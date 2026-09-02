package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/security"
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
	// códigos previos" del segundo envío, no el cooldown en sí.
	if err := gdb.Where("scope = ?", db.RateLimitScopeTurnoVerifEnviar).Delete(&db.AuthRateCounter{}).Error; err != nil {
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
