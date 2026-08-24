package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

func registrarProfesionalDePrueba(t *testing.T, router http.Handler, req registerRequest) authResponse {
	t.Helper()
	rec := doJSON(t, router, http.MethodPost, "/auth/register", req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("no se pudo registrar el profesional de prueba: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp authResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta de registro no es JSON válido: %v", err)
	}
	return resp
}

// deployarPaginaDePrueba — el buscador (T4.5) solo lista clínicas
// deployadas (spec §5.2); la mayoría de los tests de este archivo
// necesitan pasar por acá antes de esperar resultados.
func deployarPaginaDePrueba(t *testing.T, router http.Handler, token string) {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/deployar", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("no se pudo deployar la página de prueba: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestBuscarClinicas_PorNombreDeClinica(t *testing.T) {
	router := newTestRouter(t)
	uno := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: "buscar1@example.com", Password: "password123", NombreClinica: "Sonrisas del Sur",
	})
	deployarPaginaDePrueba(t, router, uno.Token)
	dos := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "Julián Ortiz", Email: "buscar2@example.com", Password: "password123", NombreClinica: "Clínica Norte",
	})
	deployarPaginaDePrueba(t, router, dos.Token)

	req := httptest.NewRequest(http.MethodGet, "/clinicas?q=Sonrisas", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got []clinicaResultado
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 || got[0].NombreClinica != "Sonrisas del Sur" {
		t.Errorf("got = %+v, esperaba solo 'Sonrisas del Sur'", got)
	}
}

func TestBuscarClinicas_PorNombreDeProfesional(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "Bruno Iglesias", Email: "buscar3@example.com", Password: "password123", NombreClinica: "Clínica X",
	})
	deployarPaginaDePrueba(t, router, reg.Token)

	req := httptest.NewRequest(http.MethodGet, "/clinicas?q=Bruno", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var got []clinicaResultado
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 || got[0].ProfesionalNombre != "Bruno Iglesias" {
		t.Errorf("got = %+v, esperaba encontrar a Bruno Iglesias por nombre de profesional", got)
	}
}

func TestBuscarClinicas_PorEspecialidad(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret-de-test", []string{"http://localhost:3000"})

	var especialidad db.Especialidad
	if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
		t.Fatalf("no se encontró 'Odontología general' en el catálogo sembrado: %v", err)
	}

	con := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "Con Especialidad", Email: "buscar4@example.com", Password: "password123",
		NombreClinica: "Clínica Con Especialidad", EspecialidadIDs: []string{especialidad.ID.String()},
	})
	deployarPaginaDePrueba(t, router, con.Token)
	sin := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "Sin Especialidad", Email: "buscar5@example.com", Password: "password123",
		NombreClinica: "Clínica Sin Especialidad",
	})
	deployarPaginaDePrueba(t, router, sin.Token)

	req := httptest.NewRequest(http.MethodGet, "/clinicas?especialidad=Odontolog%C3%ADa+general", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var got []clinicaResultado
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 || got[0].NombreClinica != "Clínica Con Especialidad" {
		t.Errorf("got = %+v, esperaba solo la clínica con esa especialidad", got)
	}
}

func TestBuscarClinicas_SinFiltrosDevuelveTodas(t *testing.T) {
	router := newTestRouter(t)
	uno := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "Uno", Email: "buscar6@example.com", Password: "password123", NombreClinica: "Clínica Uno",
	})
	deployarPaginaDePrueba(t, router, uno.Token)
	dos := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "Dos", Email: "buscar7@example.com", Password: "password123", NombreClinica: "Clínica Dos",
	})
	deployarPaginaDePrueba(t, router, dos.Token)

	req := httptest.NewRequest(http.MethodGet, "/clinicas", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var got []clinicaResultado
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 2 {
		t.Errorf("len(got) = %d, esperaba 2", len(got))
	}
}

func TestBuscarClinicas_SinResultados(t *testing.T) {
	router := newTestRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/clinicas?q=NoExiste", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var got []clinicaResultado
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 0 {
		t.Errorf("len(got) = %d, esperaba 0", len(got))
	}
}

// TestBuscarClinicas_NoListaClinicasSinDeployar — T4.5: el buscador no
// muestra páginas vacías/incompletas (spec §5.2) hasta el primer
// PATCH /panel/pagina/deployar.
func TestBuscarClinicas_NoListaClinicasSinDeployar(t *testing.T) {
	router := newTestRouter(t)
	registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "Sin Deploy", Email: "buscar8@example.com", Password: "password123", NombreClinica: "Clínica Sin Deploy",
	})

	req := httptest.NewRequest(http.MethodGet, "/clinicas?q=Sin+Deploy", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var got []clinicaResultado
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 0 {
		t.Errorf("len(got) = %d, esperaba 0 — la clínica todavía no fue deployada", len(got))
	}
}

func TestBuscarClinicas_NoRequiereAutenticacion(t *testing.T) {
	router := NewRouter(nil, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodGet, "/clinicas", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code == http.StatusUnauthorized {
		t.Error("GET /clinicas no debería exigir autenticación")
	}
}

func TestGetClinicaPublica_DevuelveDatosIncluyendoTelefono(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: "publicaslug1@example.com", Password: "password123", NombreClinica: "Clínica Slug",
	})

	telefono := "+5493511234567"
	recMe := doJSONAuth(t, router, http.MethodPatch, "/me", reg.Token, updateMeRequest{
		Nombre: "María Games", Telefono: &telefono,
	})
	if recMe.Code != http.StatusOK {
		t.Fatalf("no se pudo setear teléfono: status=%d body=%s", recMe.Code, recMe.Body.String())
	}

	req := httptest.NewRequest(http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", res.Code, http.StatusOK, res.Body.String())
	}
	var got clinicaPublicaResponse
	if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.NombreClinica != "Clínica Slug" || got.ProfesionalNombre != "María Games" {
		t.Errorf("got = %+v, esperaba datos de 'Clínica Slug' / 'María Games'", got)
	}
	if got.Telefono == nil || *got.Telefono != telefono {
		t.Errorf("Telefono = %v, esperaba %q", got.Telefono, telefono)
	}
}

// TestGetClinicaPublica_SinPaginaPublicaTodaviaNoEstaOculta — T4.4: un
// profesional que nunca abrió /panel/pagina no tiene fila en
// paginas_publicas todavía (get-or-create perezoso, ver
// pagina_publica.go) — su página pública sigue visible, no en
// mantenimiento por default.
func TestGetClinicaPublica_SinPaginaPublicaTodaviaNoEstaOculta(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "Nunca Abrió El Editor", Email: "publicaslug2@example.com", Password: "password123", NombreClinica: "Clínica Default",
	})

	req := httptest.NewRequest(http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	var got clinicaPublicaResponse
	_ = json.Unmarshal(res.Body.Bytes(), &got)
	if got.Oculta {
		t.Error("Oculta = true, esperaba false (sin fila en paginas_publicas todavía)")
	}
}

// TestGetClinicaPublica_OcultaSeReflejaEnLaRespuesta — T4.4: una vez que
// el profesional oculta la página (PATCH /panel/pagina/ocultar), la ruta
// pública lo refleja — el frontend decide ahí si mostrar el modo
// mantenimiento.
func TestGetClinicaPublica_OcultaSeReflejaEnLaRespuesta(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "Oculta Su Página", Email: "publicaslug3@example.com", Password: "password123", NombreClinica: "Clínica Oculta",
	})
	recOcultar := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/ocultar", reg.Token, ocultarPaginaPublicaRequest{Oculta: true})
	if recOcultar.Code != http.StatusOK {
		t.Fatalf("no se pudo ocultar la página: status=%d body=%s", recOcultar.Code, recOcultar.Body.String())
	}

	req := httptest.NewRequest(http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	var got clinicaPublicaResponse
	_ = json.Unmarshal(res.Body.Bytes(), &got)
	if !got.Oculta {
		t.Error("Oculta = false, esperaba true")
	}
}

func TestGetClinicaPublica_SlugInexistenteDevuelve404(t *testing.T) {
	router := newTestRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/clinicas/no-existe", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestGetClinicaPublica_NoRequiereAutenticacion(t *testing.T) {
	router := NewRouter(nil, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodGet, "/clinicas/cualquiera", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code == http.StatusUnauthorized {
		t.Error("GET /clinicas/{slug} no debería exigir autenticación")
	}
}

// TestGetClinicaPublica_VisibleAntesDeDeployar — "Ver página" desde el
// editor (spec §5.2) tiene que poder previsualizar la página ANTES del
// primer deploy — a diferencia del buscador, esta ruta nunca se bloquea
// por falta de deploy.
func TestGetClinicaPublica_VisibleAntesDeDeployar(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "Todavía No Deployó", Email: "publicaslug4@example.com", Password: "password123", NombreClinica: "Clínica Sin Deploy Aún",
	})

	req := httptest.NewRequest(http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Errorf("status = %d, esperaba %d — la página tiene que poder previsualizarse antes de deployar", res.Code, http.StatusOK)
	}
}
