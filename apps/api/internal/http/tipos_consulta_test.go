package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"dental-mirage/api/internal/testdb"
)

func TestListTiposConsulta_DevuelveLosDelProfesionalAutenticado(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "tipos1@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	req := httptest.NewRequest(http.MethodGet, "/tipos-consulta", nil)
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got []tipoConsultaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, esperaba 2 (TR-001)", len(got))
	}
	nombres := map[string]string{}
	for _, tc := range got {
		nombres[tc.Nombre] = tc.Color
	}
	if nombres["Consulta general"] != "#E7D9BE" {
		t.Errorf("color de Consulta general = %q, esperaba #E7D9BE", nombres["Consulta general"])
	}
	if nombres["Urgencia"] != "#D6563A" {
		t.Errorf("color de Urgencia = %q, esperaba #D6563A", nombres["Urgencia"])
	}
}

func TestListTiposConsulta_NoDevuelveLosDeOtroProfesional(t *testing.T) {
	router, gdb := newTestRouter(t)
	registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Uno", Email: "tipos-otro1@example.com", Password: "password123456", NombreClinica: "Clínica Uno",
	})
	reg2 := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Dos", Email: "tipos-otro2@example.com", Password: "password123456", NombreClinica: "Clínica Dos",
	})

	req := httptest.NewRequest(http.MethodGet, "/tipos-consulta", nil)
	req.Header.Set("Authorization", "Bearer "+reg2.Token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var got []tipoConsultaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, esperaba 2 (solo los propios, no los de 'Uno')", len(got))
	}
}

func TestListTiposConsulta_RequiereAutenticacion(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodGet, "/tipos-consulta", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}
