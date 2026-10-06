package http

import (
	"net/http"
	"reflect"
	"slices"
	"testing"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/documentos"
)

// Los bordes de los anexos de continuación (Fase 5.6d): cada respuesta de
// los dos endpoints, el número en un campo de texto, una historia terminada
// que no se toca, y la fecha del último asiento sin una consulta por fila.

// plantillaContinuableConTexto — una historia cuyo "Continúa en anexo Nº"
// del diagnóstico es un campo de TEXTO (las reales usan número).
const plantillaContinuableConTexto = "historia-continuable-texto-de-prueba"

func init() {
	conducto, ok := documentos.PorID(plantillaConducto, 1)
	if !ok {
		panic("falta la plantilla de conducto")
	}
	historia := *conducto
	historia.ID, historia.Nombre, historia.Tipo = plantillaContinuableConTexto, "Historia continuable con texto", documentos.TipoHistoriaClinica
	historia.Secciones = append(slices.Clone(conducto.Secciones), documentos.Seccion{ID: "diagnostico", Titulo: "Diagnóstico", Campos: []documentos.Campo{
		{Tipo: "texto", ID: "diagnostico_anexo", Etiqueta: "Continúa en anexo Nº", ContinuaEnAnexo: "diagnostico"},
	}})
	if err := documentos.RegistrarPlantillaDePrueba(historia); err != nil {
		panic(err)
	}
}

// terminarDe — una historia completada y terminada (a firmar), sin firmas.
func (e escenarioDocs) terminarDe(t *testing.T, token, plantillaID string) documentoDetalleResponse {
	t.Helper()
	d := e.crearDe(t, token, plantillaID, e.paciente.ID)
	valores := d.Valores
	valores["elementos"] = []string{"36"}
	if _, tiene := valores["suscribe_fecha_nacimiento"]; !tiene {
		valores["suscribe_fecha_nacimiento"] = "1990-01-01"
	}
	if _, tiene := valores["suscribe_domicilio"]; !tiene {
		valores["suscribe_domicilio"] = "Calle 1"
	}
	e.guardar(t, token, d.ID, valores)
	return e.terminar(t, token, d.ID)
}

func TestContinuacion_RespuestasDeError(t *testing.T) {
	e := escenarioDeDocumentos(t, "cont-errores")
	historia := e.crearDe(t, e.token, plantillaGeneral, e.paciente.ID)
	colega, _ := e.colegaConPerfil(t, "cont-errores-colega@example.com")

	casos := []struct {
		nombre, token, id string
		cuerpo            any
		esperado          int
	}{
		{"un id que no es uuid", e.token, "no-es-un-id", map[string]any{"seccion": "plan"}, http.StatusBadRequest},
		{"un cuerpo inválido", e.token, historia.ID, "no es un objeto", http.StatusBadRequest},
		{"una historia que no existe", e.token, uuid.NewString(), map[string]any{"seccion": "plan"}, http.StatusNotFound},
		{"la historia en borrador de otro", colega, historia.ID, map[string]any{"seccion": "plan"}, http.StatusNotFound},
		{"una sección vacía", e.token, historia.ID, map[string]any{"seccion": "  "}, http.StatusUnprocessableEntity},
		{"una sección que no existe", e.token, historia.ID, map[string]any{"seccion": "anamnesis"}, http.StatusUnprocessableEntity},
	}
	for _, c := range casos {
		rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+c.id+"/continuaciones", c.token, c.cuerpo)
		if rec.Code != c.esperado {
			t.Errorf("%s: %d (se esperaba %d) %s", c.nombre, rec.Code, c.esperado, rec.Body.String())
		}
	}

	// Algo que no es una historia: un consentimiento, y el propio anexo.
	consentimiento := e.crearDe(t, e.token, plantillaConducto, e.paciente.ID)
	if codigo, _ := e.continuar(t, e.token, consentimiento.ID, "plan"); codigo != http.StatusNotFound {
		t.Errorf("un consentimiento: %d", codigo)
	}
	_, anexo := e.continuar(t, e.token, historia.ID, "plan")
	if codigo, _ := e.continuar(t, e.token, anexo.ID, "plan"); codigo != http.StatusNotFound {
		t.Errorf("un anexo de continuación: %d", codigo)
	}

	// Una historia anulada.
	anulada := e.terminarDe(t, e.token, plantillaHistoriaContinuable)
	if err := e.gdb.Exec(`UPDATE documentos_clinicos SET estado = 'anulado', anulado_en = now(), motivo_anulacion = 'Prueba' WHERE id = ?`, anulada.ID).Error; err != nil {
		t.Fatalf("anular: %v", err)
	}
	if codigo, _ := e.continuar(t, e.token, anulada.ID, "plan"); codigo != http.StatusNotFound {
		t.Errorf("una historia anulada: %d", codigo)
	}

	// Nada de lo rechazado creó un anexo.
	var cuantos int64
	if err := e.gdb.Model(&db.DocumentoClinico{}).Where("plantilla_id = ?", documentos.PlantillaDeContinuacion).Count(&cuantos).Error; err != nil || cuantos != 1 {
		t.Fatalf("anexos de continuación creados: %d (%v)", cuantos, err)
	}
}

// Un anexo que existe y quien pide no ve: el de un colega, cuando el
// paciente salió de la lista de quien escribió la historia.
func TestContinuacion_ElAnexoExisteYNoSeVe(t *testing.T) {
	e := escenarioDeDocumentos(t, "cont-no-visible")
	colega, colegaID := e.colegaConPerfil(t, "cont-no-visible-colega@example.com")
	historia := e.completarYSellarDe(t, colega, plantillaHistoriaContinuable, e.paciente.ID)

	// El titular ve la historia sellada (el paciente está en su lista) y
	// crea el anexo del plan.
	codigo, anexo := e.continuar(t, e.token, historia.ID, "plan")
	if codigo != http.StatusCreated {
		t.Fatalf("el titular crea el anexo: %d", codigo)
	}
	// El paciente sale de la lista del colega: sigue viendo su historia (es
	// el autor), pero no el anexo del titular.
	if err := e.gdb.Where("paciente_id = ? AND user_id = ?", e.paciente.ID, colegaID).Delete(&db.PacienteEnMiLista{}).Error; err != nil {
		t.Fatal(err)
	}
	if rec := doJSONAuth(t, e.router, http.MethodGet, "/documentos/"+anexo.ID, colega, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("el colega ya no ve el anexo: %d", rec.Code)
	}
	if codigo, _ := e.continuar(t, colega, historia.ID, "plan"); codigo != http.StatusConflict {
		t.Fatalf("pedir el anexo que existe y no ve: %d", codigo)
	}
	if rec := e.asentar(t, colega, anexo.ID, "No lo ve."); rec.Code != http.StatusNotFound {
		t.Fatalf("un asiento en un anexo que no ve: %d", rec.Code)
	}
	// Y no crea un segundo anexo de la misma sección.
	if codigo, otro := e.continuar(t, colega, historia.ID, "plan"); codigo == http.StatusCreated || otro.ID != "" {
		t.Fatalf("no crea un segundo anexo de la misma sección: %d", codigo)
	}
}

func TestContinuacion_ElNumeroEnUnCampoDeTexto(t *testing.T) {
	e := escenarioDeDocumentos(t, "cont-texto")
	historia := e.crearDe(t, e.token, plantillaContinuableConTexto, e.paciente.ID)
	if codigo, _ := e.continuar(t, e.token, historia.ID, "diagnostico"); codigo != http.StatusCreated {
		t.Fatalf("crear: %d", codigo)
	}
	leida := e.leer(t, e.token, historia.ID)
	if leida.Valores["diagnostico_anexo"] != "1" {
		t.Fatalf("un campo de texto guarda el número como texto: %#v", leida.Valores["diagnostico_anexo"])
	}
	leida.Valores["diagnostico_anexo"] = ""
	if guardada := e.guardar(t, e.token, historia.ID, leida.Valores); guardada.Valores["diagnostico_anexo"] != "1" {
		t.Fatalf("guardar vacío no borra el número: %#v", guardada.Valores["diagnostico_anexo"])
	}
	// Sin el campo en el body, también vuelve.
	delete(leida.Valores, "diagnostico_anexo")
	if guardada := e.guardar(t, e.token, historia.ID, leida.Valores); guardada.Valores["diagnostico_anexo"] != "1" {
		t.Fatalf("guardar sin el campo no borra el número: %#v", guardada.Valores["diagnostico_anexo"])
	}
}

// Una historia terminada (a firmar o sellada) no cambia en nada al crear su
// anexo: ni su contenido congelado ni sus valores.
func TestContinuacion_UnaHistoriaTerminadaNoCambia(t *testing.T) {
	e := escenarioDeDocumentos(t, "cont-terminada")
	for _, historia := range []documentoDetalleResponse{
		e.terminarDe(t, e.token, plantillaHistoriaContinuable),
		e.completarYSellarDe(t, e.token, plantillaHistoriaContinuable, e.paciente.ID),
	} {
		var antes, despues db.DocumentoClinico
		if err := e.gdb.First(&antes, "id = ?", historia.ID).Error; err != nil {
			t.Fatal(err)
		}
		if codigo, _ := e.continuar(t, e.token, historia.ID, "plan"); codigo != http.StatusCreated {
			t.Fatalf("crear el anexo de una historia %s: %d", antes.Estado, codigo)
		}
		if err := e.gdb.First(&despues, "id = ?", historia.ID).Error; err != nil {
			t.Fatal(err)
		}
		if *despues.HashContenido != *antes.HashContenido || *despues.ContenidoCanonico != *antes.ContenidoCanonico ||
			!reflect.DeepEqual(despues.Valores, antes.Valores) || !despues.UpdatedAt.Equal(antes.UpdatedAt) || despues.Estado != antes.Estado {
			t.Fatalf("crear el anexo tocó la historia %s", antes.Estado)
		}
		if _, tiene := despues.Valores["plan_anexo"]; tiene {
			t.Fatalf("el número se escribió en una historia %s", antes.Estado)
		}
	}
}

func TestAsientos_RespuestasDeError(t *testing.T) {
	e := escenarioDeDocumentos(t, "asientos-errores")
	historia := e.crearDe(t, e.token, plantillaGeneral, e.paciente.ID)
	_, anexo := e.continuar(t, e.token, historia.ID, "plan")
	sellada := e.completarYSellar(t, e.token, e.paciente.ID)

	casos := []struct {
		nombre, id string
		cuerpo     any
		esperado   int
	}{
		{"un id que no es uuid", "x", map[string]any{"texto": "a"}, http.StatusBadRequest},
		{"un cuerpo inválido", anexo.ID, []int{1}, http.StatusBadRequest},
		{"un carácter NUL en el texto", anexo.ID, map[string]any{"texto": "Con\x00trol."}, http.StatusBadRequest},
		{"un texto en blanco", anexo.ID, map[string]any{"texto": "   "}, http.StatusBadRequest},
		{"un documento que no existe", uuid.NewString(), map[string]any{"texto": "Control."}, http.StatusNotFound},
		{"un documento sellado", sellada.ID, map[string]any{"texto": "Control."}, http.StatusConflict},
	}
	for _, c := range casos {
		rec := doJSONAuth(t, e.router, http.MethodPost, "/documentos/"+c.id+"/asientos", e.token, c.cuerpo)
		if rec.Code != c.esperado {
			t.Errorf("%s: %d (se esperaba %d) %s", c.nombre, rec.Code, c.esperado, rec.Body.String())
		}
	}
	// 4000 caracteres justos entran (y con espacios alrededor, también).
	if rec := e.asentar(t, e.token, anexo.ID, "  "+repetir("á", 4000)+"  "); rec.Code != http.StatusCreated {
		t.Fatalf("un asiento de 4000 caracteres: %d %s", rec.Code, rec.Body.String())
	}
	// Ninguno de los rechazados dejó un asiento ni un evento.
	var asientos, eventos int64
	e.gdb.Model(&db.DocumentoAsiento{}).Where("documento_id = ?", anexo.ID).Count(&asientos)
	e.gdb.Model(&db.DocumentoEvento{}).Where("documento_id = ? AND tipo = ?", anexo.ID, db.EventoDocumentoAsiento).Count(&eventos)
	if asientos != 1 || eventos != 1 {
		t.Fatalf("asientos %d, eventos de asiento %d", asientos, eventos)
	}
}

func repetir(s string, n int) string {
	out := make([]byte, 0, len(s)*n)
	for range n {
		out = append(out, s...)
	}
	return string(out)
}

// Dos pedidos de la misma sección: el segundo llega al mismo anexo (200) y
// no a un 500. La concurrencia real no se puede probar sobre la transacción
// de testdb (TR-161); el índice único lo prueba el paquete db.
func TestContinuacion_DosPedidosDeLaMismaSeccionLleganAlMismo(t *testing.T) {
	e := escenarioDeDocumentos(t, "cont-dos")
	historia := e.crearDe(t, e.token, plantillaGeneral, e.paciente.ID)
	colega, _ := e.colegaConPerfil(t, "cont-dos-colega@example.com")
	sellada := e.completarYSellarDe(t, e.token, plantillaHistoriaContinuable, e.paciente.ID)

	c1, a1 := e.continuar(t, e.token, historia.ID, "observaciones")
	c2, a2 := e.continuar(t, e.token, historia.ID, "observaciones")
	if c1 != http.StatusCreated || c2 != http.StatusOK || a1.ID != a2.ID {
		t.Fatalf("dos pedidos: %d %d, %s %s", c1, c2, a1.ID, a2.ID)
	}
	// Con la historia sellada, el colega que la ve llega al mismo que el autor.
	c1, a1 = e.continuar(t, e.token, sellada.ID, "plan")
	c2, a2 = e.continuar(t, colega, sellada.ID, "plan")
	if c1 != http.StatusCreated || c2 != http.StatusOK || a1.ID != a2.ID {
		t.Fatalf("el autor y el colega: %d %d", c1, c2)
	}
}

// La fecha del último asiento de cada anexo sale de una consulta fija: la
// lista de documentos del paciente no hace una consulta más por anexo.
func TestContinuacion_UltimoAsientoSinUnaConsultaPorFila(t *testing.T) {
	e := escenarioDeDocumentos(t, "cont-consultas")
	historia := e.crearDe(t, e.token, plantillaGeneral, e.paciente.ID)
	listar := func() int64 {
		return contarConsultasDe(t, e.gdb, func() {
			rec := doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String()+"/documentos", e.token, nil)
			if rec.Code != http.StatusOK {
				t.Fatalf("listar: %d", rec.Code)
			}
		})
	}
	_, primero := e.continuar(t, e.token, historia.ID, "diagnostico")
	e.asentar(t, e.token, primero.ID, "Uno.")
	conUno := listar()
	for _, seccion := range []string{"plan", "observaciones"} {
		_, anexo := e.continuar(t, e.token, historia.ID, seccion)
		e.asentar(t, e.token, anexo.ID, "Uno.")
		e.asentar(t, e.token, anexo.ID, "Dos.")
	}
	if conTres := listar(); conTres != conUno {
		t.Fatalf("con un anexo %d consultas, con tres %d", conUno, conTres)
	}
	rec := doJSONAuth(t, e.router, http.MethodGet, "/pacientes/"+e.paciente.ID.String()+"/documentos", e.token, nil)
	con := 0
	for _, d := range decodificar[[]documentoResumenResponse](t, rec.Body.Bytes()) {
		if d.Continuacion != nil {
			if d.UltimoAsientoEn == nil {
				t.Errorf("el anexo %s sin la fecha de su último asiento", d.ID)
			}
			con++
		}
	}
	if con != 3 {
		t.Fatalf("anexos en la lista: %d", con)
	}
}
