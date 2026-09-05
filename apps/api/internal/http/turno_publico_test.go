package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// crearSegundoTipoConsultaDePrueba — Fase 2.4.1 (F4.1.3) agregó una guarda
// nueva ("ya tenés un turno de este tipo de consulta") que bloquea un
// segundo pedido con el MISMO tipo para el mismo paciente — varios tests
// de este archivo, de antes de esa guarda, pedían dos turnos seguidos con
// el mismo DNI para probar la reutilización/protección de datos (E5.1/
// TR-101), sin que el tipo de consulta importara para lo que en verdad
// probaban. Un segundo tipo distinto los deja seguir probando lo mismo
// sin chocar con la guarda nueva.
func crearSegundoTipoConsultaDePrueba(t *testing.T, gdb *gorm.DB, profesionalID string) string {
	t.Helper()
	pid, err := uuid.Parse(profesionalID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	tipo := db.TipoConsulta{ProfesionalID: pid, Nombre: "Urgencia", Color: "#D6563A", DuracionMinutos: 30}
	if err := gdb.Create(&tipo).Error; err != nil {
		t.Fatalf("no se pudo crear el segundo tipo de consulta de prueba: %v", err)
	}
	return tipo.ID.String()
}

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

// TestSolicitarTurnoPublico_EnviaMailDeConfirmacion — pedido textual del
// cliente: "cada vez que se saque un turno, enviar una notificación por
// mail, al mail con el que se hizo el turno".
func TestSolicitarTurnoPublico_EnviaMailDeConfirmacion(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico-mailconf@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	info := sender.turnoConfirmadoEnviadoA("bruno@example.com")
	if info == nil {
		t.Fatal("no se mandó ningún mail de turno confirmado a bruno@example.com")
	}
	if info.NombrePaciente != "Bruno Iglesias" {
		t.Errorf("NombrePaciente = %q, esperaba \"Bruno Iglesias\"", info.NombrePaciente)
	}
	if info.HoraInicio != "08:00" {
		t.Errorf("HoraInicio = %q, esperaba \"08:00\"", info.HoraInicio)
	}
	if info.NombreClinica == "" || info.TipoConsulta == "" || info.Fecha == "" {
		t.Errorf("info = %+v, esperaba NombreClinica/TipoConsulta/Fecha completos", *info)
	}
}

// TestSolicitarTurnoPublico_NoEnviaMailSiElPedidoSeRechaza — un pedido
// rechazado (DNI con turno activo) no debería disparar ningún mail de
// confirmación — el turno nunca llegó a crearse.
func TestSolicitarTurnoPublico_NoEnviaMailSiElPedidoSeRechaza(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico-mailconf2@example.com")
	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token1))

	segundoTipoID := crearSegundoTipoConsultaDePrueba(t, gdb, reg.Profesional.ID)
	if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?)",
		db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown").Error; err != nil {
		t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
	}
	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "otro@example.com")
	req2 := solicitudDePrueba(segundoTipoID, fechaDePruebaDisponibilidad, "10:00", token2)
	req2.EmailContacto = "otro@example.com"
	rec2 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req2)
	if rec2.Code != http.StatusConflict {
		t.Fatalf("segundo pedido: status = %d, esperaba %d", rec2.Code, http.StatusConflict)
	}

	if info := sender.turnoConfirmadoEnviadoA("otro@example.com"); info != nil {
		t.Errorf("no esperaba ningún mail de confirmación para el pedido rechazado, got %+v", *info)
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

// TestSolicitarTurnoPublico_MismoDNIMismoMailReusaPaciente — el único caso
// que sigue reusando la MISMA ficha en el camino público: el mail
// coincide de verdad (o es uno alternativo ya migrado) con el de la ficha
// existente — ver pacienteRespondeAlMail. Un mail distinto, en cambio,
// desde la corrección de QA de más abajo, ya no se sincroniza en
// silencio — ver TestSolicitarTurnoPublico_MismoDNIMailDistintoCreaFichaSeparadaSinConflictoSiNadieVerificado.
//
// Corrección de QA (TR-107): pedido textual del cliente — "cualquier
// paciente sin verificar no puede sacar otro turno con otro tipo de
// consulta, si ya tiene un turno primero debe asistir a ese primer turno,
// ser verificado y ahí sí puede sacar para diferentes tipos de turno" —
// esto vale AUNQUE el segundo pedido sea del mismo mail que el primero
// (turnoActivoDeOtroTipo no tiene excepción de mail, solo la de ficha ya
// verificada). Este test simula el primer turno ya RESUELTO (pasó su
// hora, sin marcar asistencia) antes del segundo pedido — la única
// ventana en la que la reutilización de ficha que prueba este test sigue
// siendo alcanzable sin pasar por una verificación real.
func TestSolicitarTurnoPublico_MismoDNIMismoMailReusaPaciente(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico2@example.com")
	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")

	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token1))

	// Corrección de QA (TR-107): mientras el primer turno siga VIGENTE,
	// turnoActivoDeOtroTipo rechaza CUALQUIER segundo pedido de otro tipo
	// para el mismo DNI, sin excepción de mail — pedido textual del
	// cliente: "cualquier paciente sin verificar no puede sacar otro turno
	// con otro tipo de consulta, si ya tiene un turno primero debe asistir
	// a ese primer turno, ser verificado y ahí sí puede sacar para
	// diferentes tipos de turno". La reutilización de ficha que este test
	// prueba solo puede pasar, sin verificación de por medio, una vez que
	// ese primer turno ya no está vigente (pasó su hora) — se simula esa
	// ventana llevándolo al pasado, sin marcar asistencia (si se marcara
	// "asistió" pasaría a VERIFICADO, y ahí el camino es otro —
	// pacienteVerificadoId, no este).
	if err := gdb.Model(&db.Turno{}).Where("profesional_id = ? AND email_contacto = ?", reg.Profesional.ID, "bruno@example.com").
		Updates(map[string]interface{}{"hora_inicio": time.Now().Add(-2 * time.Hour), "hora_fin": time.Now().Add(-90 * time.Minute)}).Error; err != nil {
		t.Fatalf("no se pudo llevar el primer turno al pasado: %v", err)
	}

	// Segundo tipo de consulta a propósito (F4.1.3): la guarda "ya tenés
	// un turno de este tipo" es ajena a lo que este test prueba. El
	// cooldown de 60s entre dos códigos al MISMO mail (E5.6) tampoco es
	// parte de lo que se prueba acá — se limpia a mano.
	segundoTipoID := crearSegundoTipoConsultaDePrueba(t, gdb, reg.Profesional.ID)
	if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?)",
		db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown").Error; err != nil {
		t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
	}
	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")
	req2 := solicitudDePrueba(segundoTipoID, fechaDePruebaDisponibilidad, "09:00", token2)
	rec2 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req2)
	if rec2.Code != http.StatusCreated {
		t.Fatalf("segundo pedido: status = %d, esperaba %d. body=%s", rec2.Code, http.StatusCreated, rec2.Body.String())
	}

	var pacientes []db.Paciente
	if err := gdb.Where("profesional_id = ? AND dni = ?", reg.Profesional.ID, "30111222").Find(&pacientes).Error; err != nil {
		t.Fatalf("no se pudo consultar pacientes: %v", err)
	}
	if len(pacientes) != 1 {
		t.Fatalf("got %d pacientes con el mismo DNI, esperaba 1 (mismo mail: se reusa, no se duplica)", len(pacientes))
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

// TestSolicitarTurnoPublico_MismoDNIMailDistintoCreaFichaSeparadaSinConflictoSiNadieVerificado
// — corrección de QA (reemplaza el comportamiento viejo de TR-101, "se
// sincroniza en silencio", y una revisión intermedia que dejaba SIEMPRE
// un ConflictoPaciente visible aunque nadie estuviera verificado — el
// cliente pidió volver atrás en ese punto puntual: "no sabemos con
// certeza quién es el impostor acá" cuando ninguna de las dos fichas
// demostró nada todavía, así que no hay nada que avisarle al profesional
// todavía): con el mismo DNI pero un mail distinto, la ficha existente
// queda INTACTA (nunca se pisan sus datos reales con los del segundo
// pedido) y se crea una ficha nueva y separada para el segundo mail — pero
// mientras NINGUNA de las dos esté verificada, no se deja ningún
// ConflictoPaciente todavía. Si más adelante una de las dos demuestra ser
// la real, el conflicto se detecta y se resuelve retroactivamente — ver
// TestMarcarAsistencia_GeneraConflictoRetroactivoPendiente en
// turnos_test.go.
//
// Corrección de QA (TR-107): esta coexistencia silenciosa ya no puede
// pasar con los dos turnos VIGENTES al mismo tiempo — turnoActivoDeOtroTipo
// rechazaría el segundo pedido de inmediato (ver
// TestSolicitarTurnoPublico_SegundoMailMismoTipoRechazaSiPrimeroNoVerificado).
// Sigue existiendo, pero acotada a la ventana en la que el primer turno ya
// no está vigente (pasó su hora) y todavía nadie lo verificó — el test
// simula esa ventana a mano.
func TestSolicitarTurnoPublico_MismoDNIMailDistintoCreaFichaSeparadaSinConflictoSiNadieVerificado(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico11@example.com")

	// Primer pedido: crea a Bruno Iglesias de verdad.
	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token1))

	// Corrección de QA (TR-107): mientras el turno de Bruno siga VIGENTE,
	// turnoActivoDeOtroTipo rechaza cualquier otro mail que reclame el
	// mismo DNI en otro tipo de consulta (ver el test de arriba) — la
	// coexistencia silenciosa de 2 fichas sin verificar que este test
	// prueba solo puede pasar una vez que ese turno YA NO está vigente
	// (pasó su hora_fin) pero nadie lo verificó todavía, la misma ventana
	// angosta que describe el punto 2 de TR-107 en docs/tradeoffs.md. Se
	// simula esa ventana llevando el turno de Bruno al pasado, SIN tocar
	// asistencia (si se marcara "asistio" pasaría a verificado, y eso es
	// otro test — TestSolicitarTurnoPublico_MismoDNIMailDistintoCreaConflictoVisibleSiOriginalYaVerificada).
	if err := gdb.Model(&db.Turno{}).Where("profesional_id = ? AND email_contacto = ?", reg.Profesional.ID, "bruno@example.com").
		Updates(map[string]interface{}{"hora_inicio": time.Now().Add(-2 * time.Hour), "hora_fin": time.Now().Add(-90 * time.Minute)}).Error; err != nil {
		t.Fatalf("no se pudo llevar el turno de Bruno al pasado: %v", err)
	}

	// Segundo pedido, mismo DNI pero con nombre/teléfono/email DISTINTOS —
	// nadie verificado todavía. Segundo TIPO de consulta a propósito
	// (F4.1.3): la guarda "ya tenés un turno de este tipo" es ajena a lo
	// que este test prueba.
	segundoTipoID := crearSegundoTipoConsultaDePrueba(t, gdb, reg.Profesional.ID)
	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "otro@example.com")
	req := solicitudDePrueba(segundoTipoID, fechaDePruebaDisponibilidad, "09:00", token2)
	req.NombreContacto = "Otro"
	req.ApellidoContacto = "Apellido"
	req.TelefonoContacto = "+5493519999999"
	req.EmailContacto = "otro@example.com"
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var pacientes []db.Paciente
	if err := gdb.Where("profesional_id = ? AND dni = ?", reg.Profesional.ID, "30111222").Order("created_at").Find(&pacientes).Error; err != nil {
		t.Fatalf("no se pudo consultar pacientes: %v", err)
	}
	if len(pacientes) != 2 {
		t.Fatalf("got %d pacientes con el mismo DNI, esperaba 2 (fichas separadas)", len(pacientes))
	}
	original, nueva := pacientes[0], pacientes[1]
	if original.EnConflicto {
		t.Error("la ficha original quedó marcada en_conflicto, esperaba que quedara intacta")
	}
	if original.Nombre != "Bruno" || original.Apellido != "Iglesias" || original.Telefono != "+5493511234567" {
		t.Errorf("la ficha original cambió: %+v, esperaba los datos reales de Bruno sin tocar", original)
	}
	if !nueva.EnConflicto {
		t.Error("la ficha nueva no quedó marcada en_conflicto")
	}
	if nueva.Nombre != "Otro" || nueva.Apellido != "Apellido" {
		t.Errorf("la ficha nueva = %+v, esperaba los datos del segundo pedido", nueva)
	}

	var countConflictos int64
	gdb.Model(&db.ConflictoPaciente{}).Where("paciente_en_conflicto_id = ?", nueva.ID).Count(&countConflictos)
	if countConflictos != 0 {
		t.Errorf("no esperaba ningún ConflictoPaciente todavía (nadie verificado), count=%d", countConflictos)
	}

	fecha, err := clock.ParseDate(fechaDePruebaDisponibilidad)
	if err != nil {
		t.Fatalf("fecha de prueba inválida: %v", err)
	}
	var turnoNuevo db.Turno
	if err := gdb.Where("profesional_id = ? AND hora_inicio = ?", reg.Profesional.ID, combinarFechaYHora(fecha, "09:00")).
		First(&turnoNuevo).Error; err != nil {
		t.Fatalf("no se pudo consultar el turno: %v", err)
	}
	if turnoNuevo.PacienteID == nil || *turnoNuevo.PacienteID != nueva.ID {
		t.Error("el turno de las 09:00 debería apuntar a la ficha nueva, no a la de Bruno")
	}
}

// TestSolicitarTurnoPublico_MismoDNIMailDistintoCreaConflictoVisibleSiOriginalYaVerificada
// — la otra mitad del comportamiento revertido: si la ficha original YA
// está verificada quando llega el segundo pedido con otro mail, el
// ConflictoPaciente SÍ se deja de inmediato, sin esperar a nada — mismo
// criterio que TR-100/101 de siempre.
func TestSolicitarTurnoPublico_MismoDNIMailDistintoCreaConflictoVisibleSiOriginalYaVerificada(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico12@example.com")

	// Primer pedido: crea a Bruno Iglesias, y lo dejamos ya VERIFICADO
	// (turno resuelto y asistido) antes de que llegue el segundo pedido.
	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token1))

	var original db.Paciente
	if err := gdb.Where("profesional_id = ? AND dni = ?", reg.Profesional.ID, "30111222").First(&original).Error; err != nil {
		t.Fatalf("no se pudo consultar la ficha original: %v", err)
	}
	pasado := time.Now().Add(-72 * time.Hour)
	asistio := "asistio"
	if err := gdb.Model(&db.Turno{}).Where("paciente_id = ?", original.ID).
		Updates(map[string]interface{}{"hora_inicio": pasado, "hora_fin": pasado.Add(30 * time.Minute), "asistencia": asistio}).Error; err != nil {
		t.Fatalf("no se pudo marcar el turno original como asistido: %v", err)
	}

	// Segundo pedido, mismo DNI, mail distinto.
	segundoTipoID := crearSegundoTipoConsultaDePrueba(t, gdb, reg.Profesional.ID)
	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "otro@example.com")
	req := solicitudDePrueba(segundoTipoID, fechaDePruebaDisponibilidad, "09:00", token2)
	req.NombreContacto = "Otro"
	req.ApellidoContacto = "Apellido"
	req.TelefonoContacto = "+5493519999999"
	req.EmailContacto = "otro@example.com"
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var nueva db.Paciente
	if err := gdb.Where("profesional_id = ? AND dni = ? AND id != ?", reg.Profesional.ID, "30111222", original.ID).First(&nueva).Error; err != nil {
		t.Fatalf("no se pudo consultar la ficha nueva: %v", err)
	}

	var conflicto db.ConflictoPaciente
	if err := gdb.Where("paciente_en_conflicto_id = ?", nueva.ID).First(&conflicto).Error; err != nil {
		t.Fatalf("esperaba un ConflictoPaciente visible porque la ficha original ya estaba verificada: %v", err)
	}
	if conflicto.Resuelto {
		t.Error("Resuelto = true, esperaba false (recién se crea, requiere resolución)")
	}
	if conflicto.PacienteVerificadoID != original.ID {
		t.Errorf("PacienteVerificadoID = %q, esperaba %q (la ficha original)", conflicto.PacienteVerificadoID, original.ID)
	}
}

// TestSolicitarTurnoPublico_VerificadoConOtroTipoActivoTambienRechaza —
// corrección de QA sobre TR-107: reemplaza el comportamiento viejo (la
// excepción de turnoActivoDeOtroTipo para fichas YA VERIFICADAS, que
// dejaba pasar el pedido y generaba un ConflictoPaciente) — pedido
// textual del cliente: "sea paciente verificado o no verificado solo
// puede tener un turno activo con el mismo dni, sea el tipo de consulta
// que sea... aunque esté verificado". Ahora un mail distinto que pide
// CUALQUIER tipo con un DNI que ya tiene un turno vigente (del tipo que
// sea) se rechaza directo con el mensaje universal — nunca llega a crear
// una ficha nueva ni un conflicto.
func TestSolicitarTurnoPublico_VerificadoConOtroTipoActivoTambienRechaza(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico22@example.com")
	segundoTipoID := crearSegundoTipoConsultaDePrueba(t, gdb, reg.Profesional.ID)

	original := crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com")

	// El paciente verificado tiene, además de su turno pasado, uno VIGENTE
	// a futuro de tipoID — mismo escenario que un paciente real con más de
	// un tipo de consulta reservado.
	fecha, err := clock.ParseDate(fechaDePruebaDisponibilidad)
	if err != nil {
		t.Fatalf("fecha de prueba inválida: %v", err)
	}
	inicioVigente := combinarFechaYHora(fecha, "08:00")
	finVigente := inicioVigente.Add(30 * time.Minute)
	tid, err := uuid.Parse(tipoID)
	if err != nil {
		t.Fatalf("tipoID inválido: %v", err)
	}
	pid, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	turnoVigente := db.Turno{
		ProfesionalID:    pid,
		PacienteID:       &original.ID,
		Estado:           "agendado",
		TipoConsultaID:   &tid,
		HoraInicio:       &inicioVigente,
		HoraFin:          &finVigente,
		NombreContacto:   "Bruno",
		ApellidoContacto: "Iglesias",
		DNIContacto:      "30111222",
		TelefonoContacto: "+5493511234567",
		EmailContacto:    "bruno@example.com",
		Origen:           "pagina_publica",
	}
	if err := gdb.Create(&turnoVigente).Error; err != nil {
		t.Fatalf("no se pudo crear el turno vigente del paciente verificado: %v", err)
	}

	// Un mail distinto pide un TERCER tipo de consulta con el mismo DNI.
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "otro@example.com")
	req := solicitudDePrueba(segundoTipoID, fechaDePruebaDisponibilidad, "10:00", token)
	req.EmailContacto = "otro@example.com"
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d (turno activo aunque esté verificado). body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "ya tenés un turno pendiente") {
		t.Errorf("body = %s, esperaba el mensaje universal de turno activo", rec.Body.String())
	}

	var count int64
	gdb.Model(&db.Paciente{}).Where("profesional_id = ? AND dni = ? AND id != ?", reg.Profesional.ID, "30111222", original.ID).Count(&count)
	if count != 0 {
		t.Errorf("no esperaba ninguna ficha nueva creada, count=%d", count)
	}
}

// TestSolicitarTurnoPublico_TurnoResueltoLiberaElTopeDeUnoPorDNI — TR-107:
// turnoActivoDelMismoTipo/turnoActivoDeOtroTipo solo cuentan turnos
// VIGENTES (hora_fin >= ahora) — uno que ya pasó su horario, sin importar
// si alguien lo verificó marcando asistencia o no, deja de ocupar el tope
// y un nuevo pedido con el mismo DNI puede pasar de nuevo.
func TestSolicitarTurnoPublico_TurnoResueltoLiberaElTopeDeUnoPorDNI(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico23@example.com")

	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token1))

	// El turno del primer pedido ya pasó — sin marcar asistencia, sigue sin
	// verificar, pero ya no está vigente.
	if err := gdb.Model(&db.Turno{}).Where("profesional_id = ? AND email_contacto = ?", reg.Profesional.ID, "bruno@example.com").
		Updates(map[string]interface{}{"hora_inicio": time.Now().Add(-2 * time.Hour), "hora_fin": time.Now().Add(-90 * time.Minute)}).Error; err != nil {
		t.Fatalf("no se pudo llevar el turno al pasado: %v", err)
	}

	// Mismo DNI, mismo tipo de consulta, mail distinto — ya no debería
	// chocar contra el tope de 1 activo.
	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno2@example.com")
	req2 := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "10:00", token2)
	req2.EmailContacto = "bruno2@example.com"
	rec2 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req2)
	if rec2.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d (el turno anterior ya no está vigente). body=%s", rec2.Code, http.StatusCreated, rec2.Body.String())
	}
}

// TestSolicitarTurnoPublico_VerificadoConTurnoActivoRechazaOtroPedidoDelMismoTipo
// — corrección de QA sobre TR-107: "sea paciente verificado o no
// verificado solo puede tener un turno activo con el mismo dni, sea el
// tipo de consulta que sea" — reemplaza la guarda vieja de F4.1.3
// (turnoVigenteDeTipo/errTurnoPublicoDuplicado, "ya tenés un turno
// agendado para el DD/MM... para este tipo de consulta"), ahora
// inalcanzable: la regla nueva (turnoActivoPorDNI) topea en 1 turno
// activo por DNI ANTES de llegar a esa guarda específica de tipo, así
// que dispara ella primero con su propio mensaje.
func TestSolicitarTurnoPublico_VerificadoConTurnoActivoRechazaOtroPedidoDelMismoTipo(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico-dup-verif@example.com")
	email := "bruno@example.com"
	paciente := crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", email)

	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)
	req1 := solicitarTurnoPublicoRequest{
		EmailContacto: email, TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "08:00",
		VerificacionToken: token1, PacienteVerificadoID: paciente.ID.String(),
	}
	rec1 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req1)
	if rec1.Code != http.StatusCreated {
		t.Fatalf("primer pedido: status = %d, esperaba %d. body=%s", rec1.Code, http.StatusCreated, rec1.Body.String())
	}

	// El cooldown de 60s entre dos códigos para el mismo mail (E5.6) no
	// tiene nada que ver con lo que este test prueba — se limpia a mano
	// para poder pedir un segundo código real de inmediato.
	if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?)",
		db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown").Error; err != nil {
		t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
	}
	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)
	req2 := req1
	req2.Hora = "10:00"
	req2.VerificacionToken = token2
	rec2 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req2)
	if rec2.Code != http.StatusConflict {
		t.Fatalf("segundo pedido (mismo tipo, verificado): status = %d, esperaba %d. body=%s", rec2.Code, http.StatusConflict, rec2.Body.String())
	}
	if !strings.Contains(rec2.Body.String(), "ya tenés un turno pendiente") || !strings.Contains(rec2.Body.String(), "contactate con la clínica") {
		t.Errorf("body = %s, esperaba el mensaje universal de turno activo", rec2.Body.String())
	}
}

// TestSolicitarTurnoPublico_TopeDeUnoActivoPorDNIRechazaDesdeElSegundo —
// corrección de seguridad (TR-107): el tope viejo (limiteTurnosSinVerificarPorDNIYTipo,
// dejaba pasar hasta 3 antes de rechazar) queda reemplazado por
// turnoActivoDelMismoTipo — el SEGUNDO pedido con el mismo DNI+tipo, de
// CUALQUIER mail, ya se rechaza (no hace falta llegar al cuarto).
func TestSolicitarTurnoPublico_TopeDeUnoActivoPorDNIRechazaDesdeElSegundo(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico18@example.com")

	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "tope1@example.com")
	req1 := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token1)
	req1.EmailContacto = "tope1@example.com"
	rec1 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req1)
	if rec1.Code != http.StatusCreated {
		t.Fatalf("primer pedido: status = %d, esperaba %d. body=%s", rec1.Code, http.StatusCreated, rec1.Body.String())
	}

	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "tope2@example.com")
	req2 := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "09:00", token2)
	req2.EmailContacto = "tope2@example.com"
	rec2 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req2)
	if rec2.Code != http.StatusConflict {
		t.Errorf("segundo pedido: status = %d, esperaba %d. body=%s", rec2.Code, http.StatusConflict, rec2.Body.String())
	}
}

// TestSolicitarTurnoPublico_TopeDeUnoActivoPorDNINoEsSimulable — corrección
// de QA (TR-107): a diferencia de los detectores de abuso
// (bloquearMailPorAbusoDeDNIsYBorrarTurnos/bloquearIPPorRotacionYBorrarTurnos),
// turnoActivoDelMismoTipo/turnoActivoDeOtroTipo son reglas de negocio
// ordinarias (mismo criterio que errTurnoPublicoDuplicado, nunca se
// simulan) — SimularBloqueosSeguridad activo no les cambia el
// comportamiento, siguen rechazando de verdad.
func TestSolicitarTurnoPublico_TopeDeUnoActivoPorDNINoEsSimulable(t *testing.T) {
	router, gdb, sender := newTestRouterWithMailYSimulacion(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico19@example.com")

	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "simtope1@example.com")
	req1 := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token1)
	req1.EmailContacto = "simtope1@example.com"
	rec1 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req1)
	if rec1.Code != http.StatusCreated {
		t.Fatalf("primer pedido: status = %d, esperaba %d. body=%s", rec1.Code, http.StatusCreated, rec1.Body.String())
	}

	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "simtope2@example.com")
	req2 := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "09:00", token2)
	req2.EmailContacto = "simtope2@example.com"
	rec2 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req2)
	if rec2.Code != http.StatusConflict {
		t.Errorf("segundo pedido (modo simulado, igual debe rechazar de verdad): status = %d, esperaba %d. body=%s", rec2.Code, http.StatusConflict, rec2.Body.String())
	}

	var count int64
	gdb.Model(&db.Turno{}).Where("profesional_id = ? AND email_contacto = ?", reg.Profesional.ID, "simtope2@example.com").Count(&count)
	if count != 0 {
		t.Errorf("no esperaba que se creara el turno del segundo pedido ni en modo simulado, count=%d", count)
	}
}

// TestSolicitarTurnoPublico_MailConMasDeDosDNIsDistintosBloqueaYBorraTodo —
// corrección de seguridad (Fase 2.4.1), pedido textual del cliente: "si un
// usuario malicioso genera turnos con un mismo mail y diferentes DNIs, si
// pasa cierto límite bloquear ese mail y borrar los turnos que subió".
// Corrección de QA sobre el valor inicial (5, "muy permisivo" tras
// probarlo): el límite bajó a 2 — los primeros 2 pasan igual que siempre;
// el 3ro dispara el bloqueo SIN llegar a crearse (chequeo ahora antes de
// resolver la ficha/turno, no después) — y a diferencia del resto del
// sistema, los 2 anteriores SÍ se borran de la base, no se cancelan.
func TestSolicitarTurnoPublico_MailConMasDeDosDNIsDistintosBloqueaYBorraTodo(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico21@example.com")
	email := "atacante@example.com"
	horas := []string{"08:00", "09:00", "10:00"}
	dnis := []string{"30000001", "30000002", "30000003"}

	for i, dni := range dnis {
		// Limpia el rate limit de envío de código entre iteraciones — no es
		// lo que este test prueba (mismo criterio que
		// TestSolicitarTurnoPublico_MismoDNIMismoMailReusaPaciente), y el
		// mismo mail pidiendo varios códigos seguidos chocaría con el
		// cooldown de 60s.
		if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?, ?)",
			db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown", db.RateLimitScopeTurnoVerifConfirmar).Error; err != nil {
			t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
		}
		token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)
		req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, horas[i], token)
		req.EmailContacto = email
		req.DNIContacto = dni
		rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
		if i < 2 {
			if rec.Code != http.StatusCreated {
				t.Fatalf("pedido %d (DNI %s): status = %d, esperaba %d. body=%s", i+1, dni, rec.Code, http.StatusCreated, rec.Body.String())
			}
			continue
		}
		if rec.Code != http.StatusForbidden {
			t.Fatalf("pedido %d (DNI %s, el que excede el límite): status = %d, esperaba %d. body=%s", i+1, dni, rec.Code, http.StatusForbidden, rec.Body.String())
		}
	}

	// Los 2 turnos que SÍ se habían creado con éxito también se borraron
	// — "borrar los turnos que subió", todos, no solo el que excedió. El
	// 3ro nunca llegó a crearse.
	var count int64
	gdb.Model(&db.Turno{}).Where("email_contacto = ?", email).Count(&count)
	if count != 0 {
		t.Errorf("deberían haberse borrado TODOS los turnos de ese mail, quedan %d", count)
	}

	var bloqueo db.EmailBloqueadoTurnoPublico
	if err := gdb.Where("profesional_id = ? AND email = ?", reg.Profesional.ID, email).First(&bloqueo).Error; err != nil {
		t.Fatalf("esperaba que el mail quedara bloqueado: %v", err)
	}
	restante := time.Until(bloqueo.BloqueadoHasta)
	if restante < 2*24*time.Hour || restante > 4*24*time.Hour {
		t.Errorf("BloqueadoHasta = %v, esperaba ~3 días desde ahora (quedan %v)", bloqueo.BloqueadoHasta, restante)
	}

	// Las fichas de paciente sin verificar de ese mail, sin ningún turno
	// que las sostenga, también se borran. El 3er DNI ni siquiera llegó a
	// tener ficha propia (el chequeo corre antes de crearla).
	var countPacientes int64
	gdb.Model(&db.Paciente{}).Where("profesional_id = ? AND dni IN ?", reg.Profesional.ID, dnis).Count(&countPacientes)
	if countPacientes != 0 {
		t.Errorf("las fichas sin verificar de ese mail deberían haberse borrado, quedan %d", countPacientes)
	}

	// El mail bloqueado no puede ni pedir un código nuevo.
	recEnviar := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: email})
	if recEnviar.Code != http.StatusForbidden {
		t.Errorf("status al pedir código con el mail bloqueado = %d, esperaba %d", recEnviar.Code, http.StatusForbidden)
	}

	// Corrección de QA, pedido textual del cliente: "este tipo de
	// infractor bloquea la IP para que no vulnere con el otro tipo de
	// caminos" — la IP del pedido que gatilló el límite también queda
	// bloqueada (duración más corta que la del mail).
	var bloqueoIP db.IPBloqueadaTurnoPublico
	if err := gdb.Where("profesional_id = ?", reg.Profesional.ID).First(&bloqueoIP).Error; err != nil {
		t.Fatalf("esperaba que la IP quedara bloqueada: %v", err)
	}
	restanteIP := time.Until(bloqueoIP.BloqueadoHasta)
	if restanteIP < 12*time.Hour || restanteIP > 36*time.Hour {
		t.Errorf("BloqueadoHasta de la IP = %v, esperaba ~24hs desde ahora (quedan %v)", bloqueoIP.BloqueadoHasta, restanteIP)
	}

	// Otro mail, totalmente distinto, tampoco puede pedir código desde la
	// misma IP bloqueada.
	recOtroMail := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: "inocente@example.com"})
	if recOtroMail.Code != http.StatusForbidden {
		t.Errorf("status al pedir código con otro mail desde la IP bloqueada = %d, esperaba %d", recOtroMail.Code, http.StatusForbidden)
	}

	// Corrección de QA, pedido textual del cliente: "el apartado de
	// auditoría... por las dudas de algún malentendido" — queda un
	// registro de qué se borró y por qué, ya que los turnos en sí
	// desaparecen.
	var auditoria db.AuditoriaBloqueoTurnoPublico
	if err := gdb.Where("profesional_id = ? AND motivo = ?", reg.Profesional.ID, "mail_muchos_dnis").First(&auditoria).Error; err != nil {
		t.Fatalf("esperaba una fila de auditoría: %v", err)
	}
	if auditoria.Email == nil || *auditoria.Email != email {
		t.Errorf("Email de la auditoría = %v, esperaba %q", auditoria.Email, email)
	}
	if auditoria.TurnosBorrados != 2 {
		t.Errorf("TurnosBorrados = %d, esperaba 2", auditoria.TurnosBorrados)
	}
	// Solo los primeros 2 DNIs llegaron a tener turno/ficha — el 3ro (el
	// que gatilló el límite) nunca se creó.
	for _, dni := range dnis[:2] {
		if !strings.Contains(auditoria.DNIs, dni) {
			t.Errorf("DNIs de la auditoría = %q, esperaba que incluyera %q", auditoria.DNIs, dni)
		}
	}
}

// TestSolicitarTurnoPublico_MailConMuchosDNIsSimulado — corrección de
// seguridad (Fase 2.4.1). Corrección de QA sobre el diseño inicial del
// modo simulado, pedido textual del cliente: "acá sí se deben borrar los
// turnos si hay infracción, pero no bloquear, para ver que sí funciona"
// — con SimularBloqueosSeguridad activo, el 3er pedido (el que excede el
// límite) se rechaza igual (403) y los 2 turnos anteriores se borran de
// verdad (para poder confirmar que el borrado funciona); lo único que NO
// pasa de verdad es el bloqueo persistente del mail/IP — así se puede
// seguir probando sin esperar 3 días/24hs.
func TestSolicitarTurnoPublico_MailConMuchosDNIsSimulado(t *testing.T) {
	router, gdb, sender := newTestRouterWithMailYSimulacion(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico24@example.com")
	email := "simulado-atacante@example.com"
	horas := []string{"08:00", "09:00", "10:00"}
	dnis := []string{"32000001", "32000002", "32000003"}

	for i, dni := range dnis {
		if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?, ?)",
			db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown", db.RateLimitScopeTurnoVerifConfirmar).Error; err != nil {
			t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
		}
		token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)
		req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, horas[i], token)
		req.EmailContacto = email
		req.DNIContacto = dni
		rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
		if i < 2 {
			if rec.Code != http.StatusCreated {
				t.Fatalf("pedido %d (DNI %s): status = %d, esperaba %d. body=%s", i+1, dni, rec.Code, http.StatusCreated, rec.Body.String())
			}
			continue
		}
		if rec.Code != http.StatusForbidden {
			t.Fatalf("pedido %d (DNI %s, el que excede el límite): status = %d, esperaba %d. body=%s", i+1, dni, rec.Code, http.StatusForbidden, rec.Body.String())
		}
	}

	// El borrado pasa de verdad, incluso en modo simulado.
	var count int64
	gdb.Model(&db.Turno{}).Where("email_contacto = ?", email).Count(&count)
	if count != 0 {
		t.Errorf("count = %d, esperaba 0 (el borrado pasa de verdad en modo simulado)", count)
	}
	// Pero el bloqueo persistente NO se aplica de verdad.
	var bloqueo db.EmailBloqueadoTurnoPublico
	if err := gdb.Where("profesional_id = ? AND email = ?", reg.Profesional.ID, email).First(&bloqueo).Error; !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("no esperaba que el mail quedara bloqueado de verdad (err=%v)", err)
	}
	var bloqueoIP db.IPBloqueadaTurnoPublico
	if err := gdb.Where("profesional_id = ?", reg.Profesional.ID).First(&bloqueoIP).Error; !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("no esperaba que la IP quedara bloqueada de verdad (err=%v)", err)
	}

	var auditoria db.AuditoriaBloqueoTurnoPublico
	if err := gdb.Where("profesional_id = ? AND motivo = ?", reg.Profesional.ID, "mail_muchos_dnis").First(&auditoria).Error; err != nil {
		t.Fatalf("esperaba una fila de auditoría simulada: %v", err)
	}
	if !auditoria.Simulado {
		t.Errorf("Simulado = false, esperaba true")
	}
	if auditoria.TurnosBorrados != 2 {
		t.Errorf("TurnosBorrados = %d, esperaba 2 (borrado real)", auditoria.TurnosBorrados)
	}
}

// TestSolicitarTurnoPublico_MailConDNIsCanceladosNoCuentanParaElTope —
// corrección de QA, pedido textual del cliente: cancelar un turno hoy
// exige contactarse con el consultorio (no hay auto-servicio) — un turno
// ya cancelado pasó por esa intervención humana real y no debería seguir
// contando como parte del patrón de abuso. Solo los turnos VIGENTES
// cuentan para el tope de DNIs distintos por mail (límite 2, corrección
// de QA sobre el valor inicial). Sin la cancelación, un 3er DNI nuevo se
// rechazaría (ya hay 2 DNIs distintos en archivo); cancelando uno de los
// 2 primeros, el 3ro pasa porque solo queda 1 vigente.
func TestSolicitarTurnoPublico_MailConDNIsCanceladosNoCuentanParaElTope(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico22@example.com")
	email := "familianumerosa@example.com"
	horas := []string{"08:00", "09:00"}
	dnis := []string{"30000011", "30000012"}

	var turnoIDs []string
	for i, dni := range dnis {
		if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?, ?)",
			db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown", db.RateLimitScopeTurnoVerifConfirmar).Error; err != nil {
			t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
		}
		token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)
		req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, horas[i], token)
		req.EmailContacto = email
		req.DNIContacto = dni
		rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("pedido %d (DNI %s): status = %d, esperaba %d. body=%s", i+1, dni, rec.Code, http.StatusCreated, rec.Body.String())
		}
		var got solicitarTurnoPublicoResponse
		_ = json.Unmarshal(rec.Body.Bytes(), &got)
		turnoIDs = append(turnoIDs, got.ID)
	}

	// El profesional cancela 1 de los 2 (contacto real, intervención
	// humana) — debería dejar de contar para el tope. Directo en la
	// base (no vía PATCH /turnos/{id}/cancelar): lo que importa acá es el
	// estado resultante, no ejercitar ese endpoint de nuevo.
	if err := gdb.Model(&db.Turno{}).Where("id = ?", turnoIDs[0]).Update("estado", "cancelada").Error; err != nil {
		t.Fatalf("no se pudo cancelar el turno de prueba: %v", err)
	}

	if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?, ?)",
		db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown", db.RateLimitScopeTurnoVerifConfirmar).Error; err != nil {
		t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
	}
	token3 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)
	req3 := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "10:00", token3)
	req3.EmailContacto = email
	req3.DNIContacto = "30000013"
	rec3 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req3)
	if rec3.Code != http.StatusCreated {
		t.Fatalf("3er pedido (1 cancelado no debería contar): status = %d, esperaba %d. body=%s", rec3.Code, http.StatusCreated, rec3.Body.String())
	}

	var bloqueo db.EmailBloqueadoTurnoPublico
	err := gdb.Where("profesional_id = ? AND email = ?", reg.Profesional.ID, email).First(&bloqueo).Error
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("no esperaba que el mail quedara bloqueado (solo 1 vigente antes del 3ro, err=%v)", err)
	}
}

// TestSolicitarTurnoPublico_RotacionDeMailYDNIDesdeMismaIPBloqueaIP —
// corrección de seguridad (Fase 2.4.1), pedido textual del cliente: "para
// el caso mail y DNI juntos, nunca repitiendo ninguno... bloqueo por IP
// si desde esa IP se registra este tipo de patrón". Los primeros 4
// pedidos (cada uno con mail Y DNI nuevos, nunca repetidos entre sí) se
// crean en su momento. El 5to ya no: la IP mostró el patrón completo, se
// bloquea ANTES de crear ese turno — y corrección de QA, pedido textual
// del cliente: los 4 turnos ANTERIORES de esa misma IP también se borran
// (no solo se bloquea hacia adelante), porque en conjunto ya formaban
// parte del mismo patrón de abuso, aunque cada uno aislado pareciera
// legítimo.
func TestSolicitarTurnoPublico_RotacionDeMailYDNIDesdeMismaIPBloqueaIP(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico23@example.com")
	horas := []string{"08:00", "09:00", "10:00", "11:00", "12:00"}
	mails := []string{"rotador0@example.com", "rotador1@example.com", "rotador2@example.com", "rotador3@example.com", "rotador4@example.com"}
	dnis := []string{"31000000", "31000001", "31000002", "31000003", "31000004"}

	for i := 0; i < 4; i++ {
		if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?, ?)",
			db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown", db.RateLimitScopeTurnoVerifConfirmar).Error; err != nil {
			t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
		}
		token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, mails[i])
		req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, horas[i], token)
		req.EmailContacto = mails[i]
		req.DNIContacto = dnis[i]
		rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("pedido %d: status = %d, esperaba %d. body=%s", i+1, rec.Code, http.StatusCreated, rec.Body.String())
		}
	}

	if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?, ?)",
		db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown", db.RateLimitScopeTurnoVerifConfirmar).Error; err != nil {
		t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
	}
	token5 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, mails[4])
	req5 := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, horas[4], token5)
	req5.EmailContacto = mails[4]
	req5.DNIContacto = dnis[4]
	rec5 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req5)
	if rec5.Code != http.StatusForbidden {
		t.Fatalf("5to pedido (rotación completa): status = %d, esperaba %d. body=%s", rec5.Code, http.StatusForbidden, rec5.Body.String())
	}

	// Corrección de QA: los 4 turnos ANTERIORES de esa misma IP también
	// se borran (el 5to nunca llegó a crearse, así que en total no queda
	// ninguno).
	var count int64
	gdb.Model(&db.Turno{}).Where("profesional_id = ?", reg.Profesional.ID).Count(&count)
	if count != 0 {
		t.Errorf("count = %d, esperaba 0 (los 4 anteriores se borran, el 5to nunca se creó)", count)
	}

	var bloqueoIP db.IPBloqueadaTurnoPublico
	if err := gdb.Where("profesional_id = ?", reg.Profesional.ID).First(&bloqueoIP).Error; err != nil {
		t.Fatalf("esperaba que la IP quedara bloqueada: %v", err)
	}

	var auditoria db.AuditoriaBloqueoTurnoPublico
	if err := gdb.Where("profesional_id = ? AND motivo = ?", reg.Profesional.ID, "ip_rotacion").First(&auditoria).Error; err != nil {
		t.Fatalf("esperaba una fila de auditoría de rotación: %v", err)
	}
	if auditoria.TurnosBorrados != 4 {
		t.Errorf("TurnosBorrados = %d, esperaba 4", auditoria.TurnosBorrados)
	}
	if auditoria.Email != nil {
		t.Errorf("Email de la auditoría = %v, esperaba nil (varios mails distintos, no uno solo del que tener certeza)", auditoria.Email)
	}
	for _, dni := range dnis[:4] {
		if !strings.Contains(auditoria.DNIs, dni) {
			t.Errorf("DNIs de la auditoría = %q, esperaba que incluyera %q", auditoria.DNIs, dni)
		}
	}

	// Las fichas de paciente de esos 4 turnos borrados (ninguna verificada
	// — nunca llegaron a demostrar nada) también se borran.
	var countPacientes int64
	gdb.Model(&db.Paciente{}).Where("profesional_id = ? AND dni IN ?", reg.Profesional.ID, dnis[:4]).Count(&countPacientes)
	if countPacientes != 0 {
		t.Errorf("las fichas de los 4 turnos borrados deberían haberse borrado, quedan %d", countPacientes)
	}

	// La IP bloqueada tampoco puede pedir un código nuevo, ni siquiera con
	// un sexto mail totalmente distinto.
	recEnviar := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: "otro-mas@example.com"})
	if recEnviar.Code != http.StatusForbidden {
		t.Errorf("status al pedir código desde la IP bloqueada = %d, esperaba %d", recEnviar.Code, http.StatusForbidden)
	}
}

// TestSolicitarTurnoPublico_RotacionSimulada — corrección de seguridad
// (Fase 2.4.1). Corrección de QA sobre el diseño inicial del modo
// simulado, mismo pedido que TestSolicitarTurnoPublico_MailConMuchosDNIsSimulado:
// con SimularBloqueosSeguridad activo, el 5to pedido (el que gatilla el
// patrón) se rechaza igual (403) y los 4 turnos anteriores de esa IP se
// borran de verdad; lo único que NO pasa de verdad es el bloqueo
// persistente de la IP.
func TestSolicitarTurnoPublico_RotacionSimulada(t *testing.T) {
	router, gdb, sender := newTestRouterWithMailYSimulacion(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico25@example.com")
	horas := []string{"08:00", "09:00", "10:00", "11:00", "12:00"}
	mails := []string{"simrot0@example.com", "simrot1@example.com", "simrot2@example.com", "simrot3@example.com", "simrot4@example.com"}
	dnis := []string{"33000000", "33000001", "33000002", "33000003", "33000004"}

	for i := 0; i < 4; i++ {
		if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?, ?)",
			db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown", db.RateLimitScopeTurnoVerifConfirmar).Error; err != nil {
			t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
		}
		token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, mails[i])
		req := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, horas[i], token)
		req.EmailContacto = mails[i]
		req.DNIContacto = dnis[i]
		rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("pedido %d: status = %d, esperaba %d. body=%s", i+1, rec.Code, http.StatusCreated, rec.Body.String())
		}
	}

	if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?, ?)",
		db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown", db.RateLimitScopeTurnoVerifConfirmar).Error; err != nil {
		t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
	}
	token5 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, mails[4])
	req5 := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, horas[4], token5)
	req5.EmailContacto = mails[4]
	req5.DNIContacto = dnis[4]
	rec5 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req5)
	if rec5.Code != http.StatusForbidden {
		t.Fatalf("5to pedido (rotación completa, simulado): status = %d, esperaba %d. body=%s", rec5.Code, http.StatusForbidden, rec5.Body.String())
	}

	// El borrado de los 4 turnos anteriores pasa de verdad, incluso en
	// modo simulado (el 5to nunca llegó a crearse, igual que en modo real).
	var count int64
	gdb.Model(&db.Turno{}).Where("profesional_id = ?", reg.Profesional.ID).Count(&count)
	if count != 0 {
		t.Errorf("count = %d, esperaba 0 (el borrado pasa de verdad en modo simulado)", count)
	}
	// Pero la IP NO queda bloqueada de verdad.
	var bloqueoIP db.IPBloqueadaTurnoPublico
	if err := gdb.Where("profesional_id = ?", reg.Profesional.ID).First(&bloqueoIP).Error; !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("no esperaba que la IP quedara bloqueada de verdad (err=%v)", err)
	}

	var auditoria db.AuditoriaBloqueoTurnoPublico
	if err := gdb.Where("profesional_id = ? AND motivo = ?", reg.Profesional.ID, "ip_rotacion").First(&auditoria).Error; err != nil {
		t.Fatalf("esperaba una fila de auditoría de rotación simulada: %v", err)
	}
	if !auditoria.Simulado {
		t.Errorf("Simulado = false, esperaba true")
	}
	if auditoria.TurnosBorrados != 4 {
		t.Errorf("TurnosBorrados = %d, esperaba 4 (borrado real)", auditoria.TurnosBorrados)
	}
}

// TestSolicitarTurnoPublico_SegundoMailMismoTipoRechazaSiPrimeroNoVerificado
// — corrección de QA (TR-107), reemplaza el comportamiento viejo de este
// mismo escenario (antes se dejaba pasar "ya que no sabemos con certeza
// quién es el impostor acá"): ahora un DNI sin verificar nunca puede tener
// más de 1 turno VIGENTE a la vez, ni siquiera del mismo tipo con otro
// mail — pedido textual del cliente: "es muy específico que un atacante
// sepa que tal DNI va a asistir a la clínica y reservarlo de antemano". El
// aviso expone el mail del turno YA activo, censurado.
func TestSolicitarTurnoPublico_SegundoMailMismoTipoRechazaSiPrimeroNoVerificado(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico12@example.com")
	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")
	rec1 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token1))
	if rec1.Code != http.StatusCreated {
		t.Fatalf("primer pedido: status = %d, esperaba %d. body=%s", rec1.Code, http.StatusCreated, rec1.Body.String())
	}

	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno2@example.com")
	req2 := solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "10:00", token2)
	req2.EmailContacto = "bruno2@example.com"
	rec2 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req2)
	if rec2.Code != http.StatusConflict {
		t.Fatalf("segundo pedido (mismo tipo, otro mail, primero sin verificar): status = %d, esperaba %d. body=%s", rec2.Code, http.StatusConflict, rec2.Body.String())
	}
	if !strings.Contains(rec2.Body.String(), "brun...@example.com") {
		t.Errorf("body = %s, esperaba el mail censurado del turno ya activo (brun...@example.com)", rec2.Body.String())
	}
}

// TestSolicitarTurnoPublico_PacienteVerificadoIdCreaTurnoConDatosReales —
// Fase 2.4.1, camino "ya he venido antes": el turno se vincula directo a
// la ficha elegida, con el snapshot de contacto REAL de esa ficha —
// nunca datos sueltos de la request (que ni siquiera manda nombre/
// apellido/DNI/teléfono en este camino).
func TestSolicitarTurnoPublico_PacienteVerificadoIdCreaTurnoConDatosReales(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico13@example.com")
	email := "bruno@example.com"
	paciente := crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", email)
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)

	req := solicitarTurnoPublicoRequest{
		EmailContacto:        email,
		TipoConsultaID:       tipoID,
		Fecha:                fechaDePruebaDisponibilidad,
		Hora:                 "08:00",
		VerificacionToken:    token,
		PacienteVerificadoID: paciente.ID.String(),
	}
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	// El paciente ya tenía UN turno (el que crearPacienteVerificadoDePrueba
	// arma para dejarlo "verificado", con Asistencia = "asistio") — el
	// nuevo se distingue por no tener asistencia marcada todavía.
	var turno db.Turno
	if err := gdb.Where("paciente_id = ? AND asistencia IS NULL", paciente.ID).First(&turno).Error; err != nil {
		t.Fatalf("no se pudo encontrar el turno creado: %v", err)
	}
	if turno.NombreContacto != "Bruno" || turno.ApellidoContacto != "Iglesias" || turno.DNIContacto != "30111222" {
		t.Errorf("datos de contacto = %q/%q/%q, esperaba los reales de la ficha (Bruno/Iglesias/30111222)", turno.NombreContacto, turno.ApellidoContacto, turno.DNIContacto)
	}
}

// TestSolicitarTurnoPublico_PacienteVerificadoIdConTurnoActivoPropioRechaza
// — corrección de QA sobre TR-107: "aunque esté verificado" — un paciente
// verificado que ya tiene un turno activo NO puede sacar otro ni siquiera
// usando su propia tarjeta de "ya he venido antes" (pacienteVerificadoId).
func TestSolicitarTurnoPublico_PacienteVerificadoIdConTurnoActivoPropioRechaza(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico26@example.com")
	segundoTipoID := crearSegundoTipoConsultaDePrueba(t, gdb, reg.Profesional.ID)
	email := "bruno@example.com"
	paciente := crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", email)

	token1 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)
	req1 := solicitarTurnoPublicoRequest{
		EmailContacto: email, TipoConsultaID: tipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "08:00",
		VerificacionToken: token1, PacienteVerificadoID: paciente.ID.String(),
	}
	rec1 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req1)
	if rec1.Code != http.StatusCreated {
		t.Fatalf("primer pedido: status = %d, esperaba %d. body=%s", rec1.Code, http.StatusCreated, rec1.Body.String())
	}

	// Mismo paciente, mismo mail, pero OTRO tipo de consulta — igual se
	// rechaza, ya tiene un turno activo (el de arriba).
	if err := gdb.Exec("DELETE FROM auth_rate_counters WHERE scope IN (?, ?)",
		db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown").Error; err != nil {
		t.Fatalf("no se pudo limpiar el rate limit de prueba: %v", err)
	}
	token2 := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)
	req2 := solicitarTurnoPublicoRequest{
		EmailContacto: email, TipoConsultaID: segundoTipoID, Fecha: fechaDePruebaDisponibilidad, Hora: "10:00",
		VerificacionToken: token2, PacienteVerificadoID: paciente.ID.String(),
	}
	rec2 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req2)
	if rec2.Code != http.StatusConflict {
		t.Fatalf("segundo pedido: status = %d, esperaba %d. body=%s", rec2.Code, http.StatusConflict, rec2.Body.String())
	}
	if !strings.Contains(rec2.Body.String(), "ya tenés un turno pendiente") {
		t.Errorf("body = %s, esperaba el mensaje universal de turno activo", rec2.Body.String())
	}
}

// TestSolicitarTurnoPublico_PacienteVerificadoIdInexistenteRechaza — un id
// inventado, o de OTRA clínica, no puede usarse para saltarse el alta de
// paciente nuevo.
func TestSolicitarTurnoPublico_PacienteVerificadoIdInexistenteRechaza(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico14@example.com")
	email := "bruno@example.com"
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)

	req := solicitarTurnoPublicoRequest{
		EmailContacto:        email,
		TipoConsultaID:       tipoID,
		Fecha:                fechaDePruebaDisponibilidad,
		Hora:                 "08:00",
		VerificacionToken:    token,
		PacienteVerificadoID: uuid.NewString(),
	}
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

// TestSolicitarTurnoPublico_DNIExistenteVerificadoConMailDistintoCreaConflicto
// — Fase 2.4.1 (F4.1.3): el documento pide dejar pasar el turno (nunca
// bloquear a alguien real) pero avisar — se crea una ficha nueva Y un
// `ConflictoPaciente` para que el profesional lo resuelva, en vez de
// sincronizar en silencio como TR-101 (que solo aplica cuando la ficha
// existente NO está verificada).
func TestSolicitarTurnoPublico_DNIExistenteVerificadoConMailDistintoCreaConflicto(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico15@example.com")
	pacienteVerificado := crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com")

	segundoTipoID := crearSegundoTipoConsultaDePrueba(t, gdb, reg.Profesional.ID)
	tokenOtro := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "otro@example.com")
	req := solicitudDePrueba(segundoTipoID, fechaDePruebaDisponibilidad, "08:00", tokenOtro)
	req.DNIContacto = "30111222" // mismo DNI que el paciente ya verificado
	req.EmailContacto = "otro@example.com"
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("el turno en conflicto igual se tiene que crear (nunca bloquear): status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var conflictos []db.ConflictoPaciente
	if err := gdb.Where("profesional_id = ? AND paciente_verificado_id = ?", reg.Profesional.ID, pacienteVerificado.ID).Find(&conflictos).Error; err != nil {
		t.Fatalf("no se pudo consultar conflictos: %v", err)
	}
	if len(conflictos) != 1 {
		t.Fatalf("got %d conflictos, esperaba 1", len(conflictos))
	}
	if conflictos[0].Resuelto {
		t.Error("el conflicto nuevo no debería nacer resuelto")
	}

	var pacientes []db.Paciente
	if err := gdb.Where("profesional_id = ? AND dni = ?", reg.Profesional.ID, "30111222").Find(&pacientes).Error; err != nil {
		t.Fatalf("no se pudo consultar pacientes: %v", err)
	}
	if len(pacientes) != 2 {
		t.Fatalf("got %d pacientes con el mismo DNI, esperaba 2 (el verificado + la ficha nueva en conflicto)", len(pacientes))
	}
}

// TestSolicitarTurnoPublico_MailBloqueadoRechaza — Fase 2.4.1: chequeo
// redundante al de enviarVerificacionTurnoPublicoHandler, por si el mail
// se bloqueó DESPUÉS de emitir un token que todavía sigue vigente (hasta
// 30 min) — el pedido final también tiene que rechazarlo.
func TestSolicitarTurnoPublico_MailBloqueadoRechaza(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "publico16@example.com")
	email := "bruno@example.com"
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)

	pid, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	if err := gdb.Create(&db.EmailBloqueadoTurnoPublico{ProfesionalID: pid, Email: email, BloqueadoHasta: time.Now().Add(7 * 24 * time.Hour)}).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo de prueba: %v", err)
	}

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token))
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
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
