package googleauth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"dental-mirage/api/internal/googleauth"
)

func fakeGoogleServers(t *testing.T, tokenBody, userinfoBody string, tokenStatus, userinfoStatus int) (tokenURL, userinfoURL string, cleanup func()) {
	t.Helper()
	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(tokenStatus)
		_, _ = w.Write([]byte(tokenBody))
	}))
	userinfoServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(userinfoStatus)
		_, _ = w.Write([]byte(userinfoBody))
	}))
	return tokenServer.URL, userinfoServer.URL, func() {
		tokenServer.Close()
		userinfoServer.Close()
	}
}

func TestExchange_Exitoso(t *testing.T) {
	tokenBody, _ := json.Marshal(map[string]string{"access_token": "un-access-token"})
	userinfoBody, _ := json.Marshal(map[string]any{
		"sub": "google-sub-123", "email": "Paciente@Example.com", "email_verified": true,
	})
	tokenURL, userinfoURL, cleanup := fakeGoogleServers(t, string(tokenBody), string(userinfoBody), http.StatusOK, http.StatusOK)
	defer cleanup()

	ex := &googleauth.HTTPExchanger{
		ClientID: "id", ClientSecret: "secret", Client: http.DefaultClient,
		TokenURL: tokenURL, UserinfoURL: userinfoURL,
	}

	info, err := ex.Exchange(context.Background(), "un-code", "https://dentalmirage.example/callback")
	if err != nil {
		t.Fatalf("Exchange error inesperado: %v", err)
	}
	if info.Sub != "google-sub-123" {
		t.Errorf("Sub = %q, esperaba %q", info.Sub, "google-sub-123")
	}
	if info.Email != "paciente@example.com" {
		t.Errorf("Email = %q, esperaba normalizado a minúsculas", info.Email)
	}
	if !info.EmailVerified {
		t.Error("EmailVerified debería ser true")
	}
}

func TestExchange_GoogleRechazaElCode(t *testing.T) {
	tokenBody, _ := json.Marshal(map[string]string{"error": "invalid_grant", "error_description": "code expirado"})
	tokenURL, userinfoURL, cleanup := fakeGoogleServers(t, string(tokenBody), "{}", http.StatusOK, http.StatusOK)
	defer cleanup()

	ex := &googleauth.HTTPExchanger{
		ClientID: "id", ClientSecret: "secret", Client: http.DefaultClient,
		TokenURL: tokenURL, UserinfoURL: userinfoURL,
	}

	_, err := ex.Exchange(context.Background(), "code-invalido", "https://dentalmirage.example/callback")
	if err == nil {
		t.Fatal("esperaba un error cuando Google rechaza el code")
	}
	if !strings.Contains(err.Error(), "invalid_grant") {
		t.Errorf("el error debería mencionar el motivo de Google, fue: %v", err)
	}
}

func TestExchange_UserinfoFalla(t *testing.T) {
	tokenBody, _ := json.Marshal(map[string]string{"access_token": "un-access-token"})
	tokenURL, userinfoURL, cleanup := fakeGoogleServers(t, string(tokenBody), "server error", http.StatusOK, http.StatusInternalServerError)
	defer cleanup()

	ex := &googleauth.HTTPExchanger{
		ClientID: "id", ClientSecret: "secret", Client: http.DefaultClient,
		TokenURL: tokenURL, UserinfoURL: userinfoURL,
	}

	if _, err := ex.Exchange(context.Background(), "un-code", "https://dentalmirage.example/callback"); err == nil {
		t.Fatal("esperaba un error cuando el endpoint de userinfo falla")
	}
}

func TestExchange_SinAccessToken(t *testing.T) {
	tokenURL, userinfoURL, cleanup := fakeGoogleServers(t, "{}", "{}", http.StatusOK, http.StatusOK)
	defer cleanup()

	ex := &googleauth.HTTPExchanger{
		ClientID: "id", ClientSecret: "secret", Client: http.DefaultClient,
		TokenURL: tokenURL, UserinfoURL: userinfoURL,
	}

	if _, err := ex.Exchange(context.Background(), "un-code", "https://dentalmirage.example/callback"); err == nil {
		t.Fatal("esperaba un error cuando Google no devuelve access_token")
	}
}
