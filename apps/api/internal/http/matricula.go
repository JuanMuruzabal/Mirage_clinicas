package http

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// La matrícula es única en todo el sistema (índice `idx_matricula_unica`,
// ver migrate.go). Este archivo traduce el rechazo del motor a algo que la
// persona pueda leer.
//
// La regla se declara en la base y se detecta acá por el error, en vez de
// preguntar "¿existe?" antes de guardar: entre el SELECT y el INSERT hay
// una ventana en la que dos altas simultáneas con la misma matrícula
// pasarían las dos. Mismo criterio que el DNI de paciente en turnos.go.
const errMatriculaDuplicada = "esa matrícula ya está registrada en otra cuenta"

// esMatriculaDuplicada distingue el choque de matrícula de cualquier otra
// violación de unicidad que pueda salir de la misma transacción. Se mira
// el NOMBRE de la constraint, no el texto del error: guardar el perfil
// toca también `professional_especialidades`, y confundir un choque de esa
// tabla con este le mostraría a la persona un mensaje sobre su matrícula
// cuando el problema es otro.
func esMatriculaDuplicada(err error) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return false
	}
	return pgErr.Code == "23505" && pgErr.ConstraintName == "idx_matricula_unica"
}
