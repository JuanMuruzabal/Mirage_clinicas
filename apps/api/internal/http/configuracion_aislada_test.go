package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// LA CONFIGURACIÓN DE AGENDA ES DE UN PROFESIONAL — QA de la Fase 3.2.6
// (2026-09-20).
//
// El pedido, textual: *"la configuración debería ser totalmente aislada
// para el profesional que se selecciona y al sacar turno la
// disponibilidad y tipo de consulta debe ser coherente con la
// configuración y los horarios disponibles del profesional seleccionado"*.
//
// Tres bugs distintos daban esa impresión, y cada uno tiene su test acá:
//
//  1. `tipos_consulta.go` se quedó en `session.UserID` cuando la 3.2.6
//     mudó todo lo demás al foco. Recepción veía siempre la misma lista
//     —la suya, la de alguien que no atiende— eligiera a quien eligiera, y
//     el tipo que creaba nacía a su nombre: después no lo encontraba para
//     editarlo ("tipo de consulta no encontrado") y la disponibilidad de
//     "+ Agregar turno" no devolvía ningún horario.
//  2. Las escrituras de agenda caían a `user_id` NULL cuando no había
//     foco. Una fila sin dueño NO es "de la clínica": los scopes la
//     incluyen para TODOS los profesionales, porque son las filas
//     anteriores a la 3.2.1.
//  3. La disponibilidad resolvía el tipo con el scope de la sesión y los
//     huecos con `profesionalQueAtiende`: dos respuestas que podían ser de
//     personas distintas.

// TestConfiguracion_ElTipoNaceEnLaAgendaDelProfesionalEnFoco — el bug 1.
func TestConfiguracion_ElTipoNaceEnLaAgendaDelProfesionalEnFoco(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "tipofoco")

	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", esc.recepToken, tipoConsultaRequest{
		Nombre: "Ortodoncia de prueba", Color: "#E7D9BE", DuracionMinutos: 30,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear tipo: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var creado tipoConsultaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &creado)

	var enLaBase db.TipoConsulta
	if err := gdb.First(&enLaBase, "id = ?", creado.ID).Error; err != nil {
		t.Fatalf("no se pudo leer el tipo: %v", err)
	}
	if enLaBase.UserID == nil || *enLaBase.UserID != esc.colegaID {
		t.Errorf("user_id = %v, esperaba el colega en foco (%s) y no el usuario de recepción",
			enLaBase.UserID, esc.colegaID)
	}

	// Y lo encuentra para editarlo: el síntoma reportado era justamente
	// que el tipo recién creado daba "tipo de consulta no encontrado".
	edit := doJSONAuth(t, router, http.MethodPatch, "/tipos-consulta/"+creado.ID, esc.recepToken,
		tipoConsultaRequest{Nombre: "Ortodoncia editada", Color: "#E7D9BE", DuracionMinutos: 45})
	if edit.Code != http.StatusOK {
		t.Errorf("editar: status=%d body=%s", edit.Code, edit.Body.String())
	}
	del := doJSONAuth(t, router, http.MethodDelete, "/tipos-consulta/"+creado.ID, esc.recepToken, nil)
	if del.Code != http.StatusNoContent && del.Code != http.StatusOK {
		t.Errorf("borrar: status=%d body=%s", del.Code, del.Body.String())
	}
}

// TestConfiguracion_CadaProfesionalVeSusTipos — el otro lado del bug 1:
// la lista tiene que cambiar al cambiar de profesional.
func TestConfiguracion_CadaProfesionalVeSusTipos(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "tiposlista")
	titularID := userIDDelMail(t, gdb, "titular-tiposlista@example.com")

	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	if rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", esc.recepToken, tipoConsultaRequest{
		Nombre: "Solo del colega", Color: "#E7D9BE", DuracionMinutos: 30,
	}); rec.Code != http.StatusCreated {
		t.Fatalf("crear tipo: status=%d body=%s", rec.Code, rec.Body.String())
	}

	if tieneTipo(t, router, esc.recepToken, "Solo del colega") != true {
		t.Error("parada en el colega, recepción no ve el tipo que acaba de crearle")
	}

	if code := elegirVista(t, router, esc.recepToken, titularID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	if tieneTipo(t, router, esc.recepToken, "Solo del colega") {
		t.Error("el tipo del colega aparece en la configuración del titular: la agenda no está aislada")
	}
}

func tieneTipo(t *testing.T, router http.Handler, token, nombre string) bool {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/tipos-consulta", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /tipos-consulta: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var tipos []tipoConsultaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &tipos); err != nil {
		t.Fatalf("respuesta ilegible: %v", err)
	}
	for _, tipo := range tipos {
		if tipo.Nombre == nombre {
			return true
		}
	}
	return false
}

// TestConfiguracion_SinProfesionalElegidoNoSeConfiguraNada — el bug 2.
//
// Una fila con `user_id` NULL la ven TODOS los profesionales. Así que
// "guardar sin elegir a nadie" no es guardar en la clínica: es guardar en
// la agenda de todos a la vez.
func TestConfiguracion_SinProfesionalElegidoNoSeConfiguraNada(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "sinelegir")

	mañana := clock.In(clock.Now().Add(24 * time.Hour)).Format("2006-01-02")
	casos := []struct {
		que    string
		metodo string
		ruta   string
		body   any
	}{
		{"horario reservado", http.MethodPost, "/bloqueos", crearBloqueoHorarioRequest{
			Especifico: true, Fecha: mañana, HoraDesde: "10:00", HoraHasta: "11:00",
		}},
		{"tipo de consulta", http.MethodPost, "/tipos-consulta", tipoConsultaRequest{
			Nombre: "Sin dueño", Color: "#E7D9BE", DuracionMinutos: 30,
		}},
		{"horario de atención", http.MethodPut, "/horario-atencion", map[string]string{
			"horaDesde": "08:00", "horaHasta": "18:00",
		}},
	}
	for _, caso := range casos {
		rec := doJSONAuth(t, router, caso.metodo, caso.ruta, esc.recepToken, caso.body)
		if rec.Code != http.StatusConflict {
			t.Errorf("%s: status=%d, esperaba 409 pidiendo elegir profesional (body=%s)",
				caso.que, rec.Code, rec.Body.String())
		}
	}

	// Y nada quedó escrito sin dueño.
	var huerfanos int64
	gdb.Model(&db.BloqueoHorario{}).Where("clinic_id = ? AND user_id IS NULL", esc.clinicID).Count(&huerfanos)
	if huerfanos != 0 {
		t.Errorf("quedaron %d horarios reservados sin dueño: los ve la agenda de todos", huerfanos)
	}
}

// TestConfiguracion_LaDisponibilidadEsDeLaAgendaPedida — el bug 3.
//
// "+ Agregar turno" elige agenda en el propio modal, sin mover el foco.
// Si el tipo se resuelve contra una persona y los huecos contra otra, el
// resultado no es la agenda de ninguna de las dos — y lo que se ve en
// pantalla es "no hay horarios disponibles" sobre una agenda libre.
func TestConfiguracion_LaDisponibilidadEsDeLaAgendaPedida(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "dispoagenda")

	// Un tipo y un horario de atención para el COLEGA.
	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", esc.recepToken, tipoConsultaRequest{
		Nombre: "Consulta del colega", Color: "#E7D9BE", DuracionMinutos: 30,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear tipo: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var tipo tipoConsultaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &tipo)

	if h := doJSONAuth(t, router, http.MethodPut, "/horario-atencion", esc.recepToken,
		map[string]string{"horaDesde": "08:00", "horaHasta": "20:00"}); h.Code != http.StatusOK && h.Code != http.StatusCreated {
		t.Fatalf("horario de atención: status=%d body=%s", h.Code, h.Body.String())
	}

	// Ahora recepción vuelve a la vista general —como si estuviera en el
	// modal de "+ Agregar turno"— y pregunta por la agenda del colega.
	volverALaVistaGeneral(t, router, esc.recepToken)

	mañana := clock.In(clock.Now().Add(24 * time.Hour)).Format("2006-01-02")
	ruta := "/disponibilidad?tipoConsultaId=" + tipo.ID + "&fecha=" + mañana +
		"&profesionalUserId=" + esc.colegaID.String()
	disp := doJSONAuth(t, router, http.MethodGet, ruta, esc.recepToken, nil)
	if disp.Code != http.StatusOK {
		t.Fatalf("GET /disponibilidad: status=%d body=%s", disp.Code, disp.Body.String())
	}
	var out disponibilidadResponse
	if err := json.Unmarshal(disp.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta ilegible: %v", err)
	}
	if len(out.Slots) == 0 {
		t.Error("no devolvió ningún horario para una agenda con 08:00 a 20:00 libres — es el síntoma que reportó el cliente")
	}
}

// Sin agenda pedida NI foco, la disponibilidad tampoco adivina.
func TestConfiguracion_SinAgendaNoHayDisponibilidad(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "dispovacia")

	mañana := clock.In(clock.Now().Add(24 * time.Hour)).Format("2006-01-02")
	ruta := "/disponibilidad?tipoConsultaId=" + esc.tipoID + "&fecha=" + mañana
	rec := doJSONAuth(t, router, http.MethodGet, ruta, esc.recepToken, nil)
	if rec.Code != http.StatusConflict {
		t.Errorf("status=%d, esperaba 409 pidiendo elegir profesional", rec.Code)
	}
}

// TestConfiguracion_NoSugiereLoQueElProfesionalYaTiene — QA de la 3.2.6
// (2026-09-20): *"en tipos de turno me sigue sugiriendo los tipos 'de
// esta clínica' aunque ya los tenga configurado el profesional"*.
//
// `tipos_consulta_colegas.go` tenía el mismo bug que su hermano: armaba
// "lo que ya tenés" contra el usuario de la SESIÓN. Para recepción eso es
// alguien que no atiende y no tiene ningún tipo, así que nunca escondía
// nada — y por el mismo motivo los tipos PROPIOS del profesional en foco
// se listaban como si fueran de un colega.
func TestConfiguracion_NoSugiereLoQueElProfesionalYaTiene(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "colegas")

	// El colega ya tiene "Limpieza dental"; el titular también.
	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	if rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", esc.recepToken, tipoConsultaRequest{
		Nombre: "Limpieza dental", Color: "#E7D9BE", DuracionMinutos: 30,
	}); rec.Code != http.StatusCreated {
		t.Fatalf("crear tipo del colega: status=%d body=%s", rec.Code, rec.Body.String())
	}

	sugeridos := tiposDeColegas(t, router, esc.recepToken)
	for _, s := range sugeridos {
		if seParecen(s, "Limpieza dental") {
			t.Errorf("se sugiere %q, que el profesional en foco YA tiene configurado", s)
		}
	}
}

// Y el otro lado: lo que tiene un COLEGA sí se ofrece.
func TestConfiguracion_SiSugiereLoDeUnColega(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "colegasi")
	titularID := userIDDelMail(t, gdb, "titular-colegasi@example.com")

	if code := elegirVista(t, router, esc.recepToken, titularID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	if rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", esc.recepToken, tipoConsultaRequest{
		Nombre: "Blanqueamiento del titular", Color: "#E7D9BE", DuracionMinutos: 30,
	}); rec.Code != http.StatusCreated {
		t.Fatalf("crear tipo: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Parada en el colega, el tipo del titular sí es "de un colega".
	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	sugeridos := tiposDeColegas(t, router, esc.recepToken)
	encontrado := false
	for _, s := range sugeridos {
		if s == "Blanqueamiento del titular" {
			encontrado = true
		}
	}
	if !encontrado {
		t.Errorf("no se ofrece el tipo del titular; sugeridos = %v", sugeridos)
	}
}

func tiposDeColegas(t *testing.T, router http.Handler, token string) []string {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/tipos-consulta/de-colegas", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /tipos-consulta/de-colegas: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out []tipoDeColegaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta ilegible: %v", err)
	}
	nombres := make([]string, 0, len(out))
	for _, tipo := range out {
		nombres = append(nombres, tipo.Nombre)
	}
	return nombres
}
