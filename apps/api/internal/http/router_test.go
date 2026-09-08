package http

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"dental-mirage/api/internal/testdb"
)

func TestHealth_ConDB_OK(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if body := rec.Body.String(); !contains(body, `"db":"ok"`) {
		t.Errorf("body = %s, esperaba contener db:ok", body)
	}
}

func TestHealth_SinDB(t *testing.T) {
	router := NewRouter(nil, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusOK)
	}
	if body := rec.Body.String(); !contains(body, `"db":"not_configured"`) {
		t.Errorf("body = %s, esperaba db:not_configured", body)
	}
}

func TestMe_SinToken(t *testing.T) {
	router := NewRouter(nil, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

// TestDecodeJSON_RechazaBodyDemasiadoGrande — corrección de seguridad
// (auditoría 2026-09-08, radiografia-tecnica_1.md): antes de este límite,
// un POST con un body de cualquier tamaño se decodificaba entero en
// memoria antes de validar nada — DoS trivial contra un endpoint sin
// sesión. Usa /auth/register (público, no exige DB antes de llegar a
// decodeJSON) con un body de más de maxJSONBodyBytes: tiene que rechazarse
// con un error controlado, nunca colgar el proceso ni devolver un 500
// crudo por agotar memoria.
func TestDecodeJSON_RechazaBodyDemasiadoGrande(t *testing.T) {
	router := NewRouter(nil, "un-secret", []string{"http://localhost:3000"})

	// Un campo de texto de sobra para superar el límite (1 MiB) — el resto
	// del JSON es deliberadamente inválido (clave sin cerrar) porque nunca
	// debería llegar a parsearse: MaxBytesReader corta la lectura antes.
	bodyGigante := `{"email":"` + strings.Repeat("a", 2<<20) + `"`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewReader([]byte(bodyGigante)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperaba %d (body demasiado grande). body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (func() bool {
		for i := 0; i+len(substr) <= len(s); i++ {
			if s[i:i+len(substr)] == substr {
				return true
			}
		}
		return false
	})()
}
