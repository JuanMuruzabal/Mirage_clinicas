package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"dental-mirage/api/internal/db"
)

func TestRegister_Exitoso(t *testing.T) {
	router, _, sender := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "maria@example.com", Password: "password123456", AceptaTerminos: true,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var resp registerResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if resp.Token == nil || *resp.Token == "" {
		t.Error("esperaba un token no vacío")
	}
	if sender.tokenFromLastVerifyURL("maria@example.com") == "" {
		t.Error("esperaba que se mandara un mail de verificación con un token")
	}
}

func TestRegister_EmailDuplicado_RespuestaGenericaSinToken(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	req := registerRequest{Email: "duplicado@example.com", Password: "password123456", AceptaTerminos: true}
	if rec := doJSON(t, router, http.MethodPost, "/auth/register", req); rec.Code != http.StatusCreated {
		t.Fatalf("primer registro falló: status=%d body=%s", rec.Code, rec.Body.String())
	}

	rec := doJSON(t, router, http.MethodPost, "/auth/register", req)
	// spec §7 anti-enumeración: mismo status, mismo mensaje, y sobre todo
	// SIN token (registrarse con el mail de otra cuenta no puede loguear
	// como esa cuenta).
	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, esperaba %d (misma respuesta que un registro nuevo)", rec.Code, http.StatusCreated)
	}
	var resp registerResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Token != nil {
		t.Error("un email duplicado nunca debería devolver un token de sesión (evita secuestro de cuenta)")
	}
}

func TestRegister_PasswordCorta(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "corta@example.com", Password: "corta1234", AceptaTerminos: true,
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestRegister_EmailInvalido(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "no-es-un-email", Password: "password123456", AceptaTerminos: true,
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestRegister_SinAceptarTerminos(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "sinterminos@example.com", Password: "password123456", AceptaTerminos: false,
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestRegister_BodyInvalido(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader("esto no es json"))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------

func TestLogin_MailNoVerificado(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "sinverificar@example.com", Password: "password123456", AceptaTerminos: true,
	})

	rec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{
		Email: "sinverificar@example.com", Password: "password123456",
	})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, esperaba %d (mail no verificado)", rec.Code, http.StatusForbidden)
	}
	var resp loginResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.EmailVerificado {
		t.Error("EmailVerificado debería ser false")
	}
	if resp.Token != nil {
		t.Error("no debería devolver token sin verificar el mail")
	}
}

func TestLogin_ExitosoTrasVerificar(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "login@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "login@example.com")

	rec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{
		Email: "login@example.com", Password: "password123456",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var resp loginResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Token == nil || *resp.Token == "" {
		t.Error("esperaba un token no vacío")
	}
}

func TestLogin_PasswordIncorrecta(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "wrongpass@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "wrongpass@example.com")

	rec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{
		Email: "wrongpass@example.com", Password: "password-incorrecta",
	})
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestLogin_UsuarioInexistente(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{
		Email: "no-existe@example.com", Password: "password123456",
	})
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

// TestLogin_MismoMensajeParaCuentaInexistenteYPasswordIncorrecta cubre
// anti-enumeración (spec §7): "email o contraseña incorrectos" no debe
// distinguir cuál de las dos cosas pasó.
func TestLogin_MismoMensajeParaCuentaInexistenteYPasswordIncorrecta(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "existe@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "existe@example.com")

	recInexistente := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{Email: "no-existe@example.com", Password: "cualquiera123"})
	recPasswordMala := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{Email: "existe@example.com", Password: "password-incorrecta"})

	var e1, e2 map[string]string
	_ = json.Unmarshal(recInexistente.Body.Bytes(), &e1)
	_ = json.Unmarshal(recPasswordMala.Body.Bytes(), &e2)
	if e1["error"] != e2["error"] {
		t.Errorf("mensajes distintos: %q vs %q — filtra si la cuenta existe", e1["error"], e2["error"])
	}
}

// ---------------------------------------------------------------------
// Verificación de mail
// ---------------------------------------------------------------------

func TestVerificarEmail_Exitoso(t *testing.T) {
	router, _, sender := newTestRouterWithMail(t)
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "verificar@example.com", Password: "password123456", AceptaTerminos: true,
	})
	token := sender.tokenFromLastVerifyURL("verificar@example.com")
	if token == "" {
		t.Fatal("no se capturó el token de verificación")
	}

	rec := doJSON(t, router, http.MethodPost, "/auth/verificar-email", verificarEmailRequest{Token: token})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var resp verificarEmailResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Token == "" {
		t.Error("esperaba un token de sesión nuevo")
	}
	if resp.OnboardingStep != db.OnboardingStepPerfil {
		t.Errorf("OnboardingStep = %q, esperaba %q", resp.OnboardingStep, db.OnboardingStepPerfil)
	}
}

// TestVerificarEmail_UsadoDosVecesFallaLaSegunda — criterio de aceptación
// explícito de la spec (§10, seguridad).
func TestVerificarEmail_UsadoDosVecesFallaLaSegunda(t *testing.T) {
	router, _, sender := newTestRouterWithMail(t)
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "usadodosveces@example.com", Password: "password123456", AceptaTerminos: true,
	})
	token := sender.tokenFromLastVerifyURL("usadodosveces@example.com")

	primera := doJSON(t, router, http.MethodPost, "/auth/verificar-email", verificarEmailRequest{Token: token})
	if primera.Code != http.StatusOK {
		t.Fatalf("primera verificación falló: status=%d body=%s", primera.Code, primera.Body.String())
	}
	segunda := doJSON(t, router, http.MethodPost, "/auth/verificar-email", verificarEmailRequest{Token: token})
	if segunda.Code != http.StatusBadRequest {
		t.Errorf("segunda verificación: status = %d, esperaba %d", segunda.Code, http.StatusBadRequest)
	}
}

func TestVerificarEmail_TokenInvalido(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/verificar-email", verificarEmailRequest{Token: "no-existe"})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

// TestVerificarEmail_RotaLaSesion — spec §7: "rotar el identificador de
// sesión... al verificar el mail". El token de sesión emitido en el
// registro deja de ser válido después de verificar.
func TestVerificarEmail_RotaLaSesion(t *testing.T) {
	router, _, sender := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "rotasesion@example.com", Password: "password123456", AceptaTerminos: true,
	})
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)
	sessionVieja := *reg.Token

	token := sender.tokenFromLastVerifyURL("rotasesion@example.com")
	verifyReq := httptest.NewRequest(http.MethodPost, "/auth/verificar-email", strings.NewReader(`{"token":"`+token+`"}`))
	verifyReq.Header.Set("Content-Type", "application/json")
	verifyReq.Header.Set("Authorization", "Bearer "+sessionVieja)
	verifyRec := httptest.NewRecorder()
	router.ServeHTTP(verifyRec, verifyReq)
	if verifyRec.Code != http.StatusOK {
		t.Fatalf("verificación falló: status=%d body=%s", verifyRec.Code, verifyRec.Body.String())
	}

	// La sesión vieja (emitida en el registro) ya no debería servir.
	meRec := doJSONAuth(t, router, http.MethodGet, "/me", sessionVieja, nil)
	if meRec.Code != http.StatusUnauthorized {
		t.Errorf("la sesión pre-verificación debería haber quedado revocada, status = %d", meRec.Code)
	}
}

// ---------------------------------------------------------------------
// Reenvío de verificación
// ---------------------------------------------------------------------

func TestReenviarVerificacion_MismaRespuestaExistaONoLaCuenta(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "reenviar@example.com", Password: "password123456", AceptaTerminos: true,
	})

	recExiste := doJSON(t, router, http.MethodPost, "/auth/reenviar-verificacion", reenviarVerificacionRequest{Email: "reenviar@example.com"})
	recNoExiste := doJSON(t, router, http.MethodPost, "/auth/reenviar-verificacion", reenviarVerificacionRequest{Email: "no-existe@example.com"})

	if recExiste.Code != recNoExiste.Code || recExiste.Body.String() != recNoExiste.Body.String() {
		t.Errorf("respuestas distintas: %d/%q vs %d/%q — filtra si la cuenta existe",
			recExiste.Code, recExiste.Body.String(), recNoExiste.Code, recNoExiste.Body.String())
	}
}

// ---------------------------------------------------------------------
// Recuperar / resetear contraseña
// ---------------------------------------------------------------------

func TestRecuperarPassword_MismoMensajeExistaONoElMail(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "recuperar@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "recuperar@example.com")

	recExiste := doJSON(t, router, http.MethodPost, "/auth/recuperar-password", recuperarPasswordRequest{Email: "recuperar@example.com"})
	recNoExiste := doJSON(t, router, http.MethodPost, "/auth/recuperar-password", recuperarPasswordRequest{Email: "no-existe@example.com"})

	var m1, m2 map[string]string
	_ = json.Unmarshal(recExiste.Body.Bytes(), &m1)
	_ = json.Unmarshal(recNoExiste.Body.Bytes(), &m2)
	if recExiste.Code != recNoExiste.Code || m1["mensaje"] != m2["mensaje"] {
		t.Error("la respuesta debería ser idéntica exista o no el mail (spec §7)")
	}
	if m1["mensaje"] != mensajeGenericoRecuperarPassword {
		t.Errorf("mensaje = %q, esperaba el texto exacto de la spec", m1["mensaje"])
	}
}

func TestResetPassword_ExitosoYCierraOtrasSesiones(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "reset@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "reset@example.com")
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)
	sesionVieja := *reg.Token

	doJSON(t, router, http.MethodPost, "/auth/recuperar-password", recuperarPasswordRequest{Email: "reset@example.com"})
	token := sender.tokenFromLastResetURL("reset@example.com")
	if token == "" {
		t.Fatal("no se capturó el token de reset")
	}

	rec := doJSON(t, router, http.MethodPost, "/auth/reset-password", resetPasswordRequest{Token: token, NewPassword: "nueva-password-larga"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var resp resetPasswordResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Token == "" {
		t.Error("esperaba un token de sesión nuevo")
	}

	// La sesión de antes del reset debería haber quedado revocada.
	meRec := doJSONAuth(t, router, http.MethodGet, "/me", sesionVieja, nil)
	if meRec.Code != http.StatusUnauthorized {
		t.Errorf("la sesión anterior al reset debería estar revocada, status = %d", meRec.Code)
	}

	// La contraseña nueva debería servir para loguearse.
	loginRec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{Email: "reset@example.com", Password: "nueva-password-larga"})
	if loginRec.Code != http.StatusOK {
		t.Errorf("login con la contraseña nueva: status = %d, esperaba %d", loginRec.Code, http.StatusOK)
	}
}

func TestResetPassword_TokenUsadoFalla(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "resetusado@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "resetusado@example.com")
	doJSON(t, router, http.MethodPost, "/auth/recuperar-password", recuperarPasswordRequest{Email: "resetusado@example.com"})
	token := sender.tokenFromLastResetURL("resetusado@example.com")

	primera := doJSON(t, router, http.MethodPost, "/auth/reset-password", resetPasswordRequest{Token: token, NewPassword: "nueva-password-larga"})
	if primera.Code != http.StatusOK {
		t.Fatalf("primer reset falló: status=%d body=%s", primera.Code, primera.Body.String())
	}
	segunda := doJSON(t, router, http.MethodPost, "/auth/reset-password", resetPasswordRequest{Token: token, NewPassword: "otra-password-larga"})
	if segunda.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d (token ya usado)", segunda.Code, http.StatusBadRequest)
	}
}

// ---------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------

func TestLogout_InvalidaLaSesion(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "logout@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "logout@example.com")
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	logoutRec := doJSONAuth(t, router, http.MethodPost, "/auth/logout", *reg.Token, nil)
	if logoutRec.Code != http.StatusOK {
		t.Fatalf("logout: status = %d, esperaba %d. body=%s", logoutRec.Code, http.StatusOK, logoutRec.Body.String())
	}

	meRec := doJSONAuth(t, router, http.MethodGet, "/me", *reg.Token, nil)
	if meRec.Code != http.StatusUnauthorized {
		t.Errorf("reusar la cookie tras logout: status = %d, esperaba %d", meRec.Code, http.StatusUnauthorized)
	}
}

func TestLogout_SinToken(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

// ---------------------------------------------------------------------
// Google OAuth
// ---------------------------------------------------------------------

func TestGoogle_CuentaNuevaQuedaVerificadaYPasaAPerfil(t *testing.T) {
	router, gdb := newTestRouterWithGoogle(t, fakeGoogleExchanger{sub: "google-sub-1", email: "google1@example.com", emailVerified: true})

	stateRec := doJSON(t, router, http.MethodGet, "/auth/google/state", nil)
	var stateResp googleStateResponse
	_ = json.Unmarshal(stateRec.Body.Bytes(), &stateResp)

	rec := doJSON(t, router, http.MethodPost, "/auth/google", googleRequest{Code: "un-code", State: stateResp.State})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var resp googleResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.OnboardingStep != db.OnboardingStepPerfil {
		t.Errorf("OnboardingStep = %q, esperaba %q (Google se considera verificado, pasa directo al paso 2)", resp.OnboardingStep, db.OnboardingStepPerfil)
	}

	var user db.User
	if err := gdb.Where("email = ?", "google1@example.com").First(&user).Error; err != nil {
		t.Fatalf("no se creó el usuario: %v", err)
	}
	if user.EmailVerifiedAt == nil {
		t.Error("EmailVerifiedAt debería quedar seteado")
	}
}

func TestGoogle_EmailNoVerificadoPorGoogleFalla(t *testing.T) {
	router, _ := newTestRouterWithGoogle(t, fakeGoogleExchanger{sub: "google-sub-2", email: "google2@example.com", emailVerified: false})

	stateRec := doJSON(t, router, http.MethodGet, "/auth/google/state", nil)
	var stateResp googleStateResponse
	_ = json.Unmarshal(stateRec.Body.Bytes(), &stateResp)

	rec := doJSON(t, router, http.MethodPost, "/auth/google", googleRequest{Code: "un-code", State: stateResp.State})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d (spec §7: no confiar en email_verified sin chequeo)", rec.Code, http.StatusBadRequest)
	}
}

func TestGoogle_StateInvalidoFalla(t *testing.T) {
	router, _ := newTestRouterWithGoogle(t, fakeGoogleExchanger{sub: "google-sub-3", email: "google3@example.com", emailVerified: true})

	rec := doJSON(t, router, http.MethodPost, "/auth/google", googleRequest{Code: "un-code", State: "state-falso"})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestGoogle_VinculaConCuentaNativaYaVerificada(t *testing.T) {
	router, gdb := newTestRouterWithGoogle(t, fakeGoogleExchanger{sub: "google-sub-4", email: "vincular@example.com", emailVerified: true})
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "vincular@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "vincular@example.com")

	stateRec := doJSON(t, router, http.MethodGet, "/auth/google/state", nil)
	var stateResp googleStateResponse
	_ = json.Unmarshal(stateRec.Body.Bytes(), &stateResp)

	rec := doJSON(t, router, http.MethodPost, "/auth/google", googleRequest{Code: "un-code", State: stateResp.State})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var count int64
	gdb.Model(&db.User{}).Where("email = ?", "vincular@example.com").Count(&count)
	if count != 1 {
		t.Errorf("count de Users con ese email = %d, esperaba 1 (un solo usuario con dos providers)", count)
	}
	var accountCount int64
	gdb.Model(&db.Account{}).Where("provider_account_id = ?", "google-sub-4").Count(&accountCount)
	if accountCount != 1 {
		t.Errorf("count de Accounts vinculadas = %d, esperaba 1", accountCount)
	}
}

func TestGoogle_NoVinculaConCuentaNativaSinVerificar(t *testing.T) {
	router, _ := newTestRouterWithGoogle(t, fakeGoogleExchanger{sub: "google-sub-5", email: "sinverificar2@example.com", emailVerified: true})
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "sinverificar2@example.com", Password: "password123456", AceptaTerminos: true,
	})

	stateRec := doJSON(t, router, http.MethodGet, "/auth/google/state", nil)
	var stateResp googleStateResponse
	_ = json.Unmarshal(stateRec.Body.Bytes(), &stateResp)

	rec := doJSON(t, router, http.MethodPost, "/auth/google", googleRequest{Code: "un-code", State: stateResp.State})
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d (no vincular sin verificar el mail nativo primero)", rec.Code, http.StatusConflict)
	}
}
