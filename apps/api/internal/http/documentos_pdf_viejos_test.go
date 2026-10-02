package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// Documentos VIEJOS y el PDF (Fase 5.3, correcciones):
//   - un consentimiento para imprimir terminado antes de TR-188, sin folio:
//     tiene PDF ("…-sin-folio.pdf");
//   - un documento terminado antes de que se congelara la composición de la
//     lámina (TR-187 decisión 14): no tiene PDF (409, sin evento), y la API
//     lo avisa con `tienePDF: false`;
//   - y cómo responde la descarga a los errores tipados de GenerarPDF.

// plantillaSinLamina — un consentimiento como el de conducto, sin lámina:
// GenerarPDF responde ErrPlantillaSinLamina. Solo para tests.
const plantillaSinLamina = "consentimiento-sin-lamina-de-prueba"

func init() {
	conducto, ok := documentos.Ultima(plantillaConducto)
	if !ok {
		panic("falta la plantilla de conducto")
	}
	sin := *conducto
	sin.ID = plantillaSinLamina
	sin.Nombre = "Consentimiento sin lámina"
	sin.Lamina = nil
	if err := documentos.RegistrarPlantillaDePrueba(sin); err != nil {
		panic(err)
	}
}

// conLosTriggersApagados — corre `cambio` con el candado de los documentos
// apagado, como en TestDocumentos_UnaAlteracionPorFueraSeDetecta: es la
// única forma de reproducir en un test un documento terminado con datos de
// antes de una regla. Todo vuelve atrás con la transacción del test.
func conLosTriggersApagados(t *testing.T, e escenarioDocs, cambio func()) {
	t.Helper()
	if err := e.gdb.Exec("ALTER TABLE documentos_clinicos DISABLE TRIGGER trg_documentos_clinicos_candado").Error; err != nil {
		t.Skipf("no se pudo apagar el trigger (permisos): %v", err)
	}
	cambio()
	if err := e.gdb.Exec("ALTER TABLE documentos_clinicos ENABLE TRIGGER trg_documentos_clinicos_candado").Error; err != nil {
		t.Fatal(err)
	}
}

// sacarLaComposicion — deja el contenido congelado del documento sin la
// clave `lamina` (o con ese JSON en su lugar), como uno sellado en la 5.1.
func sacarLaComposicion(t *testing.T, e escenarioDocs, id, crudo string) {
	t.Helper()
	var doc db.DocumentoClinico
	if err := e.gdb.First(&doc, "id = ?", id).Error; err != nil {
		t.Fatal(err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal([]byte(*doc.ContenidoCanonico), &m); err != nil {
		t.Fatal(err)
	}
	if _, ok := m["lamina"]; !ok {
		t.Fatal("el documento de prueba no trae la composición")
	}
	if crudo == "" {
		delete(m, "lamina")
	} else {
		m["lamina"] = json.RawMessage(crudo)
	}
	nuevo, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	conLosTriggersApagados(t, e, func() {
		if err := e.gdb.Exec("UPDATE documentos_clinicos SET contenido_canonico = ? WHERE id = ?", string(nuevo), id).Error; err != nil {
			t.Fatal(err)
		}
	})
}

func exportacionesDe(t *testing.T, e escenarioDocs, id string) int64 {
	t.Helper()
	var n int64
	if err := e.gdb.Model(&db.DocumentoEvento{}).
		Where("documento_id = ? AND tipo = ?", id, db.EventoDocumentoExportado).Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	return n
}

func mensajeDeError(t *testing.T, body []byte) string {
	t.Helper()
	return decodificar[map[string]string](t, body)["error"]
}

func detalleDe(t *testing.T, e escenarioDocs, id string) documentoDetalleResponse {
	t.Helper()
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+id, e.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("detalle: %d %s", rec.Code, rec.Body.String())
	}
	return decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
}

// tienePDFEnElRegistro — el `tienePDF` de cada documento del registro del
// paciente, por id.
func tienePDFEnElRegistro(t *testing.T, e escenarioDocs) map[string]bool {
	t.Helper()
	rec := doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String()+"/documentos", e.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("registro: %d %s", rec.Code, rec.Body.String())
	}
	out := map[string]bool{}
	for _, d := range decodificar[[]documentoResumenResponse](t, rec.Body.Bytes()) {
		out[d.ID] = d.TienePDF
	}
	return out
}

func TestDocumentoPDF_ParaImprimirSinFolio(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-sin-folio")
	papel := e.consentimientoParaImprimir(t)

	// Un consentimiento terminado antes de TR-188: sin folio. La regla es
	// NOT VALID para no tocar esos documentos, pero rige en un UPDATE: el
	// test la saca dentro de su transacción.
	if err := e.gdb.Exec("ALTER TABLE documentos_clinicos DROP CONSTRAINT chk_documento_para_imprimir_con_folio").Error; err != nil {
		t.Skipf("no se pudo sacar la restricción (permisos): %v", err)
	}
	conLosTriggersApagados(t, e, func() {
		if err := e.gdb.Exec("UPDATE documentos_clinicos SET folio = NULL WHERE id = ?", papel.ID).Error; err != nil {
			t.Fatal(err)
		}
	})

	d := detalleDe(t, e, papel.ID)
	if d.Folio != nil {
		t.Fatalf("el documento sigue con folio %d", *d.Folio)
	}
	if !d.TienePDF {
		t.Error("un para imprimir sin folio tiene PDF: tienePDF = false")
	}
	if !tienePDFEnElRegistro(t, e)[papel.ID] {
		t.Error("el registro dice que el para imprimir sin folio no tiene PDF")
	}

	code, h, cuerpo := descargarPDF(e, t, e.token, papel.ID)
	if code != http.StatusOK {
		t.Fatalf("descarga: %d %s", code, cuerpo)
	}
	disp := h.Get("Content-Disposition")
	if !strings.HasPrefix(disp, "attachment; ") || !strings.HasSuffix(disp, `-sin-folio.pdf"`) {
		t.Errorf("Content-Disposition = %q, esperaba …-sin-folio.pdf", disp)
	}
	if strings.Contains(disp, "folio-0") {
		t.Errorf("el nombre dice folio-0: %q", disp)
	}
	if !strings.HasPrefix(string(cuerpo), "%PDF-") {
		t.Fatal("no es un PDF")
	}
	// Determinista también sin folio, y con su evento.
	_, _, otra := descargarPDF(e, t, e.token, papel.ID)
	if string(otra) != string(cuerpo) {
		t.Fatal("dos descargas del documento sin folio dieron bytes distintos")
	}
	if n := exportacionesPDF(t, e, papel.ID); n != 2 {
		t.Fatalf("%d eventos exportado/pdf, esperaba 2", n)
	}

	// Para imprimir: inline, mismo nombre.
	code, h, _ = descargarParaImprimir(e, t, e.token, papel.ID)
	if code != http.StatusOK || !strings.HasPrefix(h.Get("Content-Disposition"), "inline; ") ||
		!strings.HasSuffix(h.Get("Content-Disposition"), `-sin-folio.pdf"`) {
		t.Fatalf("para imprimir: %d %q", code, h.Get("Content-Disposition"))
	}
}

func TestDocumentoPDF_SelladoSinComposicion(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-sin-comp")
	sellado := e.completarYSellar(t, e.token, e.paciente.ID)
	papel := e.consentimientoParaImprimir(t)
	enCurso := e.crear(t, e.token, e.paciente.ID) // un borrador

	// Antes: los dos terminados tienen PDF; el borrador no.
	if !detalleDe(t, e, sellado.ID).TienePDF || !detalleDe(t, e, papel.ID).TienePDF {
		t.Fatal("un terminado con composición tiene PDF")
	}
	if detalleDe(t, e, enCurso.ID).TienePDF {
		t.Error("un borrador no tiene PDF")
	}
	registro := tienePDFEnElRegistro(t, e)
	if !registro[sellado.ID] || !registro[papel.ID] || registro[enCurso.ID] {
		t.Fatalf("tienePDF del registro antes: %v", registro)
	}

	sacarLaComposicion(t, e, sellado.ID, "")
	sacarLaComposicion(t, e, papel.ID, "null")

	for _, id := range []string{sellado.ID, papel.ID} {
		if detalleDe(t, e, id).TienePDF {
			t.Errorf("%s: el detalle dice tienePDF sin composición", id)
		}
		for _, imprimir := range []bool{false, true} {
			var code int
			var cuerpo []byte
			if imprimir {
				code, _, cuerpo = descargarParaImprimir(e, t, e.token, id)
			} else {
				code, _, cuerpo = descargarPDF(e, t, e.token, id)
			}
			if code != http.StatusConflict {
				t.Fatalf("%s (imprimir=%v): %d %s", id, imprimir, code, cuerpo)
			}
			if got := mensajeDeError(t, cuerpo); got != documentos.ErrSinComposicion.Error() {
				t.Errorf("%s: mensaje %q", id, got)
			}
		}
		if n := exportacionesDe(t, e, id); n != 0 {
			t.Errorf("%s: un documento sin PDF registró %d exportaciones", id, n)
		}
	}
	registro = tienePDFEnElRegistro(t, e)
	if registro[sellado.ID] || registro[papel.ID] {
		t.Fatalf("tienePDF del registro después: %v", registro)
	}
	// El documento se sigue viendo: el detalle trae su contenido.
	if len(detalleDe(t, e, sellado.ID).Contenido) == 0 {
		t.Error("el detalle de un sellado sin composición perdió su contenido")
	}
}

func TestDocumentoPDF_UnaLaminaVaciaTampocoTienePDF(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-lamina-vacia")
	papel := e.consentimientoParaImprimir(t)
	sacarLaComposicion(t, e, papel.ID, "[]")
	if detalleDe(t, e, papel.ID).TienePDF {
		t.Error("lámina vacía: tienePDF = true")
	}
	if code, _, _ := descargarPDF(e, t, e.token, papel.ID); code != http.StatusConflict {
		t.Fatalf("lámina vacía: %d", code)
	}
}

// La lista "en curso" solo trae borradores y a firmar: nunca tienePDF.
func TestDocumentos_EnCursoNoTienePDF(t *testing.T) {
	e := escenarioDeDocumentos(t, "pdf-en-curso")
	borrador := e.crear(t, e.token, e.paciente.ID)
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
	if aFirmar.TienePDF {
		t.Error("uno a firmar no tiene PDF")
	}
	otro := e.crearDe(t, e.token, plantillaConducto, e.paciente.ID)

	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/en-curso", e.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("en curso: %d %s", rec.Code, rec.Body.String())
	}
	// Se decodifica como mapa para ver que el campo viaja (no es omitempty).
	var crudos []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &crudos); err != nil {
		t.Fatal(err)
	}
	vistos := 0
	for _, d := range crudos {
		v, ok := d["tienePDF"]
		if !ok {
			t.Errorf("%v: el resumen no trae tienePDF", d["id"])
			continue
		}
		if v != false {
			t.Errorf("%v: tienePDF = %v en la lista en curso", d["id"], v)
		}
		if d["id"] == aFirmar.ID || d["id"] == otro.ID {
			vistos++
		}
	}
	if vistos != 2 {
		t.Fatalf("la lista en curso no trae los dos documentos: %s", rec.Body.String())
	}
}

// Los errores de GenerarPDF que vienen del DOCUMENTO: cómo los responde
// la descarga, y que ninguno deja evento.
func TestDocumentoPDF_ErroresDeGenerarPDF(t *testing.T) {
	t.Run("plantilla sin lámina: 409", func(t *testing.T) {
		e := escenarioDeDocumentos(t, "pdf-sin-lamina")
		d := e.crearDe(t, e.token, plantillaSinLamina, e.paciente.ID)
		v := d.Valores
		v["elementos"] = []string{"36"}
		e.guardar(t, e.token, d.ID, v)
		d = e.terminar(t, e.token, d.ID)
		if d.Estado != db.DocumentoParaImprimir {
			t.Fatalf("estado = %s", d.Estado)
		}
		if d.TienePDF {
			t.Error("una plantilla sin lámina: tienePDF = true")
		}
		code, _, cuerpo := descargarPDF(e, t, e.token, d.ID)
		if code != http.StatusConflict {
			t.Fatalf("%d %s", code, cuerpo)
		}
		if got := mensajeDeError(t, cuerpo); got != documentos.ErrPlantillaSinLamina.Error() {
			t.Errorf("mensaje %q", got)
		}
		if n := exportacionesDe(t, e, d.ID); n != 0 {
			t.Errorf("%d exportaciones", n)
		}
	})

	t.Run("contenido dañado: 500 con lo que falta", func(t *testing.T) {
		e := escenarioDeDocumentos(t, "pdf-danado")
		sellado := e.completarYSellar(t, e.token, e.paciente.ID)
		conLosTriggersApagados(t, e, func() {
			if err := e.gdb.Exec("UPDATE documentos_clinicos SET contenido_canonico = '{no es json' WHERE id = ?", sellado.ID).Error; err != nil {
				t.Fatal(err)
			}
		})
		code, _, cuerpo := descargarPDF(e, t, e.token, sellado.ID)
		if code != http.StatusInternalServerError {
			t.Fatalf("%d %s", code, cuerpo)
		}
		got := mensajeDeError(t, cuerpo)
		if got != "no se pudo generar el PDF del documento: el contenido congelado del documento no se puede leer" {
			t.Errorf("mensaje %q", got)
		}
		// La causa (el error de JSON, que podría citar contenido) no viaja.
		if strings.Contains(got, "invalid character") {
			t.Errorf("la respuesta lleva la causa interna: %q", got)
		}
		if n := exportacionesDe(t, e, sellado.ID); n != 0 {
			t.Errorf("un documento dañado registró %d exportaciones", n)
		}
	})

	t.Run("sellado sin huella de sello: 500 con lo que falta", func(t *testing.T) {
		e := escenarioDeDocumentos(t, "pdf-sin-sello")
		sellado := e.completarYSellar(t, e.token, e.paciente.ID)
		// chk_documento_sellado_completo lo impide en un UPDATE: dentro de
		// la transacción del test se saca la restricción.
		if err := e.gdb.Exec("ALTER TABLE documentos_clinicos DROP CONSTRAINT chk_documento_sellado_completo").Error; err != nil {
			t.Skipf("no se pudo sacar la restricción: %v", err)
		}
		conLosTriggersApagados(t, e, func() {
			if err := e.gdb.Exec("UPDATE documentos_clinicos SET hash_sello = 'no-es-un-sha256' WHERE id = ?", sellado.ID).Error; err != nil {
				t.Fatal(err)
			}
		})
		code, _, cuerpo := descargarPDF(e, t, e.token, sellado.ID)
		if code != http.StatusInternalServerError {
			t.Fatalf("%d %s", code, cuerpo)
		}
		if got := mensajeDeError(t, cuerpo); !strings.HasPrefix(got, "no se pudo generar el PDF del documento: ") ||
			!strings.Contains(got, "SHA-256") {
			t.Errorf("mensaje %q", got)
		}
		if n := exportacionesDe(t, e, sellado.ID); n != 0 {
			t.Errorf("%d exportaciones", n)
		}
	})
}
