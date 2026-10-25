package http

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

const requestIDDelCliente = "inventado-por-el-cliente"

// TestDescartarRequestIDEntrante_ElIDLoGeneraElServidor — encadenado como en
// router.go (descartarRequestIDEntrante ANTES de middleware.RequestID), el
// handler no ve el id que mandó el cliente: ve uno generado por chi.
func TestDescartarRequestIDEntrante_ElIDLoGeneraElServidor(t *testing.T) {
	var visto string
	r := chi.NewRouter()
	r.Use(descartarRequestIDEntrante)
	r.Use(middleware.RequestID)
	r.Get("/algo", func(w http.ResponseWriter, r *http.Request) {
		visto = middleware.GetReqID(r.Context())
		w.WriteHeader(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/algo", nil)
	req.Header.Set(middleware.RequestIDHeader, requestIDDelCliente)
	r.ServeHTTP(httptest.NewRecorder(), req)

	if visto == "" {
		t.Fatal("el request llegó sin request id")
	}
	if strings.Contains(visto, requestIDDelCliente) {
		t.Errorf("el request id es el del cliente: %q", visto)
	}
}

// TestDescartarRequestIDEntrante_SinElMiddlewareChiReusaElDelCliente — el
// control: prueba que el test de arriba mide algo. Sin el middleware, chi
// adopta el X-Request-Id entrante tal cual.
func TestDescartarRequestIDEntrante_SinElMiddlewareChiReusaElDelCliente(t *testing.T) {
	var visto string
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Get("/algo", func(w http.ResponseWriter, r *http.Request) {
		visto = middleware.GetReqID(r.Context())
	})

	req := httptest.NewRequest(http.MethodGet, "/algo", nil)
	req.Header.Set(middleware.RequestIDHeader, requestIDDelCliente)
	r.ServeHTTP(httptest.NewRecorder(), req)

	if visto != requestIDDelCliente {
		t.Fatalf("control: esperaba que chi reusara el id del cliente, vio %q", visto)
	}
}

// TestRouter_NoLogueaElRequestIDDelCliente — de punta a punta con el router
// real: lo que queda en el log como request_id no es lo que mandó el
// cliente. Si alguien mueve descartarRequestIDEntrante después de
// middleware.RequestID (o lo saca), este test falla.
func TestRouter_NoLogueaElRequestIDDelCliente(t *testing.T) {
	var buf bytes.Buffer
	anterior := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
	t.Cleanup(func() { slog.SetDefault(anterior) })

	router := NewRouter(nil, "un-secret", []string{"http://localhost:3000"})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set(middleware.RequestIDHeader, requestIDDelCliente)
	router.ServeHTTP(httptest.NewRecorder(), req)

	var encontrado bool
	for _, renglon := range bytes.Split(bytes.TrimSpace(buf.Bytes()), []byte("\n")) {
		var linea map[string]any
		if err := json.Unmarshal(renglon, &linea); err != nil || linea["msg"] != "http" {
			continue
		}
		encontrado = true
		id, _ := linea["request_id"].(string)
		if id == "" {
			t.Errorf("la línea de log no trae request_id: %s", renglon)
		}
		if strings.Contains(id, requestIDDelCliente) {
			t.Errorf("se logueó el request id del cliente: %q", id)
		}
	}
	if !encontrado {
		t.Fatalf("no hubo línea de log del request; buffer=%s", buf.String())
	}
	if strings.Contains(buf.String(), requestIDDelCliente) {
		t.Errorf("el valor del cliente aparece en el log: %s", buf.String())
	}
}
