package turnstile_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"dental-mirage/api/internal/turnstile"
)

func TestNewHTTPVerifier_ConfiguraSecretYCliente(t *testing.T) {
	v := turnstile.NewHTTPVerifier("un-secret")
	if v.SecretKey != "un-secret" {
		t.Errorf("NewHTTPVerifier no seteó SecretKey correctamente: %+v", v)
	}
	if v.Client == nil {
		t.Error("NewHTTPVerifier debería configurar un *http.Client")
	}
}

func TestVerify_Exitoso(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatalf("no se pudo parsear el form: %v", err)
		}
		if r.FormValue("response") != "un-token-valido" {
			t.Errorf("response = %q, esperaba %q", r.FormValue("response"), "un-token-valido")
		}
		_, _ = w.Write([]byte(`{"success": true}`))
	}))
	defer server.Close()

	v := &turnstile.HTTPVerifier{SecretKey: "secret", Client: http.DefaultClient, BaseURL: server.URL}

	ok, err := v.Verify(context.Background(), "un-token-valido", "127.0.0.1")
	if err != nil {
		t.Fatalf("Verify error inesperado: %v", err)
	}
	if !ok {
		t.Error("esperaba success=true")
	}
}

func TestVerify_TokenRechazado(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"success": false}`))
	}))
	defer server.Close()

	v := &turnstile.HTTPVerifier{SecretKey: "secret", Client: http.DefaultClient, BaseURL: server.URL}

	ok, err := v.Verify(context.Background(), "un-token-invalido", "")
	if err != nil {
		t.Fatalf("Verify error inesperado: %v", err)
	}
	if ok {
		t.Error("esperaba success=false")
	}
}

func TestVerify_TokenVacioNoLlamaALaRed(t *testing.T) {
	v := &turnstile.HTTPVerifier{SecretKey: "secret", Client: http.DefaultClient, BaseURL: "http://este-host-no-deberia-consultarse.invalid"}

	ok, err := v.Verify(context.Background(), "", "")
	if err != nil {
		t.Fatalf("Verify error inesperado: %v", err)
	}
	if ok {
		t.Error("un token vacío nunca debería reportarse como válido")
	}
}
