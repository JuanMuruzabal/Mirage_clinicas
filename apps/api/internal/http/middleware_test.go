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

// TestHandlersConProfesionalIDFromRequest_SinClinicIDEnElContextoDevuelven401
// — mismo criterio que el test de arriba, para el propio "if !ok { return }"
// de cada handler — es una rama de código DISTINTA a la de
// profesionalIDFromRequest (cada handler tiene la suya propia, inline),
// igual de inalcanzable vía HTTP real por el mismo motivo. gdb queda en
// nil a propósito: la rama bajo prueba retorna antes de tocarlo. Lista no
// exhaustiva — se agregan acá los handlers que se van tocando, no hace
// falta cubrir los ~20 que usan el mismo patrón de una sola vez.
func TestHandlersConProfesionalIDFromRequest_SinClinicIDEnElContextoDevuelven401(t *testing.T) {
	handlers := map[string]http.HandlerFunc{
		"listConflictosPacienteHandler":     listConflictosPacienteHandler(nil),
		"resolverConflictoPacienteHandler":  resolverConflictoPacienteHandler(nil),
		"panelNotificacionesHandler":        panelNotificacionesHandler(nil),
		"listBloqueosSeguridadHandler":      listBloqueosSeguridadHandler(nil),
		"desbloquearMailHandler":            desbloquearMailHandler(nil),
		"desbloquearIPHandler":              desbloquearIPHandler(nil),
		"turnosPendientesAsistenciaHandler": turnosPendientesAsistenciaHandler(nil),
		"listTurnosHandler":                 listTurnosHandler(nil),
		"crearTurnoManualHandler":           crearTurnoManualHandler(nil),
		"cancelarTurnoHandler":              cancelarTurnoHandler(nil),
		"cancelarTurnosSinVerificarHandler": cancelarTurnosSinVerificarHandler(nil),
		"reprogramarTurnoHandler":           reprogramarTurnoHandler(nil),
		"autoreservarTurnosHandler":         autoreservarTurnosHandler(nil),
		"marcarAsistenciaHandler":           marcarAsistenciaHandler(nil),
		"resumenPanelHandler":               resumenPanelHandler(nil),
	}
	for nombre, handler := range handlers {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		handler(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: status = %d, esperaba %d", nombre, rec.Code, http.StatusUnauthorized)
		}
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
