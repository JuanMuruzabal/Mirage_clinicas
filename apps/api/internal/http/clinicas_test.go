package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

func TestBuscarClinicas_PorNombreDeClinica(t *testing.T) {
	router, gdb := newTestRouter(t)
	uno := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "buscar1@example.com", Password: "password123456", NombreClinica: "Sonrisas del Sur",
	})
	deployarPaginaDePrueba(t, router, uno.Token)
	dos := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Julián Ortiz", Email: "buscar2@example.com", Password: "password123456", NombreClinica: "Clínica Norte",
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
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Bruno Iglesias", Email: "buscar3@example.com", Password: "password123456", NombreClinica: "Clínica X",
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
	// "sin" necesita una especialidad DISTINTA (no ninguna — el paso 2 del
	// wizard exige al menos una) para que el filtro por "Odontología
	// general" siga excluyéndola.
	var otraEspecialidad db.Especialidad
	if err := gdb.Where("nombre = ?", "Ortodoncia").First(&otraEspecialidad).Error; err != nil {
		t.Fatalf("no se encontró 'Ortodoncia' en el catálogo sembrado: %v", err)
	}

	con := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Con Especialidad", Email: "buscar4@example.com", Password: "password123456",
		NombreClinica: "Clínica Con Especialidad", EspecialidadIDs: []string{especialidad.ID.String()},
	})
	deployarPaginaDePrueba(t, router, con.Token)
	sin := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Sin Especialidad", Email: "buscar5@example.com", Password: "password123456",
		NombreClinica: "Clínica Sin Especialidad", EspecialidadIDs: []string{otraEspecialidad.ID.String()},
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

// TestBuscarClinicas_PorNombreDeProfesionalNoOwner — Fase 4.2, fix del bug
// owner-only: buscarClinicasHandler filtraba el EXISTS de nombre por
// r.rol = RoleOwner, así que un profesional invitado (no dueño) era
// invisible para el buscador por nombre aunque atendiera en esa clínica.
func TestBuscarClinicas_PorNombreDeProfesionalNoOwner(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Titular Owner", Email: "noowner-titular@example.com", Password: "password123456",
		NombreClinica: "Clínica Con Colega",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "noowner-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "noowner-colega@example.com")
	perfilColega := db.ProfessionalProfile{UserID: colegaID, Nombre: "Ezequiel", Apellido: "Franco", Telefono: "+5493511234598"}
	if err := gdb.Create(&perfilColega).Error; err != nil {
		t.Fatalf("no se pudo crear el perfil del colega: %v", err)
	}
	deployarPaginaDePrueba(t, router, titular.Token)

	req := httptest.NewRequest(http.MethodGet, "/clinicas?q=Ezequiel+Franco", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var got []clinicaResultado
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 || got[0].NombreClinica != "Clínica Con Colega" {
		t.Errorf("got = %+v, esperaba encontrar la clínica por el nombre del colega (no owner)", got)
	}
}

// TestGetClinicaPublica_EspecialidadesUnenTodosLosProfesionalesActivos —
// Fase 4.2, fix del bug owner-only: antes de este fix, la página pública
// mostraba solo las especialidades del owner — con 2+ profesionales
// activos tienen que ser la unión deduplicada de todos (ver
// profesionalesActivosDeLaClinica/especialidadesUnicasDe en clinicas.go).
func TestGetClinicaPublica_EspecialidadesUnenTodosLosProfesionalesActivos(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Titular Con Especialidad", Email: "esp-titular@example.com", Password: "password123456",
		NombreClinica: "Clínica Multi Especialidad",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "esp-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "esp-colega@example.com")

	var ortodoncia db.Especialidad
	if err := gdb.Where("nombre = ?", "Ortodoncia").First(&ortodoncia).Error; err != nil {
		t.Fatalf("no se encontró 'Ortodoncia' en el catálogo sembrado: %v", err)
	}
	perfilColega := db.ProfessionalProfile{
		UserID: colegaID, Nombre: "Laura", Apellido: "Colega", Telefono: "+5493511234599",
		Especialidades: []db.Especialidad{ortodoncia},
	}
	if err := gdb.Create(&perfilColega).Error; err != nil {
		t.Fatalf("no se pudo crear el perfil del colega: %v", err)
	}
	deployarPaginaDePrueba(t, router, titular.Token)

	req := httptest.NewRequest(http.MethodGet, "/clinicas/"+titular.Profesional.Slug, nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var got clinicaPublicaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	tieneOdontologiaGeneral, tieneOrtodoncia := false, false
	for _, e := range got.Especialidades {
		if e == "Odontología general" {
			tieneOdontologiaGeneral = true
		}
		if e == "Ortodoncia" {
			tieneOrtodoncia = true
		}
	}
	if !tieneOdontologiaGeneral || !tieneOrtodoncia {
		t.Errorf("Especialidades = %v, esperaba la unión de la especialidad del titular (Odontología general) y la del colega (Ortodoncia)", got.Especialidades)
	}
}

func TestBuscarClinicas_SinFiltrosDevuelveTodas(t *testing.T) {
	router, gdb := newTestRouter(t)
	uno := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Uno", Email: "buscar6@example.com", Password: "password123456", NombreClinica: "Clínica Uno",
	})
	deployarPaginaDePrueba(t, router, uno.Token)
	dos := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Dos", Email: "buscar7@example.com", Password: "password123456", NombreClinica: "Clínica Dos",
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
	router, _ := newTestRouter(t)

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
	router, gdb := newTestRouter(t)
	registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Sin Deploy", Email: "buscar8@example.com", Password: "password123456", NombreClinica: "Clínica Sin Deploy",
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
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "publicaslug1@example.com", Password: "password123456", NombreClinica: "Clínica Slug",
	})

	telefono := "+5493511234568"
	recMe := doJSONAuth(t, router, http.MethodPatch, "/me", reg.Token, updateMeRequest{
		Nombre: "María", Apellido: "Games", TelefonoPrefijo: "+54", Telefono: telefono,
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: matriculaDePrueba("publicaslug1@example.com"),
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
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Nunca Abrió El Editor", Email: "publicaslug2@example.com", Password: "password123456", NombreClinica: "Clínica Default",
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
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Oculta Su Página", Email: "publicaslug3@example.com", Password: "password123456", NombreClinica: "Clínica Oculta",
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
	router, _ := newTestRouter(t)

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

// TestGetClinicaPublica_EnPreparacionAntesDelPrimerPublicar (PE-8, plan
// Prisma Engine): sin ninguna versión publicada todavía, la ruta pública
// responde 200 con EnPreparacion=true — no 404 (sigue siendo una clínica
// real, solo que sin contenido publicado) ni el contenido del borrador en
// vivo (eso lo decidió Kevin el 21/09: "página en preparación" hasta el
// primer Publicar, ya no un preview del borrador en esta misma ruta).
func TestGetClinicaPublica_EnPreparacionAntesDelPrimerPublicar(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Todavía No Publicó", Email: "publicaslug4@example.com", Password: "password123456", NombreClinica: "Clínica Sin Publicar Aún",
	})

	req := httptest.NewRequest(http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d", res.Code, http.StatusOK)
	}
	var got clinicaPublicaResponse
	_ = json.Unmarshal(res.Body.Bytes(), &got)
	if !got.EnPreparacion {
		t.Error("EnPreparacion = false, esperaba true (todavía no se publicó ninguna versión)")
	}
	if got.NombreClinica != "Clínica Sin Publicar Aún" {
		t.Errorf("NombreClinica = %q, esperaba que igual viaje (no depende de la versión publicada)", got.NombreClinica)
	}
}
