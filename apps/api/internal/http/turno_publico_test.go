package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"dental-mirage/api/internal/testdb"
)

func TestSolicitarTurnoPublico_Exitoso(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: "publico1@example.com", Password: "password123", NombreClinica: "Clínica Pública",
	})

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto:   "Bruno",
		ApellidoContacto: "Iglesias",
		DNIContacto:      "30111222",
		TelefonoContacto: "+5493511234567",
		EmailContacto:    "bruno@example.com",
		Motivo:           "Dolor de muela",
	})

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got solicitarTurnoPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.ID == "" {
		t.Error("esperaba un id de turno no vacío")
	}
}

func TestSolicitarTurnoPublico_ClinicaInexistente(t *testing.T) {
	router := newTestRouter(t)

	rec := doJSON(t, router, http.MethodPost, "/clinicas/no-existe/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "bruno@example.com",
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestSolicitarTurnoPublico_DNIInvalido(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: "publico2@example.com", Password: "password123", NombreClinica: "Clínica DNI",
	})

	for _, dni := range []string{"123", "abcdefgh", "123456789012"} {
		rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
			NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: dni,
			TelefonoContacto: "+5493511234567", EmailContacto: "bruno@example.com",
		})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("DNI %q: status = %d, esperaba %d", dni, rec.Code, http.StatusBadRequest)
		}
	}
}

func TestSolicitarTurnoPublico_TelefonoInvalido(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: "publico3@example.com", Password: "password123", NombreClinica: "Clínica Tel",
	})

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "123", EmailContacto: "bruno@example.com",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestSolicitarTurnoPublico_EmailInvalido(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: "publico4@example.com", Password: "password123", NombreClinica: "Clínica Mail",
	})

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "no-es-un-email",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestSolicitarTurnoPublico_NombreApellidoObligatorios(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: "publico5@example.com", Password: "password123", NombreClinica: "Clínica Nombre",
	})

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "bruno@example.com",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestSolicitarTurnoPublico_QuedaPendienteYVisibleParaElProfesional(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: "publico6@example.com", Password: "password123", NombreClinica: "Clínica Visible",
	})

	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias", DNIContacto: "30111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "bruno@example.com",
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?estado=pendiente", reg.Token, nil)
	var got []turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 || got[0].Origen != "pagina_publica" {
		t.Errorf("got = %+v, esperaba 1 turno pendiente con origen pagina_publica", got)
	}
}

func TestSolicitarTurnoPublico_NoRequiereAutenticacion(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodPost, "/clinicas/x/turnos", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code == http.StatusUnauthorized {
		t.Error("POST /clinicas/{slug}/turnos no debería exigir autenticación")
	}
}
