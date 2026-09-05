package http

import (
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// resultadoPacientePublico — lo que devuelve
// crearPacientePublicoConDeteccionDeConflicto: la ficha a la que el turno
// se termina vinculando, y opcionalmente los datos para armar un
// `ConflictoPaciente` DESPUÉS de crear el turno (necesita su ID, que
// todavía no existe en el momento en que se resuelve el paciente — ver
// solicitarTurnoPublicoHandler).
type resultadoPacientePublico struct {
	Paciente               db.Paciente
	ConflictoConVerificado *db.Paciente
	Motivo                 string
}

// crearPacientePublicoConDeteccionDeConflicto — Fase 2.4.1 (F4.1.3,
// `docs/FASE 2.4 - detallada y bien especificada.docx`): variante de
// crearOBuscarPacientePorDNI (turnos.go, TR-100/101) SOLO para el
// formulario público — el camino del panel ("Agregar turno" del
// profesional) sigue usando la función vieja tal cual, sin tocar, ya
// aprobada por el cliente.
//
// Mismo punto de partida (buscar por DNI, crear si no existe), pero
// cuando el DNI YA existe con un mail DISTINTO al que se acaba de
// verificar, SIEMPRE se crea una ficha separada (EnConflicto=true) para
// ese mail — dos personas sin verificar compartiendo un DNI no se pisan
// los datos entre sí. Corrección de QA (tercera revisión de TR-101):
// el ConflictoPaciente visible en /panel/pacientes recién se crea si la
// ficha existente YA está verificada en este momento — "no sabemos con
// certeza quién es el impostor acá" cuando ninguna de las dos demostró
// nada todavía, así que no tiene sentido avisarle al profesional de un
// conflicto que ninguna prueba respalda. Si más adelante CUALQUIERA de
// las dos fichas demuestra ser la real (turno resuelto y asistido), el
// conflicto se detecta y se resuelve recién ahí, retroactivamente — ver
// autoResolverConflictosAlVerificar.
func crearPacientePublicoConDeteccionDeConflicto(tx *gorm.DB, profesionalID uuid.UUID, turno *db.Turno) (resultadoPacientePublico, error) {
	// `en_conflicto = false` — nunca compararse contra una ficha
	// temporaria de un conflicto todavía sin resolver (ver
	// db.Paciente.EnConflicto); esa ficha no es "la" real para este DNI
	// hasta que el profesional decida qué hacer con ella.
	var existente db.Paciente
	err := tx.Where("profesional_id = ? AND dni = ? AND en_conflicto = false", profesionalID, turno.DNIContacto).First(&existente).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		nueva, err := crearFichaPacientePublico(tx, profesionalID, turno, false)
		if err != nil {
			if isUniqueViolation(err) {
				// Carrera real: otra request creó el mismo DNI entre el
				// SELECT de arriba y este INSERT — mismo criterio que
				// crearOBuscarPacientePorDNI, se reintenta como "ya existe".
				return crearPacientePublicoConDeteccionDeConflicto(tx, profesionalID, turno)
			}
			return resultadoPacientePublico{}, err
		}
		return resultadoPacientePublico{Paciente: nueva}, nil
	}
	if err != nil {
		return resultadoPacientePublico{}, err
	}

	responde, err := pacienteRespondeAlMail(tx, existente, turno.EmailContacto)
	if err != nil {
		return resultadoPacientePublico{}, err
	}
	if responde {
		sincronizarContactoConPaciente(turno, existente)
		return resultadoPacientePublico{Paciente: existente}, nil
	}

	verificado, err := pacienteEstaVerificado(tx, existente)
	if err != nil {
		return resultadoPacientePublico{}, err
	}

	nueva, err := crearFichaPacientePublico(tx, profesionalID, turno, true)
	if err != nil {
		return resultadoPacientePublico{}, err
	}
	if !verificado {
		// Ninguna de las dos fichas está verificada todavía — no se
		// marca el conflicto ahora. Queda como dos fichas separadas y
		// sin señalar hasta que una de las dos demuestre ser la real
		// (ver autoResolverConflictosAlVerificar).
		return resultadoPacientePublico{Paciente: nueva}, nil
	}
	return resultadoPacientePublico{
		Paciente:               nueva,
		ConflictoConVerificado: &existente,
		Motivo:                 "se registró con un mail distinto al de la ficha ya verificada con este DNI",
	}, nil
}

// generarConflictosRetroactivosPorDNI — corrección de QA, pedido textual
// del cliente (revisión sobre un diseño anterior que auto-resolvía esto
// — ver el historial de esta función en git si hace falta el detalle):
// "esto no se tiene que auto solucionar, se debe marcar al profesional
// para que lo resuelva manualmente". Como
// crearPacientePublicoConDeteccionDeConflicto ya no deja un
// ConflictoPaciente cuando nadie está verificado (ver ahí), acá se cubre
// el otro lado: en cuanto `pacienteVerificado` demuestra ser real (turno
// resuelto y asistido, o alta manual del profesional), se buscan OTRAS
// fichas del mismo profesional con el MISMO DNI que nunca llegaron a
// tener un ticket (porque en su momento nadie estaba verificado) y se
// deja un ConflictoPaciente PENDIENTE (`Resuelto: false`) para cada
// una — ninguna ficha ni turno se toca acá, la migración/cancelación
// real queda 100% en manos del profesional vía
// resolverConflictoPacienteHandler (pacientes_conflicto_panel.go), mismo
// criterio que el conflicto que se crea de inmediato cuando la ficha
// existente YA estaba verificada (crearPacientePublicoConDeteccionDeConflicto).
//
// Por qué ya no hace falta un mecanismo de "resolver un ticket que ya
// existía": mientras un ConflictoPaciente siga pendiente,
// marcarAsistenciaHandler (turnos.go) bloquea marcar asistencia/ausencia
// en CUALQUIER turno de las dos fichas involucradas — así que para
// cuando esta función se llama, nunca puede toparse con una "hermana"
// que ya tenga un ticket pendiente Y además acabe de conseguir su propia
// verificación por otro lado (el bloqueo se lo impidió). Antes esto sí
// pasaba, y el resultado podía ser borrar a la ficha ORIGINAL (la que ya
// estaba verificada primero) si la impostora conseguía su propio
// "asistió" más tarde — un bug real encontrado en QA.
func generarConflictosRetroactivosPorDNI(tx *gorm.DB, pacienteVerificado db.Paciente) error {
	var hermanas []db.Paciente
	if err := tx.Where("profesional_id = ? AND dni = ? AND id != ?",
		pacienteVerificado.ProfesionalID, pacienteVerificado.DNI, pacienteVerificado.ID).Find(&hermanas).Error; err != nil {
		return err
	}
	for _, hermana := range hermanas {
		// Si la hermana TAMBIÉN está verificada, son dos identidades
		// confirmadas compitiendo por el mismo DNI — una anomalía real
		// que este mecanismo no decide sola; queda para revisión manual
		// directa desde las fichas de cada una.
		hermanaVerificada, err := pacienteEstaVerificado(tx, hermana)
		if err != nil {
			return err
		}
		if hermanaVerificada {
			continue
		}

		// Evita duplicar el ticket si esta función se llama más de una
		// vez para el mismo par (p. ej. la ficha verificada tiene más de
		// un turno y se marca "asistió" en otro más adelante).
		var ticketExistente int64
		if err := tx.Model(&db.ConflictoPaciente{}).
			Where("resuelto = false AND ((paciente_verificado_id = ? AND paciente_en_conflicto_id = ?) OR (paciente_verificado_id = ? AND paciente_en_conflicto_id = ?))",
				pacienteVerificado.ID, hermana.ID, hermana.ID, pacienteVerificado.ID).
			Count(&ticketExistente).Error; err != nil {
			return err
		}
		if ticketExistente > 0 {
			continue
		}

		var turnoReferencia db.Turno
		err = tx.Where("paciente_id = ?", hermana.ID).Order("hora_inicio").First(&turnoReferencia).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Sin ningún turno propio no hay nada que mostrar en el
			// panel de conflictos (necesita un TurnoEnConflictoID) — no
			// debería pasar en la práctica (toda ficha nace de un
			// turno), la condición queda explícita por las dudas.
			continue
		}
		if err != nil {
			return err
		}

		ticket := db.ConflictoPaciente{
			ProfesionalID:         pacienteVerificado.ProfesionalID,
			PacienteVerificadoID:  pacienteVerificado.ID,
			PacienteEnConflictoID: hermana.ID,
			TurnoEnConflictoID:    turnoReferencia.ID,
			Motivo:                "mismo DNI con un mail distinto — detectado al verificarse esta ficha, pendiente de resolución manual",
		}
		if err := tx.Create(&ticket).Error; err != nil {
			return err
		}
	}
	return nil
}

// turnoVigenteDeTipo — Fase 2.4.1: "si ya tengo turno en el tipo de
// consulta seleccionado que me aparezca para elegir, no dejar sacar
// turno, dar aviso que ya hay un turno registrado para este tipo de
// consulta" — pedido textual del cliente. Corrección de QA: devuelve el
// turno encontrado (no solo si existe) para que el mensaje pueda incluir
// la fecha ("ya tenés un turno agendado para el día tal") — el más
// próximo primero, si hubiera más de uno.
func turnoVigenteDeTipo(tx *gorm.DB, pacienteID, tipoConsultaID uuid.UUID) (*db.Turno, error) {
	var turno db.Turno
	err := tx.Where("paciente_id = ? AND tipo_consulta_id = ? AND estado = 'agendado' AND hora_fin >= now()", pacienteID, tipoConsultaID).
		Order("hora_inicio").
		First(&turno).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &turno, nil
}

func crearFichaPacientePublico(tx *gorm.DB, profesionalID uuid.UUID, turno *db.Turno, enConflicto bool) (db.Paciente, error) {
	paciente := db.Paciente{
		ProfesionalID: profesionalID,
		Nombre:        turno.NombreContacto,
		Apellido:      turno.ApellidoContacto,
		DNI:           turno.DNIContacto,
		Telefono:      turno.TelefonoContacto,
		EnConflicto:   enConflicto,
		// Origen explícito (coincide con el default de la columna, pero
		// declarado a mano para que quede claro en el código que ESTA
		// ficha nace sin confiar en el DNI todavía — a diferencia de una
		// creada a mano por el profesional, ver pacienteEstaVerificado.
		Origen: "pagina_publica",
	}
	if turno.EmailContacto != "" {
		paciente.Email = &turno.EmailContacto
	}
	if err := tx.Create(&paciente).Error; err != nil {
		return db.Paciente{}, err
	}
	return paciente, nil
}
