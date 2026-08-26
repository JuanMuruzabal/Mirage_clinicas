package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"dental-mirage/api/internal/db"
)

func TestMe_ReciénRegistrado_SinPerfilNiClinica(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "me1@example.com", Password: "password123456", AceptaTerminos: true,
	})
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	rec := doJSONAuth(t, router, http.MethodGet, "/me", *reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got meResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.Email != "me1@example.com" {
		t.Errorf("Email = %q, esperaba %q", got.Email, "me1@example.com")
	}
	if got.EmailVerificado {
		t.Error("EmailVerificado debería ser false recién registrado")
	}
	if got.OnboardingStep != db.OnboardingStepCuenta {
		t.Errorf("OnboardingStep = %q, esperaba %q", got.OnboardingStep, db.OnboardingStepCuenta)
	}
	if got.OnboardingCompletado {
		t.Error("OnboardingCompletado debería ser false")
	}
	if got.Perfil != nil {
		t.Error("Perfil debería venir ausente todavía")
	}
	if got.Clinica != nil {
		t.Error("Clinica debería venir ausente todavía")
	}
}

func TestMe_TrasCompletarPerfil_IncluyePerfilSinClinica(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "me2@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "me2@example.com")
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	var especialidad db.Especialidad
	if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
		t.Fatalf("no se encontró la especialidad de prueba: %v", err)
	}
	perfilRec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", *reg.Token, onboardingPerfilRequest{
		Nombre: "Ana", Apellido: "Pérez", Telefono: "+5493511234567",
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MP-1",
		EspecialidadIDs: []string{especialidad.ID.String()},
	})
	if perfilRec.Code != http.StatusOK {
		t.Fatalf("no se pudo completar el perfil: status=%d body=%s", perfilRec.Code, perfilRec.Body.String())
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/me", *reg.Token, nil)
	var got meResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.OnboardingStep != db.OnboardingStepClinica {
		t.Errorf("OnboardingStep = %q, esperaba %q", got.OnboardingStep, db.OnboardingStepClinica)
	}
	if got.Perfil == nil {
		t.Fatal("Perfil debería venir presente")
	}
	if got.Perfil.Nombre != "Ana" || got.Perfil.Apellido != "Pérez" {
		t.Errorf("Perfil = %+v, esperaba Ana Pérez", got.Perfil)
	}
	if len(got.Perfil.Especialidades) != 1 {
		t.Errorf("len(Especialidades) = %d, esperaba 1", len(got.Perfil.Especialidades))
	}
	if got.Clinica != nil {
		t.Error("Clinica debería venir ausente todavía")
	}
}

func TestMe_OnboardingCompleto_IncluyePerfilYClinica(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Bruno Iglesias", Email: "me3@example.com", Password: "password123456", NombreClinica: "Clínica Me3",
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/me", reg.Token, nil)
	var got meResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if !got.OnboardingCompletado {
		t.Error("OnboardingCompletado debería ser true")
	}
	if got.Perfil == nil {
		t.Fatal("Perfil debería venir presente")
	}
	if got.Clinica == nil {
		t.Fatal("Clinica debería venir presente")
	}
	if got.Clinica.Nombre != "Clínica Me3" || got.Clinica.Rol != db.RoleOwner {
		t.Errorf("Clinica = %+v, esperaba nombre=Clínica Me3 rol=owner", got.Clinica)
	}
	if got.Clinica.Slug != reg.Profesional.Slug {
		t.Errorf("Clinica.Slug = %q, esperaba %q", got.Clinica.Slug, reg.Profesional.Slug)
	}
}

func TestUpdateMe_SinPerfilCompletoDevuelve404(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "sinperfil@example.com", Password: "password123456", AceptaTerminos: true,
	})
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	rec := doJSONAuth(t, router, http.MethodPatch, "/me", *reg.Token, updateMeRequest{
		Nombre: "Ana", Apellido: "Pérez", Telefono: "+5493511234567",
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d (perfil todavía no completado)", rec.Code, http.StatusNotFound)
	}
}

func TestUpdateMe_BodyInvalido(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Fabio", Email: "me4@example.com", Password: "password123456", NombreClinica: "Clínica Fabio",
	})

	req := httptest.NewRequest(http.MethodPatch, "/me", strings.NewReader("esto no es json"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestUpdateMe_FaltaUnCampoObligatorioDevuelve400(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Gala", Email: "me5@example.com", Password: "password123456", NombreClinica: "Clínica Gala",
	})

	rec := doJSONAuth(t, router, http.MethodPatch, "/me", reg.Token, updateMeRequest{
		Nombre: "", Apellido: "Pérez", Telefono: "+5493511234567",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d (falta el nombre)", rec.Code, http.StatusBadRequest)
	}
}

func TestUpdateMe_EspecialidadInvalidaDevuelve400(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Hugo", Email: "me6@example.com", Password: "password123456", NombreClinica: "Clínica Hugo",
	})

	rec := doJSONAuth(t, router, http.MethodPatch, "/me", reg.Token, updateMeRequest{
		Nombre: "Hugo", Apellido: "Gómez", Telefono: "+5493511234567",
		EspecialidadIDs: []string{"00000000-0000-0000-0000-000000000000"},
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d (especialidad inexistente)", rec.Code, http.StatusBadRequest)
	}
}

func TestMe_TokenVacioEsRechazado(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	rec := doJSONAuth(t, router, http.MethodGet, "/me", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}
