package http

import (
	"net/http"

	"dental-mirage/api/internal/db"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Fase 3.2.2 — el aislamiento entre colegas de una misma clínica.
//
// El brief lo pide en mayúsculas: "CADA COMPONENTE DEL PANEL DE CADA
// PROFESIONAL, ES AISLADO DEL RESTO DE PROFESIONALES". Un odontólogo ve su
// agenda y sus pacientes; no los del colega del sillón de al lado.
//
// QUIÉN VE TODO. Recepción, por definición del brief ("el recepcionista
// tiene acceso a todas las vistas de los profesionales"), y quien
// administra la clínica —`owner` y `admin`—, que necesitan la vista
// completa para reasignar turnos y resolver conflictos.
//
// POR QUÉ ESTO VIVE EN UN SCOPE Y NO EN CADA HANDLER. Son 17 queries de
// turnos y 8 de pacientes filtrando por clínica. Repetir la condición en
// cada una garantiza que alguna quede sin ella, y una fuga de aislamiento
// no se nota mirando la pantalla: los datos aparecen, simplemente son de
// más gente de la que corresponde. Concentrarlo acá deja un solo lugar que
// auditar y un solo lugar que cambiar cuando la Fase 3.2.6 sume la vista
// del recepcionista por profesional.
//
// LOS PACIENTES SON DE LA CLÍNICA, no del profesional (ver TR-137), así
// que "los pacientes de Lucía" no es una columna: son los que tienen algún
// turno con ella. Eso mantiene una sola ficha por persona —de lo que
// depende la detección de conflictos de identidad de la Fase 2.4— y a la
// vez permite la vista aislada.

// veTodaLaClinica — ¿este usuario ve la clínica entera, o solo lo suyo?
func veTodaLaClinica(r *http.Request) bool {
	return tieneAlgunRol(r, db.RoleRecepcion, db.RoleAdmin, db.RoleOwner)
}

// usuarioDeLaSesion — el user autenticado. Solo existe después de
// requireSession.
func usuarioDeLaSesion(r *http.Request) (uuid.UUID, bool) {
	session, ok := sessionFromContext(r)
	if !ok {
		return uuid.Nil, false
	}
	return session.UserID, true
}

// usuarioDeLaSesionOpcional — el mismo dato, en la forma que esperan los
// campos nullable del modelo.
func usuarioDeLaSesionOpcional(r *http.Request) *uuid.UUID {
	userID, ok := usuarioDeLaSesion(r)
	if !ok {
		return nil
	}
	return &userID
}

// soloMisTurnos — scope que acota los turnos a los del profesional de la
// sesión, cuando corresponde. Para quien ve toda la clínica es un no-op.
func soloMisTurnos(r *http.Request) func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		if veTodaLaClinica(r) {
			return tx
		}
		userID, ok := usuarioDeLaSesion(r)
		if !ok {
			// Sin sesión no debería llegarse acá (requireSession corre
			// antes), pero ante la duda se acota a nada en vez de abrir.
			return tx.Where("1 = 0")
		}
		return tx.Where("atendido_por_user_id = ?", userID)
	}
}

// soloMisPacientes — mismo criterio, derivado de los turnos: un paciente
// es "de" un profesional si tiene algún turno con él… o si fue esta misma
// persona quien cargó la ficha a mano.
//
// Esa segunda mitad se agregó en la Fase 3.2.3, cuando un test mostró que
// un profesional invitado podía usar "+ Agregar paciente" y la ficha
// desaparecía de su listado en el acto: todavía no tenía ningún turno, así
// que el EXISTS no la encontraba. Quien acaba de cargar a una persona
// tiene que poder verla, aunque el turno venga después.
func soloMisPacientes(r *http.Request) func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		if veTodaLaClinica(r) {
			return tx
		}
		userID, ok := usuarioDeLaSesion(r)
		if !ok {
			return tx.Where("1 = 0")
		}
		return tx.Where(`(
			EXISTS (
				SELECT 1 FROM turnos t
				WHERE t.paciente_id = pacientes.id AND t.atendido_por_user_id = ?
			)
			OR pacientes.creado_por_user_id = ?
		)`, userID, userID)
	}
}
