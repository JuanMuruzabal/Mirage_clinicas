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

// pdfConAnexos — el valor de `?con=` que pide el PDF de una historia seguida
// de sus anexos.
const pdfConAnexos = "anexos"

// errSoloLaHistoriaConAnexos — `?con=anexos` sobre algo que no es una
// historia clínica: un anexo o un consentimiento no tienen anexos.
const errSoloLaHistoriaConAnexos = "solo una historia clínica se descarga con sus anexos"

// conSusAnexos — el nombre del archivo de una historia con sus anexos: el de
// la historia con "-con-anexos" antes de la extensión
// ("historia-clinica-general-folio-3-con-anexos.pdf"). El mismo que arma
// nombreDeArchivoDelPDF de apps/web/src/lib/pdf-de-documentos.ts.
func conSusAnexos(nombre string) string {
	return strings.TrimSuffix(nombre, ".pdf") + "-con-anexos.pdf"
}

// descargarPDFHandler — GET /documentos/{id}/pdf: el PDF de un documento
// terminado que veo (TR-186), con su evento "exportado" en la auditoría.
// Con `?para=imprimir` se sirve para abrirlo en el navegador (inline) e
// imprimirlo, y el evento lo dice; sin eso, como descarga (attachment). Con
// `?con=anexos`, una historia clínica seguida de sus anexos con PDF
// (entregarPDFConAnexos).
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
		con := r.URL.Query().Get("con")
		if con != "" && con != pdfConAnexos {
			writeError(w, http.StatusBadRequest, `"con" solo admite "anexos"`)
			return
		}
		var doc db.DocumentoClinico
		if err := gdb.Scopes(documentosQueVeo(r, clinicID)).
			Where("documentos_clinicos.id = ? AND documentos_clinicos.clinic_id = ?", docID, clinicID).First(&doc).Error; err != nil {
			writeError(w, http.StatusNotFound, "documento no encontrado")
			return
		}
		if doc.Estado == db.DocumentoAbierto {
			if con != "" {
				writeError(w, http.StatusConflict, errSoloLaHistoriaConAnexos)
				return
			}
			entregarPDFDeContinuacion(gdb, w, r, doc)
			return
		}
		fuente, ok := fuenteDelTerminado(gdb, w, doc)
		if !ok {
			return
		}
		if con != "" {
			entregarPDFConAnexos(gdb, w, r, clinicID, fuente)
			return
		}
		datos, err := documentos.GenerarPDF(fuente)
		if err != nil {
			responderErrorDelPDF(w, doc.ID, err)
			return
		}
		entregarPDF(gdb, w, r, []db.DocumentoClinico{doc}, nombreDeArchivoDelPDF(doc, fuente.Plantilla, documentos.FolioDe(doc, fuente.FolioDeLaHistoria)), datos)
	}
}

// fuenteDelTerminado — lo que hace falta para el PDF de un documento sellado
// o para imprimir: su plantilla, el folio de su historia si es un anexo y, si
// está sellado, sus firmas. Si falta algo, responde y devuelve false.
func fuenteDelTerminado(gdb *gorm.DB, w http.ResponseWriter, doc db.DocumentoClinico) (documentos.FuenteDelPDF, bool) {
	switch doc.Estado {
	case db.DocumentoSellado, db.DocumentoParaImprimir:
	case db.DocumentoAFirmar:
		writeError(w, http.StatusConflict, "todavía faltan firmas: el PDF está cuando el documento se sella")
		return documentos.FuenteDelPDF{}, false
	default:
		writeError(w, http.StatusConflict, "solo un documento terminado tiene PDF")
		return documentos.FuenteDelPDF{}, false
	}
	plantilla, ok := documentos.PorID(doc.PlantillaID, doc.PlantillaVersion)
	if !ok {
		slog.Error("el PDF de un documento no tiene su plantilla",
			slog.String("documento_id", doc.ID.String()),
			slog.String("plantilla_id", doc.PlantillaID), slog.Int("plantilla_version", doc.PlantillaVersion))
		writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento: la API no tiene la versión de la plantilla con la que se hizo")
		return documentos.FuenteDelPDF{}, false
	}
	folioHistoria, err := folioDeLaHistoria(gdb, doc)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento")
		return documentos.FuenteDelPDF{}, false
	}
	var firmas []db.DocumentoFirma
	if doc.Estado == db.DocumentoSellado {
		if err := gdb.Where("documento_id = ?", doc.ID).Order("rol").Find(&firmas).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento")
			return documentos.FuenteDelPDF{}, false
		}
	}
	return documentos.FuenteDelPDF{Documento: doc, Firmas: firmas, Plantilla: plantilla, FolioDeLaHistoria: folioHistoria}, true
}

// responderErrorDelPDF — la respuesta a un error del generador del PDF. Lo
// que el documento no tiene no es una falla del servidor: un documento sellado
// antes de que se congelara la composición de la lámina (TR-187 decisión 14),
// que se ve en pantalla pero cuyo PDF sería el formulario en blanco, o una
// historia sin anexos con PDF. Eso es un 409 sin log ni evento: no se exportó
// nada. El resto se loguea solo con el id —nada del contenido va a los logs
// (TR-186)—, y los errores del generador no lo llevan.
func responderErrorDelPDF(w http.ResponseWriter, docID uuid.UUID, err error) {
	if errors.Is(err, documentos.ErrSinComposicion) || errors.Is(err, documentos.ErrSinAnexosConPDF) {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	slog.Error("no se pudo generar el PDF de un documento",
		slog.String("documento_id", docID.String()), slog.String("error", err.Error()))
	var incompleto *documentos.DocumentoIncompletoError
	switch {
	case errors.Is(err, documentos.ErrPlantillaSinLamina):
		// No hay página sobre la cual dibujar: no es una falla del servidor
		// sino algo que este documento no tiene.
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, documentos.ErrDocumentoNoTerminado):
		writeError(w, http.StatusConflict, "solo un documento terminado tiene PDF")
	case errors.As(err, &incompleto):
		// Un dato que el estado del documento garantiza y no está: el
		// documento guardado está dañado. Sigue siendo un 500, pero dice qué
		// falta.
		writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento: "+incompleto.Falta)
	default:
		writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento")
	}
}

// entregarPDFConAnexos — `?con=anexos`: el PDF de una historia clínica
// terminada seguida de los anexos con PDF que ve quien pide
// (documentos.GenerarPDFConAnexos), con un evento "exportado" por cada
// documento incluido. Las validaciones de la historia son las de su PDF
// suelto y van antes que el 409 de "sin anexos con PDF".
func entregarPDFConAnexos(gdb *gorm.DB, w http.ResponseWriter, r *http.Request, clinicID uuid.UUID, historia documentos.FuenteDelPDF) {
	if historia.Plantilla.Tipo != documentos.TipoHistoriaClinica {
		writeError(w, http.StatusConflict, errSoloLaHistoriaConAnexos)
		return
	}
	anexos, fuentes, err := anexosConPDF(gdb, r, clinicID, historia.Documento)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo generar el PDF del documento")
		return
	}
	datos, err := documentos.GenerarPDFConAnexos(historia, fuentes)
	if err != nil {
		responderErrorDelPDF(w, historia.Documento.ID, err)
		return
	}
	d := historia.Documento
	nombre := conSusAnexos(nombreDeArchivoDelPDF(d, historia.Plantilla, documentos.FolioDe(d, historia.FolioDeLaHistoria)))
	entregarPDF(gdb, w, r, append([]db.DocumentoClinico{d}, anexos...), nombre, datos)
}

// anexosConPDF — los anexos de una historia que ve quien pide y tienen PDF
// (documentos.TienePDF, el criterio del resumen), por número, con lo que hace
// falta para armar cada uno: los asientos de los de continuación y las firmas
// de los sellados. Tres consultas fijas como máximo, nunca una por anexo
// (TR-177). El folio de cada uno es el de la historia, que ya está cargada.
func anexosConPDF(tx *gorm.DB, r *http.Request, clinicID uuid.UUID, historia db.DocumentoClinico) ([]db.DocumentoClinico, []documentos.FuenteDeAnexo, error) {
	var filas []db.DocumentoClinico
	if err := tx.Scopes(documentosQueVeo(r, clinicID)).
		Where("documentos_clinicos.clinic_id = ? AND documentos_clinicos.anexo_de = ?", clinicID, historia.ID).
		Order("documentos_clinicos.anexo_numero").Find(&filas).Error; err != nil {
		return nil, nil, err
	}
	anexos := make([]db.DocumentoClinico, 0, len(filas))
	plantillas := make(map[uuid.UUID]*documentos.Plantilla, len(filas))
	var continuaciones, sellados []uuid.UUID
	for _, a := range filas {
		p, ok := documentos.PorID(a.PlantillaID, a.PlantillaVersion)
		if !ok || !documentos.TienePDF(a, p) {
			continue
		}
		anexos = append(anexos, a)
		plantillas[a.ID] = p
		switch a.Estado {
		case db.DocumentoAbierto:
			continuaciones = append(continuaciones, a.ID)
		case db.DocumentoSellado:
			sellados = append(sellados, a.ID)
		}
	}
	asientos, err := porDocumento(tx, continuaciones, "numero", func(a db.DocumentoAsiento) uuid.UUID { return a.DocumentoID })
	if err != nil {
		return nil, nil, err
	}
	firmas, err := porDocumento(tx, sellados, "rol", func(f db.DocumentoFirma) uuid.UUID { return f.DocumentoID })
	if err != nil {
		return nil, nil, err
	}
	fuentes := make([]documentos.FuenteDeAnexo, len(anexos))
	for i, a := range anexos {
		if a.Estado == db.DocumentoAbierto {
			fuentes[i] = documentos.FuenteDeContinuacion{Documento: a, Asientos: asientos[a.ID], FolioDeLaHistoria: historia.Folio}
			continue
		}
		fuentes[i] = documentos.FuenteDelPDF{Documento: a, Firmas: firmas[a.ID], Plantilla: plantillas[a.ID], FolioDeLaHistoria: historia.Folio}
	}
	return anexos, fuentes, nil
}

// porDocumento — las filas de una tabla hija (asientos, firmas) de varios
// documentos en una sola consulta, agrupadas por documento y, en cada uno, en
// el mismo orden que su PDF suelto: así cada parte sale igual que sola.
func porDocumento[T any](tx *gorm.DB, ids []uuid.UUID, orden string, documentoDe func(T) uuid.UUID) (map[uuid.UUID][]T, error) {
	grupos := make(map[uuid.UUID][]T, len(ids))
	if len(ids) == 0 {
		return grupos, nil
	}
	var filas []T
	if err := tx.Where("documento_id IN ?", ids).Order("documento_id, " + orden).Find(&filas).Error; err != nil {
		return nil, err
	}
	for _, f := range filas {
		id := documentoDe(f)
		grupos[id] = append(grupos[id], f)
	}
	return grupos, nil
}

// entregarPDF — deja en la auditoría la exportación de cada documento
// incluido (uno, o una historia con sus anexos) y sirve el PDF: como descarga
// o, con `?para=imprimir`, para abrirlo en el navegador. Los eventos van en un
// solo INSERT, dentro de la transacción de GORM —quedan todos o ninguno—, y
// antes de la respuesta: sin auditoría no se entrega nada.
func entregarPDF(gdb *gorm.DB, w http.ResponseWriter, r *http.Request, incluidos []db.DocumentoClinico, nombre string, datos []byte) {
	consulta := r.URL.Query()
	detalle, disposicion := "pdf", "attachment"
	if consulta.Get("para") == "imprimir" {
		detalle, disposicion = "impresión", "inline"
	}
	if consulta.Get("con") == pdfConAnexos {
		detalle += " con anexos"
	}
	eventos := make([]db.DocumentoEvento, len(incluidos))
	for i, d := range incluidos {
		eventos[i] = eventoDelDocumento(r, d, db.EventoDocumentoExportado, detalle)
	}
	if err := gdb.Create(&eventos).Error; err != nil {
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
