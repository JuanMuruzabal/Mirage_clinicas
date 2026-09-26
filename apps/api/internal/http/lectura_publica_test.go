package http

import (
	"net/http"
	"testing"

	"dental-mirage/api/internal/ratelimit"
)

// Radiografía técnica 2, A1: las lecturas públicas tienen tope por IP.

func leerConIP(t *testing.T, router http.Handler, method, ruta, ip string) int {
	t.Helper()
	cabeceras := map[string]string{}
	if ip != "" {
		cabeceras["X-Forwarded-For"] = ip
	}
	return doJSONConCabeceras(t, router, method, ruta, nil, cabeceras).Code
}

func TestLecturasPublicas_TopePorIP(t *testing.T) {
	router, _ := newTestRouter(t)
	limite := ratelimit.LimitLecturaPublicaPerIP.Max

	for i := 0; i < limite; i++ {
		if code := leerConIP(t, router, http.MethodGet, "/especialidades", "190.1.2.3"); code != http.StatusOK {
			t.Fatalf("pedido %d: status = %d, esperaba 200 dentro del tope", i+1, code)
		}
	}
	if code := leerConIP(t, router, http.MethodGet, "/clinicas", "190.1.2.3"); code != http.StatusTooManyRequests {
		t.Fatalf("pasado el tope: status = %d, esperaba 429 (el tope es por IP, no por ruta)", code)
	}

	// Otra IP no se ve afectada.
	if code := leerConIP(t, router, http.MethodGet, "/clinicas", "190.9.8.7"); code != http.StatusOK {
		t.Errorf("otra IP: status = %d, esperaba 200", code)
	}
}

// Sin IP pública (desarrollo, tests) no hay tope: ahí todos los pedidos
// comparten la misma dirección, y frenarla frenaría a todos juntos.
func TestLecturasPublicas_SinIPPublicaNoCuenta(t *testing.T) {
	router, _ := newTestRouter(t)
	for i := 0; i < ratelimit.LimitLecturaPublicaPerIP.Max+5; i++ {
		if code := leerConIP(t, router, http.MethodGet, "/especialidades", ""); code != http.StatusOK {
			t.Fatalf("pedido %d sin IP pública: status = %d, esperaba 200", i+1, code)
		}
	}
}

// Los POST del mismo grupo (código, turno) tienen sus propios topes: no
// gastan el de lectura, y el de lectura no los frena.
func TestLecturasPublicas_LosPostNoCuentan(t *testing.T) {
	router, _ := newTestRouter(t)
	for i := 0; i < ratelimit.LimitLecturaPublicaPerIP.Max+5; i++ {
		if code := leerConIP(t, router, http.MethodPost, "/clinicas/no-existe/turnos", "190.1.2.4"); code == http.StatusTooManyRequests {
			t.Fatalf("POST %d: 429 del tope de lectura", i+1)
		}
	}
	if code := leerConIP(t, router, http.MethodGet, "/especialidades", "190.1.2.4"); code != http.StatusOK {
		t.Errorf("después de los POST, la primera lectura: status = %d, esperaba 200", code)
	}
}
