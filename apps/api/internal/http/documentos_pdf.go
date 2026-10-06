package http

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// El PDF de un documento terminado (Fase 5.3, TR-185). Diseño en
// docs/Fases post MVP/fase 5/fase5-documentos-clinicos.md §4.6.
//
// No se guarda: se genera en cada descarga con documentos.GenerarPDF, que
// es determinista —dos descargas del mismo documento dan los mismos
// bytes—. El documento legal es lo congelado (y, en una historia clínica,
// lo sellado), que ya es inmutable en la base; el PDF es su
// representación. Lo tiene todo documento terminado: una historia clínica
// sellada (con sus firmas y su constancia) y un consentimiento para
// imprimir (la hoja con lo cargado, que se firma a mano: TR-188).

// noAlfanumerico — lo que no puede ir en un nombre de archivo ASCII.
var noAlfanumerico = regexp.MustCompile(`[^a-z0-9]+`)

var sinAcentos = strings.NewReplacer(
	"á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n",
	"Á", "a", "É", "e", "Í", "i", "Ó", "o", "Ú", "u", "Ü", "u", "Ñ", "n",
)

// nombreDeArchivoDelPDF — "historia-clinica-odontologia-general-folio-3.pdf":
// el documento con su tipo, en ASCII (el header Content-Disposition no
// admite otra cosa sin `filename*`) y sin datos del paciente — el nombre de
// un archivo descargado queda a la vista en la carpeta de descargas. Un
// consentimiento terminado antes de que existiera el folio al terminar
// (TR-188) no tiene folio: "…-sin-folio.pdf", nunca un "folio-0". Un anexo
// lleva el "x.y" de su historia (documentos.FolioDe):
// "anexo-de-continuacion-folio-3.2.pdf"; mientras la historia no tiene folio,
// su número: "anexo-de-continuacion-anexo-2-sin-folio.pdf".
func nombreDeArchivoDelPDF(doc db.DocumentoClinico, plantilla *documentos.Plantilla, folio documentos.Folio) string {
	nombre := doc.PlantillaID
	if plantilla != nil {
		nombre = documentos.NombreSinRepetirTipo(plantilla.Tipo, plantilla.Nombre)
	}
	base := strings.Trim(noAlfanumerico.ReplaceAllString(strings.ToLower(sinAcentos.Replace(nombre)), "-"), "-")
	if base == "" {
		base = "documento"
	}
	switch {
	case folio.AnexoSinFolio():
		return fmt.Sprintf("%s-anexo-%d-sin-folio.pdf", base, *doc.AnexoNumero)
	case folio.Valor == "":
		return base + "-sin-folio.pdf"
	}
	return base + "-folio-" + folio.Valor + ".pdf"
}

// folioDeLaHistoria — en un anexo, el folio actual de su historia: el x de
// su "x.y". Una consulta interna por id y clínica, sin el scope de
// visibilidad: es solo un número, y el PDF tiene que ser el mismo para
// cualquiera que lo baje. Nil si no es un anexo o si la historia no tiene
// folio todavía.
func folioDeLaHistoria(tx *gorm.DB, d db.DocumentoClinico) (*int, error) {
	if d.AnexoDe == nil || d.AnexoNumero == nil {
		return nil, nil
	}
	var folio *int
	err := tx.Raw("SELECT folio FROM documentos_clinicos WHERE id = ? AND clinic_id = ?", *d.AnexoDe, d.ClinicID).Scan(&folio).Error
	return folio, err
}

// descargarPDFHandler — GET /documentos/{id}/pdf: el PDF de un documento
// terminado que veo (TR-186), con su evento "exportado" en la auditoría.
// Con `?para=imprimir` se sirve para abrirlo en el navegador (inline) e
// imprimirlo, y el evento lo dice; sin eso, como descarga (attachment).
func descargarPDFHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		docID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de documento inválido")
			return
		}
		var doc db.DocumentoClinico
		if err := gdb.Scopes(documentosQueVeo(r, clinicID)).
			Where("documentos_clinicos.id = ? AND documentos_clinicos.clinic_id = ?", docID, clinicID).First(&doc).Error; err != nil {
			writeError(w, http.StatusNotFound, "documento no encontrado")
			return
		}
		switch doc.Estado {
		case db.DocumentoAbierto:
			entregarPDFDeContinuacion(gdb, w, r, doc)
			return
		case db.DocumentoSellado, db.DocumentoParaImprimir:
		case db.DocumentoAFirmar:
			writeError(w, http.StatusConflict, "todavía faltan firmas: el PDF está cuando el documento se sella")
			return
		default:
			writeError(w, http.StatusConflict, "solo un documento terminado tiene PDF")
			return
		}

		plantilla, ok := documentos.PorID(doc.PlantillaID, doc.PlantillaVersion)
		if !ok {
			slog.Error("el PDF de un documento no tiene su plantilla",
				slog.String("documento_id", doc.ID.String()),
				slog.String("plantilla_id", doc.PlantillaID), slog.Int("plantilla_version", doc.PlantillaVersion))
			writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento: la API no tiene la versión de la plantilla con la que se hizo")
			return
		}
		folioHistoria, err := folioDeLaHistoria(gdb, doc)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento")
			return
		}
		var firmas []db.DocumentoFirma
		if doc.Estado == db.DocumentoSellado {
			if err := gdb.Where("documento_id = ?", doc.ID).Order("rol").Find(&firmas).Error; err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento")
				return
			}
		}
		datos, err := documentos.GenerarPDF(documentos.FuenteDelPDF{Documento: doc, Firmas: firmas, Plantilla: plantilla, FolioDeLaHistoria: folioHistoria})
		if errors.Is(err, documentos.ErrSinComposicion) {
			// Un documento sellado antes de que se congelara la composición
			// de la lámina (TR-187 decisión 14): se ve en pantalla, en su
			// versión de texto, pero su PDF sería el formulario en blanco.
			// No es una falla: ese documento no tiene PDF. Sin evento —
			// no se exportó nada— y sin log de error.
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		if err != nil {
			// Solo el id: nada del contenido va a los logs (TR-186). Los
			// errores de GenerarPDF no llevan contenido del documento.
			slog.Error("no se pudo generar el PDF de un documento",
				slog.String("documento_id", doc.ID.String()), slog.String("error", err.Error()))
			var incompleto *documentos.DocumentoIncompletoError
			switch {
			case errors.Is(err, documentos.ErrPlantillaSinLamina):
				// No hay página sobre la cual dibujar: no es una falla del
				// servidor sino algo que este documento no tiene.
				writeError(w, http.StatusConflict, err.Error())
			case errors.Is(err, documentos.ErrDocumentoNoTerminado):
				writeError(w, http.StatusConflict, "solo un documento terminado tiene PDF")
			case errors.As(err, &incompleto):
				// Un dato que el estado del documento garantiza y no está:
				// el documento guardado está dañado. Sigue siendo un 500,
				// pero dice qué falta.
				writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento: "+incompleto.Falta)
			default:
				writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento")
			}
			return
		}

		entregarPDF(gdb, w, r, doc, nombreDeArchivoDelPDF(doc, plantilla, documentos.FolioDe(doc, folioHistoria)), datos)
	}
}

// entregarPDF — deja la exportación en la auditoría y sirve el PDF: como
// descarga o, con `?para=imprimir`, para abrirlo en el navegador.
func entregarPDF(gdb *gorm.DB, w http.ResponseWriter, r *http.Request, doc db.DocumentoClinico, nombre string, datos []byte) {
	detalle, disposicion := "pdf", "attachment"
	if r.URL.Query().Get("para") == "imprimir" {
		detalle, disposicion = "impresión", "inline"
	}
	if err := registrarEvento(gdb, r, doc, db.EventoDocumentoExportado, detalle); err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo registrar la descarga")
		return
	}

	h := w.Header()
	h.Set("Content-Type", "application/pdf")
	h.Set("Content-Disposition", disposicion+`; filename="`+nombre+`"`)
	h.Set("Content-Length", strconv.Itoa(len(datos)))
	h.Set("Cache-Control", "no-store")
	h.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(datos)
}
