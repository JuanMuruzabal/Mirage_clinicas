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
	// CaptchaToken — corrección de seguridad (Fase 2.4.1): mismo Turnstile
	// que ya protege registro/reset de contraseña (auth.go), reusado acá.
	// Con deps.Turnstile nil (dev sin secret) el chequeo siempre pasa,
	// igual criterio que el resto del proyecto.
	CaptchaToken string `json:"captchaToken"`
}

type enviarVerificacionTurnoPublicoResponse struct {
	Mensaje string `json:"mensaje"`
	// CodigoDev — SOLO se llena cuando deps.ExponerCodigoVerificacion está
	// prendido (sin RESEND_API_KEY, es decir, en local — nunca en
	// producción, ver el comentario en AuthDeps): comodidad de desarrollo
	// para no tener que mirar los logs del backend (LogSender) cada vez
	// que se prueba el wizard público.
	CodigoDev string `json:"codigoDev,omitempty"`
}

// enviarVerificacionTurnoPublicoHandler — POST
// /clinicas/{slug}/verificacion-email (E5.6): primer paso del wizard
// público después de los datos de contacto — manda un código de 6 dígitos
// al mail que puso, mismo mecanismo que createAndSendVerificationToken
// (auth.go, TR-055) pero sin ningún User detrás.
//
// Corrección de seguridad (Fase 2.4.1): este es el único punto de entrada
// de TODO el flujo público de turnos (sin pasar por acá no hay token de
// verificación, y sin token no hay POST /turnos) — antes no tenía ningún
// CAPTCHA, así que el rate limit por IP/cuenta era la única traba real, y
// un atacante rotando IP + mails descartables la esquiva gratis. Se
// chequea el mismo Turnstile del registro/reset de contraseña (nil en dev
// sin secret, igual que ahí) ANTES de tocar los límites por cuenta — con
// deps.Turnstile configurado, cada código nuevo exige haber resuelto el
// desafío.
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

		// Fase 2.4.1: un mail bloqueado por una resolución de conflicto de
		// pacientes ("el mail NO es de la persona verificada") no puede ni
		// empezar a pedir un código nuevo.
		if bloqueado, err := emailEstaBloqueado(gdb, clinic.ID, email); err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo procesar el pedido")
			return
		} else if bloqueado {
			writeError(w, http.StatusForbidden, "este mail no puede pedir turno por ahora")
			return
		}
		// Corrección de seguridad (Fase 2.4.1): misma idea, para una IP que
		// el sistema bloqueó sola (ver bloquearMailPorAbusoDeDNIsYBorrarTurnos/
		// bloquearIPPorRotacionYBorrarTurnos en turno_publico.go).
		if bloqueada, err := ipEstaBloqueada(gdb, clinic.ID, ip); err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo procesar el pedido")
			return
		} else if bloqueada {
			writeError(w, http.StatusForbidden, "no se puede pedir turno desde esta conexión por ahora")
			return
		}

		// Corrección de bug real (N clínicas en subdominios propios): la
		// clave del limitador tiene que incluir la clínica, igual que
		// cuentaKey más abajo — sin esto, dos clínicas SIN NINGUNA relación
		// entre sí comparten el mismo cupo de 20/hora por IP. Con varias
		// clínicas en la plataforma, un edificio de oficinas o una red
		// móvil compartida (CGNAT) hace que pacientes de una clínica
		// agoten el cupo de otra sin saber que la otra existe — y, peor,
		// alguien que conozca que clientIP() confía en X-Forwarded-For sin
		// validar (ver el comentario grande en auth.go) podría falsificar
		// la IP de una víctima real y dejarla sin cupo en TODA la
		// plataforma de un solo golpe, en vez de en una sola clínica.
		ipPorClinica := clinic.ID.String() + ":" + ip
		if deps.IPLimiter != nil && !deps.IPLimiter.Allow(db.RateLimitScopeTurnoVerifEnviar, ipPorClinica, ratelimit.LimitTurnoVerifEnviarPerIP) {
			writeError(w, http.StatusTooManyRequests, "demasiados intentos, esperá un momento y volvé a intentar")
			return
		}
		if !checkCaptchaToken(r.Context(), deps.Turnstile, req.CaptchaToken, ip) {
			writeError(w, http.StatusBadRequest, "no se pudo verificar que sos una persona, intentá de nuevo")
			return
		}
		cuentaKey := clinic.ID.String() + ":" + email
		if deps.AccountLimiter != nil {
			// Corrección de bug real: el cooldown (60s) y el tope por hora
			// NO pueden compartir scope+key — AccountLimiter.Allow guarda
			// una sola fila por (scope, key), así que dos límites con
			// ventanas de duración distinta sobre la MISMA fila se pisan
			// entre sí (cada llamada al cooldown "trunca" la fila a un
			// minuto, lo que el chequeo de 1 hora de abajo interpreta como
			// que la ventana nunca avanza lo suficiente para resetear, pero
			// tampoco logra acumular — en la práctica el tope de
			// LimitTurnoVerifEnviarPerCuenta quedaba inutilizado: alguien
			// que solo respetara el cooldown de 60s podía mandar muchos
			// más de 5 códigos por hora). Mismo criterio que
			// RateLimitScopeResendVerify+"_cooldown" en auth.go — scope
			// propio para el cooldown, fila separada.
			if ok, err := deps.AccountLimiter.Allow(db.RateLimitScopeTurnoVerifEnviar+"_cooldown", cuentaKey, ratelimit.LimitTurnoVerifEnviarCooldown); err == nil && !ok {
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

		resp := enviarVerificacionTurnoPublicoResponse{Mensaje: "Te mandamos un código a tu correo."}
		if deps.ExponerCodigoVerificacion {
			resp.CodigoDev = code
		}
		writeJSON(w, http.StatusOK, resp)
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
		// Mismo criterio que enviarVerificacionTurnoPublicoHandler — la
		// clave del limitador por IP tiene que incluir la clínica.
		ipPorClinica := clinic.ID.String() + ":" + ip
		if deps.IPLimiter != nil && !deps.IPLimiter.Allow(db.RateLimitScopeTurnoVerifConfirmar, ipPorClinica, ratelimit.LimitTurnoVerifConfirmarPerIP) {
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

// validarVerificacionTurnoPublico — Fase 2.4.1 (F4.1.2): misma búsqueda
// que consumirVerificacionTurnoPublico de abajo, pero SIN marcar el token
// usado — la necesita GET /clinicas/{slug}/pacientes/verificado (camino
// "ya he venido antes" del wizard) para poder levantar los datos de la
// tarjeta sin gastar todavía la verificación: el paciente la vuelve a
// necesitar después, al mandar el pedido final (POST
// /clinicas/{slug}/turnos) — ESE es el único lugar que de verdad la
// consume (vía consumirVerificacionTurnoPublico, que ahora reusa esta
// función para la búsqueda y solo agrega el UPDATE).
func validarVerificacionTurnoPublico(tx *gorm.DB, clinicID, email, token string) (db.VerificacionTurnoPublico, error) {
	tokenHash := security.HashToken(token)
	var vt db.VerificacionTurnoPublico
	err := tx.Where(
		"clinic_id = ? AND email = ? AND token_hash = ? AND verified_at IS NOT NULL AND used_at IS NULL AND expires_at > ?",
		clinicID, email, tokenHash, time.Now(),
	).First(&vt).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return db.VerificacionTurnoPublico{}, errTurnoVerifPruebaInvalida
	}
	if err != nil {
		return db.VerificacionTurnoPublico{}, err
	}
	return vt, nil
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
	vt, err := validarVerificacionTurnoPublico(tx, clinicID, email, token)
	if err != nil {
		return err
	}
	now := time.Now()
	vt.UsedAt = &now
	return tx.Save(&vt).Error
}
