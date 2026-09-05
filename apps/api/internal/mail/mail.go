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
	"regexp"
	"strings"
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
	// SendTurnoVerificationEmail — Extra 2.3.5 (E5.6): "Confirmanos que sos
	// vos" del wizard público de pedido de turno. Mismo mecanismo que
	// SendVerificationEmail (código de 6 dígitos, no un link) pero con otro
	// texto/asunto y sin ninguna cuenta detrás — nombreClinica identifica
	// de qué clínica es el pedido, ya que quien lo recibe puede haber
	// pedido turno en más de una.
	SendTurnoVerificationEmail(ctx context.Context, to, code, nombreClinica string) error
	// SendTurnoConfirmadoEmail — pedido textual del cliente: "cada vez que
	// se saque un turno, enviar una notificación por mail, al mail con el
	// que se hizo el turno". Se manda DESPUÉS de que el turno ya quedó
	// creado (mismo criterio que el resto de los mails de este archivo: un
	// envío que falla nunca tumba el request que lo dispara), tanto para
	// el camino "primera vez" como "ya he venido antes".
	SendTurnoConfirmadoEmail(ctx context.Context, to string, info TurnoConfirmadoInfo) error
}

// TurnoConfirmadoInfo — agrupa los datos del turno para el mail de
// confirmación en un struct en vez de una firma con 6+ parámetros
// sueltos (único método de este archivo que necesita tantos datos a la
// vez).
type TurnoConfirmadoInfo struct {
	NombreClinica  string
	NombrePaciente string
	Fecha          string // ya formateada, ej. "martes 8 de septiembre de 2026"
	HoraInicio     string
	HoraFin        string
	TipoConsulta   string
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

func (LogSender) SendTurnoVerificationEmail(_ context.Context, to, code, nombreClinica string) error {
	log.Printf("[mail:dev] código de verificación de turno (%s) para %s: %s", nombreClinica, to, code)
	return nil
}

func (LogSender) SendTurnoConfirmadoEmail(_ context.Context, to string, info TurnoConfirmadoInfo) error {
	log.Printf("[mail:dev] turno confirmado (%s) para %s: %s %s-%s (%s)", info.NombreClinica, to, info.Fecha, info.HoraInicio, info.HoraFin, info.TipoConsulta)
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
	Text    string   `json:"text"`
}

// htmlTagRegex/textoPlanoDesdeHTML — corrección de QA (2026-09-06),
// pedido textual del cliente: "los códigos de confirmación de turno me
// llegan a spam... el mail de turno sacado sí me llega a principal".
// Ninguna de las plantillas mandaba una versión de texto plano junto con
// el HTML (`resendRequest` no tenía el campo `text` de la API de Resend)
// — un mail solo-HTML es justamente el patrón que separa a un mail
// transaccional legítimo de uno de phishing a ojos de los clasificadores
// de spam de Gmail/Outlook (todo OTP real de un banco/Google manda las
// dos partes, "multipart/alternative"); el mail de "turno confirmado"
// tiene menos señales de riesgo (sin código numérico grande, sin
// urgencia de "vence en 15 minutos") así que se libraba más seguido,
// pero el problema de fondo (solo HTML) aplicaba a los dos por igual.
// Regex sobre las propias plantillas (controladas por nosotros, nunca
// HTML de un tercero) en vez de un parser HTML completo — alcanza y
// evita sumar una dependencia nueva solo para esto.
var htmlTagRegex = regexp.MustCompile(`<[^>]*>`)

func textoPlanoDesdeHTML(html string) string {
	sinTags := htmlTagRegex.ReplaceAllString(html, " ")
	return strings.Join(strings.Fields(sinTags), " ")
}

func (s *ResendSender) send(ctx context.Context, to, subject, html string) error {
	base := s.BaseURL
	if base == "" {
		base = resendAPIURL
	}

	body, err := json.Marshal(resendRequest{From: s.From, To: []string{to}, Subject: subject, HTML: html, Text: textoPlanoDesdeHTML(html)})
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

func (s *ResendSender) SendTurnoVerificationEmail(ctx context.Context, to, code, nombreClinica string) error {
	subject, html, err := renderTurnoVerificacionEmail(code, nombreClinica)
	if err != nil {
		return err
	}
	return s.send(ctx, to, subject, html)
}

func (s *ResendSender) SendTurnoConfirmadoEmail(ctx context.Context, to string, info TurnoConfirmadoInfo) error {
	subject, html, err := renderTurnoConfirmadoEmail(info)
	if err != nil {
		return err
	}
	return s.send(ctx, to, subject, html)
}
