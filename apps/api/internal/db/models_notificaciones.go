package db

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Notificaciones por cuenta (2026-09-26, TR-179).
//
// Una notificación es de UNA cuenta (`user_id`), no de una clínica: cada
// persona tiene su bandeja y nadie ve la de otro. Por eso un turno que
// entra por la página pública crea VARIAS filas —una para el profesional
// que lo atiende, una para cada recepcionista de esa clínica— en vez de
// una fila compartida: "leída" es un estado de cada persona.
//
// Los datos que la tarjeta muestra (paciente, fecha, hora, clínica,
// profesional) viajan en `Datos`, una FOTO tomada al crear la
// notificación: la notificación cuenta lo que pasó cuando llegó el turno.
// Si después el turno se reprograma o se cancela, "Ver turno" lleva al
// turno de verdad, que dice cómo quedó.
const (
	NotificacionBienvenida = "bienvenida"
	NotificacionTurnoNuevo = "turno_nuevo"
)

type Notificacion struct {
	ID     uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID uuid.UUID `gorm:"column:user_id;type:uuid;not null;index:idx_notificaciones_bandeja,priority:1"`
	Tipo   string    `gorm:"type:varchar(30);not null;check:chk_notificacion_tipo,tipo IN ('bienvenida','turno_nuevo')"`
	// ClinicID — de qué clínica viene (nil en la bienvenida). Sirve para
	// cambiar de clínica antes de abrir el turno, si la persona está
	// parada en otra.
	ClinicID *uuid.UUID `gorm:"column:clinic_id;type:uuid"`
	// TurnoID — sin foreign key a propósito, como conflictos_paciente
	// (TR-131): la notificación es historial, y un turno puede dejar de
	// existir (el "ausente" de un paciente sin verificar borra su ficha y
	// sus turnos). "Ver turno" ya contempla que no aparezca.
	TurnoID *uuid.UUID        `gorm:"column:turno_id;type:uuid"`
	Datos   DatosNotificacion `gorm:"type:jsonb;serializer:json;not null;default:'{}'"`
	// LeidaEn nil = nueva. Se marca al abrirla, nunca al mostrarla en la
	// lista: "leída" quiere decir que la persona la expandió.
	LeidaEn   *time.Time `gorm:"column:leida_en"`
	CreatedAt time.Time  `gorm:"index:idx_notificaciones_bandeja,priority:2,sort:desc"`
}

func (Notificacion) TableName() string { return "notificaciones" }

// DatosNotificacion — la foto de lo que muestra la tarjeta. Campos
// opcionales según el tipo: la bienvenida no usa ninguno.
type DatosNotificacion struct {
	PacienteNombre    string `json:"pacienteNombre,omitempty"`
	ClinicaNombre     string `json:"clinicaNombre,omitempty"`
	ProfesionalNombre string `json:"profesionalNombre,omitempty"`
	TipoConsulta      string `json:"tipoConsulta,omitempty"`
	// Inicio/fin del turno en RFC3339, con la zona de Córdoba.
	HoraInicio string `json:"horaInicio,omitempty"`
	HoraFin    string `json:"horaFin,omitempty"`
	// ParaRecepcion — la copia de recepción: la tarjeta dice para qué
	// profesional es el turno.
	ParaRecepcion bool `json:"paraRecepcion,omitempty"`
	// ProfesionalUserID — quién lo atiende. Al abrir la notificación,
	// recepción queda parada en ESA agenda: en la de otro profesional el
	// turno no aparece.
	ProfesionalUserID string `json:"profesionalUserId,omitempty"`
	// PorEnlace — entró por un "Compartir link" y no por la página.
	PorEnlace bool `json:"porEnlace,omitempty"`
}

// PushSuscripcion — un navegador donde la persona activó los avisos
// (Web Push). Una cuenta puede tener varias: el celular y la compu. La
// clave es el `endpoint`, que el navegador genera y es único por
// dispositivo y sitio.
type PushSuscripcion struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID    uuid.UUID `gorm:"column:user_id;type:uuid;not null;index"`
	Endpoint  string    `gorm:"type:text;not null;uniqueIndex"`
	P256dh    string    `gorm:"column:p256dh;type:text;not null"`
	Auth      string    `gorm:"type:text;not null"`
	CreatedAt time.Time
}

func (PushSuscripcion) TableName() string { return "push_suscripciones" }

// CrearBienvenida — la primera notificación de toda cuenta. Se llama al
// crear la cuenta (registro nativo y Google), dentro de la misma
// transacción; las cuentas anteriores a esta funcionalidad la reciben una
// vez por backfillBienvenidas.
func CrearBienvenida(tx *gorm.DB, userID uuid.UUID) error {
	return tx.Create(&Notificacion{UserID: userID, Tipo: NotificacionBienvenida}).Error
}

// migracionBienvenidas — las cuentas que ya existían cuando llegaron las
// notificaciones (2026-09-26) reciben su bienvenida, así descubren el
// panel. Una sola vez (TR-123): una cuenta que la lea y la vuelva a
// buscar no tiene que encontrarse otra.
const migracionBienvenidas = "bienvenida_a_las_cuentas_existentes"

func backfillBienvenidas(tx *gorm.DB) error {
	return tx.Exec(`
		INSERT INTO notificaciones (user_id, tipo)
		SELECT u.id, ? FROM users u
		WHERE NOT EXISTS (
			SELECT 1 FROM notificaciones n WHERE n.user_id = u.id AND n.tipo = ?
		)`, NotificacionBienvenida, NotificacionBienvenida).Error
}
