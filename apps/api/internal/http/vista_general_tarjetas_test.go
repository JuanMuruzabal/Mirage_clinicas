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

// Las tarjetas de General y la tabla de Turnos en la VISTA GENERAL —
// QA de la Fase 3.2.6.
//
// El pedido, textual: *"en general de la vista 'Toda la clínica' las
// tarjetas deben tener también el profesional"*, y enseguida el límite
// que le pone: *"ESTO SOLO APLICARLO A LA VISTA 'Toda la clínica', en la
// vista de los demás profesionales debe quedar como está ahora mismo"*.
//
// Las dos mitades importan por igual y tiran en direcciones opuestas, así
// que cada una tiene su test:
//
//   - Sin el nombre, una lista que mezcla los turnos de N profesionales
//     no sirve para atender un teléfono.
//   - Con el nombre en la vista de un profesional, la columna sería la
//     misma palabra repetida en cada fila: ruido, no información.
//
// La condición vive en el BACKEND (`veTodaLaClinica`) y no en la
// pantalla: la tabla dibuja la columna cuando el dato viene, así que
// "cuándo viene" tiene un solo dueño. Por eso se verifica acá.

// turnoDePruebaParaElColega carga un turno en la agenda del colega
// usando el foco de recepción — el mismo camino que usa la persona real,
// no un insert a mano.
func turnoDePruebaParaElColega(
	t *testing.T, router http.Handler, esc escenarioRecepcion, dni, email string, inicio time.Time,
) turnoResponse {
	t.Helper()
	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", esc.recepToken, crearTurnoManualRequest{
		NombreContacto: "Ana", ApellidoContacto: "Paciente", DNIContacto: dni,
		TelefonoContacto: "3510000000", EmailContacto: email,
		TipoConsultaID: esc.tipoID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear turno: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var creado turnoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &creado); err != nil {
		t.Fatalf("respuesta ilegible: %v", err)
	}
	return creado
}

// manianaALas10 — mañana a las 10 de la mañana EN CÓRDOBA.
//
// Y no `manianaALas10(t)`, que es lo que decía antes y fallaba
// según la hora a la que corriera la suite: a las 22:00 esas 26 horas caen
// en PASADO mañana, y la tarjeta "Turnos próximos" —que muestra el día
// siguiente y nada más— quedaba vacía. Mismo problema que ya había
// resuelto `horaVigenteDeHoy` para el otro extremo del día.
func manianaALas10(t *testing.T) time.Time {
	t.Helper()
	maniana := clock.In(clock.Now()).AddDate(0, 0, 1)
	return time.Date(maniana.Year(), maniana.Month(), maniana.Day(), 10, 0, 0, 0, maniana.Location())
}

// volverALaVistaGeneral deja a recepción sin foco: es la vista general.
func volverALaVistaGeneral(t *testing.T, router http.Handler, token string) {
	t.Helper()
	if code := elegirVista(t, router, token, ""); code != http.StatusOK {
		t.Fatalf("volver a la vista general: status=%d", code)
	}
}

func resumenDelPanel(t *testing.T, router http.Handler, token string) resumenPanelResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /panel/resumen: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out resumenPanelResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta ilegible: %v", err)
	}
	return out
}

// TestVistaGeneral_LasTarjetasDicenDeQuienEsCadaFila — "Turnos próximos"
// con el nombre Y el id del profesional.
//
// El id no es un extra del nombre: tocar una fila desde la vista general
// primero se para en esa agenda y después navega (`LinkConVista`). Sin el
// id, el link llevaría al módulo siguiente con la vista de otro y la
// pantalla de destino mostraría algo distinto de lo que la fila prometía.
func TestVistaGeneral_LasTarjetasDicenDeQuienEsCadaFila(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "tarjetas")

	turnoDePruebaParaElColega(t, router, esc, "41500001", "ana-tarjetas@example.com",
		manianaALas10(t))
	volverALaVistaGeneral(t, router, esc.recepToken)

	resumen := resumenDelPanel(t, router, esc.recepToken)
	if len(resumen.TurnosProximos) == 0 {
		t.Fatal("la vista general no trajo el turno del colega")
	}
	item := resumen.TurnosProximos[0]
	if item.Profesional == "" {
		t.Error("el turno no dice de quién es: la vista general mezcla N agendas y sin el nombre la fila no se puede atender")
	}
	if item.ProfesionalID != esc.colegaID.String() {
		t.Errorf("profesionalId = %q, esperaba el colega (%s): sin él, tocar la fila llevaría a la agenda equivocada",
			item.ProfesionalID, esc.colegaID)
	}
}

// TestVistaDeUnProfesional_LasTarjetasNoRepitenSuNombre — la otra mitad
// del pedido, y la que se rompe sola si alguien "simplifica" mandando el
// nombre siempre.
func TestVistaDeUnProfesional_LasTarjetasNoRepitenSuNombre(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "tarjetasfoco")

	turnoDePruebaParaElColega(t, router, esc, "41500002", "ana-tarjetasfoco@example.com",
		manianaALas10(t))
	// Sin volver a la general: recepción sigue parada en el colega.

	resumen := resumenDelPanel(t, router, esc.recepToken)
	if len(resumen.TurnosProximos) == 0 {
		t.Fatal("la vista del colega no trajo su propio turno")
	}
	if p := resumen.TurnosProximos[0].Profesional; p != "" {
		t.Errorf("profesional = %q; en la vista de UN profesional todos los turnos son suyos y la columna sería su nombre repetido", p)
	}
}

// TestVistaGeneral_LosHorariosReservadosDicenDeQuienSonLosDeOtro — los
// horarios reservados salen de OTRA tabla que los turnos, así que su
// nombre se arma con una consulta aparte. Es justo el lugar donde es
// fácil completar los turnos y olvidarse de estos.
func TestVistaGeneral_LosHorariosReservadosDicenDeQuienSon(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "bloqueos")

	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	// La fecha del bloqueo se arma contra el reloj del PRODUCTO (Córdoba,
	// UTC-3), no contra el del runner: en UTC, "mañana" cae otro día.
	mañana := clock.In(clock.Now().Add(24 * time.Hour)).Format("2006-01-02")
	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", esc.recepToken, crearBloqueoHorarioRequest{
		Especifico: true,
		Fecha:      mañana, HoraDesde: "10:00", HoraHasta: "11:00",
		Motivo: "Congreso",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear bloqueo: status=%d body=%s", rec.Code, rec.Body.String())
	}
	volverALaVistaGeneral(t, router, esc.recepToken)

	resumen := resumenDelPanel(t, router, esc.recepToken)
	if len(resumen.HorariosReservados) == 0 {
		t.Fatal("la vista general no trajo el horario reservado del colega")
	}
	h := resumen.HorariosReservados[0]
	if h.Profesional == "" {
		t.Error("el horario reservado no dice de quién es la agenda que ocupa")
	}
	if h.ProfesionalID != esc.colegaID.String() {
		t.Errorf("profesionalId = %q, esperaba el colega (%s)", h.ProfesionalID, esc.colegaID)
	}
}

// TestVistaGeneral_LaColumnaProfesionalDeTurnosEsExclusiva — lo mismo en
// la tabla de /turnos, donde el dato entra por otro handler.
func TestVistaGeneral_LaColumnaProfesionalDeTurnosEsExclusiva(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "columna")

	turnoDePruebaParaElColega(t, router, esc, "41500003", "ana-columna@example.com",
		manianaALas10(t))

	// Parado en el colega: sin nombre.
	var enFoco []turnoResponse
	rec := doJSONAuth(t, router, http.MethodGet, "/turnos", esc.recepToken, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /turnos: status=%d", rec.Code)
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &enFoco); err != nil {
		t.Fatalf("respuesta ilegible: %v", err)
	}
	if len(enFoco) == 0 {
		t.Fatal("la vista del colega no trajo su turno")
	}
	if n := enFoco[0].AtendidoPorNombre; n != "" {
		t.Errorf("atendidoPorNombre = %q en la vista de un profesional: la columna sería su nombre repetido", n)
	}

	// En la vista general: con nombre.
	volverALaVistaGeneral(t, router, esc.recepToken)
	var general []turnoResponse
	rec = doJSONAuth(t, router, http.MethodGet, "/turnos", esc.recepToken, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /turnos (general): status=%d", rec.Code)
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &general); err != nil {
		t.Fatalf("respuesta ilegible: %v", err)
	}
	if len(general) == 0 {
		t.Fatal("la vista general no trajo el turno del colega")
	}
	if general[0].AtendidoPorNombre == "" {
		t.Error("atendidoPorNombre vacío en la vista general: la tabla dibuja la columna cuando el dato viene, y acá tiene que venir")
	}
}

// TestVistaGeneral_UnProfesionalNuncaVeLaColumna — el aislamiento de la
// 3.2.2, que esta subfase no relaja: la columna no es una decoración que
// se pueda mandar de más, es el nombre de un colega.
func TestVistaGeneral_UnProfesionalNuncaVeLaColumna(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "aisladacol")

	turnoDePruebaParaElColega(t, router, esc, "41500004", "ana-aisladacol@example.com",
		manianaALas10(t))

	resumen := resumenDelPanel(t, router, esc.titular.Token)
	for _, it := range resumen.TurnosProximos {
		if it.Profesional != "" || it.ProfesionalID != "" {
			t.Errorf("el titular vio %q/%q en su propia tarjeta", it.Profesional, it.ProfesionalID)
		}
	}
}

// EL ENLACE PARA COMPARTIR ELIGE AGENDA — QA de la Fase 3.2.6.
//
// El control pasó a ser el mismo carrusel del resto del panel: "Cualquier
// profesional" o uno puntual. Eso abre un caso que antes no se podía
// expresar —recepción generando el link de la agenda de un colega— y con
// él, la pregunta de quién puede hacerlo. La respuesta no puede vivir en
// la pantalla: un profesional generando un enlace que llena la agenda de
// un colega sería la fuga de la 3.2.2 por una puerta nueva.

func crearEnlaceEligiendoAgenda(
	t *testing.T, router http.Handler, token, profesionalUserID string,
) int {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodPost, "/enlaces-turno", token, crearEnlaceTurnoRequest{
		ProfesionalUserID: profesionalUserID,
	})
	return rec.Code
}

func TestEnlaceTurno_RecepcionPuedeElegirLaAgendaDeUnColega(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "enlacerecep")

	if code := crearEnlaceEligiendoAgenda(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusCreated {
		t.Fatalf("status=%d, esperaba 201", code)
	}

	// Y el enlace queda a nombre del colega: es lo que decide a qué
	// agenda entran los turnos que se saquen con él.
	var enlace db.EnlaceTurno
	if err := gdb.Order("created_at DESC").First(&enlace).Error; err != nil {
		t.Fatalf("no se pudo leer el enlace: %v", err)
	}
	if enlace.UserID == nil || *enlace.UserID != esc.colegaID {
		t.Errorf("user_id = %v, esperaba el colega (%s)", enlace.UserID, esc.colegaID)
	}
}

func TestEnlaceTurno_UnProfesionalNoPuedeGenerarloParaOtro(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "enlaceajeno")

	// 404 y no 403, mismo criterio que la ficha de un paciente ajeno:
	// para quien no puede, esa agenda no existe.
	if code := crearEnlaceEligiendoAgenda(t, router, esc.titular.Token, esc.colegaID.String()); code != http.StatusNotFound {
		t.Errorf("status=%d, esperaba 404: el titular no puede llenarle la agenda a un colega", code)
	}
}

func TestEnlaceTurno_UnProfesionalSiPuedeElegirseASiMismo(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "enlacepropio")
	titularID := userIDDelMail(t, gdb, "titular-enlacepropio@example.com")

	// El carrusel siempre manda un id, también cuando la única opción es
	// uno mismo: no puede ser un caso especial.
	if code := crearEnlaceEligiendoAgenda(t, router, esc.titular.Token, titularID.String()); code != http.StatusCreated {
		t.Errorf("status=%d, esperaba 201 sobre la agenda propia", code)
	}
}

func TestEnlaceTurno_SinElegirAgendaSigueSiendoElDeSiempre(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "enlacedefault")
	titularID := userIDDelMail(t, gdb, "titular-enlacedefault@example.com")

	if code := crearEnlaceEligiendoAgenda(t, router, esc.titular.Token, ""); code != http.StatusCreated {
		t.Fatalf("status=%d, esperaba 201", code)
	}
	var enlace db.EnlaceTurno
	if err := gdb.Order("created_at DESC").First(&enlace).Error; err != nil {
		t.Fatalf("no se pudo leer el enlace: %v", err)
	}
	if enlace.UserID == nil || *enlace.UserID != titularID {
		t.Errorf("user_id = %v, esperaba a quien lo generó (%s)", enlace.UserID, titularID)
	}
}

// ELEGIR LA AGENDA DESDE EL FORMULARIO — QA de la Fase 3.2.6.
//
// El pedido: *"faltan, para agregar turno o agregar horario reservado
// (solo en el atajo al lado de agregar turno), elegir el profesional a
// quien se le cargará"*.
//
// Hasta acá recepción tenía que pararse primero en la agenda de alguien;
// desde la vista general el backend le rechazaba el alta pidiéndole
// exactamente eso (`errFaltaElegirProfesional`). Ahora la pregunta viaja
// en el propio alta. Lo que NO cambia es quién puede contestarla.

func TestAgendaElegida_RecepcionCargaUnTurnoSinPararseEnLaVista(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "elegirturno")

	inicio := manianaALas10(t)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", esc.recepToken, crearTurnoManualRequest{
		NombreContacto: "Ana", ApellidoContacto: "Paciente", DNIContacto: "41600001",
		TelefonoContacto: "3510000000", EmailContacto: "ana-elegirturno@example.com",
		TipoConsultaID:    esc.tipoID,
		HoraInicio:        inicio.Format(time.RFC3339),
		HoraFin:           inicio.Add(30 * time.Minute).Format(time.RFC3339),
		ProfesionalUserID: esc.colegaID.String(),
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}

	var creado turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &creado)
	var enLaBase db.Turno
	if err := gdb.First(&enLaBase, "id = ?", creado.ID).Error; err != nil {
		t.Fatalf("no se pudo leer el turno: %v", err)
	}
	if enLaBase.AtendidoPorUserID == nil || *enLaBase.AtendidoPorUserID != esc.colegaID {
		t.Errorf("atendido_por_user_id = %v, esperaba el colega elegido (%s)",
			enLaBase.AtendidoPorUserID, esc.colegaID)
	}
}

// El carrusel del modal gana sobre el foco de la sesión: es una decisión
// tomada PARA ESTE turno, delante de la persona.
func TestAgendaElegida_LeGanaAlFocoDeLaSesion(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "elegirgana")
	titularID := userIDDelMail(t, gdb, "titular-elegirgana@example.com")

	// Parada en el colega, pero el formulario dice el titular.
	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	inicio := manianaALas10(t).Add(2 * time.Hour)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", esc.recepToken, crearTurnoManualRequest{
		NombreContacto: "Ana", ApellidoContacto: "Paciente", DNIContacto: "41600002",
		TelefonoContacto: "3510000000", EmailContacto: "ana-elegirgana@example.com",
		TipoConsultaID:    esc.tipoID,
		HoraInicio:        inicio.Format(time.RFC3339),
		HoraFin:           inicio.Add(30 * time.Minute).Format(time.RFC3339),
		ProfesionalUserID: titularID.String(),
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var creado turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &creado)
	var enLaBase db.Turno
	if err := gdb.First(&enLaBase, "id = ?", creado.ID).Error; err != nil {
		t.Fatalf("no se pudo leer el turno: %v", err)
	}
	if enLaBase.AtendidoPorUserID == nil || *enLaBase.AtendidoPorUserID != titularID {
		t.Errorf("atendido_por_user_id = %v, esperaba el elegido en el modal (%s)",
			enLaBase.AtendidoPorUserID, titularID)
	}
}

// El aislamiento de la 3.2.2 no se relaja porque el campo exista: un
// profesional llenándole la agenda a un colega es la misma fuga por una
// puerta nueva.
func TestAgendaElegida_UnProfesionalNoLeCargaUnTurnoAUnColega(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "elegirajeno")

	inicio := manianaALas10(t).Add(4 * time.Hour)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", esc.titular.Token, crearTurnoManualRequest{
		NombreContacto: "Ana", ApellidoContacto: "Paciente", DNIContacto: "41600003",
		TelefonoContacto: "3510000000", EmailContacto: "ana-elegirajeno@example.com",
		TipoConsultaID:    esc.tipoID,
		HoraInicio:        inicio.Format(time.RFC3339),
		HoraFin:           inicio.Add(30 * time.Minute).Format(time.RFC3339),
		ProfesionalUserID: esc.colegaID.String(),
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status=%d, esperaba 404: esa agenda no existe para quien no puede verla", rec.Code)
	}
}

// Lo mismo para el horario reservado: ocupa UNA agenda, y hay que poder
// decir cuál sin cambiar antes la vista de la sesión.
func TestAgendaElegida_RecepcionReservaUnHorarioEnLaAgendaDeUnColega(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "elegirbloqueo")

	mañana := clock.In(clock.Now().Add(24 * time.Hour)).Format("2006-01-02")
	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", esc.recepToken, crearBloqueoHorarioRequest{
		Especifico: true,
		Fecha:      mañana, HoraDesde: "15:00", HoraHasta: "16:00",
		Motivo:            "Congreso",
		ProfesionalUserID: esc.colegaID.String(),
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}

	var bloqueo db.BloqueoHorario
	if err := gdb.Order("created_at DESC").First(&bloqueo).Error; err != nil {
		t.Fatalf("no se pudo leer el bloqueo: %v", err)
	}
	if bloqueo.UserID == nil || *bloqueo.UserID != esc.colegaID {
		t.Errorf("user_id = %v, esperaba el colega (%s)", bloqueo.UserID, esc.colegaID)
	}
}

func TestAgendaElegida_UnIDInventadoNoPasa(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "elegirinventado")

	inicio := manianaALas10(t).Add(6 * time.Hour)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", esc.recepToken, crearTurnoManualRequest{
		NombreContacto: "Ana", ApellidoContacto: "Paciente", DNIContacto: "41600004",
		TelefonoContacto: "3510000000", EmailContacto: "ana-elegirinventado@example.com",
		TipoConsultaID:    esc.tipoID,
		HoraInicio:        inicio.Format(time.RFC3339),
		HoraFin:           inicio.Add(30 * time.Minute).Format(time.RFC3339),
		ProfesionalUserID: "no-es-un-uuid",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status=%d, esperaba 400", rec.Code)
	}
}
