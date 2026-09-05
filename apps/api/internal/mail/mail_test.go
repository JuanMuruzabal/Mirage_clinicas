package mail_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"dental-mirage/api/internal/mail"
)

func TestLogSender_NuncaFalla(t *testing.T) {
	s := mail.LogSender{}
	if err := s.SendVerificationEmail(context.Background(), "x@example.com", "482913"); err != nil {
		t.Errorf("LogSender.SendVerificationEmail no debería fallar nunca: %v", err)
	}
	if err := s.SendPasswordResetEmail(context.Background(), "x@example.com", "https://x/reset"); err != nil {
		t.Errorf("LogSender.SendPasswordResetEmail no debería fallar nunca: %v", err)
	}
	if err := s.SendWelcomeEmail(context.Background(), "x@example.com", "Ana"); err != nil {
		t.Errorf("LogSender.SendWelcomeEmail no debería fallar nunca: %v", err)
	}
	if err := s.SendTurnoVerificationEmail(context.Background(), "x@example.com", "482913", "Clínica X"); err != nil {
		t.Errorf("LogSender.SendTurnoVerificationEmail no debería fallar nunca: %v", err)
	}
	if err := s.SendTurnoConfirmadoEmail(context.Background(), "x@example.com", mail.TurnoConfirmadoInfo{
		NombreClinica: "Clínica X", NombrePaciente: "Bruno Iglesias", Fecha: "8 de septiembre de 2026",
		HoraInicio: "10:00", HoraFin: "10:30", TipoConsulta: "Consulta general",
	}); err != nil {
		t.Errorf("LogSender.SendTurnoConfirmadoEmail no debería fallar nunca: %v", err)
	}
}

// TestResendSender_SendTurnoVerificationEmail_MandaElCodigoYLaClinica —
// TR-103 en docs/tradeoffs.md: "Confirmanos que sos vos" del formulario
// público reusa el mismo mecanismo de código de 6 dígitos, con su propia
// plantilla que además nombra a la clínica.
func TestResendSender_SendTurnoVerificationEmail_MandaElCodigoYLaClinica(t *testing.T) {
	var capturedBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sender := &mail.ResendSender{APIKey: "re_test_key", From: "no-reply@dentalmirage.com.ar", Client: server.Client(), BaseURL: server.URL}

	if err := sender.SendTurnoVerificationEmail(context.Background(), "paciente@example.com", "482913", "Clínica X"); err != nil {
		t.Fatalf("SendTurnoVerificationEmail error inesperado: %v", err)
	}

	html, _ := capturedBody["html"].(string)
	if !strings.Contains(html, "482913") {
		t.Error("el HTML debería contener el código de verificación")
	}
	if !strings.Contains(html, "Clínica X") {
		t.Error("el HTML debería nombrar a la clínica")
	}
	if subject, _ := capturedBody["subject"].(string); !strings.Contains(subject, "Clínica X") {
		t.Errorf("subject = %q, esperaba que nombre a la clínica", subject)
	}

	// Corrección de QA (2026-09-06): "los códigos de confirmación de
	// turno me llegan a spam" — un mail solo-HTML (sin versión de texto
	// plano) es una señal clásica de spam para OTPs; el campo `text` de
	// Resend (multipart/alternative) tenía que empezar a mandarse.
	text, _ := capturedBody["text"].(string)
	if text == "" {
		t.Fatal("esperaba una versión de texto plano (campo 'text'), vino vacía")
	}
	if strings.Contains(text, "<") {
		t.Errorf("el texto plano no debería tener tags HTML sin limpiar: %q", text)
	}
	if !strings.Contains(text, "482913") || !strings.Contains(text, "Clínica X") {
		t.Errorf("el texto plano debería tener el mismo contenido que el HTML: %q", text)
	}
}

// TestResendSender_SendTurnoConfirmadoEmail_MandaLosDatosDelTurno — TR-109:
// mail de confirmación disparado cada vez que se saca un turno desde el
// formulario público.
func TestResendSender_SendTurnoConfirmadoEmail_MandaLosDatosDelTurno(t *testing.T) {
	var capturedBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sender := &mail.ResendSender{APIKey: "re_test_key", From: "no-reply@dentalmirage.com.ar", Client: server.Client(), BaseURL: server.URL}

	info := mail.TurnoConfirmadoInfo{
		NombreClinica: "Clínica X", NombrePaciente: "Bruno Iglesias", Fecha: "8 de septiembre de 2026",
		HoraInicio: "10:00", HoraFin: "10:30", TipoConsulta: "Consulta general",
	}
	if err := sender.SendTurnoConfirmadoEmail(context.Background(), "paciente@example.com", info); err != nil {
		t.Fatalf("SendTurnoConfirmadoEmail error inesperado: %v", err)
	}

	html, _ := capturedBody["html"].(string)
	for _, esperado := range []string{"Bruno Iglesias", "8 de septiembre de 2026", "10:00", "10:30", "Consulta general", "Clínica X"} {
		if !strings.Contains(html, esperado) {
			t.Errorf("el HTML debería contener %q — html=%s", esperado, html)
		}
	}
	if subject, _ := capturedBody["subject"].(string); !strings.Contains(subject, "Clínica X") {
		t.Errorf("subject = %q, esperaba que nombre a la clínica", subject)
	}
}

// TestResendSender_SendTurnoConfirmadoEmail_ErrorDeRedNoTumbaElRequest —
// mismo criterio que TestResendSender_ErrorDeRedNoTumbaElRequest: el
// fire-and-forget de turno_publico.go depende de que esto NUNCA entre en
// pánico, solo devuelva el error para que el caller decida (nunca falla
// el pedido de turno por esto).
func TestResendSender_SendTurnoConfirmadoEmail_ErrorDeRedNoTumbaElRequest(t *testing.T) {
	sender := &mail.ResendSender{APIKey: "x", From: "x@example.com", Client: http.DefaultClient, BaseURL: "http://este-host-no-existe.invalid"}

	err := sender.SendTurnoConfirmadoEmail(context.Background(), "x@example.com", mail.TurnoConfirmadoInfo{NombreClinica: "Clínica X"})
	if err == nil {
		t.Fatal("esperaba un error cuando la red falla")
	}
}

// TestResendSender_SendVerificationEmail_MandaElCodigoYElFrom — TR-055 en
// docs/tradeoffs.md: el mail de verificación manda un código de 6 dígitos
// para escribir a mano, no un link para clickear.
func TestResendSender_SendVerificationEmail_MandaElCodigoYElFrom(t *testing.T) {
	var capturedAuth string
	var capturedBody map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sender := &mail.ResendSender{APIKey: "re_test_key", From: "no-reply@dentalmirage.com.ar", Client: server.Client(), BaseURL: server.URL}

	if err := sender.SendVerificationEmail(context.Background(), "paciente@example.com", "482913"); err != nil {
		t.Fatalf("SendVerificationEmail error inesperado: %v", err)
	}

	if capturedAuth != "Bearer re_test_key" {
		t.Errorf("Authorization = %q, esperaba el Bearer con la API key", capturedAuth)
	}
	if capturedBody["from"] != "no-reply@dentalmirage.com.ar" {
		t.Errorf("from = %v, esperaba el remitente configurado", capturedBody["from"])
	}
	html, _ := capturedBody["html"].(string)
	if !strings.Contains(html, "482913") {
		t.Error("el HTML del mail debería contener el código de verificación")
	}
}

func TestResendSender_ErrorDeRedNoTumbaElRequest(t *testing.T) {
	sender := &mail.ResendSender{APIKey: "x", From: "x@example.com", Client: http.DefaultClient, BaseURL: "http://este-host-no-existe.invalid"}

	err := sender.SendVerificationEmail(context.Background(), "x@example.com", "482913")
	if err == nil {
		t.Fatal("esperaba un error cuando la red falla — el caller es quien decide no tumbar el request, no este método")
	}
}

func TestResendSender_SendWelcomeEmail_MandaElNombre(t *testing.T) {
	var capturedBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sender := &mail.ResendSender{APIKey: "re_test_key", From: "no-reply@dentalmirage.com.ar", Client: server.Client(), BaseURL: server.URL}

	if err := sender.SendWelcomeEmail(context.Background(), "ana@example.com", "Ana"); err != nil {
		t.Fatalf("SendWelcomeEmail error inesperado: %v", err)
	}

	html, _ := capturedBody["html"].(string)
	if !strings.Contains(html, "Ana") {
		t.Error("el HTML de bienvenida debería incluir el nombre")
	}
}

func TestResendSender_SendWelcomeEmail_SinNombreNoRompe(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sender := &mail.ResendSender{APIKey: "x", From: "x@example.com", Client: server.Client(), BaseURL: server.URL}

	if err := sender.SendWelcomeEmail(context.Background(), "ana@example.com", ""); err != nil {
		t.Fatalf("SendWelcomeEmail sin nombre no debería fallar: %v", err)
	}
}

func TestNewResendSender_ConfiguraClienteConTimeout(t *testing.T) {
	sender := mail.NewResendSender("re_key", "no-reply@dentalmirage.com.ar")
	if sender.APIKey != "re_key" || sender.From != "no-reply@dentalmirage.com.ar" {
		t.Errorf("NewResendSender no seteó APIKey/From correctamente: %+v", sender)
	}
	if sender.Client == nil {
		t.Error("NewResendSender debería configurar un *http.Client")
	}
}

func TestResendSender_StatusDeErrorDevuelveError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	sender := &mail.ResendSender{APIKey: "invalida", From: "x@example.com", Client: server.Client(), BaseURL: server.URL}

	if err := sender.SendPasswordResetEmail(context.Background(), "x@example.com", "https://x/reset"); err == nil {
		t.Error("un 401 de Resend debería devolver error")
	}
}
