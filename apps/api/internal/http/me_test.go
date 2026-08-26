package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
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

// TestMe_AutoVerifyEmail_CuentaSinVerificarQuedaVerificadaAlConsultar —
// TR-052 en docs/tradeoffs.md: una cuenta que quedó sin verificar ANTES de
// que existiera AutoVerifyEmail (o desde otro router sin el modo activo)
// no se queda soft-lockeada — el primer GET /me autenticado con el modo ya
// activo la verifica ahí mismo, sin que el usuario tenga que rehacer nada.
func TestMe_AutoVerifyEmail_CuentaSinVerificarQuedaVerificadaAlConsultar(t *testing.T) {
	gdb := testdb.New(t)
	sinAutoVerify := routerOverDB(gdb, false)
	regRec := doJSON(t, sinAutoVerify, http.MethodPost, "/auth/register", registerRequest{
		Email: "softlock@example.com", Password: "password123456", AceptaTerminos: true,
	})
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)
	if reg.Token == nil {
		t.Fatal("esperaba un token en el registro inicial")
	}

	// Mismo router pero con AutoVerifyEmail activo — simula que Resend se
	// dejó de configurar (o nunca se llegó a configurar) DESPUÉS de que
	// esta cuenta ya existiera sin verificar.
	conAutoVerify := routerOverDB(gdb, true)
	meRec := doJSONAuth(t, conAutoVerify, http.MethodGet, "/me", *reg.Token, nil)
	if meRec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", meRec.Code, http.StatusOK, meRec.Body.String())
	}
	var me meResponse
	_ = json.Unmarshal(meRec.Body.Bytes(), &me)
	if !me.EmailVerificado {
		t.Error("EmailVerificado debería quedar true tras el GET /me con AutoVerifyEmail activo")
	}
	if me.OnboardingStep != db.OnboardingStepPerfil {
		t.Errorf("OnboardingStep = %q, esperaba %q", me.OnboardingStep, db.OnboardingStepPerfil)
	}

	var user db.User
	if err := gdb.Where("email = ?", "softlock@example.com").First(&user).Error; err != nil {
		t.Fatalf("no se encontró el usuario: %v", err)
	}
	if user.EmailVerifiedAt == nil {
		t.Error("EmailVerifiedAt debería quedar persistido en la base, no solo en la respuesta")
	}
}

// TestMe_CuentaAbandonadaSinVerificarSeBorraAlConsultarDespuesDelTTL —
// TR-052 en docs/tradeoffs.md, pregunta explícita del cliente: "si vuelvo
// después de un tiempo y no hay cuenta que confirmar, ¿me tira
// automáticamente al paso anterior?" — Sí: sin AutoVerifyEmail (el estado
// normal una vez que Resend esté configurado), una cuenta sin verificar
// más allá del TTL del link (24h) se borra en el primer GET /me que la
// encuentra vencida, y responde 404 — exactamente como si esa cuenta
// nunca hubiera existido, para que el wizard la trate como Paso 1 de cero
// en la próxima carga, en vez de dejar a la persona mirando "revisá tu
// correo" para siempre.
func TestMe_CuentaAbandonadaSinVerificarSeBorraAlConsultarDespuesDelTTL(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t) // AutoVerifyEmail=false
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "abandonadaenme@example.com", Password: "password123456", AceptaTerminos: true,
	})
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)
	if reg.Token == nil {
		t.Fatal("esperaba un token en el registro inicial")
	}

	// Simula que pasó más del TTL del link de verificación sin que nadie
	// lo confirmara.
	if err := gdb.Model(&db.User{}).Where("email = ?", "abandonadaenme@example.com").
		Update("created_at", time.Now().Add(-25*time.Hour)).Error; err != nil {
		t.Fatalf("no se pudo forzar la antigüedad de la cuenta: %v", err)
	}

	meRec := doJSONAuth(t, router, http.MethodGet, "/me", *reg.Token, nil)
	if meRec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d (cuenta vencida, tratada como inexistente)", meRec.Code, http.StatusNotFound)
	}

	var count int64
	gdb.Model(&db.User{}).Where("email = ?", "abandonadaenme@example.com").Count(&count)
	if count != 0 {
		t.Error("la cuenta vencida debería haberse borrado de verdad, no solo rechazado la consulta")
	}

	// El wizard, al ver `me: null`, muestra el Paso 1 de cero — y
	// registrarse de nuevo con ese mismo mail ahora funciona como un alta
	// nueva (no como "mail ya existente").
	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "abandonadaenme@example.com", Password: "password-nueva-456", AceptaTerminos: true,
	})
	var resp registerResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Token == nil {
		t.Error("esperaba poder rehacer el registro desde cero con el mismo mail")
	}
}

// TestMe_CuentaSinVerificarRecienCreadaNoSeBorraTodavia — dentro del TTL,
// GET /me se comporta como siempre (emailVerificado: false), no borra nada.
func TestMe_CuentaSinVerificarRecienCreadaNoSeBorraTodavia(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "recienme@example.com", Password: "password123456", AceptaTerminos: true,
	})
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	meRec := doJSONAuth(t, router, http.MethodGet, "/me", *reg.Token, nil)
	if meRec.Code != http.StatusOK {
		t.Errorf("status = %d, esperaba %d (todavía dentro del TTL)", meRec.Code, http.StatusOK)
	}
}
