// Package mail centraliza el envío de correo transaccional (verificación
// de cuenta, recuperación de contraseña, bienvenida al completar el
// onboarding — spec §6 de docs/feature-sumarte-login.md). Mismo patrón
// dev/prod que el resto de dependencias externas del proyecto (CLAUDE.md):
// interfaz Sender + LogSender no-op para dev + ResendSender real para
// prod, inyectada desde cmd/api/main.go. Un envío que falla nunca debe
// tumbar el request que lo dispara — el caller decide qué hacer con el
// error (loguearlo y devolver un estado manejable en la UI), nunca
// propagarlo como un 500 crudo.
package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// Sender es la interfaz que consume internal/http/auth.go y onboarding.go
// — nunca llaman directo a Resend ni a ningún proveedor.
//
// SendVerificationEmail manda un CÓDIGO de 6 dígitos, no un link (pedido
// explícito del cliente, 2026-08-26, TR-055 en docs/tradeoffs.md — antes
// era un link a /verificar-mail?token=...). El resto de los mails no
// cambió.
type Sender interface {
	SendVerificationEmail(ctx context.Context, to, code string) error
	SendPasswordResetEmail(ctx context.Context, to, resetURL string) error
	SendWelcomeEmail(ctx context.Context, to, nombre string) error
}

// LogSender es la implementación de desarrollo: no manda nada de verdad,
// solo loguea el código/link — así se puede probar el flujo completo de
// verificación/reset localmente sin depender de una cuenta de Resend real.
type LogSender struct{}

func (LogSender) SendVerificationEmail(_ context.Context, to, code string) error {
	log.Printf("[mail:dev] código de verificación para %s: %s", to, code)
	return nil
}

func (LogSender) SendPasswordResetEmail(_ context.Context, to, resetURL string) error {
	log.Printf("[mail:dev] recuperación de contraseña para %s: %s", to, resetURL)
	return nil
}

func (LogSender) SendWelcomeEmail(_ context.Context, to, nombre string) error {
	log.Printf("[mail:dev] bienvenida para %s (%s)", to, nombre)
	return nil
}

// ResendSender es la implementación real, contra la API HTTP de Resend —
// sin SDK (mismo criterio que internal/turnstile y internal/googleauth:
// una request HTTP simple no justifica una dependencia nueva).
type ResendSender struct {
	APIKey string
	From   string
	Client *http.Client
	// BaseURL: vacío usa la API real de Resend. Solo se pisa en tests.
	BaseURL string
}

func NewResendSender(apiKey, from string) *ResendSender {
	return &ResendSender{APIKey: apiKey, From: from, Client: &http.Client{Timeout: 10 * time.Second}}
}

const resendAPIURL = "https://api.resend.com/emails"

type resendRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
}

func (s *ResendSender) send(ctx context.Context, to, subject, html string) error {
	base := s.BaseURL
	if base == "" {
		base = resendAPIURL
	}

	body, err := json.Marshal(resendRequest{From: s.From, To: []string{to}, Subject: subject, HTML: html})
	if err != nil {
		return fmt.Errorf("no se pudo serializar el mail: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("no se pudo armar la request a Resend: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.APIKey)

	resp, err := s.Client.Do(req)
	if err != nil {
		return fmt.Errorf("no se pudo contactar a Resend: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("resend respondió %d", resp.StatusCode)
	}
	return nil
}

func (s *ResendSender) SendVerificationEmail(ctx context.Context, to, code string) error {
	subject, html, err := renderVerificationEmail(code)
	if err != nil {
		return err
	}
	return s.send(ctx, to, subject, html)
}

func (s *ResendSender) SendPasswordResetEmail(ctx context.Context, to, resetURL string) error {
	subject, html, err := renderPasswordResetEmail(resetURL)
	if err != nil {
		return err
	}
	return s.send(ctx, to, subject, html)
}

func (s *ResendSender) SendWelcomeEmail(ctx context.Context, to, nombre string) error {
	subject, html, err := renderWelcomeEmail(nombre)
	if err != nil {
		return err
	}
	return s.send(ctx, to, subject, html)
}
