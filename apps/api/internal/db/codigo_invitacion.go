package db

import (
	"crypto/rand"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

// Código de invitación de un profesional — Fase 3.2.3.
//
// Es lo que la persona genera en "¿Dónde trabajás hoy?" y le pasa a una
// clínica para que la sume al equipo. La dirección importa: acá el
// profesional se ofrece y la clínica lo carga (3.2.4), al revés que una
// invitación por mail, donde la clínica convoca y la persona acepta. Por
// eso el código vive en el USUARIO y no en la clínica.

const (
	// alfabetoCodigo no tiene I, O, 0 ni 1. El código se dicta por
	// teléfono, se manda por WhatsApp y se vuelve a tipear del otro lado:
	// las confusiones O/0 e I/1/l son la forma más probable de que un
	// código válido sea rechazado.
	alfabetoCodigo = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

	// prefijoCodigo hace evidente de qué es el código cuando aparece
	// suelto en un chat. "PR" por PRISMA — el mockup del brief dice "DM-"
	// porque es anterior al cambio de nombre del producto (commit
	// 07ab731).
	prefijoCodigo = "PR"

	// CodigoInvitacionTTL — el código vence a las 24 horas, como pide el
	// mockup ("Vence en 24 horas"). Un código sin vencimiento pegado en un
	// grupo de WhatsApp sigue sumando gente a la clínica un año después.
	CodigoInvitacionTTL = 24 * time.Hour

	// intentosCodigoUnico — reintentos ante colisión. Con 32^8 (~1.1
	// billones) de combinaciones y los códigos vigentes de una sola
	// aplicación, una colisión es prácticamente imposible; el reintento
	// existe porque "prácticamente imposible" no es "imposible", y el
	// índice único es el que decide, no la probabilidad.
	intentosCodigoUnico = 5
)

// codigoAleatorio arma un código con el formato PR-XXXX-XXXX.
//
// El módulo no introduce sesgo: 256 es múltiplo exacto de 32, así que
// cada letra del alfabeto tiene la misma cantidad de bytes que le mapean.
// Con un alfabeto de otro tamaño esto habría que hacerlo con rechazo.
func codigoAleatorio() (string, error) {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	letras := make([]byte, 8)
	for i, b := range bytes {
		letras[i] = alfabetoCodigo[int(b)%len(alfabetoCodigo)]
	}
	return fmt.Sprintf("%s-%s-%s", prefijoCodigo, letras[:4], letras[4:]), nil
}

// GenerarCodigoInvitacion le asigna al usuario un código nuevo y devuelve
// el código y su vencimiento. Pisa el anterior si tenía uno: "generar
// otro" tiene que invalidar al primero, que es el motivo por el que
// alguien pediría otro.
func GenerarCodigoInvitacion(gdb *gorm.DB, userID uuid.UUID) (string, time.Time, error) {
	vence := time.Now().Add(CodigoInvitacionTTL)

	for intento := 0; intento < intentosCodigoUnico; intento++ {
		codigo, err := codigoAleatorio()
		if err != nil {
			return "", time.Time{}, err
		}
		err = gdb.Model(&User{}).Where("id = ?", userID).Updates(map[string]any{
			"codigo_invitacion":           codigo,
			"codigo_invitacion_expira_at": vence,
		}).Error
		if err == nil {
			return codigo, vence, nil
		}
		if !esViolacionDeUnicidad(err) {
			return "", time.Time{}, err
		}
	}
	return "", time.Time{}, errors.New("no se pudo generar un código de invitación único")
}

// esViolacionDeUnicidad — SQLSTATE 23505. Se chequea el código de
// Postgres, no el texto del mensaje, que cambia entre versiones y locales.
func esViolacionDeUnicidad(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
