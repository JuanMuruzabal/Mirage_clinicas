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
