package http

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"dental-mirage/api/internal/db"
)

// conflictoPacienteResponse — Fase 2.4.1: las "2 tablas en conflicto" que
// pide el documento del cliente para la pantalla de resolución en
// /panel/pacientes, más el motivo, el turno que originó el conflicto y —
// corrección de QA — si ese turno choca con uno que el paciente
// verificado YA tiene vigente del mismo tipo de consulta.
type conflictoPacienteResponse struct {
	ID                  string           `json:"id"`
	PacienteVerificado  pacienteResponse `json:"pacienteVerificado"`
	PacienteEnConflicto pacienteResponse `json:"pacienteEnConflicto"`
	Turno               turnoResponse    `json:"turno"`
	Motivo              string           `json:"motivo"`
	CreatedAt           string           `json:"createdAt"`
	// TurnoVigenteDelMismoTipo — corrección de QA, pedido textual del
	// cliente: "si el paciente verificado tiene ya un turno con ese tipo
	// de consulta informar también en el conflicto" — cuando está
	// presente, resolver "es la persona verificada" NO migra `Turno` (lo
	// cancela y prevalece este) — ver resolverConflictoPacienteHandler.
	TurnoVigenteDelMismoTipo *turnoResponse `json:"turnoVigenteDelMismoTipo,omitempty"`
}

// listConflictosPacienteHandler — GET /pacientes/conflictos (Fase 2.4.1):
// lista los conflictos sin resolver del profesional autenticado — ver
// crearPacientePublicoConDeteccionDeConflicto (paciente_conflicto_publico.go)
// para cómo nacen.
func listConflictosPacienteHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var conflictos []db.ConflictoPaciente
		if err := gdb.Where("profesional_id = ? AND resuelto = false", profesionalID).
			Order("created_at").Find(&conflictos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los conflictos")
			return
		}

		out := make([]conflictoPacienteResponse, 0, len(conflictos))
		for _, c := range conflictos {
			var verificado, enConflicto db.Paciente
			// Si cualquiera de las dos fichas ya no existe (se resolvió por
			// otra vía, o se borró desde otro lugar mientras tanto) se
			// salta esta fila en vez de romper el listado entero.
			if err := gdb.First(&verificado, "id = ?", c.PacienteVerificadoID).Error; err != nil {
				continue
			}
			if err := gdb.First(&enConflicto, "id = ?", c.PacienteEnConflictoID).Error; err != nil {
				continue
			}
			var turno db.Turno
			if err := gdb.First(&turno, "id = ?", c.TurnoEnConflictoID).Error; err != nil {
				continue
			}

			// Corrección de QA: si el paciente verificado YA tiene un
			// turno vigente del MISMO tipo de consulta que este, se
			// informa acá.
			var turnoVigenteMismoTipo *turnoResponse
			if turno.TipoConsultaID != nil {
				existente, err := turnoVigenteDeTipo(gdb, c.PacienteVerificadoID, *turno.TipoConsultaID)
				if err != nil {
					writeError(w, http.StatusInternalServerError, "no se pudo obtener los conflictos")
					return
				}
				if existente != nil {
					r := toTurnoResponse(*existente)
					turnoVigenteMismoTipo = &r
				}
			}

			// Corrección de QA: el lado "verificado" puede NO estarlo de
			// verdad todavía — el conflicto también se crea cuando NINGUNA
			// de las dos fichas está verificada (dos primeras veces con el
			// mismo DNI y mails distintos). El frontend usa este estado real
			// para mostrar "contactate con los dos" en vez de las dos
			// tarjetas de resolución de siempre.
			verificadoReal, err := pacienteEstaVerificado(gdb, verificado)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo obtener los conflictos")
				return
			}
			enConflictoVerificado, err := pacienteEstaVerificado(gdb, enConflicto)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo obtener los conflictos")
				return
			}

			out = append(out, conflictoPacienteResponse{
				ID:                       c.ID.String(),
				PacienteVerificado:       toPacienteResponse(verificado, verificadoReal),
				PacienteEnConflicto:      toPacienteResponse(enConflicto, enConflictoVerificado),
				Turno:                    toTurnoResponse(turno),
				Motivo:                   c.Motivo,
				CreatedAt:                c.CreatedAt.Format(time.RFC3339),
				TurnoVigenteDelMismoTipo: turnoVigenteMismoTipo,
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

type resolverConflictoPacienteRequest struct {
	// EsVerificado — true: "el mail es de la persona verificada" (botón 1
	// del documento); false: "el mail no es del paciente verificado"
	// (botón 2).
	EsVerificado bool `json:"esVerificado"`
}

// migrarAlternativosDeContacto — suma el mail/teléfono de `pierde` a
// `prevalece` (PacienteEmailAlternativo/PacienteTelefonoAlternativo) —
// "podrá usar cualquiera de los 2 mails... para volver a sacar turnos".
// `ON CONFLICT DO NOTHING` (no isUniqueViolation + seguir con la MISMA
// tx): bug real de QA — en Postgres, capturar una violación de índice y
// seguir usando la misma transacción no alcanza, el statement que falla
// deja la transacción entera "abortada" (25P02) para cualquier query
// posterior, aunque el error se haya "ignorado" del lado de Go.
func migrarAlternativosDeContacto(tx *gorm.DB, prevaleceID uuid.UUID, pierde db.Paciente) error {
	if pierde.Email != nil {
		alt := db.PacienteEmailAlternativo{PacienteID: prevaleceID, Email: *pierde.Email}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&alt).Error; err != nil {
			return err
		}
	}
	if pierde.Telefono != "" {
		alt := db.PacienteTelefonoAlternativo{PacienteID: prevaleceID, Telefono: pierde.Telefono}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&alt).Error; err != nil {
			return err
		}
	}
	return nil
}

// migrarOCancelarTurnosDePerdedor — Fase 2.4.1, corrección de QA, pedido
// textual del cliente: al confirmar que dos fichas son la misma persona,
// TODOS los turnos de la ficha que se descarta se resuelven contra la que
// prevalece — no solo el turno puntual que originó el conflicto (una
// ficha "en conflicto" puede haber acumulado más de uno mientras nadie la
// resolvía).
//
// Turnos VIGENTES (a futuro): "si es el mismo tipo de consulta que
// prevalezca la más pronta y se cancele la posterior, si tiene otro tipo
// de consulta aparte migrarla a la misma ficha de paciente" — un turno de
// un tipo que `prevaleceID` ya tiene VIGENTE se cancela (nunca se borra
// un turno, queda como registro histórico); el resto se migra tal cual.
//
// Turnos YA RESUELTOS (pasaron su horario): corrección de bug real
// encontrado en QA (2026-09-04) — antes esta función solo miraba
// vigentes, así que uno resuelto de la ficha que se borra dos líneas más
// abajo quedaba huérfano (`paciente_id` apuntando a una fila que ya no
// existe). Pedido textual del cliente: "el turno no se tiene que migrar
// sino eliminar directamente, porque ya fue resuelto y por temas lógicos
// nunca asistió a este" — se ELIMINAN de verdad (única excepción a
// "nunca se borra un turno" fuera de los detectores de abuso de
// turno_publico.go): migrarlos ensuciaría el historial real de quien
// prevalece con una consulta a la que nunca asistió bajo esa identidad.
//
// prevalece (antes prevaleceID) — corrección de bug real, pedido textual
// del cliente (2026-09-05): "Juan Muruzabal" (verificado) saca otro turno
// como "Juan IGNACIO Muruzabal" (mismo DNI, otro mail → conflicto);
// resuelto el conflicto a favor del verificado, las tarjetas de turno
// seguían mostrando "Juan IGNACIO Muruzabal" — porque NombreContacto/
// ApellidoContacto es un snapshot propio de Turno (no un join en vivo
// contra Paciente, ver turnoResponse) y esta función solo reasignaba
// paciente_id, nunca ese snapshot. Cada turno que pasa a prevalece.ID
// ahora se pisa también con el nombre CANÓNICO — el de la ficha que
// prevalece, nunca el tipeado en el pedido que disparó el conflicto.
func migrarOCancelarTurnosDePerdedor(tx *gorm.DB, prevalece db.Paciente, pierdeID uuid.UUID) error {
	if err := tx.Where("paciente_id = ? AND estado = 'agendado' AND hora_fin < now()", pierdeID).
		Delete(&db.Turno{}).Error; err != nil {
		return err
	}

	var turnos []db.Turno
	if err := tx.Where("paciente_id = ? AND estado = 'agendado' AND hora_fin >= now()", pierdeID).Find(&turnos).Error; err != nil {
		return err
	}
	for _, t := range turnos {
		colisiona := false
		if t.TipoConsultaID != nil {
			existente, err := turnoVigenteDeTipo(tx, prevalece.ID, *t.TipoConsultaID)
			if err != nil {
				return err
			}
			colisiona = existente != nil
		}
		if colisiona {
			if err := tx.Model(&db.Turno{}).Where("id = ?", t.ID).
				Updates(map[string]interface{}{"estado": "cancelada", "paciente_id": nil}).Error; err != nil {
				return err
			}
			continue
		}
		if err := tx.Model(&db.Turno{}).Where("id = ?", t.ID).
			Updates(map[string]interface{}{
				"paciente_id":       prevalece.ID,
				"nombre_contacto":   prevalece.Nombre,
				"apellido_contacto": prevalece.Apellido,
			}).Error; err != nil {
			return err
		}
	}
	return nil
}

// resolverConflictoComoVerdadero — fusiona PacienteEnConflictoID en
// PacienteVerificadoID: migra mail/teléfono alternativos, migra o cancela
// los demás turnos de la ficha que se descarta (migrarOCancelarTurnosDePerdedor),
// la borra y marca el ticket Resuelto. Compartido por
// resolverConflictoPacienteHandler ("el mail es de la persona verificada",
// botón manual) y por el carve-out de asistencia de marcarAsistenciaHandler
// (TR-107, 1.3bis: marcar "asistió" en el turno disputado).
//
// turnoAMigrarDirecto — cuando no es nil, ESE turno puntual se migra a
// PacienteVerificadoID ANTES de correr migrarOCancelarTurnosDePerdedor, en
// vez de dejar que la regla general de esa función decida qué hacer con
// él. Hace falta porque, en el carve-out de asistencia, ese turno ya está
// RESUELTO (pasó su hora — así se pudo marcar asistencia) pero con
// asistencia='asistio' recién grabada: la regla general de
// migrarOCancelarTurnosDePerdedor para turnos resueltos de la ficha que
// pierde es BORRARLOS ("nunca asistió a este", TR-106) — correcta para
// turnos resueltos que nunca se confirmaron, pero exactamente lo
// contrario de lo que corresponde acá, donde la persona SÍ asistió y esa
// asistencia tiene que preservarse en el historial de quien prevalece.
// resolverConflictoPacienteHandler (resolución manual, sin asistencia de
// por medio) sigue pasando nil — ese turno, si ya está resuelto sin
// confirmar nada, cae correctamente en la regla general de borrado.
func resolverConflictoComoVerdadero(tx *gorm.DB, conflicto db.ConflictoPaciente, turnoAMigrarDirecto *uuid.UUID) error {
	var enConflicto db.Paciente
	if err := tx.First(&enConflicto, "id = ?", conflicto.PacienteEnConflictoID).Error; err != nil {
		return err
	}
	// prevalece — corrección de bug real (2026-09-05, ver el comentario
	// grande de migrarOCancelarTurnosDePerdedor): se necesita el nombre
	// CANÓNICO de la ficha que gana el conflicto para pisar el snapshot
	// (NombreContacto/ApellidoContacto) de cada turno que se le reasigna,
	// tanto acá como dentro de esa función.
	var prevalece db.Paciente
	if err := tx.First(&prevalece, "id = ?", conflicto.PacienteVerificadoID).Error; err != nil {
		return err
	}
	if turnoAMigrarDirecto != nil {
		if err := tx.Model(&db.Turno{}).Where("id = ?", *turnoAMigrarDirecto).
			Updates(map[string]interface{}{
				"paciente_id":       prevalece.ID,
				"nombre_contacto":   prevalece.Nombre,
				"apellido_contacto": prevalece.Apellido,
			}).Error; err != nil {
			return err
		}
	}
	if err := migrarAlternativosDeContacto(tx, conflicto.PacienteVerificadoID, enConflicto); err != nil {
		return err
	}
	if err := migrarOCancelarTurnosDePerdedor(tx, prevalece, enConflicto.ID); err != nil {
		return err
	}
	if err := tx.Model(&db.Turno{}).Where("paciente_id = ?", enConflicto.ID).Update("paciente_id", nil).Error; err != nil {
		return err
	}
	if err := tx.Delete(&db.Paciente{}, "id = ?", enConflicto.ID).Error; err != nil {
		return err
	}
	return tx.Model(&conflicto).Update("resuelto", true).Error
}

// resolverConflictoComoFalso — cancela y desvincula los turnos de la ficha
// en conflicto (nunca se borra un turno, salvo la excepción de abajo) y la
// borra; si bloquearMail es true, además bloquea su mail 7 días
// (db.EmailBloqueadoTurnoPublico). Compartido por resolverConflictoPacienteHandler
// ("el mail NO es del paciente verificado", bloquearMail=true) y por el
// carve-out de asistencia de marcarAsistenciaHandler (TR-107, 1.3bis:
// marcar "ausente" en el turno disputado, bloquearMail=false — un ausente
// no prueba fraude, "puede que sea verdaderamente" quien dice ser).
//
// turnoExcluidoDelCancelado — cuando no es nil, ESE turno puntual queda
// afuera del cancelado masivo (sigue desvinculándose, paciente_id=NULL,
// por la red de seguridad de más abajo, pero mantiene su
// estado='agendado'). Hace falta en el carve-out de asistencia: el turno
// disputado ya tiene asistencia='ausente' recién grabada por
// marcarAsistenciaHandler — cancelarlo encima reescribiría esa historia
// real (un turno agendado al que no se asistió) como si se hubiera dado
// de baja antes de tiempo, dos cosas distintas. resolverConflictoPacienteHandler
// (resolución manual) sigue pasando nil — ahí ningún turno tiene
// asistencia marcada todavía, cancelarlos a todos es lo correcto.
func resolverConflictoComoFalso(tx *gorm.DB, conflicto db.ConflictoPaciente, profesionalID uuid.UUID, bloquearMail bool, turnoExcluidoDelCancelado *uuid.UUID) error {
	var enConflicto db.Paciente
	if err := tx.First(&enConflicto, "id = ?", conflicto.PacienteEnConflictoID).Error; err != nil {
		return err
	}

	cancelado := tx.Model(&db.Turno{}).Where("paciente_id = ? AND estado = 'agendado'", enConflicto.ID)
	if turnoExcluidoDelCancelado != nil {
		cancelado = cancelado.Where("id <> ?", *turnoExcluidoDelCancelado)
	}
	if err := cancelado.Updates(map[string]interface{}{"estado": "cancelada", "paciente_id": nil}).Error; err != nil {
		return err
	}

	if bloquearMail && enConflicto.Email != nil {
		bloqueo := db.EmailBloqueadoTurnoPublico{
			ProfesionalID:  profesionalID,
			Email:          *enConflicto.Email,
			BloqueadoHasta: time.Now().Add(7 * 24 * time.Hour),
		}
		if err := tx.Create(&bloqueo).Error; err != nil {
			return err
		}
	}

	// Red de seguridad: cualquier turno que por algún otro motivo siguiera
	// apuntando a esta ficha (incluido el excluido del cancelado de
	// arriba) queda desvinculado antes de borrarla — nunca dejar un
	// paciente_id colgando hacia una fila que ya no existe.
	if err := tx.Model(&db.Turno{}).Where("paciente_id = ?", enConflicto.ID).Update("paciente_id", nil).Error; err != nil {
		return err
	}
	if err := tx.Delete(&db.Paciente{}, "id = ?", enConflicto.ID).Error; err != nil {
		return err
	}
	return tx.Model(&conflicto).Update("resuelto", true).Error
}

// resolverConflictoPacienteHandler — POST /pacientes/conflictos/{id}/resolver
// (Fase 2.4.1), pedido textual del cliente, dos caminos:
//   - EsVerificado=true: "son la misma persona" — el mail/teléfono de la
//     ficha en conflicto se migran a la ficha que prevalece, y TODOS sus
//     turnos vigentes se migran o cancelan (ver migrarOCancelarTurnosDePerdedor).
//     La ficha en conflicto se borra (ya cumplió su propósito, y ya no le
//     queda ningún turno que la referencie).
//   - EsVerificado=false: "son personas distintas" — TODOS los turnos
//     vigentes de la ficha en conflicto se cancelan (nunca se borra un
//     turno, queda como registro histórico) y se desvinculan; su mail
//     queda bloqueado 7 días (db.EmailBloqueadoTurnoPublico) — "bloquear
//     su mail por una semana para que no lo pueda volver a usar para
//     sacar ningún tipo de turno". La ficha se borra.
//
// Corrección de QA: esto aplica IGUAL sea o no la ficha "verificada" del
// ticket una VERIFICACIÓN real (turno resuelto y asistido) — el conflicto
// se crea también entre dos fichas sin verificar todavía (dos primeras
// veces con el mismo DNI y mails distintos, ver
// crearPacientePublicoConDeteccionDeConflicto); acá el profesional
// resuelve a mano después de contactar a los dos, con la misma mecánica.
func resolverConflictoPacienteHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		conflictoID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de conflicto inválido")
			return
		}
		var req resolverConflictoPacienteRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}

		var conflicto db.ConflictoPaciente
		if err := gdb.Where("id = ? AND profesional_id = ?", conflictoID, profesionalID).First(&conflicto).Error; err != nil {
			writeError(w, http.StatusNotFound, "conflicto no encontrado")
			return
		}
		if conflicto.Resuelto {
			writeError(w, http.StatusConflict, "este conflicto ya fue resuelto")
			return
		}

		err = gdb.Transaction(func(tx *gorm.DB) error {
			if req.EsVerificado {
				return resolverConflictoComoVerdadero(tx, conflicto, nil)
			}
			// Resolución manual: bloquea el mail 7 días, sin excluir
			// ningún turno del cancelado masivo — acá ningún turno tiene
			// asistencia marcada todavía (a diferencia del carve-out de
			// marcarAsistenciaHandler, TR-107).
			return resolverConflictoComoFalso(tx, conflicto, profesionalID, true, nil)
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo resolver el conflicto")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"mensaje": "conflicto resuelto"})
	}
}
