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
	if err := s.SendVerificationEmail(context.Background(), "x@example.com", "https://x/verify"); err != nil {
		t.Errorf("LogSender.SendVerificationEmail no debería fallar nunca: %v", err)
	}
	if err := s.SendPasswordResetEmail(context.Background(), "x@example.com", "https://x/reset"); err != nil {
		t.Errorf("LogSender.SendPasswordResetEmail no debería fallar nunca: %v", err)
	}
	if err := s.SendWelcomeEmail(context.Background(), "x@example.com", "Ana"); err != nil {
		t.Errorf("LogSender.SendWelcomeEmail no debería fallar nunca: %v", err)
	}
}

func TestResendSender_SendVerificationEmail_MandaElLinkYElFrom(t *testing.T) {
	var capturedAuth string
	var capturedBody map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sender := &mail.ResendSender{APIKey: "re_test_key", From: "no-reply@dentalmirage.com.ar", Client: server.Client(), BaseURL: server.URL}

	if err := sender.SendVerificationEmail(context.Background(), "paciente@example.com", "https://dentalmirage.com.ar/verificar-mail?token=abc"); err != nil {
		t.Fatalf("SendVerificationEmail error inesperado: %v", err)
	}

	if capturedAuth != "Bearer re_test_key" {
		t.Errorf("Authorization = %q, esperaba el Bearer con la API key", capturedAuth)
	}
	if capturedBody["from"] != "no-reply@dentalmirage.com.ar" {
		t.Errorf("from = %v, esperaba el remitente configurado", capturedBody["from"])
	}
	html, _ := capturedBody["html"].(string)
	if !strings.Contains(html, "https://dentalmirage.com.ar/verificar-mail?token=abc") {
		t.Error("el HTML del mail debería contener el link de verificación")
	}
}

func TestResendSender_ErrorDeRedNoTumbaElRequest(t *testing.T) {
	sender := &mail.ResendSender{APIKey: "x", From: "x@example.com", Client: http.DefaultClient, BaseURL: "http://este-host-no-existe.invalid"}

	err := sender.SendVerificationEmail(context.Background(), "x@example.com", "https://x/verify")
	if err == nil {
		t.Fatal("esperaba un error cuando la red falla — el caller es quien decide no tumbar el request, no este método")
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
