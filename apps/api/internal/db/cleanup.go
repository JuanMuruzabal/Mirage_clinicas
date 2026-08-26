package db

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// PurgeStats resume cuántas filas borró cada categoría — se loguea desde
// el llamador (cmd/api/main.go), útil para confirmar que el barrido
// periódico está haciendo algo real.
type PurgeStats struct {
	UsuariosAbandonados int64
	SesionesVencidas    int64
	TokensVencidos      int64
}

// PurgeAuthGarbage — TR-063 en docs/tradeoffs.md: hasta acá nada borraba
// activamente lo que las propias TTLs del sistema ya declaran vencido —
// una cuenta nativa sin verificar abandonada, un código de verificación
// usado o vencido, una sesión vencida quedaban en la base para siempre
// (la única limpieza que existía era la perezosa de meHandler, que solo
// se dispara si ESA cuenta puntual vuelve a pedir /me — nunca pasa con
// una cuenta de verdad abandonada, mucho menos con una creada por un bot
// contra /auth/register, que hoy no tiene CAPTCHA configurado en
// producción). Pensada para correrse periódicamente desde un
// time.Ticker en cmd/api/main.go, no en cada request.
//
// Orden deliberado: primero se identifican y borran las cuentas
// abandonadas (con sus propias filas dependientes, para no dejar
// huérfanos — sessions/verification_tokens no tienen una foreign key real
// a nivel de Postgres hacia users, así que un DELETE ahí no fallaría por
// integridad referencial, pero sí dejaría basura sin sentido si no se
// hace a mano); recién después el barrido GENERAL de sesiones/tokens
// vencidos, que cubre además a cuentas verificadas y activas.
func PurgeAuthGarbage(gdb *gorm.DB, cuentaAbandonadaTTL time.Duration) (PurgeStats, error) {
	var stats PurgeStats
	now := time.Now()
	cutoffCuentas := now.Add(-cuentaAbandonadaTTL)

	err := gdb.Transaction(func(tx *gorm.DB) error {
		var abandonados []User
		if err := tx.Where("email_verified_at IS NULL AND created_at < ?", cutoffCuentas).Find(&abandonados).Error; err != nil {
			return err
		}
		if len(abandonados) > 0 {
			ids := make([]uuid.UUID, len(abandonados))
			emails := make([]string, len(abandonados))
			for i, u := range abandonados {
				ids[i] = u.ID
				emails[i] = u.Email
			}
			if err := tx.Where("user_id IN ?", ids).Delete(&VerificationToken{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id IN ?", ids).Delete(&Session{}).Error; err != nil {
				return err
			}
			// AuthRateCounter no tiene user_id — se limpia por email, que
			// es su key real para los scopes de auth (confirm_code,
			// resend_verify, login_failed, etc.).
			if err := tx.Where("key IN ?", emails).Delete(&AuthRateCounter{}).Error; err != nil {
				return err
			}
			// Unscoped: User tiene soft-delete (DeletedAt), y el
			// uniqueIndex de email no lo excluye — un borrado normal
			// dejaría el mail "ocupado" para siempre (mismo criterio que
			// meHandler, TR-052).
			if err := tx.Unscoped().Where("id IN ?", ids).Delete(&User{}).Error; err != nil {
				return err
			}
			stats.UsuariosAbandonados = int64(len(abandonados))
		}

		res := tx.Where("expires_at < ?", now).Delete(&Session{})
		if res.Error != nil {
			return res.Error
		}
		stats.SesionesVencidas = res.RowsAffected

		res = tx.Where("used_at IS NOT NULL OR expires_at < ?", now).Delete(&VerificationToken{})
		if res.Error != nil {
			return res.Error
		}
		stats.TokensVencidos = res.RowsAffected

		return nil
	})
	return stats, err
}
