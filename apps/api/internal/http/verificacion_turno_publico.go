package http

import (
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/ratelimit"
	"dental-mirage/api/internal/security"
)

// turnoVerifCodigoTTL/turnoVerifPruebaTTL — Extra 2.3.5 (E5.6, pedido
// textual del cliente): "Confirmanos que sos vos", un paso más del wizard
// público antes de "pedir turno" de verdad. Mismas magnitudes que
// verificationCodeTTL (auth.go, TR-055) para el código en sí — un código
// de 6 dígitos que la persona escribe a mano mientras sigue mirando la
// pantalla — y un poco más holgado (30 min) para la ventana de USAR el
// token de prueba ya verificado, porque ahí todavía falta completar tipo
// de consulta → fecha → horario antes de mandar el pedido final.
const (
	turnoVerifCodigoTTL = 15 * time.Minute
	turnoVerifPruebaTTL = 30 * time.Minute
)

// errTurnoVerifCodigoInvalido/errTurnoVerifPruebaInvalida — sentinels
// propios para distinguir estos casos de cualquier otro error de base y
// devolver un mensaje específico.
var (
	errTurnoVerifCodigoInvalido = errors.New("el código es incorrecto o ya venció")
	errTurnoVerifPruebaInvalida = errors.New("verificá tu mail antes de pedir el turno")
)

type enviarVerificacionTurnoPublicoRequest struct {
	Email string `json:"email"`
}

// enviarVerificacionTurnoPublicoHandler — POST
// /clinicas/{slug}/verificacion-email (E5.6): primer paso del wizard
// público después de los datos de contacto — manda un código de 6 dígitos
// al mail que puso, mismo mecanismo que createAndSendVerificationToken
// (auth.go, TR-055) pero sin ningún User detrás.
func enviarVerificacionTurnoPublicoHandler(gdb *gorm.DB, deps AuthDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		var req enviarVerificacionTurnoPublicoRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		email := strings.TrimSpace(strings.ToLower(req.Email))
		if _, err := mail.ParseAddress(email); err != nil {
			writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
			return
		}

		ip := clientIP(r)
		if deps.IPLimiter != nil && !deps.IPLimiter.Allow(db.RateLimitScopeTurnoVerifEnviar, ip, ratelimit.LimitTurnoVerifEnviarPerIP) {
			writeError(w, http.StatusTooManyRequests, "demasiados intentos, esperá un momento y volvé a intentar")
			return
		}
		cuentaKey := clinic.ID.String() + ":" + email
		if deps.AccountLimiter != nil {
			if ok, err := deps.AccountLimiter.Allow(db.RateLimitScopeTurnoVerifEnviar, cuentaKey, ratelimit.LimitTurnoVerifEnviarCooldown); err == nil && !ok {
				writeError(w, http.StatusTooManyRequests, "esperá un momento antes de pedir otro código")
				return
			}
			if ok, err := deps.AccountLimiter.Allow(db.RateLimitScopeTurnoVerifEnviar, cuentaKey, ratelimit.LimitTurnoVerifEnviarPerCuenta); err == nil && !ok {
				writeError(w, http.StatusTooManyRequests, "demasiados intentos, esperá un momento y volvé a intentar")
				return
			}
		}

		code, codeHash, err := security.NewNumericCode(6)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el código")
			return
		}

		err = gdb.Transaction(func(tx *gorm.DB) error {
			// Invalida códigos previos sin usar de este mismo mail para esta
			// clínica antes de emitir uno nuevo — mismo criterio que
			// createAndSendVerificationToken en auth.go (TR-055): solo el
			// último código pedido es válido.
			if err := tx.Model(&db.VerificacionTurnoPublico{}).
				Where("clinic_id = ? AND email = ? AND verified_at IS NULL AND used_at IS NULL", clinic.ID, email).
				Update("used_at", time.Now()).Error; err != nil {
				return err
			}
			return tx.Create(&db.VerificacionTurnoPublico{
				ClinicID:   clinic.ID,
				Email:      email,
				CodigoHash: codeHash,
				ExpiresAt:  time.Now().Add(turnoVerifCodigoTTL),
			}).Error
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el código")
			return
		}

		if deps.Mail != nil {
			// Un mail que falla nunca tumba el request (mismo criterio que
			// createAndSendVerificationToken) — el paciente siempre puede
			// pedir "Reenviar código".
			_ = deps.Mail.SendTurnoVerificationEmail(r.Context(), email, code, clinic.Nombre)
		}

		writeJSON(w, http.StatusOK, map[string]string{"mensaje": "Te mandamos un código a tu correo."})
	}
}

type confirmarVerificacionTurnoPublicoRequest struct {
	Email  string `json:"email"`
	Codigo string `json:"codigo"`
}

type confirmarVerificacionTurnoPublicoResponse struct {
	Token string `json:"token"`
}

// confirmarVerificacionTurnoPublicoHandler — POST
// /clinicas/{slug}/verificacion-email/confirmar (E5.6): valida el código
// de 6 dígitos y, si es correcto, emite el token opaco de prueba que el
// resto del wizard manda junto con el pedido final (solicitarTurnoPublicoRequest.VerificacionToken)
// — ver el comentario grande en db.VerificacionTurnoPublico para el ciclo
// de vida completo de la fila.
func confirmarVerificacionTurnoPublicoHandler(gdb *gorm.DB, deps AuthDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		var req confirmarVerificacionTurnoPublicoRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		email := strings.TrimSpace(strings.ToLower(req.Email))
		codigo := strings.TrimSpace(req.Codigo)
		if _, err := mail.ParseAddress(email); err != nil {
			writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
			return
		}
		if codigo == "" {
			writeError(w, http.StatusBadRequest, "el código es obligatorio")
			return
		}

		ip := clientIP(r)
		if deps.IPLimiter != nil && !deps.IPLimiter.Allow(db.RateLimitScopeTurnoVerifConfirmar, ip, ratelimit.LimitTurnoVerifConfirmarPerIP) {
			writeError(w, http.StatusTooManyRequests, "demasiados intentos, esperá un momento y volvé a intentar")
			return
		}
		cuentaKey := clinic.ID.String() + ":" + email
		if deps.AccountLimiter != nil {
			if ok, err := deps.AccountLimiter.Allow(db.RateLimitScopeTurnoVerifConfirmar, cuentaKey, ratelimit.LimitTurnoVerifConfirmarPerCuenta); err == nil && !ok {
				writeError(w, http.StatusTooManyRequests, "demasiados intentos, esperá un momento y volvé a intentar")
				return
			}
		}

		codeHash := security.HashToken(codigo)
		var rawToken string
		err := gdb.Transaction(func(tx *gorm.DB) error {
			var vt db.VerificacionTurnoPublico
			err := tx.Where(
				"clinic_id = ? AND email = ? AND codigo_hash = ? AND verified_at IS NULL AND used_at IS NULL AND expires_at > ?",
				clinic.ID, email, codeHash, time.Now(),
			).Order("created_at DESC").First(&vt).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errTurnoVerifCodigoInvalido
			}
			if err != nil {
				return err
			}

			token, tokenHash, err := security.NewToken()
			if err != nil {
				return err
			}
			rawToken = token
			now := time.Now()
			vt.VerifiedAt = &now
			vt.TokenHash = &tokenHash
			vt.ExpiresAt = now.Add(turnoVerifPruebaTTL)
			return tx.Save(&vt).Error
		})

		if err != nil {
			if errors.Is(err, errTurnoVerifCodigoInvalido) {
				writeError(w, http.StatusBadRequest, "el código es incorrecto o ya venció")
				return
			}
			writeError(w, http.StatusInternalServerError, "no se pudo verificar el código")
			return
		}

		writeJSON(w, http.StatusOK, confirmarVerificacionTurnoPublicoResponse{Token: rawToken})
	}
}

// consumirVerificacionTurnoPublico — Extra 2.3.5 (E5.6): valida el token
// de prueba que viaja en el pedido final de turno (POST
// /clinicas/{slug}/turnos) contra la fila que confirmarVerificacionTurnoPublicoHandler
// dejó verificada, y la marca usada (de un solo uso — no se puede pedir un
// segundo turno reusando el mismo mail ya verificado sin pasar de nuevo
// por el código). Se llama DENTRO de la misma transacción que crea el
// turno (solicitarTurnoPublicoHandler) — si la creación falla más
// adelante (horario ya no disponible, exclusion constraint), la
// transacción entera se revierte y el token queda sin consumir, para que
// el paciente pueda reintentar con otro horario sin verificar de nuevo.
func consumirVerificacionTurnoPublico(tx *gorm.DB, clinicID, email, token string) error {
	tokenHash := security.HashToken(token)
	var vt db.VerificacionTurnoPublico
	err := tx.Where(
		"clinic_id = ? AND email = ? AND token_hash = ? AND verified_at IS NOT NULL AND used_at IS NULL AND expires_at > ?",
		clinicID, email, tokenHash, time.Now(),
	).First(&vt).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return errTurnoVerifPruebaInvalida
	}
	if err != nil {
		return err
	}
	now := time.Now()
	vt.UsedAt = &now
	return tx.Save(&vt).Error
}
