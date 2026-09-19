package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

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
	// "+ Agregar paciente > De la clínica" (2026-09-19): sumar a mi lista
	// una ficha que ya existe, sin inventarle un turno.
	r.Post("/pacientes/{id}/en-mi-lista", sumarPacienteAMiListaHandler(gdb))
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

// idsDeMisPacientes marca cuáles de estos pacientes YA ESTÁN EN MI LISTA.
//
// Los mismos tres criterios que `soloMisPacientes` (2026-09-19): tengo
// turnos, yo cargué la ficha, o la sumé a mi lista. Antes miraba solo los
// turnos, y eso dejaba a las dos pantallas diciendo cosas distintas sobre
// la misma ficha — una que la cargué a mano y todavía no atendí aparecía
// en /panel/pacientes y acá figuraba como ajena.
//
// La diferencia recién importa de verdad con "+ Agregar paciente > De la
// clínica", que muestra exactamente las que NO tengo: con el criterio
// viejo me ofrecería sumar fichas que ya están en mi lista.
//
// Tres consultas para el lote, no una por ficha.
func idsDeMisPacientes(gdb *gorm.DB, r *http.Request, clinicID uuid.UUID, pacientes []db.Paciente) map[uuid.UUID]bool {
	out := make(map[uuid.UUID]bool, len(pacientes))
	yo, ok := usuarioDeLaSesion(r)
	if !ok || len(pacientes) == 0 {
		return out
	}
	ids := make([]uuid.UUID, 0, len(pacientes))
	for _, p := range pacientes {
		ids = append(ids, p.ID)
		if p.CreadoPorUserID != nil && *p.CreadoPorUserID == yo {
			out[p.ID] = true
		}
	}

	var conTurnoConmigo []uuid.UUID
	_ = gdb.Model(&db.Turno{}).
		Where("clinic_id = ? AND atendido_por_user_id = ? AND paciente_id IN ?", clinicID, yo, ids).
		Distinct().Pluck("paciente_id", &conTurnoConmigo).Error
	for _, id := range conTurnoConmigo {
		out[id] = true
	}

	var sumadosAMiLista []uuid.UUID
	_ = gdb.Model(&db.PacienteEnMiLista{}).
		Where("user_id = ? AND paciente_id IN ?", yo, ids).
		Pluck("paciente_id", &sumadosAMiLista).Error
	for _, id := range sumadosAMiLista {
		out[id] = true
	}
	return out
}

// sumarPacienteAMiListaHandler — POST /pacientes/{id}/en-mi-lista.
//
// "Agregar paciente > De la clínica": la ficha ya existe —la cargó un
// colega, o la persona pidió turno con él— y este profesional la quiere
// en su lista de trabajo SIN inventarle un turno, que era la única forma
// de conseguirlo hasta ahora.
//
// No cambia de quién es el paciente: sigue siendo de la clínica (TR-144).
// Lo único que cambia es en qué lista de trabajo aparece.
//
// Idempotente: sumar dos veces la misma ficha responde igual. El índice
// único (paciente_id, user_id) es la red de seguridad real ante dos
// clics rápidos.
func sumarPacienteAMiListaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		yo, ok := usuarioDeLaSesion(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "sesión inválida")
			return
		}
		pacienteID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de paciente inválido")
			return
		}

		// De ESTA clínica, y sin acotar por profesional: es justamente una
		// ficha que todavía no es suya. Lo que no puede es ser de otra
		// clínica, ni una ficha duplicada esperando que alguien resuelva
		// su conflicto de identidad.
		var paciente db.Paciente
		if err := gdb.Where("id = ? AND clinic_id = ? AND en_conflicto = false", pacienteID, clinicID).
			First(&paciente).Error; err != nil {
			writeError(w, http.StatusNotFound, "paciente no encontrado")
			return
		}

		fila := db.PacienteEnMiLista{ClinicID: clinicID, PacienteID: paciente.ID, UserID: yo}
		if err := gdb.Clauses(clause.OnConflict{DoNothing: true}).Create(&fila).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo agregar el paciente a tu lista")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"mensaje": "paciente agregado a tu lista"})
	}
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
// fichasDeLaPersona — TODAS las fichas de esa persona en la clínica, no
// solo la que este turno tiene vinculada (2026-09-15).
//
// Una persona puede tener más de una ficha a la vez: cuando pide turno con
// un mail que no reconocemos se le crea una DUPLICADA y queda un conflicto
// abierto hasta que un profesional lo resuelva. Mientras tanto, sus turnos
// cuelgan de fichas distintas.
//
// Las reglas que protegen al paciente —no estar en dos sillones a la vez,
// un turno activo por tipo— son sobre la PERSONA, así que tienen que mirar
// todas. Por ficha se salteaban solas justo en el caso más común: dos
// pedidos seguidos con un mail nuevo crean dos fichas duplicadas
// distintas, y ninguna ve los turnos de la otra. Fue un bug real
// (2026-09-16): el mismo paciente terminó con dos turnos a la misma hora
// con dos profesionales, y recién se notó cuando resolver los conflictos
// los junto a todos en la misma ficha.
func fichasDeLaPersona(tx *gorm.DB, clinicID, pacienteID uuid.UUID) []uuid.UUID {
	var fichas []uuid.UUID
	err := tx.Model(&db.Paciente{}).
		Where("clinic_id = ? AND dni = (SELECT dni FROM pacientes WHERE id = ?)", clinicID, pacienteID).
		Pluck("id", &fichas).Error
	if err != nil || len(fichas) == 0 {
		return []uuid.UUID{pacienteID}
	}
	return fichas
}

func turnoSuperpuestoDeOtroProfesional(
	tx *gorm.DB, clinicID, pacienteID uuid.UUID, atiende uuid.UUID,
	inicio, fin time.Time, excluirTurnoID *uuid.UUID,
) (*db.Turno, string) {
	q := tx.Where(
		`clinic_id = ? AND paciente_id IN ? AND estado = 'agendado'
		 AND atendido_por_user_id IS NOT NULL AND atendido_por_user_id <> ?
		 AND hora_inicio < ? AND hora_fin > ?`,
		clinicID, fichasDeLaPersona(tx, clinicID, pacienteID), atiende, fin, inicio,
	)
	if excluirTurnoID != nil {
		q = q.Where("id <> ?", *excluirTurnoID)
	}
	var choca db.Turno
	if err := q.First(&choca).Error; err != nil {
		return nil, ""
	}

	return &choca, nombreDelProfesional(tx, choca.AtendidoPorUserID)
}

// nombreDelProfesional — el nombre con el que se lo nombra en un mensaje
// de error, y si todavía no cargó perfil, su mail. Mismo criterio que
// nombresDeLosMiembros.
//
// "Otro profesional" queda solo para el caso de un turno sin dueño: sin
// un nombre concreto el mensaje obliga a salir a buscar con quién, que es
// justo lo que estos avisos evitan.
func nombreDelProfesional(tx *gorm.DB, userID *uuid.UUID) string {
	if userID == nil {
		return "otro profesional"
	}
	var perfil db.ProfessionalProfile
	if err := tx.First(&perfil, "user_id = ?", *userID).Error; err == nil {
		if n := strings.TrimSpace(perfil.Nombre + " " + perfil.Apellido); n != "" {
			return n
		}
	}
	var user db.User
	if err := tx.First(&user, "id = ?", *userID).Error; err == nil && user.Email != "" {
		return user.Email
	}
	return "otro profesional"
}

// turnoActivoDelMismoTipoEnLaClinica — un paciente no puede tener dos
// turnos activos del MISMO tipo de consulta, ni siquiera con profesionales
// distintos (Fase 3.2.5, 2026-09-15, pedido del cliente).
//
// La regla existía desde la Fase 3.1 pero **solo en el wizard público**, y
// ahí además como control de abuso: se aplica al paciente sin verificar y
// mira `tipo_consulta_id`. Cargando a mano no se aplicaba ninguna, así que
// la misma persona podía terminar con dos "Consulta general" pendientes
// — una cargada por cada profesional, cada uno sin ver la del otro.
//
// **Compara por NOMBRE, no por id** (TR-145). Cada profesional tiene su
// propia fila para "Consulta general": por id, la regla no vería nunca el
// turno del colega, que es exactamente el caso que el cliente reportó.
// Normalizado con `normalizarNombreTipo`, el mismo criterio con el que se
// bloquea crear un tipo duplicado.
//
// Se busca por DNI y no por `paciente_id` (corregido el 2026-09-15,
// reportado por el cliente: "yo con UN dni solo puedo SACAR UN TURNO POR
// TIPO DE CONSULTA EN LA CLÍNICA"). Por ficha, la regla se salteaba sola
// en el caso más común: cuando alguien pide turno con otro mail se le crea
// una ficha duplicada nueva, con otro id, y los turnos de la ficha
// original dejaban de contar. El DNI es la persona; la ficha es cómo la
// tenemos anotada, y puede haber más de una a la vez.
//
// DOS EXCEPCIONES, pedidas por el cliente: "Consulta general" y
// "Urgencia". Vienen precargadas en TODOS los profesionales, así que son
// la puerta de entrada genérica: bloquearlas entre profesionales impediría
// algo legítimo —hacerse ver por dos odontólogos distintos, o conseguir
// una urgencia con quien tenga lugar—. Con el MISMO profesional siguen sin
// poder repetirse: dos "Consulta general" pendientes con la misma persona
// no es una elección, es un clic de más.
func turnoActivoDelMismoTipoEnLaClinica(
	tx *gorm.DB, clinicID, pacienteID, tipoConsultaID uuid.UUID, excluirTurnoID *uuid.UUID,
) (*db.Turno, string, string) {
	var tipo db.TipoConsulta
	if err := tx.First(&tipo, "id = ?", tipoConsultaID).Error; err != nil {
		return nil, "", ""
	}
	fichas := fichasDeLaPersona(tx, clinicID, pacienteID)

	// La comparación de nombres se hace en Go y no en SQL: `normalizarNombreTipo`
	// saca acentos y colapsa espacios, y no hay equivalente portable en
	// Postgres sin la extensión `unaccent`. El costo es nulo — son los
	// turnos activos de UNA persona, siempre un puñado.
	q := tx.Where(`clinic_id = ? AND paciente_id IN ? AND tipo_consulta_id IS NOT NULL
	               AND estado = 'agendado' AND hora_fin >= now()`,
		clinicID, fichas)
	// Las dos excepciones: entre profesionales distintos no chocan.
	if esTipoPrecargado(tipo.Nombre) {
		q = q.Where("atendido_por_user_id = (SELECT user_id FROM tipos_consulta WHERE id = ?)", tipoConsultaID)
	}
	if excluirTurnoID != nil {
		q = q.Where("id <> ?", *excluirTurnoID)
	}
	var activos []db.Turno
	if err := q.Order("hora_inicio").Find(&activos).Error; err != nil || len(activos) == 0 {
		return nil, "", ""
	}

	ids := make([]uuid.UUID, 0, len(activos))
	for _, t := range activos {
		ids = append(ids, *t.TipoConsultaID)
	}
	var tipos []db.TipoConsulta
	if err := tx.Select("id", "nombre").Where("id IN ?", ids).Find(&tipos).Error; err != nil {
		return nil, "", ""
	}
	nombrePorID := make(map[uuid.UUID]string, len(tipos))
	for _, t := range tipos {
		nombrePorID[t.ID] = t.Nombre
	}

	buscado := normalizarNombreTipo(tipo.Nombre)
	for i := range activos {
		if normalizarNombreTipo(nombrePorID[*activos[i].TipoConsultaID]) == buscado {
			return &activos[i], nombreDelProfesional(tx, activos[i].AtendidoPorUserID), tipo.Nombre
		}
	}
	return nil, "", ""
}

// esTipoPrecargado — "Consulta general" y "Urgencia", los dos que el
// sistema le crea a todo profesional al sumarse a una clínica
// (db.SeedTiposConsultaDefault).
//
// Se los trata distinto en la regla de "un turno activo por tipo" porque
// son los únicos que TODOS tienen garantizado: son la puerta de entrada
// genérica, no una práctica concreta. Un paciente con una "Consulta
// general" pendiente con Ana tiene que poder sacar otra con Beto; uno con
// una "Endodoncia" pendiente, no — esa es la misma boca y el mismo
// tratamiento.
//
// Por nombre normalizado y no por id: cada profesional tiene su propia
// fila (TR-145).
func esTipoPrecargado(nombre string) bool {
	n := normalizarNombreTipo(nombre)
	return n == normalizarNombreTipo(db.NombreTipoConsultaGeneral) ||
		n == normalizarNombreTipo(db.NombreTipoConsultaUrgencia)
}
