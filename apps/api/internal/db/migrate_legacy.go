package db

import "gorm.io/gorm"

// Limpieza de las filas de la era anterior a TR-037 — ver la entrada
// "limpiar_filas_legacy_sin_clinica" en migrate_destructiva.go para el
// contexto completo.
//
// Las tres tablas raíz afectadas (`pacientes`, `tipos_consulta`,
// `paginas_publicas`) tienen en común que su `profesional_id` apunta a una
// clínica que no existe. Se resuelven con la misma condición, escrita una
// sola vez acá abajo.

// tablasLegacySinClinica — las raíces a limpiar, en el orden en que se
// borran. `pacientes` va última entre las que tienen hijos porque hay que
// barrer lo que cuelga de ella primero.
var tablasLegacySinClinica = []string{"tipos_consulta", "paginas_publicas", "pacientes"}

// condicionSinClinica arma el WHERE que identifica una fila cuya clínica no
// existe. Se usa igual para contar y para borrar: si las dos consultas se
// escribieran por separado, podrían desincronizarse y el reporte de impacto
// dejaría de decir la verdad sobre lo que el borrado va a hacer.
func condicionSinClinica(tabla string) string {
	return "SELECT id FROM " + tabla + " h WHERE NOT EXISTS (SELECT 1 FROM clinics p WHERE p.id = h.profesional_id)"
}

func contarFilasLegacySinClinica(tx *gorm.DB) (int64, error) {
	var total int64
	for _, tabla := range tablasLegacySinClinica {
		n, err := contarFilas(tx, "SELECT count(*) FROM ("+condicionSinClinica(tabla)+") AS x")
		if err != nil {
			return 0, err
		}
		total += n
	}
	// Los tutores huérfanos de una ficha que ya no existe entran en la
	// misma limpieza: son del mismo período y de la misma causa.
	n, err := contarFilas(tx, `SELECT count(*) FROM paciente_tutores h
		WHERE NOT EXISTS (SELECT 1 FROM pacientes p WHERE p.id = h.paciente_id)`)
	if err != nil {
		return 0, err
	}
	total += n

	// Y lo que quedó colgando de usuarios ya borrados — ver
	// tablasColgadasDeUsuarioBorrado.
	for _, tabla := range tablasColgadasDeUsuarioBorrado {
		n, err := contarFilas(tx, "SELECT count(*) FROM "+tabla+" h "+condicionSinUsuario)
		if err != nil {
			return 0, err
		}
		total += n
	}

	// Los turnos rotos. Se cuentan aparte y al final porque son la parte
	// que faltaba (ver el comentario grande de borrarFilasLegacySinClinica)
	// y porque el conteo tiene que incluir TODO lo que el borrado va a
	// tocar: si `Afectados` dice 10 y después el barrido modifica 4 filas
	// más, el guardián de migraciones destructivas está pidiendo permiso
	// para algo distinto de lo que va a hacer.
	for _, q := range consultasTurnosRotos {
		n, err := contarFilas(tx, q)
		if err != nil {
			return 0, err
		}
		total += n
	}
	return total, nil
}

// consultasTurnosRotos — las tres formas en que un turno puede quedar
// apuntando a algo que no existe. Cada una se cuenta y se corrige con la
// MISMA condición, para que el número que reporta el guardián sea el número
// de filas que el borrado toca.
var consultasTurnosRotos = []string{
	`SELECT count(*) FROM turnos h WHERE NOT EXISTS (SELECT 1 FROM clinics p WHERE p.id = h.profesional_id)`,
	`SELECT count(*) FROM turnos h WHERE h.paciente_id IS NOT NULL
	   AND EXISTS (SELECT 1 FROM clinics c WHERE c.id = h.profesional_id)
	   AND NOT EXISTS (SELECT 1 FROM pacientes p WHERE p.id = h.paciente_id)`,
	`SELECT count(*) FROM turnos h WHERE h.tipo_consulta_id IS NOT NULL
	   AND EXISTS (SELECT 1 FROM clinics c WHERE c.id = h.profesional_id)
	   AND NOT EXISTS (SELECT 1 FROM tipos_consulta t WHERE t.id = h.tipo_consulta_id)`,
}

// tablasColgadasDeUsuarioBorrado — filas que sobrevivieron al borrado de su
// usuario. PurgeAuthGarbage (cleanup.go) borra a mano las sesiones y los
// tokens antes de borrar la cuenta, pero se olvida del perfil profesional,
// de sus especialidades y de la membresía de clínica; meHandler (TR-052)
// borra el usuario sin limpiar nada. De ahí en más quedan inalcanzables:
// todas estas tablas se consultan por `user_id`, y ese usuario ya no
// existe.
//
// A partir de esta migración el problema no se repite: las foreign keys de
// estas mismas tablas van con ON DELETE CASCADE (ver migrate_fk.go), así
// que el borrado del usuario se las lleva. Esta limpieza es solo para lo
// que quedó de antes.
//
// `audit_events` NO está en esta lista a propósito: es auditoría, y el
// registro vale justamente cuando el usuario ya no está. Su columna es
// nullable, así que en vez de borrarse se le suelta la referencia.
// EL ORDEN IMPORTA: `professional_especialidades` va ANTES que
// `professional_profiles`. Esa tabla de join es de las 4 que ya tenían
// foreign key en el esquema (GORM las crea sola en las relaciones
// many2many), y apunta a `professional_profiles` — borrar el perfil primero
// falla con "violates foreign key constraint". Lo encontró la suite al
// correr esta migración, no una lectura del esquema.
var tablasColgadasDeUsuarioBorrado = []string{
	"sessions", "verification_tokens", "accounts",
	"professional_especialidades", "professional_profiles",
}

const condicionSinUsuario = `WHERE NOT EXISTS (SELECT 1 FROM users p WHERE p.id = h.user_id)`

func borrarFilasLegacySinClinica(tx *gorm.DB) error {
	pacientesLegacy := condicionSinClinica("pacientes")

	// 0. Los turnos de una clínica que no existe.
	//
	//    Faltaba, y lo encontró un deploy fallido en Render (2026-09-09) —
	//    no la base de desarrollo, donde justo no había ni uno, así que la
	//    verificación se hizo contra una base que no tenía el caso.
	//
	//    Van PRIMERO por el mismo motivo que todo el resto de este archivo
	//    está ordenado: un turno de una clínica inexistente puede
	//    referenciar además un paciente o un tipo de consulta que los pasos
	//    de abajo van a borrar. Sacarlos de entrada evita tener que
	//    contemplarlos en cada paso siguiente.
	//
	//    Son inalcanzables para la aplicación: cada query del panel filtra
	//    por la clínica de la sesión, y esa clínica no existe.
	pasos := []string{
		`DELETE FROM turnos h WHERE NOT EXISTS (SELECT 1 FROM clinics p WHERE p.id = h.profesional_id)`,
	}

	// 1. Lo que cuelga de las fichas que se van a borrar. Primero los
	//    teléfonos alternativos de los tutores (nietos), después los
	//    tutores, después mails y teléfonos de la ficha. Borrar la ficha
	//    antes dejaría estos registros huérfanos — cambiando un problema
	//    de integridad por otro.
	pasos = append(pasos,
		`DELETE FROM paciente_tutor_telefonos_alternativos
		   WHERE paciente_tutor_id IN (
		     SELECT id FROM paciente_tutores WHERE paciente_id IN (`+pacientesLegacy+`))`,
		`DELETE FROM paciente_tutores WHERE paciente_id IN (`+pacientesLegacy+`)`,
		`DELETE FROM paciente_emails_alternativos WHERE paciente_id IN (`+pacientesLegacy+`)`,
		`DELETE FROM paciente_telefonos_alternativos WHERE paciente_id IN (`+pacientesLegacy+`)`,

		// 2. Tutores que ya estaban huérfanos de una ficha inexistente,
		//    de antes de que la resolución de conflictos los limpiara.
		`DELETE FROM paciente_tutor_telefonos_alternativos
		   WHERE paciente_tutor_id IN (
		     SELECT id FROM paciente_tutores h
		     WHERE NOT EXISTS (SELECT 1 FROM pacientes p WHERE p.id = h.paciente_id))`,
		`DELETE FROM paciente_tutores h
		   WHERE NOT EXISTS (SELECT 1 FROM pacientes p WHERE p.id = h.paciente_id)`,

		// 3. Las raíces.
		`DELETE FROM tipos_consulta h WHERE NOT EXISTS (SELECT 1 FROM clinics p WHERE p.id = h.profesional_id)`,
		`DELETE FROM paginas_publicas h WHERE NOT EXISTS (SELECT 1 FROM clinics p WHERE p.id = h.profesional_id)`,
		`DELETE FROM pacientes h WHERE NOT EXISTS (SELECT 1 FROM clinics p WHERE p.id = h.profesional_id)`,
	)

	// 4. Lo que quedó colgando de usuarios ya borrados.
	for _, tabla := range tablasColgadasDeUsuarioBorrado {
		pasos = append(pasos, "DELETE FROM "+tabla+" h "+condicionSinUsuario)
	}

	// 5. La auditoría NO se borra: se le suelta la referencia y el evento
	//    queda. Es exactamente lo que hará de acá en más su ON DELETE SET
	//    NULL — esto solo pone al día lo que quedó de antes.
	pasos = append(pasos, `UPDATE audit_events h SET user_id = NULL
		   WHERE h.user_id IS NOT NULL
		     AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = h.user_id)`)

	// 6. Barrido final de turnos que SÍ pertenecen a una clínica real pero
	//    quedaron apuntando a una ficha o a un tipo de consulta que ya no
	//    existe — sea porque los borró el paso 3 de acá arriba, o porque ya
	//    estaban rotos de antes.
	//
	//    Se les suelta la referencia, NO se borran: un turno de una clínica
	//    real es historia clínica de verdad. Es además lo que ya hace la
	//    aplicación en el único lugar donde borra una ficha con turnos
	//    (`migrarOCancelarTurnosDePerdedor` pone `paciente_id = NULL` antes
	//    de borrar la ficha perdedora de un conflicto), y lo que harán de
	//    acá en más las foreign keys `ON DELETE SET NULL`. Las dos columnas
	//    son nullable, así que no se pierde nada más que un vínculo que ya
	//    estaba roto.
	pasos = append(pasos,
		`UPDATE turnos h SET paciente_id = NULL
		   WHERE h.paciente_id IS NOT NULL
		     AND NOT EXISTS (SELECT 1 FROM pacientes p WHERE p.id = h.paciente_id)`,
		`UPDATE turnos h SET tipo_consulta_id = NULL
		   WHERE h.tipo_consulta_id IS NOT NULL
		     AND NOT EXISTS (SELECT 1 FROM tipos_consulta t WHERE t.id = h.tipo_consulta_id)`)

	for _, sql := range pasos {
		if err := tx.Exec(sql).Error; err != nil {
			return err
		}
	}
	return nil
}
