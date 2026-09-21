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

// TestAsistencia_RecepcionNoTienePendientes — QA de la 3.2.6
// (2026-09-20): *"el cartel de asistencia que aparece debe ser exclusivo
// para el profesional, al recepcionista no le debería aparecer"*.
//
// Ese cartel es un modal incerrable que tapa la pantalla hasta que
// alguien marca asistió/ausente, y marcar dispara consecuencias
// irreversibles. La regla vive en el backend y no solo en el layout que
// monta el cartel: esconderlo no es lo mismo que no tener la lista, y
// desde la vista general esa lista serían los turnos de TODOS.
func TestAsistencia_RecepcionNoTienePendientes(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "cartelrecep")

	// Un turno del titular que ya terminó y al que nadie marcó nada.
	crearTurnoAgendadoDePrueba(t, gdb, esc.titular.Profesional.ID, esc.tipoID, horaResueltaDeHoy(t))

	// El profesional que atendió SÍ lo tiene pendiente: sin esto, el test
	// pasaría también con el endpoint roto para todo el mundo.
	if len(pendientesDeAsistencia(t, router, esc.titular.Token)) == 0 {
		t.Error("el profesional que atendió no ve su turno pendiente de asistencia")
	}

	// Recepción, parada donde sea, no.
	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	if v := pendientesDeAsistencia(t, router, esc.recepToken); len(v) != 0 {
		t.Errorf("recepción recibió %d turnos pendientes: el cartel no es suyo", len(v))
	}
	volverALaVistaGeneral(t, router, esc.recepToken)
	if v := pendientesDeAsistencia(t, router, esc.recepToken); len(v) != 0 {
		t.Errorf("en la vista general recepción recibió %d turnos pendientes", len(v))
	}
}

func pendientesDeAsistencia(t *testing.T, router http.Handler, token string) []turnoResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/turnos/pendientes-asistencia", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /turnos/pendientes-asistencia: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out turnosPendientesAsistenciaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta ilegible: %v", err)
	}
	return out.Vencidos
}

// TestNotificaciones_NoCruzaElTurnoDeUnoConElHorarioDeOtro — el mismo
// falso conflicto que el banner del calendario, por la otra puerta.
//
// El comentario de `contarTurnosEnConflictoConBloqueos` ya avisaba de
// esto ("con los dos conjuntos mezclados... un conflicto que no existe"),
// y los scopes lo resolvían para un profesional. Pero en la VISTA GENERAL
// de recepción los dos scopes son un no-op: vuelven a quedar todos los
// turnos contra todos los horarios reservados.
func TestNotificaciones_NoCruzaElTurnoDeUnoConElHorarioDeOtro(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "conflictocruzado")
	titularID := userIDDelMail(t, gdb, "titular-conflictocruzado@example.com")

	// Un turno del TITULAR, y un horario reservado del COLEGA a la misma
	// hora. Ninguno de los dos tiene un conflicto: son agendas distintas.
	inicio := horaVigenteDeHoy(t)
	turno := crearTurnoAgendadoDePrueba(t, gdb, esc.titular.Profesional.ID, esc.tipoID, inicio)
	if err := gdb.Model(&db.Turno{}).Where("id = ?", turno.ID).
		Update("atendido_por_user_id", titularID).Error; err != nil {
		t.Fatalf("no se pudo asignar el turno: %v", err)
	}

	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	hhmm := clock.In(inicio).Format("15:04")
	finHHMM := clock.In(inicio.Add(45 * time.Minute)).Format("15:04")
	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", esc.recepToken, crearBloqueoHorarioRequest{
		Especifico: true,
		Fecha:      clock.In(inicio).Format("2006-01-02"),
		HoraDesde:  hhmm, HoraHasta: finHHMM,
		Motivo: "Reunión del colega",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear bloqueo: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Desde la vista general, donde los scopes no acotan nada.
	volverALaVistaGeneral(t, router, esc.recepToken)
	if n := conflictosConBloqueos(t, router, esc.recepToken); n != 0 {
		t.Errorf("cuenta %d conflictos: el turno del titular no choca con el horario del colega", n)
	}

	// Y el control: con el horario reservado en LA MISMA agenda, sí.
	if err := gdb.Model(&db.BloqueoHorario{}).
		Where("clinic_id = ? AND user_id = ?", esc.clinicID, esc.colegaID).
		Update("user_id", titularID).Error; err != nil {
		t.Fatalf("no se pudo mudar el bloqueo: %v", err)
	}
	if n := conflictosConBloqueos(t, router, esc.recepToken); n == 0 {
		t.Error("no cuenta el conflicto real dentro de una misma agenda")
	}
}

func conflictosConBloqueos(t *testing.T, router http.Handler, token string) int64 {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/panel/notificaciones", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /panel/notificaciones: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta ilegible: %v", err)
	}
	f, ok := out["conflictosCalendario"].(float64)
	if !ok {
		t.Fatalf("la respuesta no trae conflictosCalendario: %s", rec.Body.String())
	}
	return int64(f)
}
