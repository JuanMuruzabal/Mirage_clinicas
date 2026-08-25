// Package auth gestiona las sesiones de usuario — reemplaza al JWT
// stateless (jwt.go, eliminado) por sesiones server-side en Postgres
// (db.Session), necesario para cumplir la spec de seguridad de
// docs/feature-sumarte-login.md §7: logout que invalida server-side,
// invalidar-todas-las-demás-sesiones en cambio de contraseña, y rotación
// del ID de sesión en login/verificación de mail — nada de esto es posible
// con un JWT puro sin terminar reinventando una tabla equivalente de
// blocklist de todos modos.
package auth

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/security"
)

// Expiración absoluta (30 días) e inactividad (7 días) — spec §7. El
// throttle de LastSeenAt evita que cada request protegido dispare un
// UPDATE.
const (
	SessionAbsoluteTTL   = 30 * 24 * time.Hour
	SessionInactivityTTL = 7 * 24 * time.Hour
	lastSeenThrottle     = 5 * time.Minute
)

var (
	// ErrSessionInvalid cubre tanto "no existe" como "está revocada" — el
	// caller siempre responde 401 igual en ambos casos, no hace falta
	// distinguir (evita filtrar por qué exactamente falló un token viejo).
	ErrSessionInvalid = errors.New("sesión inválida o expirada")
)

// NewSession crea una sesión nueva para userID y devuelve el token opaco en
// claro (lo único que viaja a la cookie) — solo su hash SHA-256 queda en la
// base (mismo patrón que VerificationToken).
func NewSession(gdb *gorm.DB, userID uuid.UUID, userAgent, ip string) (rawToken string, session db.Session, err error) {
	rawToken, tokenHash, err := security.NewToken()
	if err != nil {
		return "", db.Session{}, err
	}

	now := time.Now()
	session = db.Session{
		UserID:     userID,
		TokenHash:  tokenHash,
		CreatedAt:  now,
		LastSeenAt: now,
		ExpiresAt:  now.Add(SessionAbsoluteTTL),
		UserAgent:  truncate(userAgent, 255),
		IP:         truncate(ip, 64),
	}
	if err := gdb.Create(&session).Error; err != nil {
		return "", db.Session{}, err
	}
	return rawToken, session, nil
}

// RotateSession revoca oldSessionID (si no es nil) y crea una sesión nueva
// — usado en login (para no reusar el ID de sesión de antes de
// autenticarse, previniendo session fixation) y en verificación de mail
// (spec §7: "rotar el identificador de sesión... al verificar el mail").
func RotateSession(gdb *gorm.DB, oldSessionID *uuid.UUID, userID uuid.UUID, userAgent, ip string) (rawToken string, session db.Session, err error) {
	err = gdb.Transaction(func(tx *gorm.DB) error {
		if oldSessionID != nil {
			if revokeErr := RevokeSession(tx, *oldSessionID); revokeErr != nil {
				return revokeErr
			}
		}
		var newErr error
		rawToken, session, newErr = NewSession(tx, userID, userAgent, ip)
		return newErr
	})
	return rawToken, session, err
}

// ValidateSessionToken resuelve un token en claro (recibido en el header
// Authorization: Bearer) contra la sesión que representa. Actualiza
// LastSeenAt (throttled a cada 5 minutos, no en cada llamada) y trata la
// inactividad de más de 7 días como sesión inválida — no la borra, la dejä
// vencer, para no perder el registro con fines de auditoría.
func ValidateSessionToken(gdb *gorm.DB, rawToken string) (*db.Session, error) {
	if rawToken == "" {
		return nil, ErrSessionInvalid
	}
	tokenHash := security.HashToken(rawToken)

	var session db.Session
	if err := gdb.Where("token_hash = ?", tokenHash).First(&session).Error; err != nil {
		return nil, ErrSessionInvalid
	}

	now := time.Now()
	if session.RevokedAt != nil {
		return nil, ErrSessionInvalid
	}
	if now.After(session.ExpiresAt) {
		return nil, ErrSessionInvalid
	}
	if now.Sub(session.LastSeenAt) > SessionInactivityTTL {
		return nil, ErrSessionInvalid
	}

	if now.Sub(session.LastSeenAt) > lastSeenThrottle {
		// Best-effort: si el UPDATE falla no invalidamos la sesión por eso,
		// simplemente no se actualiza LastSeenAt esta vez.
		_ = gdb.Model(&db.Session{}).Where("id = ?", session.ID).Update("last_seen_at", now).Error
		session.LastSeenAt = now
	}

	return &session, nil
}

// RevokeSession marca una sesión como revocada — logout server-side (spec
// §7: "logout invalida la sesión en el servidor, no solo borra la
// cookie").
func RevokeSession(gdb *gorm.DB, sessionID uuid.UUID) error {
	now := time.Now()
	return gdb.Model(&db.Session{}).
		Where("id = ? AND revoked_at IS NULL", sessionID).
		Update("revoked_at", now).Error
}

// RevokeAllUserSessions revoca todas las sesiones activas de un usuario,
// opcionalmente exceptuando una (la sesión actual, si el caller quiere
// conservarla) — usado en cambio/reset de contraseña (spec §7: "invalidar
// todas las demás sesiones activas del usuario").
func RevokeAllUserSessions(gdb *gorm.DB, userID uuid.UUID, exceptSessionID *uuid.UUID) error {
	now := time.Now()
	q := gdb.Model(&db.Session{}).Where("user_id = ? AND revoked_at IS NULL", userID)
	if exceptSessionID != nil {
		q = q.Where("id <> ?", *exceptSessionID)
	}
	return q.Update("revoked_at", now).Error
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
