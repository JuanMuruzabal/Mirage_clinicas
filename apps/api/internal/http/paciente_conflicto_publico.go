package http

import (
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

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

	// Fase 2.4.2 (`docs/Fase 2/turnero_pagina/ArquitecturaPeticionesTurno.md` 3.4, rediseñado en
	// la ronda de correcciones del 2026-09-06): "¿esta ficha responde al
	// mail entrante?" compara contra CUALQUIERA de los tutores YA
	// CONOCIDOS de esta ficha cuando el turno es "para otro" — ahí la
	// identidad que importa es la de quien reserva, no la del paciente
	// (que puede no tener mail propio). Sin TutorEmail (no debería pasar,
	// la validación de arriba en solicitarTurnoPublicoHandler ya lo exige
	// para este camino) se trata como "no responde" — nunca reusar una
	// ficha existente a ciegas.
	var responde bool
	if turno.EsParaOtro {
		if turno.TutorEmail != nil {
			responde, err = pacienteTieneTutorConMail(tx, existente.ID, *turno.TutorEmail)
			if err != nil {
				return resultadoPacientePublico{}, err
			}
		}
	} else {
		responde, err = pacienteRespondeAlMail(tx, existente, turno.EmailContacto)
		if err != nil {
			return resultadoPacientePublico{}, err
		}
	}
	if responde {
		// emailTipado/telefonoTipado — capturados ANTES de sincronizar:
		// sincronizarContactoConPaciente pisa turno.EmailContacto/
		// TelefonoContacto con los de la ficha (si ya tiene), así que
		// compararlos DESPUÉS siempre daría "igual, no hace nada".
		emailTipado := turno.EmailContacto
		telefonoTipado := turno.TelefonoContacto
		sincronizarContactoConPaciente(turno, existente)
		if turno.EsParaOtro {
			if err := agregarEmailAlternativoSiNuevo(tx, &existente, emailTipado); err != nil {
				return resultadoPacientePublico{}, err
			}
			// Teléfono propio del paciente — ronda de correcciones
			// (2026-09-06), bug real reportado por el cliente: "probé y
			// solo se llenó el mail, pero no el teléfono" — mismo criterio
			// que el mail, arriba.
			if err := agregarTelefonoAlternativoSiNuevo(tx, &existente, telefonoTipado); err != nil {
				return resultadoPacientePublico{}, err
			}
			// Teléfono del TUTOR — pedido textual del cliente (mid-turn,
			// 2026-09-06): "si un tutor vuelve a sacar turno con mismo
			// mail, diferente teléfono, añadir ese teléfono al tutor del
			// mail correspondiente" — a diferencia del teléfono propio de
			// arriba (que se acumula como alternativo), acá se ACTUALIZA
			// la fila del tutor — su mail es su identidad, no tiene
			// "teléfonos alternativos" propios.
			if turno.TutorEmail != nil {
				if err := agregarTelefonoDeTutorSiNuevo(tx, existente.ID, *turno.TutorEmail, derefStr(turno.TutorTelefono)); err != nil {
					return resultadoPacientePublico{}, err
				}
			}
		}
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

	// motivoDeConflicto — 4 escenarios según si la ficha YA CONOCÍA algún
	// tutor y si el pedido nuevo es "para otro" (ronda de correcciones,
	// 2026-09-06, pedido textual del cliente con 4 casos concretos — ver
	// TR-116 en docs/Arquitectura y base/tradeoffs.md). Ninguno de los 4 cambia el mecanismo
	// de conflicto en sí (misma tabla ConflictoPaciente, misma resolución
	// manual) — solo el texto que le explica al profesional qué pasó.
	existenteTieneTutores, err := existentePacienteTieneTutores(tx, existente.ID)
	if err != nil {
		return resultadoPacientePublico{}, err
	}
	var motivo string
	switch {
	case existenteTieneTutores && turno.EsParaOtro:
		// Escenario A: un tutor nuevo (distinto de los ya conocidos)
		// pide turno para el mismo paciente.
		motivo = "un nuevo tutor (" + derefStr(turno.TutorNombre) + ") pide turno para este paciente — ya hay otro tutor confirmado con este DNI"
	case existenteTieneTutores && !turno.EsParaOtro:
		// Escenario B: el paciente se presenta "para mí", con su propio
		// mail, aunque hasta ahora este DNI solo se conocía a través de
		// un tutor.
		motivo = "el paciente se presentó con su propio mail — este DNI está confirmado a través de un tutor. Recomendamos contactar al/los tutor(es) confirmado(s) si hace falta verificar."
	case !existenteTieneTutores && turno.EsParaOtro:
		// Escenario D (reverso de A): un tutor aparece para un paciente
		// que ya se había confirmado por sí mismo.
		motivo = "un tutor (" + derefStr(turno.TutorNombre) + ") pide turno para este paciente, ya confirmado por sí mismo"
	default:
		// Escenario "para mí" de siempre — sin cambios respecto de antes
		// de esta ronda.
		motivo = "se registró con un mail distinto al de la ficha ya verificada con este DNI"
	}
	return resultadoPacientePublico{
		Paciente:               nueva,
		ConflictoConVerificado: &existente,
		Motivo:                 motivo,
	}, nil
}

// existentePacienteTieneTutores — ¿esta ficha ya tiene al menos un tutor
// confirmado? (ver PacienteTutor en models.go) — decide, junto con
// `turno.EsParaOtro`, cuál de los 4 motivos de conflicto de arriba aplica.
func existentePacienteTieneTutores(tx *gorm.DB, pacienteID uuid.UUID) (bool, error) {
	var count int64
	err := tx.Model(&db.PacienteTutor{}).Where("paciente_id = ?", pacienteID).Limit(1).Count(&count).Error
	return count > 0, err
}

// agregarEmailAlternativoSiNuevo — ronda de correcciones (2026-09-06),
// pedido textual del cliente: "si los tutores añaden diferentes mails
// (opcionales al paciente) añadirlos a este cuando se complete el turno".
// Solo aplica cuando se REUSA una ficha ya existente por el camino "para
// otro" (el mail propio del paciente es opcional ahí, así que puede venir
// vacío, ser nuevo, o repetir el que ya tiene) — si `emailTipado` viene
// vacío, o ya es el principal, no hace nada. Si la ficha no tenía mail
// propio todavía, este pasa a ser el principal (por eso recibe `*existente`
// y lo actualiza); si ya tenía uno DISTINTO, se suma como alternativo
// (mismo `ON CONFLICT DO NOTHING` que migrarAlternativosDeContacto).
func agregarEmailAlternativoSiNuevo(tx *gorm.DB, existente *db.Paciente, emailTipado string) error {
	if emailTipado == "" {
		return nil
	}
	if existente.Email == nil {
		if err := tx.Model(existente).Update("email", emailTipado).Error; err != nil {
			return err
		}
		existente.Email = &emailTipado
		return nil
	}
	if *existente.Email == emailTipado {
		return nil
	}
	alt := db.PacienteEmailAlternativo{PacienteID: existente.ID, Email: emailTipado}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&alt).Error
}

// agregarTelefonoAlternativoSiNuevo — mismo criterio que
// agregarEmailAlternativoSiNuevo de arriba (ver ese comentario), para el
// teléfono PROPIO del paciente. Ronda de correcciones (2026-09-06), bug
// real reportado por el cliente: "probé y solo se llenó el mail, pero no
// el teléfono" — esta función nunca se había escrito, a pesar de que el
// criterio es idéntico al del mail.
func agregarTelefonoAlternativoSiNuevo(tx *gorm.DB, existente *db.Paciente, telefonoTipado string) error {
	if telefonoTipado == "" {
		return nil
	}
	if existente.Telefono == nil {
		if err := tx.Model(existente).Update("telefono", telefonoTipado).Error; err != nil {
			return err
		}
		existente.Telefono = &telefonoTipado
		return nil
	}
	if *existente.Telefono == telefonoTipado {
		return nil
	}
	alt := db.PacienteTelefonoAlternativo{PacienteID: existente.ID, Telefono: telefonoTipado}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&alt).Error
}

// agregarTelefonoDeTutorSiNuevo — pedido textual del cliente (ronda de
// correcciones 2026-09-06): "si un tutor vuelve a sacar turno con mismo
// mail, diferente teléfono, añadir ese teléfono al tutor del mail
// correspondiente". Corrección sobre una primera implementación que
// ACTUALIZABA la fila (reemplazaba el teléfono viejo por el nuevo) — el
// cliente aclaró que "añadir" es literal: el teléfono nuevo se ACUMULA
// (mismo criterio que agregarTelefonoAlternativoSiNuevo para el paciente,
// vía PacienteTutorTelefonoAlternativo), nunca se pierde el anterior. El
// mail sigue siendo la identidad del tutor (PacienteTutor.Email no
// cambia); esta función solo decide si el teléfono tipado ya es el
// principal, ya es un alternativo conocido, o hay que sumarlo.
func agregarTelefonoDeTutorSiNuevo(tx *gorm.DB, pacienteID uuid.UUID, tutorEmail, tutorTelefono string) error {
	if tutorTelefono == "" {
		return nil
	}
	tutor, err := buscarTutorConMail(tx, pacienteID, tutorEmail)
	if err != nil {
		return err
	}
	if tutor == nil || tutor.Telefono == tutorTelefono {
		return nil
	}
	alt := db.PacienteTutorTelefonoAlternativo{PacienteTutorID: tutor.ID, Telefono: tutorTelefono}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&alt).Error
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
		EnConflicto:   enConflicto,
		// Origen explícito (coincide con el default de la columna, pero
		// declarado a mano para que quede claro en el código que ESTA
		// ficha nace sin confiar en el DNI todavía — a diferencia de una
		// creada a mano por el profesional, ver pacienteEstaVerificado.
		Origen: "pagina_publica",
	}
	// Telefono/Email — Fase 2.4.2: vacío pasa a nil (antes Telefono era
	// NOT NULL, siempre venía con algo) en vez de un string vacío — "para
	// otro" deja el teléfono/mail PROPIO del paciente opcionales.
	if turno.TelefonoContacto != "" {
		paciente.Telefono = &turno.TelefonoContacto
	}
	if turno.EmailContacto != "" {
		paciente.Email = &turno.EmailContacto
	}
	if err := tx.Create(&paciente).Error; err != nil {
		return db.Paciente{}, err
	}
	// PacienteTutor — Fase 2.4.2, ronda de correcciones (2026-09-06): la
	// ficha nace con el primero de posiblemente varios tutores a lo largo
	// del tiempo (ver PacienteTutor en models.go) — copiado del snapshot
	// ya validado en el Turno, ahora como fila aparte en vez de campos
	// directos en `Paciente`. Nunca se crea en una ficha "para mí".
	if turno.EsParaOtro {
		tutor := db.PacienteTutor{
			PacienteID: paciente.ID,
			Relacion:   derefStr(turno.TutorRelacion),
			Nombre:     derefStr(turno.TutorNombre),
			Telefono:   derefStr(turno.TutorTelefono),
			Email:      derefStr(turno.TutorEmail),
		}
		if err := tx.Create(&tutor).Error; err != nil {
			return db.Paciente{}, err
		}
	}
	return paciente, nil
}
