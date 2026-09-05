package http

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// emailEstaBloqueado — Fase 2.4.1: ¿este mail tiene un bloqueo vigente
// para pedir turno en esta clínica? (ver db.EmailBloqueadoTurnoPublico,
// creado al resolver un conflicto de pacientes con "el mail NO es de la
// persona verificada" — pedido textual del cliente: "bloquear su mail
// por una semana para que no lo pueda volver a usar para sacar ningún
// tipo de turno", ver pacientes_conflicto_panel.go). Se chequea en los
// dos puntos de entrada del wizard público que involucran ese mail:
// pedir el código de verificación y, por las dudas (un token ya emitido
// antes del bloqueo podría seguir vigente hasta 30 min más), mandar el
// pedido final de turno.
func emailEstaBloqueado(tx *gorm.DB, profesionalID uuid.UUID, email string) (bool, error) {
	var count int64
	err := tx.Model(&db.EmailBloqueadoTurnoPublico{}).
		Where("profesional_id = ? AND email = ? AND bloqueado_hasta > ?", profesionalID, email, time.Now()).
		Limit(1).
		Count(&count).Error
	return count > 0, err
}
