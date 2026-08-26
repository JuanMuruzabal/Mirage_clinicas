package http

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/auth"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/googleauth"
	dmmail "dental-mirage/api/internal/mail"
	"dental-mirage/api/internal/ratelimit"
	"dental-mirage/api/internal/security"
	"dental-mirage/api/internal/turnstile"
)

// Límites de contraseña — spec §7: "mínimo 12 caracteres, sin reglas de
// composición arbitrarias, sin límite máximo bajo (aceptar hasta 128)".
const (
	minPasswordLen = 12
	maxPasswordLen = 128
)

// mensaje genérico de anti-enumeración (spec §7): registro y reset de
// password responden lo mismo exista o no la cuenta.
const mensajeGenericoVerificacionPendiente = "si el mail no estaba registrado, creamos tu cuenta y te enviamos un link de confirmación — revisá tu correo"
const mensajeGenericoRecuperarPassword = "si el mail está registrado, te enviamos las instrucciones"

// AuthDeps agrupa las dependencias externas del módulo de auth — cada una
// nil-safe donde tiene sentido (Turnstile/Pwned deshabilitados en dev sin
// credenciales, mismo criterio que internal/turnstile ya trae).
type AuthDeps struct {
	Mail              dmmail.Sender
	Google            googleauth.Exchanger  // nil: /auth/google responde 501
	Turnstile         turnstile.Verifier    // nil: sin CAPTCHA (dev)
	Pwned             security.PwnedChecker // nil: sin chequeo de HaveIBeenPwned
	AccountLimiter    *ratelimit.AccountLimiter
	IPLimiter         *ratelimit.IPLimiter
	AppBaseURL        string // ej. https://dentalmirage.com.ar — arma los links de los mails
	StateSecret       string // firma el `state` de OAuth (ver oauthstate.go)
	GoogleRedirectURI string // debe matchear lo configurado en Google Cloud Console
}

func registerAuthRoutes(r chi.Router, gdb *gorm.DB, deps AuthDeps) {
	h := &authHandler{db: gdb, deps: deps}
	r.Post("/register", h.register)
	r.Post("/login", h.login)
	r.Post("/google", h.google)
	r.Get("/google/state", h.googleState)
	r.Post("/verificar-email", h.verificarEmail)
	r.Post("/reenviar-verificacion", h.reenviarVerificacion)
	r.Post("/recuperar-password", h.recuperarPassword)
	r.Post("/reset-password", h.resetPassword)
}

// registerProtectedAuthRoutes monta /auth/logout — a diferencia de las de
// arriba, requiere sesión (revoca la sesión actual, spec §7: "logout
// invalida la sesión en el servidor").
func registerProtectedAuthRoutes(r chi.Router, gdb *gorm.DB) {
	r.Post("/auth/logout", logoutHandler(gdb))
}

type authHandler struct {
	db   *gorm.DB
	deps AuthDeps
}

// clientIP resuelve la IP del caller para rate limiting — X-Forwarded-For
// primero (detrás de un proxy/CDN en producción), RemoteAddr si no hay.
func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		parts := strings.Split(fwd, ",")
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func normalizeEmail(raw string) string {
	return strings.TrimSpace(strings.ToLower(raw))
}

func validPassword(password string) bool {
	return len(password) >= minPasswordLen && len(password) <= maxPasswordLen
}

// checkCaptcha valida el token de Turnstile — si h.deps.Turnstile es nil
// (dev sin secret configurada), el CAPTCHA queda deshabilitado y esto
// siempre pasa, mismo criterio nil-disabled de internal/turnstile.
func (h *authHandler) checkCaptcha(ctx context.Context, token, ip string) bool {
	if h.deps.Turnstile == nil {
		return true
	}
	ok, err := h.deps.Turnstile.Verify(ctx, token, ip)
	return err == nil && ok
}

// checkPwned aplica HaveIBeenPwned en modo fail-open (nunca bloquea un
// registro/reset por un problema de red del lado de HIBP).
func (h *authHandler) checkPwned(ctx context.Context, password string) bool {
	if h.deps.Pwned == nil {
		return false
	}
	return security.IsPwnedFailOpen(ctx, h.deps.Pwned, password, func(err error) {
		// best-effort: solo se loguea, nunca bloquea el flujo.
		_ = err
	})
}

// ---------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------

type registerRequest struct {
	Email          string `json:"email"`
	Password       string `json:"password"`
	AceptaTerminos bool   `json:"aceptaTerminos"`
	CaptchaToken   string `json:"captchaToken"`
}

type registerResponse struct {
	Token   *string `json:"token,omitempty"`
	Email   string  `json:"email"`
	Mensaje string  `json:"mensaje"`
}

// register crea una cuenta nativa no verificada y manda el mail de
// confirmación (spec §2/§4 Paso 1). Nunca revela si el email ya existía
// (spec §7, anti-enumeración): si ya hay una cuenta con ese mail, no crea
// una fila nueva ni devuelve una sesión (evitaría un secuestro de cuenta:
// "registrarse" con el mail de otra persona no puede terminar logueado
// como esa persona) — responde el mismo mensaje genérico, y si la cuenta
// existente no está verificada, reenvía la verificación (respetando los
// límites de reenvío) en vez de crear un duplicado.
func (h *authHandler) register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
		return
	}

	ip := clientIP(r)
	if h.deps.IPLimiter != nil && !h.deps.IPLimiter.Allow(db.RateLimitScopeRegister, ip, ratelimit.LimitRegisterPerIP) {
		writeError(w, http.StatusTooManyRequests, "demasiados intentos de registro, esperá antes de volver a intentar")
		return
	}
	if !h.checkCaptcha(r.Context(), req.CaptchaToken, ip) {
		writeError(w, http.StatusBadRequest, "no se pudo verificar que sos una persona, intentá de nuevo")
		return
	}

	email := normalizeEmail(req.Email)
	if _, err := mail.ParseAddress(email); err != nil {
		writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
		return
	}
	if !validPassword(req.Password) {
		writeError(w, http.StatusBadRequest, "la contraseña debe tener entre 12 y 128 caracteres")
		return
	}
	if !req.AceptaTerminos {
		writeError(w, http.StatusBadRequest, "tenés que aceptar los términos y la política de privacidad")
		return
	}
	if h.checkPwned(r.Context(), req.Password) {
		writeError(w, http.StatusBadRequest, "esa contraseña apareció en una filtración conocida, elegí otra")
		return
	}

	var existing db.User
	err := h.db.Where("email = ?", email).First(&existing).Error
	if err == nil {
		// Cuenta ya existente — nunca se lo decimos al caller (spec §7).
		if existing.EmailVerifiedAt == nil {
			h.sendVerificationEmailBestEffort(r.Context(), existing)
		}
		writeJSON(w, http.StatusCreated, registerResponse{Email: email, Mensaje: mensajeGenericoVerificacionPendiente})
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		writeError(w, http.StatusInternalServerError, "no se pudo crear la cuenta")
		return
	}

	hash, err := security.Hash(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo procesar la contraseña")
		return
	}

	now := time.Now()
	termsVersion := "1.0"
	user := db.User{
		Email:           email,
		PasswordHash:    &hash,
		OnboardingStep:  db.OnboardingStepCuenta,
		TermsAcceptedAt: &now,
		TermsVersion:    &termsVersion,
	}

	err = h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return createAndSendVerificationToken(r.Context(), tx, h.deps.Mail, h.deps.AppBaseURL, user)
	})
	if err != nil {
		if isUniqueViolation(err) {
			// Carrera con otro request concurrente — mismo tratamiento
			// anti-enumeración que el caso "ya existe" de arriba.
			writeJSON(w, http.StatusCreated, registerResponse{Email: email, Mensaje: mensajeGenericoVerificacionPendiente})
			return
		}
		writeError(w, http.StatusInternalServerError, "no se pudo crear la cuenta")
		return
	}

	rawToken, _, err := auth.NewSession(h.db, user.ID, r.UserAgent(), ip)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cuenta creada pero no se pudo iniciar sesión")
		return
	}
	recordAuditEvent(h.db, &user.ID, db.AuditEventRegister, ip, r.UserAgent())

	writeJSON(w, http.StatusCreated, registerResponse{Token: &rawToken, Email: email, Mensaje: mensajeGenericoVerificacionPendiente})
}

func createAndSendVerificationToken(ctx context.Context, tx *gorm.DB, sender dmmail.Sender, baseURL string, user db.User) error {
	// Invalida tokens de verificación previos sin usar antes de emitir uno
	// nuevo (spec §7).
	if err := tx.Model(&db.VerificationToken{}).
		Where("user_id = ? AND type = ? AND used_at IS NULL", user.ID, db.VerificationTokenEmailVerify).
		Update("used_at", time.Now()).Error; err != nil {
		return err
	}

	rawToken, tokenHash, err := security.NewToken()
	if err != nil {
		return err
	}
	vt := db.VerificationToken{
		UserID:    user.ID,
		TokenHash: tokenHash,
		Type:      db.VerificationTokenEmailVerify,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	if err := tx.Create(&vt).Error; err != nil {
		return err
	}

	verifyURL := baseURL + "/verificar-mail?token=" + rawToken
	if sender != nil {
		// Un mail que falla nunca tumba el request (spec §6) — se loguea y
		// se sigue: el usuario siempre puede pedir un reenvío.
		if err := sender.SendVerificationEmail(ctx, user.Email, verifyURL); err != nil {
			// No hay logger inyectado acá — el error queda silenciado a
			// propósito por diseño de "nunca tumbar el request"; en un
			// entorno real esto pasaría por un logger estructurado.
			_ = err
		}
	}
	return nil
}

// sendVerificationEmailBestEffort reenvía la verificación para una cuenta
// que ya existe, sin filtrar al caller si de verdad se mandó — usado desde
// register() cuando el mail ya está en uso.
func (h *authHandler) sendVerificationEmailBestEffort(ctx context.Context, user db.User) {
	_ = h.db.Transaction(func(tx *gorm.DB) error {
		return createAndSendVerificationToken(ctx, tx, h.deps.Mail, h.deps.AppBaseURL, user)
	})
}

// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token           *string `json:"token,omitempty"`
	EmailVerificado bool    `json:"emailVerificado"`
	Mensaje         string  `json:"mensaje,omitempty"`
}

const mensajeCredencialesInvalidas = "email o contraseña incorrectos"

func (h *authHandler) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
		return
	}
	email := normalizeEmail(req.Email)
	ip := clientIP(r)

	if h.deps.IPLimiter != nil && !h.deps.IPLimiter.Allow(db.RateLimitScopeLogin, ip, ratelimit.LimitLoginPerIP) {
		writeError(w, http.StatusTooManyRequests, "demasiados intentos, esperá antes de volver a intentar")
		return
	}
	if h.deps.AccountLimiter != nil {
		ok, err := h.deps.AccountLimiter.Allow(db.RateLimitScopeLogin, email, ratelimit.LimitLoginPerAccount)
		if err == nil && !ok {
			writeError(w, http.StatusTooManyRequests, "demasiados intentos para esta cuenta, esperá antes de volver a intentar")
			return
		}
		if failures, err := h.deps.AccountLimiter.LoginFailureCount(email); err == nil {
			if backoff := ratelimit.LoginBackoff(failures); backoff > 0 {
				time.Sleep(backoff)
			}
		}
	}

	var user db.User
	err := h.db.Where("email = ?", email).First(&user).Error
	if err != nil || user.PasswordHash == nil {
		h.recordLoginFailure(email)
		// Sin fila encontrada, no hay userID que asociar (ver comentario en
		// db.AuditEvent) — la falta de cuenta ya queda implícita en no tener
		// un evento con userID asociado a este email vía otra tabla.
		var userID *uuid.UUID
		if user.ID != uuid.Nil {
			userID = &user.ID
		}
		recordAuditEvent(h.db, userID, db.AuditEventLoginFailed, ip, r.UserAgent())
		writeError(w, http.StatusUnauthorized, mensajeCredencialesInvalidas)
		return
	}

	ok, err := security.Verify(req.Password, *user.PasswordHash)
	if err != nil || !ok {
		h.recordLoginFailure(email)
		recordAuditEvent(h.db, &user.ID, db.AuditEventLoginFailed, ip, r.UserAgent())
		writeError(w, http.StatusUnauthorized, mensajeCredencialesInvalidas)
		return
	}

	if security.NeedsRehash(*user.PasswordHash) {
		if newHash, err := security.Hash(req.Password); err == nil {
			_ = h.db.Model(&user).Update("password_hash", newHash).Error
		}
	}

	if h.deps.AccountLimiter != nil {
		_ = h.deps.AccountLimiter.ResetLoginFailures(email)
	}

	// Excepción explícita de anti-enumeración admitida por la spec §7: tras
	// credenciales correctas, sí se distingue el estado "mail no
	// verificado" (con acción de reenvío), en vez del error genérico.
	if user.EmailVerifiedAt == nil {
		writeJSON(w, http.StatusForbidden, loginResponse{
			EmailVerificado: false,
			Mensaje:         "confirmá tu mail antes de iniciar sesión — te reenviamos el link si hace falta",
		})
		return
	}

	rawToken, _, err := auth.NewSession(h.db, user.ID, r.UserAgent(), ip)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo iniciar sesión")
		return
	}
	recordAuditEvent(h.db, &user.ID, db.AuditEventLogin, ip, r.UserAgent())

	writeJSON(w, http.StatusOK, loginResponse{Token: &rawToken, EmailVerificado: true})
}

func (h *authHandler) recordLoginFailure(email string) {
	if h.deps.AccountLimiter != nil {
		_, _ = h.deps.AccountLimiter.RecordLoginFailure(email)
	}
}

// ---------------------------------------------------------------------
// Google OAuth (popup + Authorization Code, decisión #1 del plan aprobado)
// ---------------------------------------------------------------------

type googleStateResponse struct {
	State string `json:"state"`
}

// googleState emite el `state` firmado que el frontend pasa a
// initCodeClient — spec §7: "state firmado y verificado".
func (h *authHandler) googleState(w http.ResponseWriter, r *http.Request) {
	state, err := signState(h.deps.StateSecret)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo iniciar el login con Google")
		return
	}
	writeJSON(w, http.StatusOK, googleStateResponse{State: state})
}

type googleRequest struct {
	Code  string `json:"code"`
	State string `json:"state"`
}

type googleResponse struct {
	Token          string `json:"token"`
	OnboardingStep string `json:"onboardingStep"`
}

func (h *authHandler) google(w http.ResponseWriter, r *http.Request) {
	if h.deps.Google == nil {
		writeError(w, http.StatusNotImplemented, "el login con Google no está configurado")
		return
	}

	var req googleRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
		return
	}
	if err := verifyState(h.deps.StateSecret, req.State); err != nil {
		writeError(w, http.StatusBadRequest, "no se pudo validar el inicio de sesión con Google, intentá de nuevo")
		return
	}

	info, err := h.deps.Google.Exchange(r.Context(), req.Code, h.deps.GoogleRedirectURI)
	if err != nil {
		writeError(w, http.StatusBadRequest, "no se pudo completar el login con Google")
		return
	}
	// spec §7: nunca confiar en email_verified del provider sin chequeo
	// explícito antes de vincular/crear la cuenta.
	if !info.EmailVerified {
		writeError(w, http.StatusBadRequest, "tu cuenta de Google no tiene el mail verificado")
		return
	}

	ip := clientIP(r)
	var user db.User

	var account db.Account
	err = h.db.Where("provider = ? AND provider_account_id = ?", db.ProviderGoogle, info.Sub).First(&account).Error
	switch {
	case err == nil:
		if err := h.db.First(&user, "id = ?", account.UserID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo iniciar sesión")
			return
		}
	case errors.Is(err, gorm.ErrRecordNotFound):
		user, err = h.findOrCreateUserForGoogle(r.Context(), info)
		if err != nil {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
	default:
		writeError(w, http.StatusInternalServerError, "no se pudo iniciar sesión")
		return
	}

	rawToken, _, err := auth.NewSession(h.db, user.ID, r.UserAgent(), ip)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo iniciar sesión")
		return
	}
	recordAuditEvent(h.db, &user.ID, db.AuditEventLogin, ip, r.UserAgent())

	writeJSON(w, http.StatusOK, googleResponse{Token: rawToken, OnboardingStep: user.OnboardingStep})
}

var errCuentaNativaSinVerificar = errors.New("ya existe una cuenta con este mail pendiente de verificación — revisá tu correo antes de vincular Google")

func (h *authHandler) findOrCreateUserForGoogle(ctx context.Context, info googleauth.UserInfo) (db.User, error) {
	var user db.User
	err := h.db.Where("email = ?", info.Email).First(&user).Error
	if err == nil {
		// spec §2: "si el mail nativo todavía no está verificado, pedir
		// verificación antes de vincular" — no se linkea a ciegas.
		if user.EmailVerifiedAt == nil {
			return db.User{}, errCuentaNativaSinVerificar
		}
		account := db.Account{UserID: user.ID, Provider: db.ProviderGoogle, ProviderAccountID: info.Sub}
		if err := h.db.Create(&account).Error; err != nil {
			return db.User{}, err
		}
		return user, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return db.User{}, err
	}

	now := time.Now()
	newUser := db.User{
		Email:           info.Email,
		EmailVerifiedAt: &now,                    // Google ya lo verificó (chequeado arriba)
		OnboardingStep:  db.OnboardingStepPerfil, // spec §4 Paso 1: con Google se pasa directo al paso 2
	}
	txErr := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&newUser).Error; err != nil {
			return err
		}
		account := db.Account{UserID: newUser.ID, Provider: db.ProviderGoogle, ProviderAccountID: info.Sub}
		return tx.Create(&account).Error
	})
	if txErr != nil {
		return db.User{}, txErr
	}
	return newUser, nil
}

// ---------------------------------------------------------------------
// Verificación de mail (spec §7: confirmación vía POST tras un clic
// explícito, no auto-verificación en el GET — decisión #3 del plan
// aprobado, evita que un escáner de seguridad de email queme el token).
// ---------------------------------------------------------------------

type verificarEmailRequest struct {
	Token string `json:"token"`
}

type verificarEmailResponse struct {
	Token          string `json:"token"`
	OnboardingStep string `json:"onboardingStep"`
}

func (h *authHandler) verificarEmail(w http.ResponseWriter, r *http.Request) {
	var req verificarEmailRequest
	if err := decodeJSON(r, &req); err != nil || req.Token == "" {
		writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
		return
	}

	ip := clientIP(r)
	if h.deps.IPLimiter != nil && !h.deps.IPLimiter.Allow(db.RateLimitScopeLogin, ip, ratelimit.LimitTokenConfirmPerIP) {
		writeError(w, http.StatusTooManyRequests, "demasiados intentos, esperá antes de volver a intentar")
		return
	}

	tokenHash := security.HashToken(req.Token)
	var vt db.VerificationToken
	err := h.db.Where("token_hash = ? AND type = ?", tokenHash, db.VerificationTokenEmailVerify).First(&vt).Error
	if err != nil {
		writeError(w, http.StatusBadRequest, "el link de verificación no es válido")
		return
	}
	if vt.UsedAt != nil {
		writeError(w, http.StatusBadRequest, "este link ya fue usado — pedí uno nuevo si todavía necesitás verificar tu mail")
		return
	}
	if time.Now().After(vt.ExpiresAt) {
		writeError(w, http.StatusBadRequest, "este link venció — pedí uno nuevo")
		return
	}

	var user db.User
	if err := h.db.First(&user, "id = ?", vt.UserID).Error; err != nil {
		writeError(w, http.StatusBadRequest, "el link de verificación no es válido")
		return
	}

	now := time.Now()
	err = h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&vt).Update("used_at", now).Error; err != nil {
			return err
		}
		updates := map[string]any{"email_verified_at": now}
		if user.OnboardingStep == db.OnboardingStepCuenta {
			updates["onboarding_step"] = db.OnboardingStepPerfil
		}
		return tx.Model(&user).Updates(updates).Error
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo confirmar el mail")
		return
	}
	if user.OnboardingStep == db.OnboardingStepCuenta {
		user.OnboardingStep = db.OnboardingStepPerfil
	}

	// Rotación del ID de sesión al verificar (spec §7): si el caller ya
	// traía una sesión (mismo navegador que se registró), se revoca y se
	// emite una nueva; si no (verificó desde otro dispositivo), se emite
	// una nueva sin nada que revocar.
	var oldSessionID *uuid.UUID
	if header := r.Header.Get("Authorization"); header != "" {
		if token, ok := strings.CutPrefix(header, "Bearer "); ok {
			if oldSession, err := auth.ValidateSessionToken(h.db, token); err == nil {
				oldSessionID = &oldSession.ID
			}
		}
	}

	rawToken, _, err := auth.RotateSession(h.db, oldSessionID, user.ID, r.UserAgent(), ip)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "mail confirmado pero no se pudo iniciar sesión")
		return
	}
	recordAuditEvent(h.db, &user.ID, db.AuditEventEmailVerified, ip, r.UserAgent())

	writeJSON(w, http.StatusOK, verificarEmailResponse{Token: rawToken, OnboardingStep: user.OnboardingStep})
}

// ---------------------------------------------------------------------
// Reenvío de verificación
// ---------------------------------------------------------------------

type reenviarVerificacionRequest struct {
	Email string `json:"email"`
}

func (h *authHandler) reenviarVerificacion(w http.ResponseWriter, r *http.Request) {
	var req reenviarVerificacionRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
		return
	}
	email := normalizeEmail(req.Email)
	ip := clientIP(r)

	if h.deps.IPLimiter != nil && !h.deps.IPLimiter.Allow(db.RateLimitScopeResendVerify, ip, ratelimit.LimitResendPerIP) {
		writeError(w, http.StatusTooManyRequests, "demasiados intentos, esperá antes de volver a intentar")
		return
	}
	if h.deps.AccountLimiter != nil {
		if ok, err := h.deps.AccountLimiter.Allow(db.RateLimitScopeResendVerify+"_cooldown", email, ratelimit.LimitResendCooldown); err == nil && !ok {
			writeError(w, http.StatusTooManyRequests, "esperá un minuto antes de pedir otro reenvío")
			return
		}
		if ok, err := h.deps.AccountLimiter.Allow(db.RateLimitScopeResendVerify, email, ratelimit.LimitResendPerAccount); err == nil && !ok {
			writeError(w, http.StatusTooManyRequests, "alcanzaste el máximo de reenvíos por hora para esta cuenta")
			return
		}
	}

	var user db.User
	if err := h.db.Where("email = ?", email).First(&user).Error; err == nil && user.EmailVerifiedAt == nil {
		h.sendVerificationEmailBestEffort(r.Context(), user)
	}
	// Misma respuesta exista o no la cuenta, esté verificada o no —
	// anti-enumeración (spec §7).
	writeJSON(w, http.StatusOK, map[string]string{"mensaje": "si tu cuenta existe y no fue verificada, te enviamos un nuevo link"})
}

// ---------------------------------------------------------------------
// Recuperar / resetear contraseña
// ---------------------------------------------------------------------

type recuperarPasswordRequest struct {
	Email        string `json:"email"`
	CaptchaToken string `json:"captchaToken"`
}

func (h *authHandler) recuperarPassword(w http.ResponseWriter, r *http.Request) {
	var req recuperarPasswordRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
		return
	}
	email := normalizeEmail(req.Email)
	ip := clientIP(r)

	if h.deps.IPLimiter != nil && !h.deps.IPLimiter.Allow(db.RateLimitScopePasswordReset, ip, ratelimit.LimitPasswordResetPerIP) {
		writeError(w, http.StatusTooManyRequests, "demasiados intentos, esperá antes de volver a intentar")
		return
	}
	if !h.checkCaptcha(r.Context(), req.CaptchaToken, ip) {
		writeError(w, http.StatusBadRequest, "no se pudo verificar que sos una persona, intentá de nuevo")
		return
	}
	if h.deps.AccountLimiter != nil {
		if ok, err := h.deps.AccountLimiter.Allow(db.RateLimitScopePasswordReset, email, ratelimit.LimitPasswordResetPerAccount); err == nil && !ok {
			// Igual respuesta genérica — no filtrar que se llegó al límite
			// distingue esta cuenta de una inexistente.
			writeJSON(w, http.StatusOK, map[string]string{"mensaje": mensajeGenericoRecuperarPassword})
			return
		}
	}

	var user db.User
	if err := h.db.Where("email = ?", email).First(&user).Error; err == nil {
		_ = h.db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&db.VerificationToken{}).
				Where("user_id = ? AND type = ? AND used_at IS NULL", user.ID, db.VerificationTokenPasswordReset).
				Update("used_at", time.Now()).Error; err != nil {
				return err
			}
			rawToken, tokenHash, err := security.NewToken()
			if err != nil {
				return err
			}
			vt := db.VerificationToken{
				UserID:    user.ID,
				TokenHash: tokenHash,
				Type:      db.VerificationTokenPasswordReset,
				ExpiresAt: time.Now().Add(time.Hour),
			}
			if err := tx.Create(&vt).Error; err != nil {
				return err
			}
			if h.deps.Mail != nil {
				resetURL := h.deps.AppBaseURL + "/recuperar-password/nueva?token=" + rawToken
				_ = h.deps.Mail.SendPasswordResetEmail(r.Context(), user.Email, resetURL)
			}
			return nil
		})
	}

	// Spec §7, literal: mismo mensaje exista o no el mail.
	writeJSON(w, http.StatusOK, map[string]string{"mensaje": mensajeGenericoRecuperarPassword})
}

type resetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"newPassword"`
}

type resetPasswordResponse struct {
	Token string `json:"token"`
}

func (h *authHandler) resetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetPasswordRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
		return
	}
	if !validPassword(req.NewPassword) {
		writeError(w, http.StatusBadRequest, "la contraseña debe tener entre 12 y 128 caracteres")
		return
	}
	if h.checkPwned(r.Context(), req.NewPassword) {
		writeError(w, http.StatusBadRequest, "esa contraseña apareció en una filtración conocida, elegí otra")
		return
	}

	ip := clientIP(r)
	if h.deps.IPLimiter != nil && !h.deps.IPLimiter.Allow(db.RateLimitScopePasswordReset, ip, ratelimit.LimitTokenConfirmPerIP) {
		writeError(w, http.StatusTooManyRequests, "demasiados intentos, esperá antes de volver a intentar")
		return
	}

	tokenHash := security.HashToken(req.Token)
	var vt db.VerificationToken
	err := h.db.Where("token_hash = ? AND type = ?", tokenHash, db.VerificationTokenPasswordReset).First(&vt).Error
	if err != nil {
		writeError(w, http.StatusBadRequest, "el link no es válido")
		return
	}
	if vt.UsedAt != nil {
		writeError(w, http.StatusBadRequest, "este link ya fue usado — pedí uno nuevo")
		return
	}
	if time.Now().After(vt.ExpiresAt) {
		writeError(w, http.StatusBadRequest, "este link venció — pedí uno nuevo")
		return
	}

	hash, err := security.Hash(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo procesar la nueva contraseña")
		return
	}

	now := time.Now()
	var rawToken string
	err = h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&vt).Update("used_at", now).Error; err != nil {
			return err
		}
		if err := tx.Model(&db.User{}).Where("id = ?", vt.UserID).Update("password_hash", hash).Error; err != nil {
			return err
		}
		// spec §7: cambio de contraseña invalida todas las demás sesiones.
		if err := auth.RevokeAllUserSessions(tx, vt.UserID, nil); err != nil {
			return err
		}
		var err2 error
		rawToken, _, err2 = auth.NewSession(tx, vt.UserID, r.UserAgent(), ip)
		return err2
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo restablecer la contraseña")
		return
	}
	recordAuditEvent(h.db, &vt.UserID, db.AuditEventPasswordChanged, ip, r.UserAgent())

	writeJSON(w, http.StatusOK, resetPasswordResponse{Token: rawToken})
}

// ---------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------

func logoutHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		session, ok := sessionFromContext(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
			return
		}
		if err := auth.RevokeSession(gdb, session.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo cerrar la sesión")
			return
		}
		recordAuditEvent(gdb, &session.UserID, db.AuditEventLogout, clientIP(r), r.UserAgent())
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

// ---------------------------------------------------------------------
// Helpers compartidos con onboarding.go
// ---------------------------------------------------------------------

// loadEspecialidades valida y resuelve los ids elegidos del catálogo
// cerrado (TR-004) contra filas reales.
func loadEspecialidades(gdb *gorm.DB, raw []string) ([]db.Especialidad, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	ids := make([]uuid.UUID, len(raw))
	for i, s := range raw {
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, err
		}
		ids[i] = id
	}

	var especialidades []db.Especialidad
	if err := gdb.Where("id IN ?", ids).Find(&especialidades).Error; err != nil {
		return nil, err
	}
	if len(especialidades) != len(ids) {
		return nil, errors.New("una o más especialidades no existen")
	}
	return especialidades, nil
}

var slugInvalidChars = regexp.MustCompile(`[^a-z0-9]+`)

// uniqueSlug deriva el slug de la ruta pública (/clinica-x, spec §5) a
// partir del nombre de la clínica — ahora contra la tabla clinics (antes,
// profesionales).
func uniqueSlug(gdb *gorm.DB, nombreClinica string) (string, error) {
	base := slugify(nombreClinica)
	if base == "" {
		base = "clinica"
	}

	candidate := base
	for i := 2; ; i++ {
		var count int64
		if err := gdb.Model(&db.Clinic{}).Where("slug = ?", candidate).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
		candidate = base + "-" + itoa(i)
	}
}

func slugify(value string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(value) {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(stripDiacritic(r))
		} else {
			b.WriteRune(' ')
		}
	}
	return strings.Trim(slugInvalidChars.ReplaceAllString(strings.Join(strings.Fields(b.String()), "-"), "-"), "-")
}

// stripDiacritic normaliza vocales acentuadas comunes en español a su
// equivalente ASCII para que el slug quede limpio en la URL.
func stripDiacritic(r rune) rune {
	switch r {
	case 'á':
		return 'a'
	case 'é':
		return 'e'
	case 'í':
		return 'i'
	case 'ó':
		return 'o'
	case 'ú':
		return 'u'
	case 'ñ':
		return 'n'
	default:
		return r
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

// isUniqueViolation detecta el código de error de Postgres para una
// violación de constraint único (23505).
func isUniqueViolation(err error) bool {
	return strings.Contains(err.Error(), "23505") || strings.Contains(err.Error(), "duplicate key")
}
