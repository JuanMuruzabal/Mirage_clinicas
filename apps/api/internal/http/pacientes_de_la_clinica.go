package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// El paciente es de la CLÍNICA, y hay dos preguntas distintas que no se
// responden igual (Fase 3.2.5, 2026-09-15):
//
//   - "¿cuáles son MIS pacientes?" → /pacientes, acotado por
//     soloMisPacientes. Es la pantalla de trabajo de cada profesional.
//   - "¿esta persona ya está cargada en la clínica?" → esto. Al cargar un
//     turno hay que poder elegir una ficha que armó un colega: si no, se
//     crea una segunda ficha del mismo DNI —que el índice único rechaza—
//     o, peor, se tipean de nuevo datos que ya existían y quedan dos
//     versiones de la misma persona.
//
// Un endpoint aparte y no un `?alcance=clinica` sobre /pacientes: son dos
// intenciones distintas, y mezclarlas dejaría el aislamiento del listado a
// merced de un parámetro que cualquiera puede mandar. Acá lo que se
// devuelve es deliberadamente MÍNIMO —lo justo para reconocer a la
// persona y vincular la ficha—, no la ficha completa de un colega.

type pacienteConocidoResponse struct {
	ID       string `json:"id"`
	Nombre   string `json:"nombre"`
	Apellido string `json:"apellido"`
	DNI      string `json:"dni"`
	Telefono string `json:"telefono"`
	Email    string `json:"email"`
	// EsMio — si ya tiene turnos conmigo. La pantalla lo usa para
	// distinguir "un paciente mío" de "alguien que ya atiende la clínica",
	// que son dos cosas distintas para quien está cargando el turno.
	EsMio bool `json:"esMio"`
}

func registerPacientesDeLaClinicaRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/pacientes/de-la-clinica", buscarPacienteDeLaClinicaHandler(gdb))
}

// buscarPacienteDeLaClinicaHandler — GET /pacientes/de-la-clinica?q=
//
// Las fichas de toda la clínica, filtrables por nombre, apellido o DNI.
//
// DECISIÓN DEL CLIENTE (2026-09-15): "pacientes conocidos se debe
// extender a todos los profesionales". La identidad de un paciente es de
// la clínica —una persona, una ficha, un DNI— así que cualquiera que
// vaya a cargarle un turno tiene que poder encontrarla. Lo que sigue
// siendo de cada profesional es su LISTA DE TRABAJO (/pacientes), que es
// otra pregunta: "a quiénes atiendo yo".
func buscarPacienteDeLaClinicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		// `q` es OPCIONAL: el modal de "+ Agregar turno" carga la lista al
		// abrirse y filtra mientras se tipea, sin volver a pedir. Con el
		// término obligatorio habría que rehacer esa pantalla para ganar
		// una restricción que no protege nada — quien puede buscar por
		// apellido puede enumerar igual probando letras.
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		query := gdb.Where("clinic_id = ? AND en_conflicto = false", clinicID)
		if q != "" {
			like := "%" + q + "%"
			query = query.Where("nombre ILIKE ? OR apellido ILIKE ? OR dni ILIKE ?", like, like, like)
		}

		var pacientes []db.Paciente
		if err := query.Order("apellido, nombre").Limit(500).Find(&pacientes).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo buscar el paciente")
			return
		}

		mios := idsDeMisPacientes(gdb, r, clinicID, pacientes)

		out := make([]pacienteConocidoResponse, 0, len(pacientes))
		for _, p := range pacientes {
			out = append(out, pacienteConocidoResponse{
				ID: p.ID.String(), Nombre: p.Nombre, Apellido: p.Apellido, DNI: p.DNI,
				Telefono: derefStr(p.Telefono), Email: derefStr(p.Email),
				EsMio: mios[p.ID],
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// idsDeMisPacientes marca cuáles de estos pacientes ya tienen turnos con
// quien pregunta. Una consulta para el lote, no una por ficha.
func idsDeMisPacientes(gdb *gorm.DB, r *http.Request, clinicID uuid.UUID, pacientes []db.Paciente) map[uuid.UUID]bool {
	out := make(map[uuid.UUID]bool, len(pacientes))
	yo, ok := usuarioDeLaSesion(r)
	if !ok || len(pacientes) == 0 {
		return out
	}
	ids := make([]uuid.UUID, 0, len(pacientes))
	for _, p := range pacientes {
		ids = append(ids, p.ID)
	}
	var conTurnoConmigo []uuid.UUID
	_ = gdb.Model(&db.Turno{}).
		Where("clinic_id = ? AND atendido_por_user_id = ? AND paciente_id IN ?", clinicID, yo, ids).
		Distinct().Pluck("paciente_id", &conTurnoConmigo).Error
	for _, id := range conTurnoConmigo {
		out[id] = true
	}
	return out
}

// turnoSuperpuestoDeOtroProfesional — un paciente no puede estar en dos
// sillones a la vez (Fase 3.2.5, 2026-09-15).
//
// El exclusion constraint de la base protege al PROFESIONAL: no le
// permite dos turnos encimados. No dice nada del PACIENTE, y desde que
// una clínica tiene varios profesionales eso dejó un hueco: dos agendas
// distintas pueden ofrecer el mismo horario —correctamente, son dos
// sillones— y la misma persona terminar citada en los dos.
//
// No se resuelve con otro constraint: dos turnos del mismo paciente con
// profesionales distintos son válidos mientras no se pisen, así que la
// regla es sobre el RANGO y no sobre la fila. Y el mensaje importa tanto
// como el bloqueo: decir "ya tiene un turno" sin decir con quién obliga a
// salir a buscarlo a mano.
//
// Devuelve el turno que se pisa y el nombre de quien lo atiende, o nil.
func turnoSuperpuestoDeOtroProfesional(
	tx *gorm.DB, clinicID, pacienteID uuid.UUID, atiende uuid.UUID,
	inicio, fin time.Time, excluirTurnoID *uuid.UUID,
) (*db.Turno, string) {
	q := tx.Where(
		`clinic_id = ? AND paciente_id = ? AND estado = 'agendado'
		 AND atendido_por_user_id IS NOT NULL AND atendido_por_user_id <> ?
		 AND hora_inicio < ? AND hora_fin > ?`,
		clinicID, pacienteID, atiende, fin, inicio,
	)
	if excluirTurnoID != nil {
		q = q.Where("id <> ?", *excluirTurnoID)
	}
	var choca db.Turno
	if err := q.First(&choca).Error; err != nil {
		return nil, ""
	}

	// El nombre, y si todavía no cargó perfil, su mail — mismo criterio
	// que nombresDeLosMiembros. "Otro profesional" queda solo para el caso
	// imposible de un turno sin dueño: sin un nombre concreto, el mensaje
	// obliga a salir a buscar con quién, que es justo lo que evita.
	nombre := "otro profesional"
	if choca.AtendidoPorUserID != nil {
		var perfil db.ProfessionalProfile
		if err := tx.First(&perfil, "user_id = ?", *choca.AtendidoPorUserID).Error; err == nil {
			if n := strings.TrimSpace(perfil.Nombre + " " + perfil.Apellido); n != "" {
				nombre = n
			}
		}
		if nombre == "otro profesional" {
			var user db.User
			if err := tx.First(&user, "id = ?", *choca.AtendidoPorUserID).Error; err == nil && user.Email != "" {
				nombre = user.Email
			}
		}
	}
	return &choca, nombre
}
