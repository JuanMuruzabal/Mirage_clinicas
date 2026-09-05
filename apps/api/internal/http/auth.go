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

// verificationCodeTTL — vencimiento del código de 6 dígitos que se manda
// por mail al registrarse (TR-055 en docs/tradeoffs.md: reemplaza al link
// de un solo clic, spec §7 original de "24 h verificación"). Bastante más
// corto que el link que reemplaza — es el criterio estándar para un
// código que la persona escribe a mano mientras sigue mirando la pantalla
// donde se registró, no algo pensado para abrir "más tarde".
const verificationCodeTTL = 15 * time.Minute

// CuentaAbandonadaTTL — umbral de "cuenta nativa sin verificar, dada por
// abandonada" en meHandler (TR-052 en docs/tradeoffs.md) y en el barrido
// activo de internal/db.PurgeAuthGarbage (TR-063, wireado desde
// cmd/api/main.go — de ahí que esté exportada). Deliberadamente más largo
// que verificationCodeTTL: un código vencido a los 15 minutos no
// significa que la persona abandonó el registro (puede pedir uno nuevo
// con "reenviar" y seguir en la misma sesión) — recién a las 24 horas sin
// verificar se considera abandonada de verdad y se libera el mail para
// un alta nueva.
const CuentaAbandonadaTTL = 24 * time.Hour

// mensaje genérico de anti-enumeración (spec §7): registro y reset de
// password responden lo mismo exista o no la cuenta.
const mensajeGenericoVerificacionPendiente = "si el mail no estaba registrado, creamos tu cuenta y te enviamos un código de confirmación — revisá tu correo"
const mensajeGenericoRecuperarPassword = "si el mail está registrado, te enviamos las instrucciones"

// mensajeCuentaYaExiste — TR-062 en docs/tradeoffs.md: a diferencia del
// resto de los mensajes de esta sección, este SÍ revela que la cuenta
// existe (pedido explícito del cliente, revierte parcialmente el
// anti-enumeración de la spec §7 solo para register() con una cuenta ya
// VERIFICADA — login/reset-password no cambian).
const mensajeCuentaYaExiste = "ese mail ya tiene una cuenta — iniciá sesión o recuperá tu contraseña si la olvidaste"

// mensajeCuentaCreadaAutoVerificada — respuesta cuando AuthDeps.AutoVerifyEmail
// está activo (TR-051 en docs/tradeoffs.md): no hay verificación pendiente
// que "revisar", así que no tiene sentido decir que se mandó un mail.
const mensajeCuentaCreadaAutoVerificada = "cuenta creada"

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
	// AutoVerifyEmail: true cuando no hay un proveedor de mail real
	// configurado (RESEND_API_KEY vacía, cmd/api/main.go) — sin forma de
	// que el usuario reciba el link de verificación, una cuenta nativa
	// nueva queda marcada como verificada de entrada, en vez de dejarla
	// bloqueada esperando un mail que nunca va a llegar (pedido explícito
	// del cliente, 2026-08-26, mientras no esté configurado Resend en
	// Render — ver TR-051 en docs/tradeoffs.md). Se apaga solo apenas se
	// cargue RESEND_API_KEY: no hace falta acordarse de revertir un flag
	// aparte. No afecta Google (ya llega verificado por el provider) ni
	// borra el flujo de verificación — solo lo salta para cuentas nuevas.
	AutoVerifyEmail bool
	// ExponerCodigoVerificacion — mismo criterio/señal que AutoVerifyEmail
	// (RESEND_API_KEY vacía = sin proveedor de mail real, cmd/api/main.go):
	// sin esto, ver el código de "Confirmanos que sos vos" del wizard
	// público en local exige mirar los logs del backend (LogSender).
	// Pedido del cliente para trabajar más cómodo en local — cuando está
	// prendido, enviarVerificacionTurnoPublicoHandler devuelve el código
	// en texto plano en la respuesta (CodigoDev) y el wizard lo muestra
	// debajo del campo. Se apaga solo apenas se cargue RESEND_API_KEY —
	// nunca puede quedar prendido en producción por accidente.
	ExponerCodigoVerificacion bool
	// SimularBloqueosSeguridad — corrección de seguridad (Fase 2.4.1),
	// mismo criterio/señal que ExponerCodigoVerificacion de arriba (sin
	// RESEND_API_KEY, es decir, en local): pedido textual del cliente,
	// "estoy probando en localhost, no bloquearme realmente, sino
	// decirme que debería estar bloqueado, así voy probando que
	// funcionan realmente". Con esto prendido, los detectores de abuso
	// del formulario público (turno_publico.go: tope DNI+tipo, mail con
	// muchos DNIs, rotación por IP) NUNCA bloquean mail/IP ni borran
	// turnos de verdad — el pedido sigue su curso normal, y lo único que
	// pasa es que queda una fila en la auditoría (Simulado=true, visible
	// en /panel/seguridad) diciendo qué se habría bloqueado. Se apaga
	// solo apenas se cargue RESEND_API_KEY, igual que
	// ExponerCodigoVerificacion — nunca puede quedar prendido en
	// producción por accidente.
	SimularBloqueosSeguridad bool
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
	return checkCaptchaToken(ctx, h.deps.Turnstile, token, ip)
}

// checkCaptchaToken — misma validación de arriba, extraída a función de
// paquete (corrección de seguridad, Fase 2.4.1: el formulario público de
// turnos no tenía NINGÚN CAPTCHA — un atacante podía automatizar el
// llenado del calendario con DNIs/mails inventados sin más costo que el
// rate limit por IP/cuenta, fácil de esquivar rotando ambos. Mismo
// Turnstile que ya protege registro/reset de contraseña, reusado acá —
// ver enviarVerificacionTurnoPublicoHandler en verificacion_turno_publico.go)
// para no atarla a un *authHandler que ese handler no tiene.
func checkCaptchaToken(ctx context.Context, verifier turnstile.Verifier, token, ip string) bool {
	if verifier == nil {
		return true
	}
	ok, err := verifier.Verify(ctx, token, ip)
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
	// EmailVerificado/OnboardingStep: reflejan la cuenta recién creada
	// (AutoVerifyEmail, ver AuthDeps) — en los caminos de anti-enumeración
	// (mail ya existente sin verificar) quedan en su valor por defecto
	// (false/""), nunca el estado real de la cuenta existente, para no
	// abrir un distinguidor nuevo (spec §7).
	EmailVerificado bool   `json:"emailVerificado"`
	OnboardingStep  string `json:"onboardingStep,omitempty"`
	// CuentaExistente — TR-062 en docs/tradeoffs.md: true únicamente
	// cuando el mail ya tiene una cuenta VERIFICADA (el único caso donde
	// se decide revelarlo, a propósito). El frontend lo usa para mostrar
	// "iniciá sesión"/"recuperar contraseña" en vez de avanzar al paso de
	// código.
	CuentaExistente bool `json:"cuentaExistente,omitempty"`
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

	hash, err := security.Hash(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo procesar la contraseña")
		return
	}

	var existing db.User
	lookupErr := h.db.Where("email = ?", email).First(&existing).Error
	nueva := errors.Is(lookupErr, gorm.ErrRecordNotFound)
	if !nueva && lookupErr != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo crear la cuenta")
		return
	}
	if !nueva && existing.EmailVerifiedAt != nil {
		// TR-062 en docs/tradeoffs.md: revierte parcialmente el
		// anti-enumeración de la spec §7 — pedido explícito del cliente
		// (2026-08-26): acá SÍ se dice que la cuenta ya existe, en vez de
		// mandar siempre al paso de código (generaba confusión real, "no
		// es el estándar"). El "secreto" que protegía esto es débil para
		// este producto puntual (los profesionales ya tienen presencia
		// pública a propósito, página propia + buscador) y CAPTCHA
		// todavía no está configurado en producción, así que la
		// protección real que quedaba era mínima. Nunca se sobreescribe
		// nada ni se emite token — solo cambia el mensaje.
		writeJSON(w, http.StatusCreated, registerResponse{Email: email, Mensaje: mensajeCuentaYaExiste, CuentaExistente: true})
		return
	}

	now := time.Now()
	termsVersion := "1.0"
	user := existing
	if nueva {
		user = db.User{Email: email, OnboardingStep: db.OnboardingStepCuenta}
	}
	// TR-056 en docs/tradeoffs.md: una cuenta existente pero SIN VERIFICAR
	// se sobreescribe en vez de tratarse como "ya existe" — pedido
	// explícito del cliente: "si me confundí de mail" o "quiero volver a
	// intentar con otra contraseña" no puede terminar en un softlock. Es
	// seguro porque ningún dato de perfil/clínica puede existir todavía
	// para una cuenta sin verificar (esos pasos exigen mail verificado,
	// ver requireOnboardingComplete/updateOnboardingPerfilHandler) — no
	// hay nada que "perder" al pisar la fila. La respuesta es indistinguible
	// de un alta nueva en cualquier caso (mismo Mensaje/forma), así que
	// tampoco revela si el mail ya existía.
	user.PasswordHash = &hash
	user.TermsAcceptedAt = &now
	user.TermsVersion = &termsVersion
	if h.deps.AutoVerifyEmail {
		user.EmailVerifiedAt = &now
		user.OnboardingStep = db.OnboardingStepPerfil
	}

	err = h.db.Transaction(func(tx *gorm.DB) error {
		if nueva {
			if err := tx.Create(&user).Error; err != nil {
				return err
			}
		} else if err := tx.Save(&user).Error; err != nil {
			return err
		}
		if h.deps.AutoVerifyEmail {
			return nil
		}
		return createAndSendVerificationToken(r.Context(), tx, h.deps.Mail, user)
	})
	if err != nil {
		if isUniqueViolation(err) {
			// Carrera con otro request concurrente — mismo tratamiento
			// anti-enumeración que el resto de esta función.
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

	mensaje := mensajeGenericoVerificacionPendiente
	if h.deps.AutoVerifyEmail {
		mensaje = mensajeCuentaCreadaAutoVerificada
	}
	writeJSON(w, http.StatusCreated, registerResponse{
		Token: &rawToken, Email: email, Mensaje: mensaje,
		EmailVerificado: user.EmailVerifiedAt != nil, OnboardingStep: user.OnboardingStep,
	})
}

// createAndSendVerificationToken genera el código de 6 dígitos (TR-055 en
// docs/tradeoffs.md) y lo manda por mail — ya no arma un link, así que no
// necesita la AppBaseURL que sí siguen usando los mails de reset de
// password.
func createAndSendVerificationToken(ctx context.Context, tx *gorm.DB, sender dmmail.Sender, user db.User) error {
	// Invalida tokens de verificación previos sin usar antes de emitir uno
	// nuevo (spec §7).
	if err := tx.Model(&db.VerificationToken{}).
		Where("user_id = ? AND type = ? AND used_at IS NULL", user.ID, db.VerificationTokenEmailVerify).
		Update("used_at", time.Now()).Error; err != nil {
		return err
	}

	code, codeHash, err := security.NewNumericCode(6)
	if err != nil {
		return err
	}
	vt := db.VerificationToken{
		UserID:    user.ID,
		TokenHash: codeHash,
		Type:      db.VerificationTokenEmailVerify,
		ExpiresAt: time.Now().Add(verificationCodeTTL),
	}
	if err := tx.Create(&vt).Error; err != nil {
		return err
	}

	if sender != nil {
		// Un mail que falla nunca tumba el request (spec §6) — se loguea y
		// se sigue: el usuario siempre puede pedir un reenvío.
		if err := sender.SendVerificationEmail(ctx, user.Email, code); err != nil {
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
		return createAndSendVerificationToken(ctx, tx, h.deps.Mail, user)
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
	Email  string `json:"email"`
	Codigo string `json:"codigo"`
}

type verificarEmailResponse struct {
	Token          string `json:"token"`
	OnboardingStep string `json:"onboardingStep"`
}

// mensajeCodigoInvalido — misma respuesta para "el mail no existe", "el
// código no corresponde a ese mail" y "el código ya se usó/no existe más"
// (spec §7, anti-enumeración): nunca hay que poder distinguir cuál de los
// tres pasó a partir de la respuesta.
const mensajeCodigoInvalido = "código incorrecto o vencido"

func (h *authHandler) verificarEmail(w http.ResponseWriter, r *http.Request) {
	var req verificarEmailRequest
	if err := decodeJSON(r, &req); err != nil || req.Codigo == "" {
		writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
		return
	}
	email := normalizeEmail(req.Email)
	codigo := strings.TrimSpace(req.Codigo)

	ip := clientIP(r)
	if h.deps.IPLimiter != nil && !h.deps.IPLimiter.Allow(db.RateLimitScopeConfirmCode, ip, ratelimit.LimitTokenConfirmPerIP) {
		writeError(w, http.StatusTooManyRequests, "demasiados intentos, esperá antes de volver a intentar")
		return
	}

	var user db.User
	if err := h.db.Where("email = ?", email).First(&user).Error; err != nil {
		writeError(w, http.StatusBadRequest, mensajeCodigoInvalido)
		return
	}

	// TR-061 en docs/tradeoffs.md: cinturón y tirantes — una cuenta ya
	// verificada nunca debería tener un VerificationToken de tipo
	// EmailVerify sin usar (register() no genera uno nuevo para una
	// cuenta verificada, TR-056), pero un guard explícito acá evita
	// depender solo de esa invariante en otro punto del código — nunca se
	// re-procesa ni se rota la sesión de una cuenta ya verificada desde
	// este endpoint, pase lo que pase con los tokens que existan.
	if user.EmailVerifiedAt != nil {
		writeError(w, http.StatusBadRequest, mensajeCodigoInvalido)
		return
	}

	// TR-055 en docs/tradeoffs.md: un código de 6 dígitos tiene mucha
	// menos entropía que el token de 32 bytes anterior — el límite por IP
	// de arriba no alcanza solo (un atacante puede rotar de IP), así que
	// se suma un límite por CUENTA a los intentos, sin importar qué código
	// se pruebe.
	if h.deps.AccountLimiter != nil {
		if ok, err := h.deps.AccountLimiter.Allow(db.RateLimitScopeConfirmCode, email, ratelimit.LimitConfirmCodePerAccount); err == nil && !ok {
			writeError(w, http.StatusTooManyRequests, "demasiados intentos para esta cuenta — pedí un código nuevo")
			return
		}
	}

	codeHash := security.HashToken(codigo)
	var vt db.VerificationToken
	err := h.db.Where("user_id = ? AND token_hash = ? AND type = ?", user.ID, codeHash, db.VerificationTokenEmailVerify).First(&vt).Error
	if err != nil {
		writeError(w, http.StatusBadRequest, mensajeCodigoInvalido)
		return
	}
	if vt.UsedAt != nil {
		writeError(w, http.StatusBadRequest, "este código ya fue usado — pedí uno nuevo si todavía necesitás verificar tu mail")
		return
	}
	if time.Now().After(vt.ExpiresAt) {
		writeError(w, http.StatusBadRequest, "este código venció — pedí uno nuevo")
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
