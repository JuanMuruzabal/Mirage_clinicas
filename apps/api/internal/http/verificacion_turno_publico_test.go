package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/security"
	"dental-mirage/api/internal/testdb"
)

func TestEnviarVerificacionTurnoPublico_Exitoso(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifenviar1@example.com", Password: "password123456", NombreClinica: "Clínica Verif",
	})

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: "paciente@example.com"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if codigo := sender.codigoDeLaUltimaVerificacionDeTurno("paciente@example.com"); len(codigo) != 6 {
		t.Errorf("código capturado = %q, esperaba 6 dígitos", codigo)
	}
}

// TestEnviarVerificacionTurnoPublico_LimitePorIPEsPorClinica — corrección de
// bug real (N clínicas en subdominios propios, la plataforma en su etapa
// final): el límite de "enviar código" por IP tenía la clínica AFUERA de su
// clave (`ip` a secas) — dos clínicas sin ninguna relación entre sí, con
// pacientes compartiendo salida de IP (oficina, CGNAT), competían por el
// mismo cupo de 20/hora. Agota el cupo de la Clínica A (20 pedidos, cada uno
// con un mail distinto para no chocar con el tope por cuenta) y confirma que
// la Clínica B, con la MISMA IP de origen, todavía tiene su propio cupo
// intacto.
func TestEnviarVerificacionTurnoPublico_LimitePorIPEsPorClinica(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	clinicaA := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "limiteipA@example.com", Password: "password123456", NombreClinica: "Clínica A",
	})
	clinicaB := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Juan Pérez", Email: "limiteipB@example.com", Password: "password123456", NombreClinica: "Clínica B",
	})

	for i := 0; i < 20; i++ {
		email := uuid.NewString() + "@example.com"
		rec := doJSON(t, router, http.MethodPost, "/clinicas/"+clinicaA.Profesional.Slug+"/verificacion-email",
			enviarVerificacionTurnoPublicoRequest{Email: email})
		if rec.Code != http.StatusOK {
			t.Fatalf("pedido %d a la Clínica A: status = %d, esperaba %d. body=%s", i+1, rec.Code, http.StatusOK, rec.Body.String())
		}
	}

	// El 21vo pedido a la Clínica A, misma IP, debería rechazarse — el
	// límite en sí sigue funcionando.
	recExcedido := doJSON(t, router, http.MethodPost, "/clinicas/"+clinicaA.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: uuid.NewString() + "@example.com"})
	if recExcedido.Code != http.StatusTooManyRequests {
		t.Fatalf("pedido 21 a la Clínica A: status = %d, esperaba %d (límite agotado)", recExcedido.Code, http.StatusTooManyRequests)
	}

	// La Clínica B, desde la MISMA IP, no debería verse afectada.
	recClinicaB := doJSON(t, router, http.MethodPost, "/clinicas/"+clinicaB.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: "paciente-clinica-b@example.com"})
	if recClinicaB.Code != http.StatusOK {
		t.Errorf("pedido a la Clínica B (misma IP, cupo propio): status = %d, esperaba %d. body=%s", recClinicaB.Code, http.StatusOK, recClinicaB.Body.String())
	}
}

// TestEnviarVerificacionTurnoPublico_CaptchaInvalidoRechaza — corrección
// de seguridad (Fase 2.4.1): antes de esto, el formulario público de
// turnos no tenía ningún CAPTCHA — con Turnstile configurado y un token
// inválido, el pedido de código se rechaza, mismo criterio que
// TestRegister_CaptchaInvalidoRechaza en auth_test.go.
func TestEnviarVerificacionTurnoPublico_CaptchaInvalidoRechaza(t *testing.T) {
	gdb := testdb.New(t)
	routerOK := routerOverDBWithTurnstile(gdb, true)
	reg := registrarProfesionalDePrueba(t, gdb, routerOK, altaDePruebaInput{
		Nombre: "María Games", Email: "captchaturno1@example.com", Password: "password123456", NombreClinica: "Clínica Captcha",
	})

	routerFail := routerOverDBWithTurnstile(gdb, false)
	rec := doJSON(t, routerFail, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: "paciente@example.com", CaptchaToken: "token-malo"})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d (CAPTCHA inválido)", rec.Code, http.StatusBadRequest)
	}
}

// TestEnviarVerificacionTurnoPublico_CaptchaValidoPermite — con Turnstile
// configurado pero un token que SÍ resuelve el desafío, el pedido de
// código sigue funcionando igual que siempre.
func TestEnviarVerificacionTurnoPublico_CaptchaValidoPermite(t *testing.T) {
	gdb := testdb.New(t)
	routerOK := routerOverDBWithTurnstile(gdb, true)
	reg := registrarProfesionalDePrueba(t, gdb, routerOK, altaDePruebaInput{
		Nombre: "María Games", Email: "captchaturno2@example.com", Password: "password123456", NombreClinica: "Clínica Captcha 2",
	})

	rec := doJSON(t, routerOK, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: "paciente@example.com", CaptchaToken: "token-bueno"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

// TestEnviarVerificacionTurnoPublico_ExponeCodigoEnLocal — Fase 2.4.1,
// pedido del cliente: en local (sin RESEND_API_KEY, ver
// AuthDeps.ExponerCodigoVerificacion) la respuesta trae el código de
// verdad, para no tener que mirar los logs mientras se prueba el wizard.
func TestEnviarVerificacionTurnoPublico_ExponeCodigoEnLocal(t *testing.T) {
	router, gdb := newTestRouterWithExponerCodigo(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifenviar-dev@example.com", Password: "password123456", NombreClinica: "Clínica Verif Dev",
	})

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: "paciente@example.com"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got enviarVerificacionTurnoPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got.CodigoDev) != 6 {
		t.Errorf("CodigoDev = %q, esperaba 6 dígitos", got.CodigoDev)
	}

	// El código expuesto tiene que ser el mismo que de verdad valida
	// confirmarVerificacionTurnoPublicoHandler — no un valor cualquiera.
	recConfirmar := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email/confirmar",
		confirmarVerificacionTurnoPublicoRequest{Email: "paciente@example.com", Codigo: got.CodigoDev})
	if recConfirmar.Code != http.StatusOK {
		t.Errorf("confirmar con el código expuesto: status = %d, esperaba %d. body=%s", recConfirmar.Code, http.StatusOK, recConfirmar.Body.String())
	}
}

// TestEnviarVerificacionTurnoPublico_NoExponeCodigoSinFlag — el
// comportamiento de siempre (ExponerCodigoVerificacion en false, el
// default de cmd/api/main.go con RESEND_API_KEY configurada): la
// respuesta nunca trae el código.
func TestEnviarVerificacionTurnoPublico_NoExponeCodigoSinFlag(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifenviar-prod@example.com", Password: "password123456", NombreClinica: "Clínica Verif Prod",
	})

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: "paciente@example.com"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got enviarVerificacionTurnoPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.CodigoDev != "" {
		t.Errorf("CodigoDev = %q, esperaba vacío (sin ExponerCodigoVerificacion)", got.CodigoDev)
	}
}

func TestEnviarVerificacionTurnoPublico_EmailInvalido(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifenviar2@example.com", Password: "password123456", NombreClinica: "Clínica Verif2",
	})

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: "no-es-un-email"})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestEnviarVerificacionTurnoPublico_ClinicaInexistente(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodPost, "/clinicas/no-existe/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: "paciente@example.com"})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

// TestEnviarVerificacionTurnoPublico_MailBloqueadoRechaza — Fase 2.4.1,
// pedido textual del cliente: un mail bloqueado por una resolución de
// conflicto de pacientes no puede ni pedir un código nuevo.
func TestEnviarVerificacionTurnoPublico_MailBloqueadoRechaza(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifenviar5@example.com", Password: "password123456", NombreClinica: "Clínica Verif5",
	})
	pid, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	email := "bloqueado@example.com"
	if err := gdb.Create(&db.EmailBloqueadoTurnoPublico{ProfesionalID: pid, Email: email, BloqueadoHasta: time.Now().Add(7 * 24 * time.Hour)}).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo de prueba: %v", err)
	}

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: email})
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

// TestEnviarVerificacionTurnoPublico_MailBloqueoVencidoPermite — un
// bloqueo ya vencido (más de 7 días) no debe seguir rechazando.
func TestEnviarVerificacionTurnoPublico_MailBloqueoVencidoPermite(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifenviar6@example.com", Password: "password123456", NombreClinica: "Clínica Verif6",
	})
	pid, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	email := "yano-bloqueado@example.com"
	if err := gdb.Create(&db.EmailBloqueadoTurnoPublico{ProfesionalID: pid, Email: email, BloqueadoHasta: time.Now().Add(-time.Hour)}).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo de prueba: %v", err)
	}

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email",
		enviarVerificacionTurnoPublicoRequest{Email: email})
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestEnviarVerificacionTurnoPublico_CooldownRechazaUnSegundoEnvioInmediato(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifenviar3@example.com", Password: "password123456", NombreClinica: "Clínica Verif3",
	})

	payload := enviarVerificacionTurnoPublicoRequest{Email: "paciente@example.com"}
	rec1 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email", payload)
	if rec1.Code != http.StatusOK {
		t.Fatalf("primer envío: status = %d, esperaba %d", rec1.Code, http.StatusOK)
	}
	rec2 := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email", payload)
	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("segundo envío inmediato: status = %d, esperaba %d. body=%s", rec2.Code, http.StatusTooManyRequests, rec2.Body.String())
	}
}

// TestEnviarVerificacionTurnoPublico_InvalidaCodigosPrevios — mismo
// criterio que createAndSendVerificationToken (auth.go, TR-055): pedir un
// código nuevo invalida cualquier código previo sin usar de ese mismo
// mail — el código viejo no debería servir más una vez que se pidió otro.
func TestEnviarVerificacionTurnoPublico_InvalidaCodigosPrevios(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifenviar4@example.com", Password: "password123456", NombreClinica: "Clínica Verif4",
	})
	email := "paciente@example.com"

	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email", enviarVerificacionTurnoPublicoRequest{Email: email})
	codigoViejo := sender.codigoDeLaUltimaVerificacionDeTurno(email)

	// Bypassea el cooldown de 60s entre envíos (LimitTurnoVerifEnviarCooldown,
	// ya cubierto en su propio test arriba) borrando el contador de
	// rate-limit — lo que se quiere probar acá es el efecto de "invalida
	// códigos previos" del segundo envío, no el cooldown en sí. El cooldown
	// vive en su PROPIO scope (corrección de bug real: antes compartía fila
	// con el tope por hora y se pisaban entre sí, ver el comentario grande
	// en enviarVerificacionTurnoPublicoHandler) — hay que limpiar los dos.
	if err := gdb.Where("scope IN (?, ?)", db.RateLimitScopeTurnoVerifEnviar, db.RateLimitScopeTurnoVerifEnviar+"_cooldown").
		Delete(&db.AuthRateCounter{}).Error; err != nil {
		t.Fatalf("no se pudo limpiar el rate limiter: %v", err)
	}
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email", enviarVerificacionTurnoPublicoRequest{Email: email})

	// El código VIEJO ya no debería confirmar.
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email/confirmar",
		confirmarVerificacionTurnoPublicoRequest{Email: email, Codigo: codigoViejo})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d (código viejo invalidado)", rec.Code, http.StatusBadRequest)
	}
}

func TestConfirmarVerificacionTurnoPublico_Exitoso(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifconfirmar1@example.com", Password: "password123456", NombreClinica: "Clínica ConfVerif",
	})
	email := "paciente@example.com"
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email", enviarVerificacionTurnoPublicoRequest{Email: email})
	codigo := sender.codigoDeLaUltimaVerificacionDeTurno(email)

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email/confirmar",
		confirmarVerificacionTurnoPublicoRequest{Email: email, Codigo: codigo})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got confirmarVerificacionTurnoPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.Token == "" {
		t.Error("esperaba un token de prueba no vacío")
	}
}

func TestConfirmarVerificacionTurnoPublico_CodigoIncorrectoRechaza(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifconfirmar2@example.com", Password: "password123456", NombreClinica: "Clínica ConfVerif2",
	})
	email := "paciente@example.com"
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email", enviarVerificacionTurnoPublicoRequest{Email: email})
	_ = sender.codigoDeLaUltimaVerificacionDeTurno(email)

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email/confirmar",
		confirmarVerificacionTurnoPublicoRequest{Email: email, Codigo: "000000"})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestConfirmarVerificacionTurnoPublico_EmailInvalidoFalla(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifconfirmar-email@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email/confirmar",
		confirmarVerificacionTurnoPublicoRequest{Email: "no-es-un-mail", Codigo: "123456"})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestConfirmarVerificacionTurnoPublico_CodigoVacioFalla(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifconfirmar-codigo@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email/confirmar",
		confirmarVerificacionTurnoPublicoRequest{Email: "paciente@example.com", Codigo: "   "})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestConfirmarVerificacionTurnoPublico_CodigoVencidoRechaza(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifconfirmar3@example.com", Password: "password123456", NombreClinica: "Clínica ConfVerif3",
	})
	email := "paciente@example.com"
	clinicID, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesional.ID inválido: %v", err)
	}
	codigo, codeHash, _ := security.NewNumericCode(6)
	if err := gdb.Create(&db.VerificacionTurnoPublico{
		ClinicID: clinicID, Email: email, CodigoHash: codeHash, ExpiresAt: time.Now().Add(-time.Minute),
	}).Error; err != nil {
		t.Fatalf("no se pudo insertar la fila vencida: %v", err)
	}

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email/confirmar",
		confirmarVerificacionTurnoPublicoRequest{Email: email, Codigo: codigo})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestConfirmarVerificacionTurnoPublico_EmailSinCodigoPrevioRechaza(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifconfirmar4@example.com", Password: "password123456", NombreClinica: "Clínica ConfVerif4",
	})

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email/confirmar",
		confirmarVerificacionTurnoPublicoRequest{Email: "nunca-pidio-codigo@example.com", Codigo: "123456"})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestConfirmarVerificacionTurnoPublico_ClinicaInexistente(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodPost, "/clinicas/no-existe/verificacion-email/confirmar",
		confirmarVerificacionTurnoPublicoRequest{Email: "paciente@example.com", Codigo: "123456"})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestConfirmarVerificacionTurnoPublico_NoRequiereAutenticacion(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verifconfirmar5@example.com", Password: "password123456", NombreClinica: "Clínica ConfVerif5",
	})

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/verificacion-email/confirmar",
		confirmarVerificacionTurnoPublicoRequest{Email: "paciente@example.com", Codigo: "123456"})
	if rec.Code == http.StatusUnauthorized {
		t.Error("POST /clinicas/{slug}/verificacion-email/confirmar no debería exigir autenticación")
	}
}
