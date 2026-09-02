package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// verificarEmailDePrueba — Extra 2.3.5 (E5.6): recorre el paso "Confirmanos
// que sos vos" de punta a punta (enviar código → leerlo del
// capturingMailSender → confirmarlo) y devuelve el token de prueba que
// solicitudDePrueba necesita para poder pedir el turno. Ningún test de
// turno_publico_test.go llama a POST /clinicas/{slug}/turnos sin pasar por
// acá primero — mismo criterio real que el wizard: no hay forma de pedir
// un turno sin verificar el mail antes.
func verificarEmailDePrueba(t *testing.T, router http.Handler, sender *capturingMailSender, slug, email string) string {
	t.Helper()
	recEnviar := doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/verificacion-email", enviarVerificacionTurnoPublicoRequest{Email: email})
	if recEnviar.Code != http.StatusOK {
		t.Fatalf("no se pudo enviar el código de verificación: status=%d body=%s", recEnviar.Code, recEnviar.Body.String())
	}
	codigo := sender.codigoDeLaUltimaVerificacionDeTurno(email)
	if codigo == "" {
		t.Fatal("no se capturó ningún código de verificación de turno")
	}
	recConfirmar := doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/verificacion-email/confirmar",
		confirmarVerificacionTurnoPublicoRequest{Email: email, Codigo: codigo})
	if recConfirmar.Code != http.StatusOK {
		t.Fatalf("no se pudo confirmar el código de verificación: status=%d body=%s", recConfirmar.Code, recConfirmar.Body.String())
	}
	var got confirmarVerificacionTurnoPublicoResponse
	if err := json.Unmarshal(recConfirmar.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta de confirmación no es JSON válido: %v", err)
	}
	return got.Token
}

// solicitudDePrueba arma una solicitarTurnoPublicoRequest con datos de
// contacto fijos y el tipo de consulta/fecha/hora/token de verificación
// que le pasan — evita repetir los mismos campos de contacto en cada test
// de abajo.
func solicitudDePrueba(tipoConsultaID, fecha, hora, verificacionToken string) solicitarTurnoPublicoRequest {
	return solicitarTurnoPublicoRequest{
		NombreContacto:    "Bruno",
		ApellidoContacto:  "Iglesias",
		DNIContacto:       "30111222",
		TelefonoContacto:  "+5493511234567",
		EmailContacto:     "bruno@example.com",
		Motivo:            "Dolor de muela",
		TipoConsultaID:    tipoConsultaID,
		Fecha:             fecha,
		Hora:              hora,
		VerificacionToken: verificacionToken,
	}
}

func TestListTiposConsultaPublico_Exitoso(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "publicotipos1@example.com")

	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/tipos-consulta", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got []tipoConsultaPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	// Sembrados por defecto al registrar (TR-001): "Consulta general" y
	// "Urgencia".
	if len(got) != 2 {
		t.Fatalf("got = %+v, esperaba 2 tipos de consulta sembrados", got)
	}
	for _, tipo := range got {
		if tipo.ID == "" || tipo.Nombre == "" || tipo.Color == "" || tipo.DuracionMinutos == 0 {
			t.Errorf("tipo incompleto en la respuesta pública: %+v", tipo)
		}
	}
}

func TestListTiposConsultaPublico_ClinicaInexistente(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodGet, "/clinicas/no-existe/tipos-consulta", nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestListDisponibilidadPublica_Exitoso(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publicodisp1@example.com")

	rec := doJSON(t, router, http.MethodGet,
		"/clinicas/"+reg.Profesional.Slug+"/disponibilidad?tipoConsultaId="+tipoID+"&fecha="+fechaDePruebaDisponibilidad, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got disponibilidadResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	// Sin horario de atención configurado todavía, cae al default
	// 08:00-18:00 (horarioAtencionDefaultDesde/Hasta) — "08:00" siempre
	// entra como primer horario ofrecido.
	if len(got.Slots) == 0 || got.Slots[0] != "08:00" {
		t.Errorf("slots = %v, esperaba que empezaran en 08:00", got.Slots)
	}
}

func TestListDisponibilidadPublica_TipoConsultaInexistente(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "publicodisp2@example.com")

	rec := doJSON(t, router, http.MethodGet,
		"/clinicas/"+reg.Profesional.Slug+"/disponibilidad?tipoConsultaId=00000000-0000-0000-0000-000000000000&fecha="+fechaDePruebaDisponibilidad, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestSolicitarTurnoPublico_CreaTurnoAgendadoConHorarioReal(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico1@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got solicitarTurnoPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.ID == "" || got.HoraInicio == "" || got.HoraFin == "" {
		t.Fatalf("got = %+v, esperaba id/horaInicio/horaFin no vacíos", got)
	}

	// Extra 2.3.5 (E5.2): a diferencia del formulario viejo, el turno nace
	// `agendado` con horario real — nunca más `pendiente`.
	rows := doJSONAuth(t, router, http.MethodGet, "/turnos?estado=agendado", reg.Token, nil)
	var turnos []turnoResponse
	_ = json.Unmarshal(rows.Body.Bytes(), &turnos)
	if len(turnos) != 1 || turnos[0].Origen != "pagina_publica" || turnos[0].HoraInicio == nil {
		t.Errorf("got = %+v, esperaba 1 turno agendado con origen pagina_publica y horario fijo", turnos)
	}
}

func TestSolicitarTurnoPublico_SinVerificarRechaza(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico-sinverif@example.com")

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", ""))

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestSolicitarTurnoPublico_TokenInventadoRechaza(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico-tokenfalso@example.com")

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", "un-token-que-no-existe"))

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

func TestSolicitarTurnoPublico_TokenDeOtroMailRechaza(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico-tokenotromail@example.com")
	// Verifica un mail DISTINTO al que va en la solicitud de turno.
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "otro@example.com")

	req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token)
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

func TestSolicitarTurnoPublico_TokenYaUsadoNoSirveDeNuevo(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico-tokenusado@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	rec1 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token))
	if rec1.Code != http.StatusCreated {
		t.Fatalf("primer pedido: status = %d, esperaba %d. body=%s", rec1.Code, http.StatusCreated, rec1.Body.String())
	}

	// Mismo token, un horario distinto — el token ya se consumió con el
	// primer turno, no sirve para pedir un segundo sin verificar de nuevo.
	rec2 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "09:00", token))
	if rec2.Code != http.StatusForbidden {
		t.Fatalf("segundo pedido: status = %d, esperaba %d. body=%s", rec2.Code, http.StatusForbidden, rec2.Body.String())
	}
}

func TestSolicitarTurnoPublico_TokenSobreviveUnHorarioYaNoDisponible(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico-tokensobrevive@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	fecha, err := clock.ParseDate(fechaDePruebaDisponibilidad)
	if err != nil {
		t.Fatalf("fecha de prueba inválida: %v", err)
	}
	crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, combinarFechaYHora(fecha, "08:00"))

	// El primer intento pisa un horario ya ocupado — falla, pero el token
	// (dentro de la misma transacción revertida) no debería consumirse.
	recFalla := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token))
	if recFalla.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d. body=%s", recFalla.Code, http.StatusConflict, recFalla.Body.String())
	}

	// Mismo token, un horario libre — tiene que funcionar.
	recOk := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "09:00", token))
	if recOk.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", recOk.Code, http.StatusCreated, recOk.Body.String())
	}
}

func TestSolicitarTurnoPublico_ReusaPacienteExistentePorDNI(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico2@example.com")
	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token1))
	// Segundo pedido, mismo DNI — verificado desde OTRO mail a propósito
	// (el cooldown de 60s entre envíos de código, LimitTurnoVerifEnviarCooldown,
	// bloquearía un segundo envío inmediato al mismo mail dentro del test) —
	// lo que importa acá es que la reutilización por DNI no depende de qué
	// mail se verificó, solo del DNI tipeado en el formulario.
	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno2@example.com")
	req2 := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "09:00", token2)
	req2.EmailContacto = "bruno2@example.com"
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req2)

	var pacientes []db.Paciente
	if err := gdb.Where("profesional_id = ? AND dni = ?", reg.Profesional.ID, "30111222").Find(&pacientes).Error; err != nil {
		t.Fatalf("no se pudo consultar pacientes: %v", err)
	}
	if len(pacientes) != 1 {
		t.Fatalf("got %d pacientes con el mismo DNI, esperaba 1 (E5.1: se reusa, no se duplica)", len(pacientes))
	}

	var turnos []db.Turno
	if err := gdb.Where("profesional_id = ?", reg.Profesional.ID).Find(&turnos).Error; err != nil {
		t.Fatalf("no se pudo consultar turnos: %v", err)
	}
	if len(turnos) != 2 {
		t.Fatalf("got %d turnos, esperaba 2", len(turnos))
	}
	for _, tn := range turnos {
		if tn.PacienteID == nil || *tn.PacienteID != pacientes[0].ID {
			t.Errorf("turno %s no apunta al paciente reusado", tn.ID)
		}
	}
}

// TestSolicitarTurnoPublico_IgnoraDatosDelFormularioSiElDNIYaExiste —
// corrección de bug reportado por el cliente: "yo puedo modificar en el
// formulario y generar un turno con otro nombre y datos, pero atado al
// paciente del dni tal... sin importar lo que pongan en el formulario, si
// el DNI ya existe... los datos que mostrará en el calendario son los
// datos del paciente que hay en el sistema y no los del formulario".
func TestSolicitarTurnoPublico_IgnoraDatosDelFormularioSiElDNIYaExiste(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico11@example.com")

	// Primer pedido: crea a Bruno Iglesias de verdad.
	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token1))

	// Segundo pedido, mismo DNI pero con nombre/teléfono/email DISTINTOS —
	// el formulario no debería poder "hacerse pasar" por otro nombre
	// usando el DNI de Bruno. El mail verificado es el "nuevo" (otro@...),
	// que es justamente el escenario real: alguien verifica SU mail pero
	// tipea el DNI de otra persona.
	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "otro@example.com")
	req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "09:00", token2)
	req.NombreContacto = "Otro"
	req.ApellidoContacto = "Apellido"
	req.TelefonoContacto = "+5493519999999"
	req.EmailContacto = "otro@example.com"
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	fecha, err := clock.ParseDate(fechaDePruebaDisponibilidad)
	if err != nil {
		t.Fatalf("fecha de prueba inválida: %v", err)
	}
	var turnos []db.Turno
	if err := gdb.Where("profesional_id = ? AND hora_inicio >= ?", reg.Profesional.ID, combinarFechaYHora(fecha, "09:00")).
		Find(&turnos).Error; err != nil {
		t.Fatalf("no se pudo consultar el turno: %v", err)
	}
	if len(turnos) != 1 {
		t.Fatalf("got %d turnos a las 09:00, esperaba 1", len(turnos))
	}
	// El turno tiene que quedar con los datos REALES de Bruno (el paciente
	// ya existente por ese DNI) — nunca con "Otro Apellido" ni el
	// teléfono/email recién tipeados.
	got := turnos[0]
	if got.NombreContacto != "Bruno" || got.ApellidoContacto != "Iglesias" {
		t.Errorf("nombreContacto/apellidoContacto = %q/%q, esperaba Bruno/Iglesias (datos reales del paciente)", got.NombreContacto, got.ApellidoContacto)
	}
	if got.TelefonoContacto != "+5493511234567" {
		t.Errorf("telefonoContacto = %q, esperaba el teléfono real del paciente, no el tipeado en el segundo pedido", got.TelefonoContacto)
	}
	if got.EmailContacto != "bruno@example.com" {
		t.Errorf("emailContacto = %q, esperaba el email real del paciente, no el tipeado en el segundo pedido", got.EmailContacto)
	}
}

func TestSolicitarTurnoPublico_HorarioYaNoDisponibleRechaza(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico3@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	fecha, err := clock.ParseDate(fechaDePruebaDisponibilidad)
	if err != nil {
		t.Fatalf("fecha de prueba inválida: %v", err)
	}
	// El profesional ya tiene un turno agendado a mano a las 08:00 — el
	// pedido público por ese mismo horario tiene que rechazarse con un
	// mensaje explícito, no un 500 ni un turno duplicado en el mismo hueco.
	crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, combinarFechaYHora(fecha, "08:00"))

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token))

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}
}

func TestSolicitarTurnoPublico_FechaPasadaRechaza(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico4@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, "2020-01-01", "08:00", token))

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestSolicitarTurnoPublico_TipoConsultaInexistenteDaNotFound(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "publico5@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba("00000000-0000-0000-0000-000000000000", fechaDePruebaDisponibilidad, "08:00", token))

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestSolicitarTurnoPublico_ClinicaInexistente(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodPost, "/clinicas/no-existe/turnos",
		solicitudDePrueba("00000000-0000-0000-0000-000000000000", fechaDePruebaDisponibilidad, "08:00", "cualquier-cosa"))
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestSolicitarTurnoPublico_DNIInvalido(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico6@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	for _, dni := range []string{"123", "abcdefgh", "123456789012"} {
		req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token)
		req.DNIContacto = dni
		rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("DNI %q: status = %d, esperaba %d", dni, rec.Code, http.StatusBadRequest)
		}
	}
}

func TestSolicitarTurnoPublico_TelefonoInvalido(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico7@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token)
	req.TelefonoContacto = "123"
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestSolicitarTurnoPublico_EmailInvalido(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico8@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token)
	req.EmailContacto = "no-es-un-email"
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestSolicitarTurnoPublico_NombreApellidoObligatorios(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico9@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token)
	req.NombreContacto = ""
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestSolicitarTurnoPublico_HorarioInvalidoRechaza(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico10@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "8hs", token)
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestSolicitarTurnoPublico_NoRequiereAutenticacion(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodPost, "/clinicas/x/turnos", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code == http.StatusUnauthorized {
		t.Error("POST /clinicas/{slug}/turnos no debería exigir autenticación")
	}
}
