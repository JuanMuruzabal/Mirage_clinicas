// Package turnstile verifica tokens de Cloudflare Turnstile (CAPTCHA en
// registro y reset de contraseña, spec §7 de docs/feature-sumarte-login.md).
package turnstile

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const siteverifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

// Verifier valida un token de Turnstile resuelto por el cliente.
type Verifier interface {
	Verify(ctx context.Context, token, remoteIP string) (bool, error)
}

// HTTPVerifier es la implementación real. Un Verifier nil (no configurado,
// típicamente en dev sin secret key propia) se trata como "CAPTCHA
// deshabilitado" por el caller — ver internal/http/auth.go — nunca como un
// error 500.
type HTTPVerifier struct {
	SecretKey string
	Client    *http.Client
	// BaseURL: vacío usa siteverifyURL (la API real). Solo se pisa en tests.
	BaseURL string
}

func NewHTTPVerifier(secretKey string) *HTTPVerifier {
	return &HTTPVerifier{SecretKey: secretKey, Client: &http.Client{Timeout: 5 * time.Second}}
}

type siteverifyResponse struct {
	Success bool `json:"success"`
}

func (v *HTTPVerifier) Verify(ctx context.Context, token, remoteIP string) (bool, error) {
	if token == "" {
		return false, nil
	}
	endpoint := v.BaseURL
	if endpoint == "" {
		endpoint = siteverifyURL
	}

	form := url.Values{"secret": {v.SecretKey}, "response": {token}}
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return false, fmt.Errorf("no se pudo armar la request a Turnstile: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := v.Client.Do(req)
	if err != nil {
		return false, fmt.Errorf("no se pudo contactar a Turnstile: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	var out siteverifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false, fmt.Errorf("respuesta de Turnstile inválida: %w", err)
	}
	return out.Success, nil
}
