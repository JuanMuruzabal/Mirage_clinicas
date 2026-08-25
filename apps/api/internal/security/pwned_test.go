package security_test

import (
	"context"
	"crypto/sha1" //nolint:gosec // mismo motivo que pwned.go: protocolo de HaveIBeenPwned, no uso criptográfico propio.
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"dental-mirage/api/internal/security"
)

// fakeChecker permite testear IsPwnedFailOpen sin depender del checker HTTP.
type fakeChecker struct {
	pwned bool
	err   error
}

func (f fakeChecker) IsPwned(context.Context, string) (bool, error) { return f.pwned, f.err }

func TestIsPwnedFailOpen_DevuelvePwnedCuandoElCheckerLoConfirma(t *testing.T) {
	if !security.IsPwnedFailOpen(context.Background(), fakeChecker{pwned: true}, "x", nil) {
		t.Error("debería devolver true cuando el checker confirma que está filtrada")
	}
}

func TestIsPwnedFailOpen_FailaAbiertoAnteUnErrorDelChecker(t *testing.T) {
	var logged error
	result := security.IsPwnedFailOpen(context.Background(), fakeChecker{err: errors.New("timeout")}, "x", func(err error) {
		logged = err
	})
	if result {
		t.Error("un error del checker no debería bloquear el flujo (fail-open)")
	}
	if logged == nil {
		t.Error("el error debería reportarse via onError, aunque no bloquee")
	}
}

// sha1PrefixSuffix replica el cálculo del protocolo k-anonymity para armar
// respuestas fake coherentes con lo que HTTPPwnedChecker.IsPwned va a pedir.
func sha1PrefixSuffix(password string) (prefix, suffix string) {
	sum := sha1.Sum([]byte(password)) //nolint:gosec // protocolo de HaveIBeenPwned, no uso criptográfico propio
	full := strings.ToUpper(hex.EncodeToString(sum[:]))
	return full[:5], full[5:]
}

// TestHTTPPwnedChecker_ContraServidorFake ejercita el checker real
// (HTTPPwnedChecker.IsPwned) contra un httptest.Server vía BaseURL — nunca
// pega a la red real (mismo criterio que googleauth/turnstile en el plan
// aprobado). Confirma que solo el prefijo de 5 caracteres viaja en la URL
// (protocolo k-anonymity, spec §7) y que el parseo de "SUFFIX:count"
// funciona.
func TestHTTPPwnedChecker_ContraServidorFake(t *testing.T) {
	password := "correcto-caballo-batería-grapa"
	prefix, suffix := sha1PrefixSuffix(password)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, prefix) {
			t.Errorf("la URL debería terminar en el prefijo %q, fue %q", prefix, r.URL.Path)
		}
		// La respuesta real de HIBP es "SUFFIX:count" por línea.
		_, _ = fmt.Fprintf(w, "%s:3\r\nOTRO0000000000000000000000000000000:1\r\n", suffix)
	}))
	defer server.Close()

	checker := &security.HTTPPwnedChecker{Client: server.Client(), BaseURL: server.URL + "/range/"}

	pwned, err := checker.IsPwned(context.Background(), password)
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	if !pwned {
		t.Error("debería reportar la contraseña como filtrada (count=3 en la respuesta fake)")
	}
}

func TestHTTPPwnedChecker_ContraseñaNoFiltradaDevuelveFalse(t *testing.T) {
	password := "una-contraseña-que-no-está-filtrada"
	_, suffix := sha1PrefixSuffix(password)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Ningún sufijo coincide con el de la contraseña bajo prueba.
		_, _ = fmt.Fprintf(w, "0000000000000000000000000000000000000:5\r\n")
		_ = suffix
	}))
	defer server.Close()

	checker := &security.HTTPPwnedChecker{Client: server.Client(), BaseURL: server.URL + "/range/"}

	pwned, err := checker.IsPwned(context.Background(), password)
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	if pwned {
		t.Error("no debería reportarse como filtrada si su sufijo no aparece en la respuesta")
	}
}

func TestHTTPPwnedChecker_ErrorDeRedDevuelveError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	checker := &security.HTTPPwnedChecker{Client: server.Client(), BaseURL: server.URL + "/range/"}

	if _, err := checker.IsPwned(context.Background(), "x"); err == nil {
		t.Error("un 500 del servidor debería devolver error, no un false silencioso")
	}
}
