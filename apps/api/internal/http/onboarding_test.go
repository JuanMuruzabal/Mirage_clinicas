package http

import (
	"encoding/json"
	"net/http"
	"testing"

	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

func TestOnboardingPerfil_RequiereMailVerificado(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "perfilsinverificar@example.com", Password: "password123456", AceptaTerminos: true,
	})
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	rec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", *reg.Token, onboardingPerfilRequest{
		Nombre: "Ana", Apellido: "Pérez", Telefono: "+5493511234567",
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MP-1",
	})
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba %d (mail sin verificar)", rec.Code, http.StatusForbidden)
	}
}

func TestOnboardingPerfil_CamposObligatorios(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "perfilcampos@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "perfilcampos@example.com")
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	casos := []onboardingPerfilRequest{
		{Apellido: "Pérez", Telefono: "+5493511234567", MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MP-1"},                // sin nombre
		{Nombre: "Ana", Telefono: "+5493511234567", MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MP-1"},                    // sin apellido
		{Nombre: "Ana", Apellido: "Pérez", MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MP-1"},                             // sin teléfono
		{Nombre: "Ana", Apellido: "Pérez", Telefono: "+5493511234567", MatriculaNumero: "MP-1"},                                          // sin tipo de matrícula
		{Nombre: "Ana", Apellido: "Pérez", Telefono: "+5493511234567", MatriculaTipo: db.MatriculaTipoNacional},                          // sin número de matrícula
		{Nombre: "Ana", Apellido: "Pérez", Telefono: "+5493511234567", MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MP-1"}, // sin especialidad
	}
	for i, req := range casos {
		rec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", *reg.Token, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("caso %d: status = %d, esperaba %d. body=%s", i, rec.Code, http.StatusBadRequest, rec.Body.String())
		}
	}
}

func TestOnboardingPerfil_ExitosoAvanzaAClinica(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "perfilexitoso@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "perfilexitoso@example.com")
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	var especialidad db.Especialidad
	if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
		t.Fatalf("no se encontró la especialidad de prueba: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", *reg.Token, onboardingPerfilRequest{
		Nombre: "Ana", Apellido: "Pérez", Telefono: "+5493511234567",
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MP-1",
		EspecialidadIDs: []string{especialidad.ID.String()},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var user db.User
	if err := gdb.Where("email = ?", "perfilexitoso@example.com").First(&user).Error; err != nil {
		t.Fatalf("no se encontró el usuario: %v", err)
	}
	if user.OnboardingStep != db.OnboardingStepClinica {
		t.Errorf("OnboardingStep = %q, esperaba %q", user.OnboardingStep, db.OnboardingStepClinica)
	}
}

// TestOnboardingPerfil_ReenviarEnPasoClinicaNoRegresaElPaso — el frontend
// (SumarseWizard, "Atrás" desde el Paso 3) reenvía /onboarding/perfil
// mientras onboardingStep ya está en "clinica" para permitir editar sin
// perder datos — esto NO debe hacer retroceder el paso, solo actualizar
// el perfil (spec §4: "se puede volver atrás y editar sin perder datos").
func TestOnboardingPerfil_ReenviarEnPasoClinicaNoRegresaElPaso(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	token := completarPerfilDePrueba(t, router, gdb, "reenviarperfil@example.com")

	var user db.User
	if err := gdb.Where("email = ?", "reenviarperfil@example.com").First(&user).Error; err != nil {
		t.Fatalf("no se encontró el usuario: %v", err)
	}
	if user.OnboardingStep != db.OnboardingStepClinica {
		t.Fatalf("precondición: OnboardingStep = %q, esperaba %q", user.OnboardingStep, db.OnboardingStepClinica)
	}

	var especialidad db.Especialidad
	if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
		t.Fatalf("no se encontró la especialidad de prueba: %v", err)
	}
	rec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", token, onboardingPerfilRequest{
		Nombre: "Test", Apellido: "Editado", Telefono: "+5493511234567",
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MP-2",
		EspecialidadIDs: []string{especialidad.ID.String()},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got perfilResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.Apellido != "Editado" {
		t.Errorf("Apellido = %q, esperaba %q (el reenvío debería haber actualizado el perfil)", got.Apellido, "Editado")
	}

	if err := gdb.Where("email = ?", "reenviarperfil@example.com").First(&user).Error; err != nil {
		t.Fatalf("no se encontró el usuario: %v", err)
	}
	if user.OnboardingStep != db.OnboardingStepClinica {
		t.Errorf("OnboardingStep = %q, esperaba que se mantuviera en %q (no debe retroceder)", user.OnboardingStep, db.OnboardingStepClinica)
	}
}

func TestOnboardingClinica_RechazaSiPerfilIncompleto(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "clinicasinperfil@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "clinicasinperfil@example.com")
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	rec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/clinica", *reg.Token, onboardingClinicaRequest{
		Tipo: db.ClinicTipoIndividual, Nombre: "Mi Clínica",
	})
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba %d (perfil incompleto)", rec.Code, http.StatusForbidden)
	}
}

func TestOnboardingClinica_ExitosoCreaClinicMemberOwner(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	token := completarPerfilDePrueba(t, router, gdb, "clinicaexitosa@example.com")

	rec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/clinica", token, onboardingClinicaRequest{
		Tipo: db.ClinicTipoIndividual, Nombre: "Clínica Exitosa",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var resp onboardingClinicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.OnboardingStep != db.OnboardingStepCompleto {
		t.Errorf("OnboardingStep = %q, esperaba %q", resp.OnboardingStep, db.OnboardingStepCompleto)
	}

	var user db.User
	gdb.Where("email = ?", "clinicaexitosa@example.com").First(&user)
	var member db.ClinicMember
	if err := gdb.Preload("Roles").Scopes(db.ConRol(db.RoleOwner)).
		Where("user_id = ?", user.ID).First(&member).Error; err != nil {
		t.Fatalf("no se creó el ClinicMember owner: %v", err)
	}
	// Fase 3.2.1: el rol vive en `clinic_member_roles`, no en una columna.
	// Fase 3.2.2: quien crea la clínica arranca con LOS TRES roles que el
	// brief le asigna — "la tarjeta del titular... por default siempre
	// tiene el rol de profesional y con el rol de administrador de
	// página", más `owner`, que es lo que lo habilita a invitar y repartir
	// roles. Sin `admin` no podría entrar a la página de su propia clínica.
	if rol := db.RolPrincipal(member.Roles); rol != db.RoleOwner {
		t.Errorf("RolPrincipal = %q, esperaba %q", rol, db.RoleOwner)
	}
	tiene := map[string]bool{}
	for _, r := range member.Roles {
		tiene[r.Rol] = true
	}
	for _, esperado := range []string{db.RoleOwner, db.RoleAdmin, db.RoleProfesional} {
		if !tiene[esperado] {
			t.Errorf("al titular le falta el rol %q", esperado)
		}
	}
	if tiene[db.RoleRecepcion] {
		t.Error("el titular no puede ser recepcionista: es excluyente con profesional")
	}
	if member.Status != db.ClinicMemberStatusActive {
		t.Errorf("Status = %q, esperaba %q", member.Status, db.ClinicMemberStatusActive)
	}

	// Sembrado de tipos de consulta default (TR-001), ahora atado a la
	// Clinic en vez de al Profesional.
	var count int64
	gdb.Table("tipos_consulta").Where("clinic_id = ?", member.ClinicID).Count(&count)
	if count != 2 {
		t.Errorf("count de tipos_consulta sembrados = %d, esperaba 2", count)
	}
}

// TestOnboardingClinica_UnaSolaClinicaPropia — antes se llamaba
// "NoReentraTrasCompleto" y esperaba 403, porque la regla era la del
// wizard: "onboarding completo → no puede volver" (spec §4).
//
// Desde la Fase 3.2.3 el wizard de dos pasos quedó deconstruido y crear
// la clínica dejó de ser un paso del onboarding: es una acción de
// "¿Dónde trabajás hoy?" que alguien puede querer hacer meses después de
// haber entrado a la app invitado por un colega. Lo que sigue prohibido
// —y es lo que este test protege— es tener DOS clínicas propias. Por eso
// el rechazo pasó a 409: el problema no es en qué paso está la persona,
// es que ese recurso ya existe.
func TestOnboardingClinica_UnaSolaClinicaPropia(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	token := completarPerfilDePrueba(t, router, gdb, "noreentra@example.com")

	primera := doJSONAuth(t, router, http.MethodPatch, "/onboarding/clinica", token, onboardingClinicaRequest{
		Tipo: db.ClinicTipoIndividual, Nombre: "Clínica Uno",
	})
	if primera.Code != http.StatusOK {
		t.Fatalf("primera creación falló: status=%d body=%s", primera.Code, primera.Body.String())
	}

	segunda := doJSONAuth(t, router, http.MethodPatch, "/onboarding/clinica", token, onboardingClinicaRequest{
		Tipo: db.ClinicTipoIndividual, Nombre: "Clínica Dos",
	})
	if segunda.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d (ya tiene su clínica creada)", segunda.Code, http.StatusConflict)
	}
}

func TestOnboardingClinica_TipoInvalido(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	token := completarPerfilDePrueba(t, router, gdb, "tipoinvalido@example.com")

	rec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/clinica", token, onboardingClinicaRequest{
		Tipo: "no-es-un-tipo", Nombre: "Clínica",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestOnboardingClinica_TipoOrganizacionPermitido(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	token := completarPerfilDePrueba(t, router, gdb, "organizacion@example.com")

	rec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/clinica", token, onboardingClinicaRequest{
		Tipo: db.ClinicTipoOrganizacion, Nombre: "Clínica Organización",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s — organizaciones ya no están fuera de alcance (esta feature revierte TR-009)", rec.Code, http.StatusOK, rec.Body.String())
	}
}

// completarPerfilDePrueba registra+verifica+completa el paso 2, dejando la
// cuenta lista para el paso 3 — usado por los tests de este archivo que
// solo les importa el comportamiento de /onboarding/clinica.
func completarPerfilDePrueba(t *testing.T, router http.Handler, gdb *gorm.DB, email string) string {
	t.Helper()

	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: email, Password: "password123456", AceptaTerminos: true,
	})
	if regRec.Code != http.StatusCreated {
		t.Fatalf("registro de prueba falló: status=%d body=%s", regRec.Code, regRec.Body.String())
	}
	var reg registerResponse
	if err := json.Unmarshal(regRec.Body.Bytes(), &reg); err != nil {
		t.Fatalf("respuesta de registro no es JSON válido: %v", err)
	}
	marcarMailVerificadoDePrueba(t, gdb, email)

	var especialidad db.Especialidad
	if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
		t.Fatalf("no se encontró la especialidad de prueba: %v", err)
	}

	perfilRec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", *reg.Token, onboardingPerfilRequest{
		Nombre: "Test", Apellido: "Apellido", Telefono: "+5493511234567",
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MP-1",
		EspecialidadIDs: []string{especialidad.ID.String()},
	})
	if perfilRec.Code != http.StatusOK {
		t.Fatalf("no se pudo completar el perfil de prueba: status=%d body=%s", perfilRec.Code, perfilRec.Body.String())
	}

	return *reg.Token
}
