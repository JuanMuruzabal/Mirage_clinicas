package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetPaginaPublica_SeCreaSolaLaPrimeraVezConValoresPorDefecto(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "pagina1@example.com", Password: "password123456", NombreClinica: "Clínica Ana",
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/pagina", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got paginaPublicaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.Oculta {
		t.Error("Oculta = true, esperaba false por default")
	}
	if got.DeployadaEn != nil {
		t.Errorf("DeployadaEn = %v, esperaba nil (todavía no deployó)", *got.DeployadaEn)
	}
}

func TestGetPaginaPublica_RequiereAutenticacion(t *testing.T) {
	router, _ := newTestRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/panel/pagina", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestOcultarPaginaPublica_CambiaElValorYLoDevuelve(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Bruno", Email: "pagina2@example.com", Password: "password123456", NombreClinica: "Clínica Bruno",
	})

	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/ocultar", reg.Token, ocultarPaginaPublicaRequest{Oculta: true})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if !got.Oculta {
		t.Error("Oculta = false, esperaba true")
	}

	// Se puede volver a mostrar (des-ocultar) — no es un camino de una sola
	// dirección como deployar.
	rec2 := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/ocultar", reg.Token, ocultarPaginaPublicaRequest{Oculta: false})
	var got2 paginaPublicaResponse
	_ = json.Unmarshal(rec2.Body.Bytes(), &got2)
	if got2.Oculta {
		t.Error("después de des-ocultar, Oculta = true, esperaba false")
	}
}

func TestDeployarPaginaPublica_SeteaDeployadaEnLaPrimeraVez(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Carla", Email: "pagina3@example.com", Password: "password123456", NombreClinica: "Clínica Carla",
	})

	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/deployar", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.DeployadaEn == nil {
		t.Fatal("DeployadaEn = nil, esperaba una fecha")
	}
}

// TestDeployarPaginaPublica_EsIdempotente — spec §5.2: "Deployar (solo
// visible la primera vez)" — no hay forma de "des-deployar" en el MVP,
// llamarlo de nuevo no debe pisar la fecha original ni fallar.
func TestDeployarPaginaPublica_EsIdempotente(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Diego", Email: "pagina4@example.com", Password: "password123456", NombreClinica: "Clínica Diego",
	})

	primera := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/deployar", reg.Token, nil)
	var got1 paginaPublicaResponse
	_ = json.Unmarshal(primera.Body.Bytes(), &got1)

	segunda := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/deployar", reg.Token, nil)
	if segunda.Code != http.StatusOK {
		t.Fatalf("segundo deployar: status = %d, esperaba %d. body=%s", segunda.Code, http.StatusOK, segunda.Body.String())
	}
	var got2 paginaPublicaResponse
	_ = json.Unmarshal(segunda.Body.Bytes(), &got2)

	if got1.DeployadaEn == nil || got2.DeployadaEn == nil {
		t.Fatal("esperaba DeployadaEn no nulo en ambas respuestas")
	}
	if *got1.DeployadaEn != *got2.DeployadaEn {
		t.Errorf("DeployadaEn cambió entre llamadas: %q -> %q, esperaba que se mantuviera", *got1.DeployadaEn, *got2.DeployadaEn)
	}
}

func TestOcultarYDeployarPaginaPublica_RequierenAutenticacion(t *testing.T) {
	router, _ := newTestRouter(t)

	reqOcultar := httptest.NewRequest(http.MethodPatch, "/panel/pagina/ocultar", nil)
	recOcultar := httptest.NewRecorder()
	router.ServeHTTP(recOcultar, reqOcultar)
	if recOcultar.Code != http.StatusUnauthorized {
		t.Errorf("ocultar: status = %d, esperaba %d", recOcultar.Code, http.StatusUnauthorized)
	}

	reqDeployar := httptest.NewRequest(http.MethodPatch, "/panel/pagina/deployar", nil)
	recDeployar := httptest.NewRecorder()
	router.ServeHTTP(recDeployar, reqDeployar)
	if recDeployar.Code != http.StatusUnauthorized {
		t.Errorf("deployar: status = %d, esperaba %d", recDeployar.Code, http.StatusUnauthorized)
	}
}
