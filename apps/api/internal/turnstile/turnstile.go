// Package turnstile verifica tokens de Cloudflare Turnstile (CAPTCHA en
// registro y reset de contraseña, spec §7 de docs/Login/feature-sumarte-login.md).
package turnstile

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const siteverifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

// maxRespuestaExterna — techo de lectura para el body de una respuesta de
// un servicio externo. Mismo principio que maxJSONBodyBytes en
// internal/http (Fase A de la auditoría, límite del body ENTRANTE), del
// lado de las respuestas SALIENTES: json.NewDecoder sobre un resp.Body sin
// acotar transmite a memoria todo lo que el otro lado mande, sin techo.
//
// Severidad baja y a conciencia: el otro lado acá es Google/Cloudflare
// sobre TLS, no un atacante. Pero un servicio externo puede empezar a
// responder cualquier cosa (un incidente suyo, un proxy corporativo
// intercalado devolviendo una página de error gigante) sin que este
// backend tenga forma de anticiparlo — y estas respuestas son de unos
// pocos KB: 1 MiB es holgado por dos órdenes de magnitud.
const maxRespuestaExterna = 1 << 20 // 1 MiB

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
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxRespuestaExterna)).Decode(&out); err != nil {
		return false, fmt.Errorf("respuesta de Turnstile inválida: %w", err)
	}
	return out.Success, nil
}
