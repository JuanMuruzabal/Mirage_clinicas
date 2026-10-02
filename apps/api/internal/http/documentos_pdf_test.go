package http

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// El PDF de un documento terminado (Fase 5.3, TR-185): se genera en cada
// descarga, no se guarda.

func descargarPDF(e escenarioDocs, t *testing.T, token, id string) (int, http.Header, []byte) {
	t.Helper()
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+id+"/pdf", token, nil)
	return rec.Code, rec.Header(), rec.Body.Bytes()
}

func exportacionesPDF(t *testing.T, e escenarioDocs, id string) int64 {
	t.Helper()
	var n int64
	if err := e.gdb.Model(&db.DocumentoEvento{}).
		Where("documento_id = ? AND tipo = ? AND detalle = ?", id, db.EventoDocumentoExportado, "pdf").Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	return n
}

func TestDocumentoPDF_DescargaYAuditoria(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-descarga")
	d := e.completarYSellar(t, e.token, e.paciente.ID)

	code, h, cuerpo := descargarPDF(e, t, e.token, d.ID)
	if code != http.StatusOK {
		t.Fatalf("descarga: %d %s", code, cuerpo)
	}
	if h.Get("Content-Type") != "application/pdf" {
		t.Errorf("Content-Type = %q", h.Get("Content-Type"))
	}
	esperado := fmt.Sprintf(`attachment; filename="historia-clinica-historia-de-prueba-folio-%d.pdf"`, *d.Folio)
	if h.Get("Content-Disposition") != esperado {
		t.Errorf("Content-Disposition = %q, esperaba %q", h.Get("Content-Disposition"), esperado)
	}
	if h.Get("Cache-Control") != "no-store" || h.Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("cabeceras de caché/sniff: %q %q", h.Get("Cache-Control"), h.Get("X-Content-Type-Options"))
	}
	if h.Get("Content-Length") != fmt.Sprint(len(cuerpo)) {
		t.Errorf("Content-Length = %q, cuerpo de %d", h.Get("Content-Length"), len(cuerpo))
	}
	// El nombre del archivo no lleva datos del paciente.
	if strings.Contains(strings.ToLower(h.Get("Content-Disposition")), "paz") {
		t.Error("el nombre del archivo lleva el apellido del paciente")
	}
	// El código impreso es el del detalle.
	if d.CodigoVerificacion == "" {
		t.Fatal("el detalle de un sellado no trae el código de verificación")
	}
	if !bytes.Contains(cuerpo, []byte("/Type /Catalog")) {
		t.Fatal("no es un PDF")
	}

	if n := exportacionesPDF(t, e, d.ID); n != 1 {
		t.Fatalf("la descarga registró %d eventos exportado/pdf", n)
	}
	var evento db.DocumentoEvento
	e.gdb.Where("documento_id = ? AND tipo = ?", d.ID, db.EventoDocumentoExportado).First(&evento)
	if evento.UserID == nil || *evento.UserID != e.titularID || evento.ClinicID != e.clinicID {
		t.Fatalf("el evento no dice quién descargó: %+v", evento)
	}

	// Dos descargas, los mismos bytes, y dos eventos.
	_, _, otra := descargarPDF(e, t, e.token, d.ID)
	if !bytes.Equal(cuerpo, otra) {
		t.Fatal("dos descargas dieron bytes distintos")
	}
	if n := exportacionesPDF(t, e, d.ID); n != 2 {
		t.Fatalf("dos descargas registraron %d eventos", n)
	}
}

func TestDocumentoPDF_SoloDeUnSellado(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-estados")

	borrador := e.crear(t, e.token, e.paciente.ID)
	if code, _, cuerpo := descargarPDF(e, t, e.token, borrador.ID); code != http.StatusConflict {
		t.Fatalf("un borrador: %d %s", code, cuerpo)
	}

	valores := borrador.Valores
	valores["elementos"] = []string{"36"}
	if _, tiene := valores["suscribe_fecha_nacimiento"]; !tiene {
		valores["suscribe_fecha_nacimiento"] = "1990-01-01"
	}
	if _, tiene := valores["suscribe_domicilio"]; !tiene {
		valores["suscribe_domicilio"] = "Calle 1"
	}
	e.guardar(t, e.token, borrador.ID, valores)
	aFirmar := e.terminar(t, e.token, borrador.ID)
	if aFirmar.Estado != db.DocumentoAFirmar {
		t.Fatalf("estado = %s", aFirmar.Estado)
	}
	if code, _, _ := descargarPDF(e, t, e.token, aFirmar.ID); code != http.StatusConflict {
		t.Fatalf("uno a firmar: %d", code)
	}
	if aFirmar.CodigoVerificacion != "" {
		t.Fatalf("uno a firmar no tiene código de verificación: %q", aFirmar.CodigoVerificacion)
	}

	// Un consentimiento terminado (para imprimir) sí tiene PDF: la hoja con
	// lo cargado, que se firma a mano.
	papel := e.crearDe(t, e.token, plantillaConducto, e.paciente.ID)
	pv := papel.Valores
	pv["elementos"] = []string{"36"}
	e.guardar(t, e.token, papel.ID, pv)
	papel = e.terminar(t, e.token, papel.ID)
	code, _, cuerpo := descargarPDF(e, t, e.token, papel.ID)
	if code != http.StatusOK || !bytes.HasPrefix(cuerpo, []byte("%PDF-")) {
		t.Fatalf("uno para imprimir: %d %s", code, cuerpo)
	}
	if papel.CodigoVerificacion != "" {
		t.Fatalf("uno para imprimir no tiene código de verificación: %q", papel.CodigoVerificacion)
	}

	if code, _, _ := descargarPDF(e, t, e.token, "no-es-un-uuid"); code != http.StatusBadRequest {
		t.Fatalf("id inválido: %d", code)
	}
	if code, _, _ := descargarPDF(e, t, e.token, uuid.NewString()); code != http.StatusNotFound {
		t.Fatalf("un documento que no existe: %d", code)
	}
}

func TestDocumentoPDF_CodigoDeVerificacionEnElDetalle(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-codigo")
	d := e.completarYSellar(t, e.token, e.paciente.ID)
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+d.ID, e.token, nil)
	var crudo map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &crudo)
	codigo, _ := crudo["codigoVerificacion"].(string)
	if codigo == "" || d.HashSello == nil || codigo != documentos.CodigoDeVerificacion(*d.HashSello) {
		t.Fatalf("el detalle de un sellado: codigoVerificacion = %q", codigo)
	}

	borrador := e.crear(t, e.token, e.paciente.ID)
	rec = doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+borrador.ID, e.token, nil)
	crudo = map[string]any{}
	_ = json.Unmarshal(rec.Body.Bytes(), &crudo)
	if _, tiene := crudo["codigoVerificacion"]; tiene {
		t.Fatal("un borrador no trae codigoVerificacion")
	}
}

func TestDocumentoPDF_QuienPuedeDescargarlo(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-acceso")
	d := e.completarYSellar(t, e.token, e.paciente.ID)

	recep := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "pdf-recep@example.com", db.RoleRecepcion)
	if code, _, _ := descargarPDF(e, t, recep, d.ID); code != http.StatusForbidden {
		t.Fatalf("recepción: %d", code)
	}
	admin := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "pdf-admin@example.com", db.RoleAdmin)
	if code, _, _ := descargarPDF(e, t, admin, d.ID); code != http.StatusForbidden {
		t.Fatalf("administrador de página: %d", code)
	}

	colega := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "pdf-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, e.gdb, "pdf-colega@example.com")
	if code, _, _ := descargarPDF(e, t, colega, d.ID); code != http.StatusNotFound {
		t.Fatalf("un colega sin el paciente en su lista: %d", code)
	}
	if n := exportacionesPDF(t, e, d.ID); n != 0 {
		t.Fatalf("un acceso rechazado registró %d exportaciones", n)
	}
	// Con el paciente en su lista, lo descarga (solo lectura: ve lo sellado).
	if err := e.gdb.Create(&db.PacienteEnMiLista{PacienteID: e.paciente.ID, UserID: colegaID, ClinicID: e.clinicID}).Error; err != nil {
		t.Fatal(err)
	}
	if code, _, cuerpo := descargarPDF(e, t, colega, d.ID); code != http.StatusOK || !bytes.HasPrefix(cuerpo, []byte("%PDF-")) {
		t.Fatalf("un colega con el paciente en su lista: %d", code)
	}

	otra := registrarProfesionalDePrueba(t, e.gdb, e.router, altaDePruebaInput{
		Email: "pdf-otra@example.com", Password: "unaClaveLarga123", Nombre: "Pedro Ruiz", NombreClinica: "Otra",
	})
	if code, _, _ := descargarPDF(e, t, otra.Token, d.ID); code != http.StatusNotFound {
		t.Fatalf("otra clínica: %d", code)
	}
	if code, _, _ := descargarPDF(e, t, "", d.ID); code != http.StatusUnauthorized {
		t.Fatalf("sin sesión: %d", code)
	}
}

func TestNombreDeArchivoDelPDF(t *testing.T) {
	folio := 12
	p := &documentos.Plantilla{Tipo: "historia_clinica", Nombre: "Odontología general — Niños/Ñandú"}
	got := nombreDeArchivoDelPDF(db.DocumentoClinico{Folio: &folio}, p)
	if got != "historia-clinica-odontologia-general-ninos-nandu-folio-12.pdf" {
		t.Fatalf("nombre = %q", got)
	}
	if got := nombreDeArchivoDelPDF(db.DocumentoClinico{PlantillaID: "sin-plantilla"}, nil); got != "sin-plantilla-sin-folio.pdf" {
		t.Fatalf("sin plantilla = %q", got)
	}
	if got := nombreDeArchivoDelPDF(db.DocumentoClinico{PlantillaID: "¿¿"}, nil); got != "documento-sin-folio.pdf" {
		t.Fatalf("sin nada ASCII = %q", got)
	}
}
