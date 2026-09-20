package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"dental-mirage/api/internal/clock"
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
		time.Now().Add(26*time.Hour))
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
		time.Now().Add(26*time.Hour))
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
		time.Now().Add(30*time.Hour))

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
		time.Now().Add(34*time.Hour))

	resumen := resumenDelPanel(t, router, esc.titular.Token)
	for _, it := range resumen.TurnosProximos {
		if it.Profesional != "" || it.ProfesionalID != "" {
			t.Errorf("el titular vio %q/%q en su propia tarjeta", it.Profesional, it.ProfesionalID)
		}
	}
}
