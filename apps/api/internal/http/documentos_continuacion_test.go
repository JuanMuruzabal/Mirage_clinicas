package http

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"slices"
	"strings"
	"testing"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// Los anexos de continuación (Fase 5.6d) contra la base real: se crean desde
// la historia, una vez por sección, y suman asientos encadenados.

// plantillaHistoriaContinuable — una historia que se firma en el sistema y
// continúa su "plan" en un anexo: la de conducto v1 como historia, con un
// "Continúa en anexo Nº". La General real continúa tres secciones, pero
// sellarla pide más de lo que un test arma en pocas líneas.
const plantillaHistoriaContinuable = "historia-continuable-de-prueba"

const plantillaGeneral = "historia-clinica-general"

func init() {
	conducto, ok := documentos.PorID(plantillaConducto, 1)
	if !ok {
		panic("falta la plantilla de conducto")
	}
	historia := *conducto
	historia.ID, historia.Nombre, historia.Tipo = plantillaHistoriaContinuable, "Historia continuable de prueba", documentos.TipoHistoriaClinica
	minimo, maximo := 1.0, 999.0
	// Clone: el append no puede tocar las secciones de la plantilla real.
	historia.Secciones = append(slices.Clone(conducto.Secciones), documentos.Seccion{ID: "plan", Titulo: "Plan", Campos: []documentos.Campo{
		{Tipo: "numero", ID: "plan_anexo", Etiqueta: "Continúa en anexo Nº", Min: &minimo, Max: &maximo, ContinuaEnAnexo: "plan"},
	}})
	if err := documentos.RegistrarPlantillaDePrueba(historia); err != nil {
		panic(err)
	}
}

func (e escenarioDocs) continuar(t *testing.T, token, historiaID, seccion string) (int, documentoDetalleResponse) {
	t.Helper()
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+historiaID+"/continuaciones", token, map[string]any{"seccion": seccion})
	var d documentoDetalleResponse
	if rec.Code == http.StatusOK || rec.Code == http.StatusCreated {
		d = decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	}
	return rec.Code, d
}

func (e escenarioDocs) asentar(t *testing.T, token, anexoID, texto string) *httptest.ResponseRecorder {
	t.Helper()
	return doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+anexoID+"/asientos", token, map[string]any{"texto": texto})
}

// historiaCongelada — de qué historia dice ser el anexo en su contenido
// congelado.
func historiaCongelada(t *testing.T, anexo documentoDetalleResponse) documentos.ContinuacionCongelada {
	t.Helper()
	var contenido documentos.ContenidoCongelado
	if err := json.Unmarshal(anexo.Contenido, &contenido); err != nil || contenido.Continuacion == nil {
		t.Fatalf("el contenido congelado del anexo: %v %s", err, anexo.Contenido)
	}
	return *contenido.Continuacion
}

func (e escenarioDocs) leer(t *testing.T, token, id string) documentoDetalleResponse {
	t.Helper()
	rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+id, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("leer %s: %d %s", id, rec.Code, rec.Body.String())
	}
	return decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
}

func TestContinuacion_ConLaHistoriaEnBorradorEscribeElNumero(t *testing.T) {
	e := escenarioDeDocumentos(t, "cont-borrador")
	historia := e.crearDe(t, e.token, plantillaGeneral, e.paciente.ID)

	codigo, anexo := e.continuar(t, e.token, historia.ID, "diagnostico")
	if codigo != http.StatusCreated {
		t.Fatalf("crear la continuación: %d", codigo)
	}
	// Sin folio propio: con la historia sin folio todavía, es "Anexo Nº 1".
	if anexo.Estado != db.DocumentoAbierto || anexo.Folio != nil || anexo.FolioMostrado != "Anexo Nº 1" ||
		anexo.AnexoDe == nil || anexo.AnexoDe.ID != historia.ID ||
		!reflect.DeepEqual(anexo.Continuacion, &continuacionResponse{Seccion: "diagnostico", Numero: 1}) {
		t.Fatalf("el anexo: %+v", anexo.documentoResumenResponse)
	}
	// La historia queda congelada en el anexo.
	if c := historiaCongelada(t, anexo); c.HistoriaID != historia.ID || c.Historia != "Historia clínica general" {
		t.Fatalf("la historia congelada: %+v", c)
	}

	// El número quedó en su "Continúa en anexo Nº", y guardar no lo pisa.
	leida := e.leer(t, e.token, historia.ID)
	if leida.Valores["diagnostico_anexo"] != 1.0 {
		t.Fatalf("el número en el borrador: %v", leida.Valores["diagnostico_anexo"])
	}
	leida.Valores["diagnostico_anexo"] = 7.0
	if guardada := e.guardar(t, e.token, historia.ID, leida.Valores); guardada.Valores["diagnostico_anexo"] != 1.0 {
		t.Fatalf("guardar pisó el número del anexo: %v", guardada.Valores["diagnostico_anexo"])
	}

	// La segunda vez, el mismo; otra sección, el número que sigue.
	if codigo, otra := e.continuar(t, e.token, historia.ID, "diagnostico"); codigo != http.StatusOK || otra.ID != anexo.ID {
		t.Fatalf("pedirlo de nuevo: %d, %s", codigo, otra.ID)
	}
	if _, plan := e.continuar(t, e.token, historia.ID, "plan"); plan.Continuacion == nil || plan.Continuacion.Numero != 2 {
		t.Fatalf("el anexo del plan: %+v", plan.Continuacion)
	}

	// Una sección que la General no continúa, y el anexo de continuación por
	// el camino de cualquier documento.
	if codigo, _ := e.continuar(t, e.token, historia.ID, "estudios"); codigo != http.StatusUnprocessableEntity {
		t.Fatalf("una sección que no se continúa: %d", codigo)
	}
	rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos", e.token, map[string]any{
		"plantillaId": documentos.PlantillaDeContinuacion, "pacienteId": e.paciente.ID.String(), "historiaId": historia.ID,
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("POST /documentos con el anexo de continuación: %d", rec.Code)
	}
}

func TestContinuacion_ConLaHistoriaSelladaNoLaToca(t *testing.T) {
	e := escenarioDeDocumentos(t, "cont-sellada")
	historia := e.completarYSellarDe(t, e.token, plantillaHistoriaContinuable, e.paciente.ID)
	var antes db.DocumentoClinico
	if err := e.gdb.First(&antes, "id = ?", historia.ID).Error; err != nil {
		t.Fatal(err)
	}

	codigo, anexo := e.continuar(t, e.token, historia.ID, "plan")
	if codigo != http.StatusCreated || anexo.Folio != nil || anexo.FolioMostrado != fmt.Sprintf("%d.1", *historia.Folio) {
		t.Fatalf("crear la continuación de una historia sellada: %d, folio %v %q", codigo, anexo.Folio, anexo.FolioMostrado)
	}
	if c := historiaCongelada(t, anexo); c.Seccion != "plan" || c.Numero != 1 {
		t.Fatalf("la historia congelada: %+v", c)
	}
	var despues db.DocumentoClinico
	if err := e.gdb.First(&despues, "id = ?", historia.ID).Error; err != nil {
		t.Fatal(err)
	}
	if !despues.UpdatedAt.Equal(antes.UpdatedAt) || !reflect.DeepEqual(despues.Valores, antes.Valores) || *despues.HashSello != *antes.HashSello {
		t.Fatal("crear la continuación tocó la historia sellada")
	}
	// Vinculado solo en el sistema: la historia lo lista con su sección.
	leida := e.leer(t, e.token, historia.ID)
	if len(leida.Anexos) != 1 || leida.Anexos[0].ID != anexo.ID || leida.Anexos[0].Continuacion == nil {
		t.Fatalf("los anexos de la historia: %+v", leida.Anexos)
	}
}

// Un asiento no lleva firma dibujada: alcanza el texto, y lo firma el registro
// digital (la sesión, el nombre y el instante).
func TestAsientos_SeEncadenanSinFirmaDibujada(t *testing.T) {
	e := escenarioDeDocumentos(t, "asientos")
	historia := e.crearDe(t, e.token, plantillaGeneral, e.paciente.ID)
	_, anexo := e.continuar(t, e.token, historia.ID, "plan")

	var ultimo documentoDetalleResponse
	for _, texto := range []string{"  Primer control: sin novedades.  ", "Segundo control."} {
		rec := e.asentar(t, e.token, anexo.ID, texto)
		if rec.Code != http.StatusCreated {
			t.Fatalf("sumar un asiento: %d %s", rec.Code, rec.Body.String())
		}
		if strings.Contains(rec.Body.String(), `"trazo"`) {
			t.Fatalf("un asiento no devuelve trazo: %s", rec.Body.String())
		}
		ultimo = decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	}
	if len(ultimo.Asientos) != 2 || ultimo.Asientos[0].Numero != 1 || ultimo.Asientos[1].Numero != 2 ||
		ultimo.Asientos[0].Texto != "Primer control: sin novedades." ||
		ultimo.Asientos[0].AutorNombre == "" || ultimo.Asientos[0].CreadoEn == "" {
		t.Fatalf("los asientos: %+v", ultimo.Asientos)
	}

	// La cadena se recalcula desde lo guardado.
	var doc db.DocumentoClinico
	var asientos []db.DocumentoAsiento
	if err := e.gdb.First(&doc, "id = ?", anexo.ID).Error; err != nil {
		t.Fatal(err)
	}
	if err := e.gdb.Where("documento_id = ?", anexo.ID).Order("numero").Find(&asientos).Error; err != nil {
		t.Fatal(err)
	}
	if err := documentos.VerificarAsientos(doc, asientos); err != nil {
		t.Fatalf("la cadena: %v", err)
	}
	if asientos[0].HashAnterior != *doc.HashContenido || asientos[1].HashAnterior != asientos[0].Hash {
		t.Fatal("cada asiento se encadena al anterior, y el primero al contenido del anexo")
	}
	// Su fecha en la ficha y en el vínculo es la de su último asiento.
	rec := doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String()+"/documentos", e.token, nil)
	for _, d := range decodificar[[]documentoResumenResponse](t, rec.Body.Bytes()) {
		switch d.ID {
		case anexo.ID:
			if d.UltimoAsientoEn == nil || *d.UltimoAsientoEn != ultimo.Asientos[1].CreadoEn {
				t.Errorf("la fecha del anexo en la ficha: %v", d.UltimoAsientoEn)
			}
		case historia.ID:
			if len(d.Anexos) != 1 || d.Anexos[0].Fecha != ultimo.Asientos[1].CreadoEn {
				t.Errorf("la fecha del anexo en el vínculo: %+v", d.Anexos)
			}
		}
	}

	asientos[1].Texto = "Otro texto."
	if documentos.VerificarAsientos(doc, asientos) == nil {
		t.Fatal("un asiento alterado no se detecta")
	}

	for _, texto := range []string{"   ", strings.Repeat("a", 4001)} {
		if rec := e.asentar(t, e.token, anexo.ID, texto); rec.Code != http.StatusBadRequest {
			t.Errorf("un asiento de %d caracteres: %d", len(texto), rec.Code)
		}
	}
	if rec := e.asentar(t, e.token, historia.ID, "A la historia no."); rec.Code != http.StatusConflict {
		t.Fatalf("un asiento en una historia: %d", rec.Code)
	}
}

func TestAsientos_UnColegaQueVeElAnexoLeSumaUno(t *testing.T) {
	e := escenarioDeDocumentos(t, "asientos-colega")
	historia := e.completarYSellarDe(t, e.token, plantillaHistoriaContinuable, e.paciente.ID)
	_, anexo := e.continuar(t, e.token, historia.ID, "plan")
	colega, colegaID := e.colegaConPerfil(t, "asientos-colega@example.com")

	rec := e.asentar(t, colega, anexo.ID, "Control del colega.")
	if rec.Code != http.StatusCreated {
		t.Fatalf("el colega suma un asiento: %d %s", rec.Code, rec.Body.String())
	}
	d := decodificar[documentoDetalleResponse](t, rec.Body.Bytes())
	if len(d.Asientos) != 1 || d.Asientos[0].AutorUserID != colegaID.String() || d.Asientos[0].AutorNombre != "Pedro Díaz" {
		t.Fatalf("el asiento lleva el nombre de quien lo escribe: %+v", d.Asientos)
	}
}

// El PDF sale del anexo y de sus asientos, no de la historia: el colega que
// ve el anexo pero no la historia (todavía en borrador) baja los mismos
// bytes que quien la escribió.
func TestContinuacion_ElPDFEsDeterminista(t *testing.T) {
	e := escenarioDeDocumentos(t, "cont-pdf")
	historia := e.crearDe(t, e.token, plantillaGeneral, e.paciente.ID)
	_, anexo := e.continuar(t, e.token, historia.ID, "observaciones")
	colega, _ := e.colegaConPerfil(t, "cont-pdf-colega@example.com")
	if rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+historia.ID, colega, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("el colega no ve la historia en borrador: %d", rec.Code)
	}

	codigo, _, sinAsientos := descargarPDF(e, t, e.token, anexo.ID)
	if codigo != http.StatusOK || !bytes.HasPrefix(sinAsientos, []byte("%PDF-")) {
		t.Fatalf("el PDF sin asientos: %d", codigo)
	}
	if rec := e.asentar(t, e.token, anexo.ID, "Evolución favorable."); rec.Code != http.StatusCreated {
		t.Fatalf("sumar un asiento: %d", rec.Code)
	}
	_, cabeceras, uno := descargarPDF(e, t, e.token, anexo.ID)
	codigo, _, delColega := descargarPDF(e, t, colega, anexo.ID)
	if codigo != http.StatusOK || !bytes.Equal(uno, delColega) || bytes.Equal(uno, sinAsientos) {
		t.Fatalf("los mismos asientos dan los mismos bytes para cualquiera (%d), y un asiento nuevo los cambia", codigo)
	}
	// La historia sigue en borrador, sin folio: el anexo se nombra por su número.
	if nombre := cabeceras.Get("Content-Disposition"); !strings.Contains(nombre, "anexo-de-continuacion-anexo-1-sin-folio.pdf") {
		t.Fatalf("el nombre del archivo: %s", nombre)
	}
	if n := exportacionesPDF(t, e, anexo.ID); n != 3 {
		t.Fatalf("cada descarga queda en la auditoría: %d", n)
	}
}

// Un anexo no consume folio (Fase 5.6d): su folio es el "x.y" de su historia
// —de continuación o suelto, en una sola secuencia por historia—, y mientras
// la historia no tiene folio es "Anexo Nº y". Cuando la historia se sella,
// pasa a "x.y" en el detalle, en el vínculo y en la lista; la historia recibe
// el folio que sigue sin hueco, y el PDF del anexo cambia con ella.
func TestAnexos_ElFolioEsElDeSuHistoria(t *testing.T) {
	e := escenarioDeDocumentos(t, "anexo-folio")
	previa := e.completarYSellarDe(t, e.token, plantillaHistoriaContinuable, e.paciente.ID)
	historia := e.crearDe(t, e.token, plantillaHistoriaContinuable, e.paciente.ID)

	_, cont := e.continuar(t, e.token, historia.ID, "plan")
	if cont.Folio != nil || cont.FolioMostrado != "Anexo Nº 1" || cont.AnexoNumero == nil || *cont.AnexoNumero != 1 {
		t.Fatalf("la continuación con la historia en borrador: folio %v %q", cont.Folio, cont.FolioMostrado)
	}
	_, cabeceras, antes := descargarPDF(e, t, e.token, cont.ID)
	if _, _, otra := descargarPDF(e, t, e.token, cont.ID); !bytes.Equal(antes, otra) {
		t.Fatal("dos descargas sin cambios dieron bytes distintos")
	}
	if nombre := cabeceras.Get("Content-Disposition"); !strings.Contains(nombre, "anexo-de-continuacion-anexo-1-sin-folio.pdf") {
		t.Fatalf("el nombre sin folio de la historia: %s", nombre)
	}

	// Un anexo suelto sigue la misma secuencia, y sellarlo no consume folio.
	codigo, suelto, cuerpo := e.pedirAnexo(t, e.token, e.paciente.ID, historia.ID)
	if codigo != http.StatusCreated || suelto.AnexoNumero == nil || *suelto.AnexoNumero != 2 || suelto.FolioMostrado != "Anexo Nº 2" {
		t.Fatalf("el anexo suelto: %d %s", codigo, cuerpo)
	}
	suelto = e.sellarBorrador(t, e.token, suelto)
	if suelto.Estado != db.DocumentoSellado || suelto.Folio != nil || suelto.FolioMostrado != "Anexo Nº 2" {
		t.Fatalf("el anexo suelto sellado: %s, folio %v %q", suelto.Estado, suelto.Folio, suelto.FolioMostrado)
	}

	sellada := e.sellarBorrador(t, e.token, e.leer(t, e.token, historia.ID))
	if sellada.Folio == nil || *sellada.Folio != *previa.Folio+1 {
		t.Fatalf("la historia sigue la secuencia sin hueco: %v después de %d", sellada.Folio, *previa.Folio)
	}
	x := *sellada.Folio
	esperados := map[string]string{cont.ID: fmt.Sprintf("%d.1", x), suelto.ID: fmt.Sprintf("%d.2", x)}
	for id, esperado := range esperados {
		if leido := e.leer(t, e.token, id); leido.FolioMostrado != esperado || leido.AnexoDe == nil || leido.AnexoDe.FolioMostrado != fmt.Sprint(x) {
			t.Errorf("el anexo %s: %q (se esperaba %q), su historia %+v", id, leido.FolioMostrado, esperado, leido.AnexoDe)
		}
	}
	for _, a := range e.leer(t, e.token, historia.ID).Anexos {
		if a.FolioMostrado != esperados[a.ID] {
			t.Errorf("el vínculo del anexo %s: %q", a.ID, a.FolioMostrado)
		}
	}
	rec := doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String()+"/documentos", e.token, nil)
	for _, d := range decodificar[[]documentoResumenResponse](t, rec.Body.Bytes()) {
		if esperado, es := esperados[d.ID]; es && d.FolioMostrado != esperado {
			t.Errorf("el anexo %s en la lista: %q", d.ID, d.FolioMostrado)
		}
	}

	_, cabeceras, despues := descargarPDF(e, t, e.token, cont.ID)
	if bytes.Equal(antes, despues) {
		t.Fatal("el PDF del anexo no cambió cuando la historia recibió su folio")
	}
	if _, _, otra := descargarPDF(e, t, e.token, cont.ID); !bytes.Equal(despues, otra) {
		t.Fatal("con el folio de la historia, dos descargas dieron bytes distintos")
	}
	if nombre := cabeceras.Get("Content-Disposition"); !strings.Contains(nombre, fmt.Sprintf("anexo-de-continuacion-folio-%d.1.pdf", x)) {
		t.Fatalf("el nombre con el folio de la historia: %s", nombre)
	}
	if otra := e.completarYSellarDe(t, e.token, plantillaHistoriaContinuable, e.paciente.ID); otra.Folio == nil || *otra.Folio != x+1 {
		t.Fatalf("la próxima historia sigue la secuencia: %v después de %d", otra.Folio, x)
	}
}
