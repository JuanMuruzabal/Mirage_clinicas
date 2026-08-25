// Package googleauth intercambia un Authorization Code de Google (flujo
// popup + Authorization Code, decisión #1 del plan aprobado —
// docs/feature-sumarte-login.md) contra la identidad del usuario. El
// client secret vive solo acá, server-side — nunca llega al navegador.
// PKCE no aplica: es un client confidencial (el secret nunca sale del
// backend), PKCE existe para proteger clients públicos que no pueden
// guardar un secret (ver docs/tradeoffs.md).
package googleauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	tokenEndpoint    = "https://oauth2.googleapis.com/token"
	userinfoEndpoint = "https://www.googleapis.com/oauth2/v3/userinfo"
)

// UserInfo es lo único que este paquete conserva de la respuesta de
// Google — no se persisten tokens de acceso/refresco (minimización de
// datos, ver docs/tradeoffs.md y el plan aprobado).
type UserInfo struct {
	Sub           string // id de cuenta de Google, estable — esto es lo que se guarda en Account.ProviderAccountID
	Email         string
	EmailVerified bool
}

// Exchanger intercambia un Authorization Code por la identidad del
// usuario. Interfaz para poder mockear en tests (nunca pegarle a Google
// real desde un test, ver internal/googleauth/googleauth_test.go).
type Exchanger interface {
	Exchange(ctx context.Context, code, redirectURI string) (UserInfo, error)
}

// HTTPExchanger es la implementación real.
type HTTPExchanger struct {
	ClientID     string
	ClientSecret string
	Client       *http.Client
	// TokenURL/UserinfoURL: vacíos usan los endpoints reales de Google.
	// Solo se pisan en tests, contra un httptest.Server.
	TokenURL    string
	UserinfoURL string
}

func NewHTTPExchanger(clientID, clientSecret string) *HTTPExchanger {
	return &HTTPExchanger{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Client:       &http.Client{Timeout: 5 * time.Second},
	}
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	IDToken     string `json:"id_token"`
	Error       string `json:"error"`
	ErrorDesc   string `json:"error_description"`
}

type userinfoResponse struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
}

func (e *HTTPExchanger) Exchange(ctx context.Context, code, redirectURI string) (UserInfo, error) {
	tokenURL := e.TokenURL
	if tokenURL == "" {
		tokenURL = tokenEndpoint
	}
	userinfoURL := e.UserinfoURL
	if userinfoURL == "" {
		userinfoURL = userinfoEndpoint
	}

	form := url.Values{
		"code":          {code},
		"client_id":     {e.ClientID},
		"client_secret": {e.ClientSecret},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return UserInfo{}, fmt.Errorf("no se pudo armar la request de intercambio: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := e.Client.Do(req)
	if err != nil {
		return UserInfo{}, fmt.Errorf("no se pudo contactar a Google: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	var tok tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return UserInfo{}, fmt.Errorf("respuesta de token inválida: %w", err)
	}
	if tok.Error != "" {
		return UserInfo{}, fmt.Errorf("google rechazó el código: %s (%s)", tok.Error, tok.ErrorDesc)
	}
	if tok.AccessToken == "" {
		return UserInfo{}, errors.New("google no devolvió un access_token")
	}

	infoReq, err := http.NewRequestWithContext(ctx, http.MethodGet, userinfoURL, nil)
	if err != nil {
		return UserInfo{}, fmt.Errorf("no se pudo armar la request de userinfo: %w", err)
	}
	infoReq.Header.Set("Authorization", "Bearer "+tok.AccessToken)

	infoResp, err := e.Client.Do(infoReq)
	if err != nil {
		return UserInfo{}, fmt.Errorf("no se pudo obtener el perfil de Google: %w", err)
	}
	defer func() { _ = infoResp.Body.Close() }()

	if infoResp.StatusCode != http.StatusOK {
		return UserInfo{}, fmt.Errorf("google devolvió %d al pedir el perfil", infoResp.StatusCode)
	}

	var info userinfoResponse
	if err := json.NewDecoder(infoResp.Body).Decode(&info); err != nil {
		return UserInfo{}, fmt.Errorf("respuesta de userinfo inválida: %w", err)
	}
	if info.Sub == "" || info.Email == "" {
		return UserInfo{}, errors.New("google no devolvió sub/email")
	}

	return UserInfo{Sub: info.Sub, Email: strings.ToLower(info.Email), EmailVerified: info.EmailVerified}, nil
}
