package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/googleauth"
	"dental-mirage/api/internal/mail"
	"dental-mirage/api/internal/ratelimit"
	"dental-mirage/api/internal/security"
	"dental-mirage/api/internal/testdb"
)

// newTestRouter arma un router de test contra una base de test real
// (testdb.New) — devuelve también la conexión, porque
// registrarProfesionalDePrueba (y varios tests que arman fixtures directo
// contra la base) la necesitan.
func newTestRouter(t *testing.T) (http.Handler, *gorm.DB) {
	t.Helper()
	gdb := testdb.New(t)
	return NewRouter(gdb, "un-secret-de-test", []string{"http://localhost:3000"}), gdb
}

func doJSON(t *testing.T, router http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("no se pudo serializar el body: %v", err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func doJSONAuth(t *testing.T, router http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("no se pudo serializar el body: %v", err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

// altaDePruebaInput es el equivalente de prueba del viejo registerRequest
// de un solo paso (antes de docs/feature-sumarte-login.md, que separó el
// alta en cuenta/perfil/clínica) — junta los tres pasos en una sola
// llamada para no reescribir cada test de dominio (turnos/pacientes/
// tipos_consulta/página pública) que solo necesita "una clínica
// autenticada que funcione", no ejercitar el wizard paso a paso (eso lo
// cubren onboarding_test.go/auth_test.go).
type altaDePruebaInput struct {
	Nombre          string
	Email           string
	Password        string
	NombreClinica   string
	EspecialidadIDs []string
}

// clinicaDePruebaResult es lo mínimo que necesitan los tests de dominio:
// un token de sesión ya utilizable contra rutas protegidas por
// requireClinic, y el ID/slug de la clínica resultante (turnos_test.go
// arma fixtures directo contra la base usando Profesional.ID como
// clinic_id — mismo campo, mismo significado que antes de la reescritura).
type clinicaDePruebaResult struct {
	Token       string
	Profesional struct {
		ID   string
		Slug string
	}
}

// registrarProfesionalDePrueba corre el flujo completo (registro → mail
// verificado → perfil → clínica) contra los endpoints reales de HTTP,
// saltando únicamente el envío/lectura del mail de verificación (se marca
// directo en la base, igual de válido para el propósito de estos tests —
// el flujo de verificación en sí ya está cubierto por
// auth_test.go/onboarding_test.go).
func registrarProfesionalDePrueba(t *testing.T, gdb *gorm.DB, router http.Handler, in altaDePruebaInput) clinicaDePruebaResult {
	t.Helper()

	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: in.Email, Password: in.Password, AceptaTerminos: true,
	})
	if regRec.Code != http.StatusCreated {
		t.Fatalf("no se pudo registrar el profesional de prueba: status=%d body=%s", regRec.Code, regRec.Body.String())
	}
	var reg registerResponse
	if err := json.Unmarshal(regRec.Body.Bytes(), &reg); err != nil {
		t.Fatalf("respuesta de registro no es JSON válido: %v", err)
	}
	if reg.Token == nil {
		t.Fatalf("esperaba un token en la respuesta de registro de prueba")
	}

	email := strings.ToLower(strings.TrimSpace(in.Email))
	now := time.Now()
	if err := gdb.Model(&db.User{}).Where("email = ?", email).
		Updates(map[string]any{"email_verified_at": now, "onboarding_step": db.OnboardingStepPerfil}).Error; err != nil {
		t.Fatalf("no se pudo marcar el mail como verificado en el fixture de prueba: %v", err)
	}

	nombre, apellido := splitNombreApellidoDePrueba(in.Nombre)
	// El paso 2 exige al menos una especialidad — si el caller no pidió
	// una en particular, usamos el catálogo por default para no repetir
	// este lookup en cada test de dominio (turnos/pacientes/etc.) que solo
	// le importa tener una clínica autenticada que funcione.
	especialidadIDs := in.EspecialidadIDs
	if len(especialidadIDs) == 0 {
		var especialidad db.Especialidad
		if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
			t.Fatalf("no se encontró la especialidad de prueba por default: %v", err)
		}
		especialidadIDs = []string{especialidad.ID.String()}
	}
	perfilRec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", *reg.Token, onboardingPerfilRequest{
		Nombre: nombre, Apellido: apellido, TelefonoPrefijo: "+54", Telefono: "+5493511234567",
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MP-12345",
		EspecialidadIDs: especialidadIDs,
	})
	if perfilRec.Code != http.StatusOK {
		t.Fatalf("no se pudo completar el perfil de prueba: status=%d body=%s", perfilRec.Code, perfilRec.Body.String())
	}

	clinicaRec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/clinica", *reg.Token, onboardingClinicaRequest{
		Tipo: db.ClinicTipoIndividual, Nombre: in.NombreClinica,
	})
	if clinicaRec.Code != http.StatusOK {
		t.Fatalf("no se pudo crear la clínica de prueba: status=%d body=%s", clinicaRec.Code, clinicaRec.Body.String())
	}
	var clinicaResp onboardingClinicaResponse
	if err := json.Unmarshal(clinicaRec.Body.Bytes(), &clinicaResp); err != nil {
		t.Fatalf("respuesta de creación de clínica no es JSON válido: %v", err)
	}

	result := clinicaDePruebaResult{Token: *reg.Token}
	result.Profesional.Slug = clinicaResp.Slug
	result.Profesional.ID = clinicaResp.ClinicID
	return result
}

// deployarPaginaDePrueba — el buscador (T4.5) solo lista clínicas
// deployadas (spec §5.2); la mayoría de los tests de clinicas_test.go
// necesitan pasar por acá antes de esperar resultados.
func deployarPaginaDePrueba(t *testing.T, router http.Handler, token string) {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/deployar", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("no se pudo deployar la página de prueba: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

// ---------------------------------------------------------------------
// Utilidades para auth_test.go / onboarding_test.go — necesitan
// interceptar los links de verificación/reset (solo el hash queda en la
// base, nunca el token en claro) y a veces un Exchanger de Google fake.
// ---------------------------------------------------------------------

// capturingMailSender es un mail.Sender de prueba que retiene el último
// código/link enviado por destinatario — así los tests pueden extraer el
// valor real y ejercitar el flujo de verificación/reset de punta a punta
// sin mockear internal/security.
type capturingMailSender struct {
	mu                sync.Mutex
	verifyCodes       map[string]string
	resetURLs         map[string]string
	turnoVerifyCodes  map[string]string
	turnosConfirmados map[string]mail.TurnoConfirmadoInfo
}

func newCapturingMailSender() *capturingMailSender {
	return &capturingMailSender{
		verifyCodes:       map[string]string{},
		resetURLs:         map[string]string{},
		turnoVerifyCodes:  map[string]string{},
		turnosConfirmados: map[string]mail.TurnoConfirmadoInfo{},
	}
}

func (c *capturingMailSender) SendVerificationEmail(_ context.Context, to, code string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.verifyCodes[to] = code
	return nil
}

func (c *capturingMailSender) SendPasswordResetEmail(_ context.Context, to, resetURL string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.resetURLs[to] = resetURL
	return nil
}

func (c *capturingMailSender) SendWelcomeEmail(_ context.Context, _, _ string) error { return nil }

// SendTurnoVerificationEmail — Extra 2.3.5 (E5.6): "Confirmanos que sos
// vos" del wizard público, mismo patrón de captura que
// SendVerificationEmail (cuenta) de arriba.
func (c *capturingMailSender) SendTurnoVerificationEmail(_ context.Context, to, code, _ string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.turnoVerifyCodes[to] = code
	return nil
}

// SendTurnoConfirmadoEmail — pedido textual del cliente: "cada vez que se
// saque un turno, enviar una notificación por mail" — mismo patrón de
// captura que el resto de este archivo, para que los tests puedan
// confirmar que se mandó (y con qué datos) sin depender de Resend real.
func (c *capturingMailSender) SendTurnoConfirmadoEmail(_ context.Context, to string, info mail.TurnoConfirmadoInfo) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.turnosConfirmados[to] = info
	return nil
}

// turnoConfirmadoEnviadoA — nil si nunca se llamó a SendTurnoConfirmadoEmail
// para ese mail.
func (c *capturingMailSender) turnoConfirmadoEnviadoA(email string) *mail.TurnoConfirmadoInfo {
	c.mu.Lock()
	defer c.mu.Unlock()
	info, ok := c.turnosConfirmados[email]
	if !ok {
		return nil
	}
	return &info
}

// codigoDeLaUltimaVerificacion — TR-055 en docs/tradeoffs.md: el mail de
// verificación manda un código de 6 dígitos directo, ya no un link del
// que haya que extraer un ?token=.
func (c *capturingMailSender) codigoDeLaUltimaVerificacion(email string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.verifyCodes[email]
}

// codigoDeLaUltimaVerificacionDeTurno — Extra 2.3.5 (E5.6), mismo criterio
// que codigoDeLaUltimaVerificacion pero para el código del wizard público.
func (c *capturingMailSender) codigoDeLaUltimaVerificacionDeTurno(email string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.turnoVerifyCodes[email]
}

func (c *capturingMailSender) tokenFromLastResetURL(email string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return tokenFromURL(c.resetURLs[email])
}

func tokenFromURL(rawURL string) string {
	idx := strings.LastIndex(rawURL, "token=")
	if idx == -1 {
		return ""
	}
	return rawURL[idx+len("token="):]
}

// newTestRouterWithMail arma un router con un capturingMailSender, para
// tests que necesitan seguir el link real de verificación/reset.
func newTestRouterWithMail(t *testing.T) (http.Handler, *gorm.DB, *capturingMailSender) {
	t.Helper()
	gdb := testdb.New(t)
	sender := newCapturingMailSender()
	deps := AuthDeps{
		Mail:           sender,
		AccountLimiter: &ratelimit.AccountLimiter{DB: gdb},
		IPLimiter:      ratelimit.NewIPLimiter(),
		AppBaseURL:     "http://localhost:3000",
		StateSecret:    "un-secret-de-test",
	}
	return NewRouterWithDeps(gdb, deps, []string{"http://localhost:3000"}), gdb, sender
}

// newTestRouterWithMailYSimulacion — mismo router que newTestRouterWithMail,
// pero con SimularBloqueosSeguridad activo (corrección de seguridad, Fase
// 2.4.1: "estoy probando en localhost, no bloquearme realmente, sino
// decirme que debería estar bloqueado"). Ver AuthDeps.SimularBloqueosSeguridad.
func newTestRouterWithMailYSimulacion(t *testing.T) (http.Handler, *gorm.DB, *capturingMailSender) {
	t.Helper()
	gdb := testdb.New(t)
	sender := newCapturingMailSender()
	deps := AuthDeps{
		Mail:                     sender,
		AccountLimiter:           &ratelimit.AccountLimiter{DB: gdb},
		IPLimiter:                ratelimit.NewIPLimiter(),
		AppBaseURL:               "http://localhost:3000",
		StateSecret:              "un-secret-de-test",
		SimularBloqueosSeguridad: true,
	}
	return NewRouterWithDeps(gdb, deps, []string{"http://localhost:3000"}), gdb, sender
}

// routerOverDB arma un router "manual" (sin crear una base nueva) sobre
// un *gorm.DB ya existente — para tests que necesitan dos routers con
// AuthDeps distintos apuntando a la MISMA base (ej. TestMe_AutoVerifyEmail_*
// en me_test.go: simula que Resend se dejó de configurar DESPUÉS de que
// una cuenta ya se hubiera creado sin AutoVerifyEmail).
func routerOverDB(gdb *gorm.DB, autoVerifyEmail bool) http.Handler {
	deps := AuthDeps{
		Mail:            mail.LogSender{},
		AccountLimiter:  &ratelimit.AccountLimiter{DB: gdb},
		IPLimiter:       ratelimit.NewIPLimiter(),
		AppBaseURL:      "http://localhost:3000",
		StateSecret:     "un-secret-de-test",
		AutoVerifyEmail: autoVerifyEmail,
	}
	return NewRouterWithDeps(gdb, deps, []string{"http://localhost:3000"})
}

// routerOverDBWithTurnstile — mismo criterio que routerOverDB: un router
// "manual" sobre un *gorm.DB ya existente, acá para probar el CAPTCHA del
// formulario público de turnos (corrección de seguridad, Fase 2.4.1) sin
// que el registro del profesional de prueba (que también pasa por
// Turnstile, ver checkCaptcha en auth.go) quede atrapado por el mismo
// verifier — se arma la clínica con un router "ok", y se prueba el
// rechazo con un segundo router "no ok" sobre la MISMA base.
func routerOverDBWithTurnstile(gdb *gorm.DB, turnstileOK bool) http.Handler {
	deps := AuthDeps{
		Mail:           mail.LogSender{},
		Turnstile:      fakeTurnstileVerifier{ok: turnstileOK},
		AccountLimiter: &ratelimit.AccountLimiter{DB: gdb},
		IPLimiter:      ratelimit.NewIPLimiter(),
		AppBaseURL:     "http://localhost:3000",
		StateSecret:    "un-secret-de-test",
	}
	return NewRouterWithDeps(gdb, deps, []string{"http://localhost:3000"})
}

// newTestRouterWithAutoVerify arma un router con AutoVerifyEmail activo —
// TR-051 en docs/tradeoffs.md: sin RESEND_API_KEY configurada, las
// cuentas nativas nuevas quedan verificadas de entrada.
func newTestRouterWithAutoVerify(t *testing.T) (http.Handler, *gorm.DB) {
	t.Helper()
	gdb := testdb.New(t)
	deps := AuthDeps{
		Mail:            mail.LogSender{},
		AccountLimiter:  &ratelimit.AccountLimiter{DB: gdb},
		IPLimiter:       ratelimit.NewIPLimiter(),
		AppBaseURL:      "http://localhost:3000",
		StateSecret:     "un-secret-de-test",
		AutoVerifyEmail: true,
	}
	return NewRouterWithDeps(gdb, deps, []string{"http://localhost:3000"}), gdb
}

// newTestRouterWithExponerCodigo — Fase 2.4.1: router con
// ExponerCodigoVerificacion activo (mismo criterio que AutoVerifyEmail —
// sin RESEND_API_KEY configurada, es decir, en local) para probar que
// enviarVerificacionTurnoPublicoHandler devuelve el código de "Confirmanos
// que sos vos" en la respuesta.
func newTestRouterWithExponerCodigo(t *testing.T) (http.Handler, *gorm.DB) {
	t.Helper()
	gdb := testdb.New(t)
	deps := AuthDeps{
		Mail:                      mail.LogSender{},
		AccountLimiter:            &ratelimit.AccountLimiter{DB: gdb},
		IPLimiter:                 ratelimit.NewIPLimiter(),
		AppBaseURL:                "http://localhost:3000",
		StateSecret:               "un-secret-de-test",
		ExponerCodigoVerificacion: true,
	}
	return NewRouterWithDeps(gdb, deps, []string{"http://localhost:3000"}), gdb
}

// fakeGoogleExchanger es un googleauth.Exchanger de prueba — nunca pega a
// la red real (mismo criterio que internal/googleauth/googleauth_test.go).
type fakeGoogleExchanger struct {
	sub           string
	email         string
	emailVerified bool
	err           error
}

func (f fakeGoogleExchanger) Exchange(context.Context, string, string) (googleauth.UserInfo, error) {
	if f.err != nil {
		return googleauth.UserInfo{}, f.err
	}
	return googleauth.UserInfo{Sub: f.sub, Email: f.email, EmailVerified: f.emailVerified}, nil
}

// newTestRouterWithGoogle arma un router con Google OAuth "configurado"
// (fakeGoogleExchanger) — para ejercitar POST /auth/google sin red real.
func newTestRouterWithGoogle(t *testing.T, exchanger fakeGoogleExchanger) (http.Handler, *gorm.DB) {
	t.Helper()
	gdb := testdb.New(t)
	deps := AuthDeps{
		Mail:           mail.LogSender{},
		Google:         exchanger,
		AccountLimiter: &ratelimit.AccountLimiter{DB: gdb},
		IPLimiter:      ratelimit.NewIPLimiter(),
		AppBaseURL:     "http://localhost:3000",
		StateSecret:    "un-secret-de-test",
	}
	return NewRouterWithDeps(gdb, deps, []string{"http://localhost:3000"}), gdb
}

// marcarMailVerificadoDePrueba salta el envío/lectura real de mail para
// tests que no necesitan ejercitar ese paso puntual (el flujo real de
// verificación por HTTP ya está cubierto en auth_test.go,
// TestVerificarEmail_*).
func marcarMailVerificadoDePrueba(t *testing.T, gdb *gorm.DB, email string) {
	t.Helper()
	now := time.Now()
	err := gdb.Model(&db.User{}).Where("email = ?", strings.ToLower(strings.TrimSpace(email))).
		Updates(map[string]any{"email_verified_at": now, "onboarding_step": db.OnboardingStepPerfil}).Error
	if err != nil {
		t.Fatalf("no se pudo marcar el mail como verificado en el fixture de prueba: %v", err)
	}
}

// fakeTurnstileVerifier / fakePwnedChecker — implementaciones de prueba
// para ejercitar las ramas "CAPTCHA configurado"/"HaveIBeenPwned
// configurado" de auth.go (con Turnstile/Pwned nil, esas ramas quedan
// deshabilitadas y no se pueden probar).
type fakeTurnstileVerifier struct {
	ok  bool
	err error
}

func (f fakeTurnstileVerifier) Verify(context.Context, string, string) (bool, error) {
	return f.ok, f.err
}

type fakePwnedChecker struct {
	pwned bool
	err   error
}

func (f fakePwnedChecker) IsPwned(context.Context, string) (bool, error) {
	return f.pwned, f.err
}

// newTestRouterWithSecurity arma un router con Turnstile/HaveIBeenPwned
// "configurados" (fakes) — para ejercitar el rechazo de CAPTCHA inválido y
// de contraseñas filtradas en register/reset-password (spec §7).
func newTestRouterWithSecurity(t *testing.T, turnstileOK bool, pwned bool) (http.Handler, *gorm.DB) {
	t.Helper()
	gdb := testdb.New(t)
	deps := AuthDeps{
		Mail:           mail.LogSender{},
		Turnstile:      fakeTurnstileVerifier{ok: turnstileOK},
		Pwned:          fakePwnedChecker{pwned: pwned},
		AccountLimiter: &ratelimit.AccountLimiter{DB: gdb},
		IPLimiter:      ratelimit.NewIPLimiter(),
		AppBaseURL:     "http://localhost:3000",
		StateSecret:    "un-secret-de-test",
	}
	return NewRouterWithDeps(gdb, deps, []string{"http://localhost:3000"}), gdb
}

var _ security.PwnedChecker = fakePwnedChecker{}

// splitNombreApellidoDePrueba replica la heurística de
// internal/db.MigrateProfesionalesToUsers (primer token = nombre, resto =
// apellido) — duplicada acá a propósito, es una función no exportada del
// paquete db y este es solo un fixture de test.
func splitNombreApellidoDePrueba(nombreCompleto string) (nombre, apellido string) {
	partes := strings.Fields(nombreCompleto)
	if len(partes) == 0 {
		return "Test", "Apellido"
	}
	if len(partes) == 1 {
		return partes[0], "Apellido"
	}
	return partes[0], strings.Join(partes[1:], " ")
}
