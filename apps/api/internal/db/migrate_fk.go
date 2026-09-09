package db

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
)

// Foreign keys reales del esquema — Fase C de la auditoría de seguridad y
// optimización (2026-09-09, `docs/Seguridad y optimizacion/`).
//
// Hasta acá el esquema tenía exactamente 4 foreign keys, y las 4 las creaba
// GORM sola en tablas de join many2many. Todas las relaciones del dominio
// —`turnos.profesional_id`, `pacientes.profesional_id`, `turnos.paciente_id`,
// y ~25 más— eran columnas `uuid` sueltas, sin ninguna garantía de que
// apuntaran a algo que existe.
//
// # La trampa de nombres, verificada antes de escribir una sola constraint
//
// `profesional_id` NO apunta a la tabla `profesionales`: guarda un
// `clinics.id`. Se confirmó empíricamente, no leyendo el nombre —
// `profesionalIDFromRequest` (internal/http/turnos.go) devuelve el
// `clinicID` del contexto, y el wizard público escribe `clinic.ID` en esa
// misma columna. La tabla `profesionales` es legacy de antes de TR-037 y
// está vacía. Una FK puesta por el nombre habría hecho fallar TODOS los
// inserts, en el panel y en el formulario público.
//
// El nombre de la columna no se cambia acá: renombrarla toca decenas de
// queries y merece su propio cambio. Las constraints sí se llaman por lo
// que la relación ES (`fk_pacientes_clinica`, no `fk_pacientes_profesional`),
// así que el esquema queda diciendo la verdad aunque la columna no.
//
// # Por qué todas arrancan en RESTRICT
//
// Una FK sin `ON DELETE` no puede destruir datos: solo puede RECHAZAR un
// borrado. Las únicas que destruyen son CASCADE y SET NULL. Arrancar con
// todas en RESTRICT hace que el peor caso posible sea "una ruta de borrado
// empieza a fallar" —cosa que la suite de tests detecta de inmediato— en
// vez de "se borró algo en silencio". Las pocas que necesitan otra
// semántica se cambian de a una, con su test, y el motivo escrito.

// claveForanea describe una relación real del esquema.
type claveForanea struct {
	// Nombre de la constraint. Nombra la relación REAL, no la columna —
	// ver la trampa de nombres arriba.
	Nombre  string
	Tabla   string
	Columna string
	Padre   string
	// OnDelete vacío = NO ACTION (RESTRICT), que es lo que queremos por
	// default. Cualquier otro valor tiene que venir con su motivo escrito
	// en el comentario de la entrada.
	OnDelete string
	// Nullable — una columna opcional solo es huérfana si tiene valor y
	// ese valor no existe.
	Nullable bool
}

// clavesForaneas — el inventario completo. Las relaciones EXCLUIDAS a
// propósito están documentadas abajo de la lista.
func clavesForaneas() []claveForanea {
	return []claveForanea{
		// --- Todo lo que pertenece a una clínica ---
		// Las clínicas no se borran por ninguna ruta del código hoy, así
		// que RESTRICT no bloquea nada existente y, el día que se agregue
		// un borrado de clínica, obliga a decidir explícitamente qué pasa
		// con los datos clínicos en vez de barrerlos en silencio.
		{"fk_pacientes_clinica", "pacientes", "profesional_id", "clinics", "", false},
		{"fk_turnos_clinica", "turnos", "profesional_id", "clinics", "", false},
		{"fk_tipos_consulta_clinica", "tipos_consulta", "profesional_id", "clinics", "", false},
		{"fk_paginas_publicas_clinica", "paginas_publicas", "profesional_id", "clinics", "", false},
		{"fk_enlaces_turno_clinica", "enlaces_turno", "profesional_id", "clinics", "", false},
		{"fk_conflictos_paciente_clinica", "conflictos_paciente", "profesional_id", "clinics", "", false},
		{"fk_auditoria_bloqueos_clinica", "auditoria_bloqueos_turno_publico", "profesional_id", "clinics", "", false},
		{"fk_emails_bloqueados_clinica", "emails_bloqueados_turno_publico", "profesional_id", "clinics", "", false},
		{"fk_ips_bloqueadas_clinica", "ips_bloqueadas_turno_publico", "profesional_id", "clinics", "", false},
		{"fk_bloqueos_horario_clinica", "bloqueos_horario", "clinic_id", "clinics", "", false},
		{"fk_horarios_atencion_clinica", "horarios_atencion", "clinic_id", "clinics", "", false},
		{"fk_verificaciones_turno_clinica", "verificaciones_turno_publico", "clinic_id", "clinics", "", false},
		{"fk_clinic_members_clinica", "clinic_members", "clinic_id", "clinics", "", false},
		{"fk_clinic_invitations_clinica", "clinic_invitations", "clinic_id", "clinics", "", false},

		// --- Lo que cuelga de una ficha de paciente ---
		{"fk_turnos_paciente", "turnos", "paciente_id", "pacientes", "", true},
		{"fk_paciente_emails_alt_paciente", "paciente_emails_alternativos", "paciente_id", "pacientes", "", false},
		{"fk_paciente_telefonos_alt_paciente", "paciente_telefonos_alternativos", "paciente_id", "pacientes", "", false},
		{"fk_paciente_tutores_paciente", "paciente_tutores", "paciente_id", "pacientes", "", false},
		{"fk_tutor_telefonos_alt_tutor", "paciente_tutor_telefonos_alternativos", "paciente_tutor_id", "paciente_tutores", "", false},

		// --- Tipo de consulta ---
		// eliminarTipoConsultaHandler ya rechaza con 409 si hay turnos
		// asociados: la FK calca exactamente el comportamiento que el
		// código ya tiene, como red por debajo.
		{"fk_turnos_tipo_consulta", "turnos", "tipo_consulta_id", "tipos_consulta", "", true},

		// --- Cuentas de usuario: CASCADE, y no por comodidad ---
		//
		// Estas filas pertenecen ESTRICTAMENTE a un usuario y no significan
		// nada sin él. El purgado de cuentas abandonadas
		// (PurgeAuthGarbage, cleanup.go) ya borra a mano las sesiones y los
		// tokens antes de borrar el usuario — o sea, la intención de que se
		// vayan con él ya estaba— pero se olvida del perfil profesional, de
		// sus especialidades y de la membresía de clínica. Ese olvido es
		// justamente lo que el chequeo de huérfanos encontró en la base de
		// test: filas colgando de usuarios que ya no existen.
		//
		// CASCADE completa esa intención sin tocar el código que ya está
		// verificado, en vez de sumar cinco borrados manuales más que la
		// próxima tabla volvería a dejar incompletos.
		//
		// Es seguro dejarlo en CASCADE porque ninguna ruta actual borra un
		// usuario que tenga clínica: tanto PurgeAuthGarbage como el borrado
		// de meHandler (TR-052) apuntan solo a cuentas SIN VERIFICAR, y sin
		// verificar el mail no se puede completar el onboarding ni crear
		// una clínica. Lo que protege esa frontera es fk_clinics_owner, más
		// abajo.
		{"fk_sessions_user", "sessions", "user_id", "users", "CASCADE", false},
		{"fk_verification_tokens_user", "verification_tokens", "user_id", "users", "CASCADE", false},
		{"fk_accounts_user", "accounts", "user_id", "users", "CASCADE", false},
		{"fk_professional_profiles_user", "professional_profiles", "user_id", "users", "CASCADE", false},
		{"fk_professional_especialidades_user", "professional_especialidades", "user_id", "users", "CASCADE", false},
		{"fk_clinic_members_user", "clinic_members", "user_id", "users", "CASCADE", false},
		{"fk_clinic_invitations_user", "clinic_invitations", "invited_by_user_id", "users", "CASCADE", false},

		// audit_events es una tabla de AUDITORÍA: el registro tiene que
		// sobrevivir al borrado del usuario, que es exactamente cuando más
		// vale. La columna es nullable, así que SET NULL conserva el evento
		// y suelta la referencia. Mismo criterio que la exclusión de
		// `conflictos_paciente` documentada abajo — la diferencia es que
		// acá la columna admite NULL y ahí no.
		{"fk_audit_events_user", "audit_events", "user_id", "users", "SET NULL", true},

		// El freno de mano: RESTRICT a propósito. Ninguna ruta borra hoy a
		// un usuario dueño de una clínica; si alguien agrega esa
		// funcionalidad, esta constraint lo obliga a decidir explícitamente
		// qué pasa con los pacientes y los turnos, en vez de que el CASCADE
		// de arriba se los lleve puestos en silencio.
		{"fk_clinics_owner", "clinics", "owner_id", "users", "", false},
	}
}

// Relaciones EXCLUIDAS a propósito — no llevan foreign key:
//
//   - conflictos_paciente.paciente_en_conflicto_id
//   - conflictos_paciente.paciente_verificado_id
//   - conflictos_paciente.turno_en_conflicto_id
//
// `conflictos_paciente` es una tabla de HISTORIAL, no de referencias vivas.
// `resolverConflictoComoVerdadero`/`...ComoFalso`
// (internal/http/pacientes_conflicto_panel.go) BORRAN la ficha perdedora y
// después marcan la fila del conflicto como `resuelto = true`, conservándola
// como registro de lo que pasó. La referencia queda colgada A PROPÓSITO.
//
// No es teoría: en la base de desarrollo, 17 de 17 filas de esa tabla
// tenían `paciente_en_conflicto_id` apuntando a una ficha ya borrada. Una
// FK RESTRICT ahí habría roto la resolución de conflictos de plano, y una
// CASCADE habría borrado el historial junto con la ficha — que es justo lo
// que la tabla existe para conservar.
//
// `conflictos_paciente.profesional_id` SÍ lleva FK (arriba): una clínica no
// se borra nunca, así que esa referencia no queda colgada.

// aplicarForeignKeys agrega las constraints que falten. Idempotente: una
// que ya existe se saltea.
//
// Antes de tocar nada corre el reporte de huérfanos COMPLETO y, si
// encuentra alguno, se niega listándolos TODOS de una vez. Sin eso, el
// `ADD CONSTRAINT` falla con un error opaco de Postgres sobre la primera
// relación rota; se arregla esa, se vuelve a deployar, y aparece la
// siguiente. Un reporte por corrida en vez de uno por deploy.
func aplicarForeignKeys(gdb *gorm.DB) error {
	fks := clavesForaneas()

	var rotas []string
	for _, fk := range fks {
		n, err := contarHuerfanos(gdb, fk)
		if err != nil {
			return fmt.Errorf("no se pudo evaluar huérfanos de %s: %w", fk.Nombre, err)
		}
		if n > 0 {
			rotas = append(rotas, fmt.Sprintf("  %s.%s -> %s: %d fila(s) apuntan a un registro inexistente",
				fk.Tabla, fk.Columna, fk.Padre, n))
		}
	}
	if len(rotas) > 0 {
		return fmt.Errorf("no se pueden crear las foreign keys: hay datos huérfanos que habría que revisar primero.\n%s",
			strings.Join(rotas, "\n"))
	}

	for _, fk := range fks {
		if err := agregarForeignKey(gdb, fk); err != nil {
			return err
		}
	}
	return nil
}

func contarHuerfanos(gdb *gorm.DB, fk claveForanea) (int64, error) {
	filtroNull := ""
	if fk.Nullable {
		filtroNull = fmt.Sprintf("h.%s IS NOT NULL AND ", fk.Columna)
	}
	query := fmt.Sprintf(
		"SELECT count(*) FROM %s h WHERE %sNOT EXISTS (SELECT 1 FROM %s p WHERE p.id = h.%s)",
		fk.Tabla, filtroNull, fk.Padre, fk.Columna)
	var n int64
	if err := gdb.Raw(query).Scan(&n).Error; err != nil {
		return 0, err
	}
	return n, nil
}

func agregarForeignKey(gdb *gorm.DB, fk claveForanea) error {
	// Se PREGUNTA si la constraint existe antes de intentar crearla, en vez
	// de tirar el ALTER TABLE dentro de un `DO $$ ... EXCEPTION WHEN
	// duplicate_object` como hace el resto de migrate.go.
	//
	// Bug real, diagnosticado desde el log del servidor de Postgres: ese
	// patrón es idempotente en su RESULTADO, pero no en sus LOCKS. Un
	// `ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY` toma
	// ShareRowExclusiveLock sobre la tabla PADRE y AccessExclusiveLock
	// sobre la hija ANTES de descubrir que la constraint ya existía y
	// descartarse. Con 29 foreign keys sobre `clinics` y `users` —las dos
	// tablas más ocupadas— cada corrida de migraciones bloqueaba esas
	// tablas 29 veces, mientras los tests de otro paquete insertaban filas
	// que necesitan RowExclusiveLock sobre las mismas. Resultado:
	// deadlocks intermitentes en tests que no tenían nada que ver, con
	// síntomas que cambiaban de corrida en corrida.
	//
	// Un SELECT sobre pg_constraint no toma ningún lock pesado, así que a
	// partir de la primera corrida esto no molesta a nadie. De paso, la
	// migración deja de tardar ~29 segundos de más.
	var existe bool
	if err := gdb.Raw(
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = ? AND conrelid = to_regclass(?))",
		fk.Nombre, fk.Tabla).Scan(&existe).Error; err != nil {
		return fmt.Errorf("no se pudo verificar si existe la foreign key %s: %w", fk.Nombre, err)
	}
	if existe {
		return nil
	}

	onDelete := ""
	if fk.OnDelete != "" {
		onDelete = " ON DELETE " + fk.OnDelete
	}
	// El DO $$ se mantiene para la carrera entre dos procesos que migren a
	// la vez: el advisory lock de RunMigrations ya los serializa, pero si
	// alguna vez se corriera esto sin ese lock, `duplicate_object` (SQLSTATE
	// 42710) evita que el segundo falle.
	sql := fmt.Sprintf(`DO $$ BEGIN
		ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s(id)%s;
	EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
		fk.Tabla, fk.Nombre, fk.Columna, fk.Padre, onDelete)
	if err := gdb.Exec(sql).Error; err != nil {
		return fmt.Errorf("no se pudo crear la foreign key %s: %w", fk.Nombre, err)
	}
	return nil
}
