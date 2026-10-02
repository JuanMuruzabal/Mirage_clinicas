package http

import (
	"bytes"
	"fmt"
	"net/http"
	"testing"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// El PDF de un consentimiento para imprimir y la descarga "para imprimir"
// (`?para=imprimir`: inline, y el evento lo dice). Fase 5.3.

// consentimientoParaImprimir — un consentimiento de conducto (versión
// vigente) terminado: queda para imprimir, sin firmas en el sistema.
func (e escenarioDocs) consentimientoParaImprimir(t *testing.T) documentoDetalleResponse {
	t.Helper()
	papel := e.crearDe(t, e.token, plantillaConducto, e.paciente.ID)
	v := papel.Valores
	v["elementos"] = []string{"36"}
	e.guardar(t, e.token, papel.ID, v)
	papel = e.terminar(t, e.token, papel.ID)
	if papel.Estado != db.DocumentoParaImprimir {
		t.Fatalf("un consentimiento terminado quedó en %q", papel.Estado)
	}
	return papel
}

func descargarParaImprimir(e escenarioDocs, t *testing.T, token, id string) (int, http.Header, []byte) {
	t.Helper()
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+id+"/pdf?para=imprimir", token, nil)
	return rec.Code, rec.Header(), rec.Body.Bytes()
}

func eventosExportado(t *testing.T, e escenarioDocs, id, detalle string) int64 {
	t.Helper()
	var n int64
	if err := e.gdb.Model(&db.DocumentoEvento{}).
		Where("documento_id = ? AND tipo = ? AND detalle = ?", id, db.EventoDocumentoExportado, detalle).Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	return n
}

func TestDocumentoPDF_ParaImprimir_LaHojaSinFirmasNiConstancia(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-papel")
	papel := e.consentimientoParaImprimir(t)

	code, h, cuerpo := descargarPDF(e, t, e.token, papel.ID)
	if code != http.StatusOK {
		t.Fatalf("descarga: %d %s", code, cuerpo)
	}
	plantilla, ok := documentos.PorID(papel.PlantillaID, papel.PlantillaVersion)
	if !ok {
		t.Fatal("sin plantilla")
	}
	// Solo las hojas de la lámina: ninguna hoja A4 de constancia.
	if got := bytes.Count(cuerpo, []byte("/Type /Page /Parent")); got != len(plantilla.Lamina.Paginas) {
		t.Fatalf("%d hojas, esperaba las %d de la lámina", got, len(plantilla.Lamina.Paginas))
	}
	if bytes.Contains(cuerpo, []byte("/MediaBox [0 0 595.28 841.89]")) {
		t.Fatal("uno para imprimir no lleva hoja de constancia")
	}
	esperado := fmt.Sprintf(`attachment; filename="consentimiento-informado-tratamiento-de-conducto-folio-%d.pdf"`, *papel.Folio)
	if got := h.Get("Content-Disposition"); got != esperado {
		t.Errorf("Content-Disposition = %q, esperaba %q", got, esperado)
	}
	if h.Get("Content-Type") != "application/pdf" || h.Get("Cache-Control") != "no-store" {
		t.Errorf("cabeceras: %q %q", h.Get("Content-Type"), h.Get("Cache-Control"))
	}
	// Generado en cada pedido, y siempre igual.
	_, _, otra := descargarPDF(e, t, e.token, papel.ID)
	if !bytes.Equal(cuerpo, otra) {
		t.Fatal("dos descargas del mismo consentimiento dieron bytes distintos")
	}
	if n := eventosExportado(t, e, papel.ID, "pdf"); n != 2 {
		t.Fatalf("dos descargas registraron %d eventos exportado/pdf", n)
	}
	// Coincide con lo que da el generador sobre lo guardado en la base.
	var doc db.DocumentoClinico
	if err := e.gdb.Where("id = ?", papel.ID).First(&doc).Error; err != nil {
		t.Fatal(err)
	}
	directo, err := documentos.GenerarPDF(documentos.FuenteDelPDF{Documento: doc, Plantilla: plantilla})
	if err != nil || !bytes.Equal(directo, cuerpo) {
		t.Fatalf("la descarga no es el PDF de lo congelado (err %v)", err)
	}
}

func TestDocumentoPDF_ParaImprimirEsInlineYElEventoLoDice(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-inline")
	papel := e.consentimientoParaImprimir(t)
	sellado := e.completarYSellar(t, e.token, e.paciente.ID)

	for nombre, d := range map[string]documentoDetalleResponse{"para imprimir": papel, "sellado": sellado} {
		code, h, cuerpo := descargarParaImprimir(e, t, e.token, d.ID)
		if code != http.StatusOK || !bytes.HasPrefix(cuerpo, []byte("%PDF-")) {
			t.Fatalf("%s: %d %s", nombre, code, cuerpo)
		}
		disp := h.Get("Content-Disposition")
		if !bytes.HasPrefix([]byte(disp), []byte(`inline; filename="`)) || !bytes.HasSuffix([]byte(disp), []byte(fmt.Sprintf(`-folio-%d.pdf"`, *d.Folio))) {
			t.Errorf("%s: Content-Disposition = %q, esperaba inline con el nombre del archivo", nombre, disp)
		}
		if n := eventosExportado(t, e, d.ID, "impresión"); n != 1 {
			t.Errorf("%s: %d eventos exportado/impresión", nombre, n)
		}
		if n := eventosExportado(t, e, d.ID, "pdf"); n != 0 {
			t.Errorf("%s: abrirlo para imprimir no es una descarga (%d eventos exportado/pdf)", nombre, n)
		}
		// El mismo archivo que la descarga: solo cambia cómo se sirve.
		_, h2, descarga := descargarPDF(e, t, e.token, d.ID)
		if !bytes.Equal(cuerpo, descarga) {
			t.Errorf("%s: imprimir y descargar dieron PDFs distintos", nombre)
		}
		if !bytes.HasPrefix([]byte(h2.Get("Content-Disposition")), []byte("attachment;")) {
			t.Errorf("%s: sin ?para=imprimir es attachment, no %q", nombre, h2.Get("Content-Disposition"))
		}
	}

	// Cualquier otro valor de `para` es una descarga común.
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+papel.ID+"/pdf?para=otra-cosa", e.token, nil)
	if rec.Code != http.StatusOK || !bytes.HasPrefix([]byte(rec.Header().Get("Content-Disposition")), []byte("attachment;")) {
		t.Fatalf("?para=otra-cosa: %d %q", rec.Code, rec.Header().Get("Content-Disposition"))
	}
}

func TestDocumentoPDF_LosMensajesDel409(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-409")

	borrador := e.crear(t, e.token, e.paciente.ID)
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+borrador.ID+"/pdf?para=imprimir", e.token, nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("borrador: %d", rec.Code)
	}
	if got := decodificar[map[string]string](t, rec.Body.Bytes())["error"]; got != "solo un documento terminado tiene PDF" {
		t.Errorf("borrador: mensaje %q", got)
	}

	v := borrador.Valores
	v["elementos"] = []string{"36"}
	if _, tiene := v["suscribe_fecha_nacimiento"]; !tiene {
		v["suscribe_fecha_nacimiento"] = "1990-01-01"
	}
	if _, tiene := v["suscribe_domicilio"]; !tiene {
		v["suscribe_domicilio"] = "Calle 1"
	}
	e.guardar(t, e.token, borrador.ID, v)
	aFirmar := e.terminar(t, e.token, borrador.ID)
	rec = doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+aFirmar.ID+"/pdf", e.token, nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("a firmar: %d", rec.Code)
	}
	if got := decodificar[map[string]string](t, rec.Body.Bytes())["error"]; got != "todavía faltan firmas: el PDF está cuando el documento se sella" {
		t.Errorf("a firmar: mensaje %q", got)
	}
	// Ningún 409 deja un evento de exportación.
	var n int64
	e.gdb.Model(&db.DocumentoEvento{}).Where("tipo = ? AND clinic_id = ?", db.EventoDocumentoExportado, e.clinicID).Count(&n)
	if n != 0 {
		t.Fatalf("un 409 registró %d exportaciones", n)
	}
}

// El acceso al PDF de un consentimiento para imprimir es el mismo que al de
// un sellado (TR-186): solo profesionales, y solo de pacientes de su lista.
func TestDocumentoPDF_ParaImprimir_QuienPuedeVerlo(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-papel-acceso")
	papel := e.consentimientoParaImprimir(t)

	recep := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "pdf-papel-recep@example.com", db.RoleRecepcion)
	if code, _, _ := descargarParaImprimir(e, t, recep, papel.ID); code != http.StatusForbidden {
		t.Fatalf("recepción: %d", code)
	}
	colega := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "pdf-papel-colega@example.com", db.RoleProfesional)
	if code, _, _ := descargarParaImprimir(e, t, colega, papel.ID); code != http.StatusNotFound {
		t.Fatalf("un colega sin el paciente: %d", code)
	}
	colegaID := userIDDelMail(t, e.gdb, "pdf-papel-colega@example.com")
	if err := e.gdb.Create(&db.PacienteEnMiLista{PacienteID: e.paciente.ID, UserID: colegaID, ClinicID: e.clinicID}).Error; err != nil {
		t.Fatal(err)
	}
	if code, _, _ := descargarParaImprimir(e, t, colega, papel.ID); code != http.StatusOK {
		t.Fatalf("un colega con el paciente en su lista: %d", code)
	}
	otra := registrarProfesionalDePrueba(t, e.gdb, e.router, altaDePruebaInput{
		Email: "pdf-papel-otra@example.com", Password: "unaClaveLarga123", Nombre: "Pedro Ruiz", NombreClinica: "Otra papel",
	})
	if code, _, _ := descargarParaImprimir(e, t, otra.Token, papel.ID); code != http.StatusNotFound {
		t.Fatalf("otra clínica: %d", code)
	}
	if code, _, _ := descargarParaImprimir(e, t, "", papel.ID); code != http.StatusUnauthorized {
		t.Fatalf("sin sesión: %d", code)
	}
	// Solo el colega con el paciente dejó un evento.
	if n := eventosExportado(t, e, papel.ID, "impresión"); n != 1 {
		t.Fatalf("%d eventos exportado/impresión, esperaba 1", n)
	}
}

// Un borrador de un colega (ajeno, no terminado) no se ve: 404, no 409 —
// el 409 confirmaría que el documento existe.
func TestDocumentoPDF_UnBorradorAjenoEs404(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-borrador-ajeno")
	colega := sumarColaboradorDePrueba(t, e.gdb, e.router, e.clinicID, "pdf-ba-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, e.gdb, "pdf-ba-colega@example.com")
	if err := e.gdb.Create(&db.PacienteEnMiLista{PacienteID: e.paciente.ID, UserID: colegaID, ClinicID: e.clinicID}).Error; err != nil {
		t.Fatal(err)
	}
	borrador := e.crear(t, e.token, e.paciente.ID)
	if code, _, _ := descargarPDF(e, t, colega, borrador.ID); code != http.StatusNotFound {
		t.Fatalf("el borrador de un colega: %d", code)
	}
}
