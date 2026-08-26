package http

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// profesionalIDFromRequest y userIDFromRequest asumen que requireClinic /
// requireSession ya corrieron antes en la cadena y dejaron el contexto
// poblado — en el router real eso siempre es así (nunca se registra un
// handler de dominio sin esos middlewares por delante), así que esta rama
// de error es inalcanzable vía HTTP. Se testea llamando a los helpers
// directamente, sin pasar por el router, para cubrir el contrato del
// propio helper (defensa en profundidad: si algún día se registra una
// ruta sin el middleware correspondiente, esto sigue devolviendo 401 en
// vez de un panic por type assertion).

func TestProfesionalIDFromRequest_SinClinicIDEnElContextoDevuelve401(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	_, ok := profesionalIDFromRequest(rec, req)

	if ok {
		t.Error("esperaba ok=false sin clinicID en el contexto")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestUserIDFromRequest_SinSesionEnElContextoDevuelve401(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	_, ok := userIDFromRequest(rec, req)

	if ok {
		t.Error("esperaba ok=false sin sesión en el contexto")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}
