package http

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// ipEstaBloqueada — mismo criterio que emailEstaBloqueado, para IP (ver
// db.IPBloqueadaTurnoPublico) — corrección de seguridad (Fase 2.4.1),
// pedido textual del cliente: bloquear la IP de un infractor detectado
// por mail (bloquearMailPorAbusoDeDNIsYBorrarTurnos, turno_publico.go)
// para que no pueda seguir con el otro camino (rotar mail Y DNI juntos).
// Se chequea en los mismos dos puntos que el bloqueo de mail: pedir el
// código de verificación y mandar el pedido final de turno.
func ipEstaBloqueada(tx *gorm.DB, profesionalID uuid.UUID, ip string) (bool, error) {
	if ip == "" {
		return false, nil
	}
	var count int64
	err := tx.Model(&db.IPBloqueadaTurnoPublico{}).
		Where("profesional_id = ? AND ip = ? AND bloqueado_hasta > ?", profesionalID, ip, time.Now()).
		Limit(1).
		Count(&count).Error
	return count > 0, err
}

// bloquearIP — upsert de db.IPBloqueadaTurnoPublico (mismo patrón que el
// bloqueo de mail dentro de bloquearMailPorAbusoDeDNIsYBorrarTurnos):
// crea el bloqueo si es la primera vez, o extiende `BloqueadoHasta` si ya
// existía uno (ej. la misma IP vuelve a disparar el detector de rotación
// mientras el bloqueo anterior todavía no venció).
func bloquearIP(tx *gorm.DB, profesionalID uuid.UUID, ip string, duracion time.Duration) error {
	if ip == "" {
		return nil
	}
	hasta := time.Now().Add(duracion)
	var bloqueo db.IPBloqueadaTurnoPublico
	err := tx.Where("profesional_id = ? AND ip = ?", profesionalID, ip).First(&bloqueo).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return tx.Create(&db.IPBloqueadaTurnoPublico{ProfesionalID: profesionalID, IP: ip, BloqueadoHasta: hasta}).Error
	case err != nil:
		return err
	default:
		return tx.Model(&bloqueo).Update("bloqueado_hasta", hasta).Error
	}
}
