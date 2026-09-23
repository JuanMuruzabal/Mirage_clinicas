package http

import (
	"errors"
	"net/http"
	"net/mail"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// registerPacienteRoutes monta las rutas de Pacientes (spec §4.5) —
// autenticadas, acotadas al profesional del token.
func registerPacienteRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/pacientes", listPacientesHandler(gdb))
	r.Get("/pacientes/contadores", contadoresDePacientesHandler(gdb))
	// La búsqueda a nivel CLÍNICA, para enganchar la ficha de un paciente
	// que ya cargó un colega — ver pacientes_de_la_clinica.go.
	registerPacientesDeLaClinicaRoutes(r, gdb)
	r.Post("/pacientes", crearPacienteHandler(gdb))
	r.Get("/pacientes/{id}", getPacienteHandler(gdb))
	r.Patch("/pacientes/{id}", editarPacienteHandler(gdb))
	// Fase 2.4.1 — conflictos entre fichas de paciente detectados desde el
	// formulario público (ver pacientes_conflicto_panel.go).
	r.Get("/pacientes/conflictos", listConflictosPacienteHandler(gdb))
	r.Post("/pacientes/conflictos/{id}/resolver", resolverConflictoPacienteHandler(gdb))
}

type pacienteResponse struct {
	ID       string `json:"id"`
	Nombre   string `json:"nombre"`
	Apellido string `json:"apellido"`
	DNI      string `json:"dni"`
	// Telefono — Fase 2.4.2: pasa a opcional (mismo patrón que Email),
	// "para otro" puede dejarlo sin cargar del lado del paciente.
	Telefono  *string `json:"telefono,omitempty"`
	Email     *string `json:"email,omitempty"`
	CreatedAt string  `json:"createdAt"`
	// Verificado (Fase 2.4.1, indicador visual pedido por el cliente para
	// la tabla de Pacientes) — mismo criterio que pacienteEstaVerificado
	// (paciente_verificado_publico.go): al menos 1 turno resuelto y
	// asistido. Se computa al vuelo en cada handler de este archivo,
	// nunca una columna en la base — mismo criterio derivado que
	// "resuelto" en Turnos (TR-074).
	Verificado bool `json:"verificado"`
	// Tutores — Fase 2.4.2, rediseñado en la ronda de correcciones del
	// 2026-09-06: un paciente puede tener MÁS de un tutor a lo largo del
	// tiempo (ver PacienteTutor en models.go) — antes era un único set de
	// campos singular, ahora una lista (vacía en la enorme mayoría de las
	// fichas, que nunca se cargaron por "sacar turno para otro").
	Tutores []tutorResponse `json:"tutores,omitempty"`
	// EmailsAlternativos/TelefonosAlternativos (Fase 2.4.1, corrección de
	// QA de la ronda 2026-09-06) — mails/teléfonos sumados a esta ficha
	// VERIFICADA al resolver un conflicto de pacientes con "el mail es de
	// la persona verificada" (ver resolverConflictoPacienteHandler).
	// Pasan de estar solo en el detalle (`pacienteDetalleResponse`) a
	// vivir acá — pedido del cliente: "en la tabla pacientes, si el
	// paciente tiene más de un número o mail poner un botón de ver
	// mails/ver teléfonos", no solo en la ficha. Vacío en la enorme
	// mayoría de los pacientes, que nunca tuvo un conflicto.
	EmailsAlternativos    []string `json:"emailsAlternativos,omitempty"`
	TelefonosAlternativos []string `json:"telefonosAlternativos,omitempty"`
	// Profesionales — quiénes tienen a esta persona entre sus pacientes
	// (Fase 3.2.6, mockup `pacientes-recepcion.html`: una columna de
	// avatares apilados).
	//
	// Viaja SOLO en la vista general de recepción, que es la única donde
	// la lista mezcla las de varios: en la vista de un profesional son
	// todos suyos y la columna sería su inicial repetida en cada fila.
	// Mismo criterio que la columna de profesional en Turnos.
	Profesionales []profesionalDePacienteResponse `json:"profesionales,omitempty"`
}

// profesionalDePacienteResponse — el id además del nombre porque la
// columna es clickeable: tocar un avatar se para en esa agenda antes de
// abrir la ficha, igual que las filas de las tarjetas de General.
type profesionalDePacienteResponse struct {
	UserID string `json:"userId"`
	Nombre string `json:"nombre"`
}

// tutorResponse — un tutor conocido/confirmado de un paciente (ver
// PacienteTutor en models.go). Sin DNI (tercera ronda de correcciones,
// 2026-09-06, pedido textual del cliente: "no es tan útil y agrega
// complejidad") — eliminado del todo de PacienteTutor.
type tutorResponse struct {
	// ID — para poder editar a ESTE tutor desde la ficha (contactos
	// principales, 2026-09-23). Hace falta porque el mail, que es su
	// identidad, ahora se puede corregir: no sirve para señalarlo.
	ID       string `json:"id"`
	Relacion string `json:"relacion"`
	Nombre   string `json:"nombre"`
	Telefono string `json:"telefono"`
	Email    string `json:"email"`
	// TelefonosAlternativos — cuarta ronda de correcciones (2026-09-06):
	// "si un tutor vuelve a sacar turno con mismo mail, diferente
	// teléfono, añadir ese teléfono al tutor del mail correspondiente" —
	// se ACUMULA (ver PacienteTutorTelefonoAlternativo en models.go),
	// nunca reemplaza al principal. Vacío en la enorme mayoría de los
	// tutores, que nunca repitieron el turno con un teléfono distinto.
	TelefonosAlternativos []string `json:"telefonosAlternativos,omitempty"`
}

func toTutorResponse(t db.PacienteTutor, telefonosAlt []string) tutorResponse {
	return tutorResponse{
		ID: t.ID.String(), Relacion: t.Relacion, Nombre: t.Nombre, Telefono: t.Telefono, Email: t.Email, TelefonosAlternativos: telefonosAlt}
}

func toPacienteResponse(p db.Paciente, verificado bool, tutores []db.PacienteTutor, emailsAlt, telefonosAlt []string, tutorTelAlt map[uuid.UUID][]string) pacienteResponse {
	tutoresOut := make([]tutorResponse, len(tutores))
	for i, t := range tutores {
		tutoresOut[i] = toTutorResponse(t, tutorTelAlt[t.ID])
	}
	return pacienteResponse{
		ID:                    p.ID.String(),
		Nombre:                p.Nombre,
		Apellido:              p.Apellido,
		DNI:                   p.DNI,
		Telefono:              p.Telefono,
		Email:                 p.Email,
		CreatedAt:             p.CreatedAt.Format(time.RFC3339),
		Verificado:            verificado,
		Tutores:               tutoresOut,
		EmailsAlternativos:    emailsAlt,
		TelefonosAlternativos: telefonosAlt,
	}
}

// tutoresPorPaciente — mismo criterio que alternativosDeContactoPorPaciente
// (una fila más abajo): 1 query para TODOS los pacientes de un profesional,
// nunca una por fila.
func tutoresPorPaciente(tx *gorm.DB, profesionalID uuid.UUID) (map[uuid.UUID][]db.PacienteTutor, error) {
	var tutores []db.PacienteTutor
	if err := tx.Joins("JOIN pacientes ON pacientes.id = paciente_tutores.paciente_id").
		Where("pacientes.clinic_id = ?", profesionalID).
		Order("paciente_tutores.created_at").
		Find(&tutores).Error; err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID][]db.PacienteTutor)
	for _, t := range tutores {
		out[t.PacienteID] = append(out[t.PacienteID], t)
	}
	return out, nil
}

// tutoresDePaciente — mismo query que tutoresPorPaciente pero para UN solo
// paciente (getPacienteHandler, y cualquier lugar que ya tenga el
// pacienteID a mano y no necesite el batch de toda la lista).
func tutoresDePaciente(tx *gorm.DB, pacienteID uuid.UUID) ([]db.PacienteTutor, error) {
	var tutores []db.PacienteTutor
	if err := tx.Where("paciente_id = ?", pacienteID).Order("created_at").Find(&tutores).Error; err != nil {
		return nil, err
	}
	return tutores, nil
}

// telefonosAlternativosPorTutor — mismo criterio que tutoresPorPaciente:
// 1 query para TODOS los tutores de un profesional, nunca una por fila.
// Agrupa por PacienteTutorID (no por PacienteID — un mismo paciente puede
// tener varios tutores, cada uno con sus propios alternativos).
func telefonosAlternativosPorTutor(tx *gorm.DB, profesionalID uuid.UUID) (map[uuid.UUID][]string, error) {
	var alternativos []db.PacienteTutorTelefonoAlternativo
	if err := tx.Joins("JOIN paciente_tutores ON paciente_tutores.id = paciente_tutor_telefonos_alternativos.paciente_tutor_id").
		Joins("JOIN pacientes ON pacientes.id = paciente_tutores.paciente_id").
		Where("pacientes.clinic_id = ?", profesionalID).
		Order("paciente_tutor_telefonos_alternativos.created_at").
		Find(&alternativos).Error; err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID][]string)
	for _, a := range alternativos {
		out[a.PacienteTutorID] = append(out[a.PacienteTutorID], a.Telefono)
	}
	return out, nil
}

// telefonosAlternativosDeTutoresDePaciente — mismo query que
// telefonosAlternativosPorTutor pero acotado a UN paciente (mismo criterio
// que tutoresDePaciente frente a tutoresPorPaciente).
func telefonosAlternativosDeTutoresDePaciente(tx *gorm.DB, pacienteID uuid.UUID) (map[uuid.UUID][]string, error) {
	var alternativos []db.PacienteTutorTelefonoAlternativo
	if err := tx.Joins("JOIN paciente_tutores ON paciente_tutores.id = paciente_tutor_telefonos_alternativos.paciente_tutor_id").
		Where("paciente_tutores.paciente_id = ?", pacienteID).
		Order("paciente_tutor_telefonos_alternativos.created_at").
		Find(&alternativos).Error; err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID][]string)
	for _, a := range alternativos {
		out[a.PacienteTutorID] = append(out[a.PacienteTutorID], a.Telefono)
	}
	return out, nil
}

// alternativosDeContactoPorPaciente — mismo criterio que
// pacientesVerificadosIDs (paciente_verificado_publico.go): 2 queries para
// TODOS los pacientes de un profesional, nunca una por fila — la tabla de
// Pacientes (listPacientesHandler) necesita saber si cada fila tiene más
// de un mail/teléfono para decidir si muestra "Ver mails →"/"Ver
// teléfonos →".
func alternativosDeContactoPorPaciente(tx *gorm.DB, profesionalID uuid.UUID) (map[uuid.UUID][]string, map[uuid.UUID][]string, error) {
	var emails []db.PacienteEmailAlternativo
	if err := tx.Joins("JOIN pacientes ON pacientes.id = paciente_emails_alternativos.paciente_id").
		Where("pacientes.clinic_id = ?", profesionalID).
		Order("paciente_emails_alternativos.created_at").
		Find(&emails).Error; err != nil {
		return nil, nil, err
	}
	emailsPorPaciente := make(map[uuid.UUID][]string)
	for _, e := range emails {
		emailsPorPaciente[e.PacienteID] = append(emailsPorPaciente[e.PacienteID], e.Email)
	}

	var telefonos []db.PacienteTelefonoAlternativo
	if err := tx.Joins("JOIN pacientes ON pacientes.id = paciente_telefonos_alternativos.paciente_id").
		Where("pacientes.clinic_id = ?", profesionalID).
		Order("paciente_telefonos_alternativos.created_at").
		Find(&telefonos).Error; err != nil {
		return nil, nil, err
	}
	telefonosPorPaciente := make(map[uuid.UUID][]string)
	for _, t := range telefonos {
		telefonosPorPaciente[t.PacienteID] = append(telefonosPorPaciente[t.PacienteID], t.Telefono)
	}

	return emailsPorPaciente, telefonosPorPaciente, nil
}

// listPacientesHandler — GET /pacientes?q= (T3.5): tabla de pacientes,
// buscador por nombre/apellido/DNI igual que Turnos.
// filtrosComunesDePacientes — el aislamiento entre colegas y la búsqueda,
// que el listado y los contadores aplican IGUAL. Extraído para que no
// puedan divergir: una pestaña que dice "12" sobre una tabla de 9 filas
// es peor que una pestaña sin número.
//
// A diferencia de su par de turnos, no devuelve error: ninguno de estos
// filtros puede venir mal escrito (la búsqueda es texto libre).
func filtrosComunesDePacientes(
	r *http.Request, gdb *gorm.DB, clinicID uuid.UUID,
) *gorm.DB {
	// Aislamiento entre colegas (Fase 3.2.2): la ficha es de la clínica,
	// pero un profesional ve las de SUS pacientes — los que tienen algún
	// turno con él.
	query := gdb.Where("clinic_id = ?", clinicID).Scopes(soloMisPacientes(r))
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		like := "%" + q + "%"
		query = query.Where("nombre ILIKE ? OR apellido ILIKE ? OR dni ILIKE ?", like, like, like)
	}
	return query
}

func listPacientesHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		query := filtrosComunesDePacientes(r, gdb, profesionalID)

		// verificacion — mismo filtro (y misma subquery) que
		// listTurnosHandler (turnos.go): las pestañas Todos/Verificados/Sin
		// verificar de /panel/pacientes se resolvían en el navegador,
		// filtrando la lista COMPLETA de fichas ya traída. Con la
		// paginación eso deja de funcionar (una tanda parcial filtrada en
		// el cliente muestra cualquier cosa), así que el filtro baja acá.
		// pacientesVerificadosQuery, y no el mapa en memoria de
		// pacientesVerificadosIDs, justamente para no caer en el `NOT IN
		// (NULL)` que describe el comentario de esa función.
		//
		// No entra en `filtrosComunesDePacientes` porque es justo lo que
		// distingue una pestaña de otra — el contador las cuenta todas de
		// una pasada (ver pacientes_contadores.go).
		if verificacion := r.URL.Query().Get("verificacion"); verificacion != "" {
			sub := pacientesVerificadosQuery(gdb, profesionalID)
			switch verificacion {
			case "verificado":
				query = query.Where("id IN (?)", sub)
			case "sin_verificar":
				query = query.Where("id NOT IN (?)", sub)
			default:
				writeError(w, http.StatusBadRequest, "el parámetro 'verificacion' debe ser 'verificado' o 'sin_verificar'")
				return
			}
		}

		// Paginación opt-in — ver paginacion.go. El picker de "Paciente
		// conocido" del modal de turnos usa el mismo endpoint y también la
		// pide: una lista desplegable con miles de fichas no le sirve a
		// nadie, para eso está el buscador.
		if limit, offset, aplicar := paginacionDeRequest(r); aplicar {
			var err error
			query, err = aplicarPaginacion(w, query, &db.Paciente{}, limit, offset)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo obtener los pacientes")
				return
			}
		}

		var pacientes []db.Paciente
		if err := query.Order("apellido, nombre").Find(&pacientes).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los pacientes")
			return
		}

		// Una sola query para todos los pacientes de la lista, no una por
		// fila — ver pacientesVerificadosIDs (paciente_verificado_publico.go).
		verificados, err := pacientesVerificadosIDs(gdb, profesionalID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los pacientes")
			return
		}
		emailsAlt, telsAlt, err := alternativosDeContactoPorPaciente(gdb, profesionalID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los pacientes")
			return
		}
		tutores, err := tutoresPorPaciente(gdb, profesionalID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los pacientes")
			return
		}
		tutorTelAlt, err := telefonosAlternativosPorTutor(gdb, profesionalID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los pacientes")
			return
		}

		// Quiénes atienden a cada persona, SOLO en la vista general
		// (Fase 3.2.6). En la vista de un profesional son todos suyos.
		var profesionales map[uuid.UUID][]profesionalDePacienteResponse
		if veTodaLaClinica(r) {
			profesionales, err = profesionalesPorPaciente(gdb, profesionalID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo obtener los pacientes")
				return
			}
		}

		out := make([]pacienteResponse, len(pacientes))
		for i, p := range pacientes {
			out[i] = toPacienteResponse(p, verificados[p.ID], tutores[p.ID], emailsAlt[p.ID], telsAlt[p.ID], tutorTelAlt)
			out[i].Profesionales = profesionales[p.ID]
		}
		writeJSON(w, http.StatusOK, out)
	}
}

type pacienteDetalleResponse struct {
	pacienteResponse
	// EmailsAlternativos/TelefonosAlternativos ahora viven en
	// pacienteResponse (ver el comentario grande ahí) — este struct ya no
	// necesita declararlos aparte, los hereda del embed.
	Turnos []turnoResponse `json:"turnos"`
}

// getPacienteHandler — GET /pacientes/{id} (T3.6): datos personales +
// TODO su historial de turnos — el front separa "activos" (agendado,
// futuro) de "historial" (el resto) con la misma lista, sin pedirle dos
// veces al backend. Los placeholders de historia clínica/presupuesto
// (spec §4.5) son puramente visuales, no tienen contraparte acá.
func getPacienteHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		pacienteID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de paciente inválido")
			return
		}

		var paciente db.Paciente
		// 404 y no 403 si la ficha es de un colega: que exista no es
		// información que este profesional deba tener (Fase 3.2.2).
		if err := gdb.Scopes(soloMisPacientes(r)).
			Where("id = ? AND clinic_id = ?", pacienteID, profesionalID).First(&paciente).Error; err != nil {
			writeError(w, http.StatusNotFound, "paciente no encontrado")
			return
		}

		var turnos []db.Turno
		// TODOS los turnos del paciente, no solo los míos (Fase 3.2.5,
		// 2026-09-14). El paciente es de la clínica: un historial clínico
		// partido por profesional no sirve como historial — el que atiende
		// hoy necesita saber qué le hicieron antes, se lo haya hecho quien
		// se lo haya hecho.
		//
		// Lo que cambia es que cada fila dice DE QUIÉN es
		// (`atendidoPorNombre`) y si es de quien mira (`esMio`), y la
		// pantalla no deja tocar los ajenos. Ver toTurnoResponse.
		if err := gdb.Where("paciente_id = ?", pacienteID).Order("created_at DESC").Find(&turnos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el historial de turnos")
			return
		}
		turnosOut := make([]turnoResponse, len(turnos))
		for i, t := range turnos {
			turnosOut[i] = toTurnoResponse(t)
		}
		// Quién atiende cada turno, para que el historial diga con quién
		// fue cada uno y cuáles puede tocar quien mira.
		// Siempre con nombre: el historial de un paciente es de la CLÍNICA
		// y su gracia es decir con quién fue cada turno (Fase 3.2.5).
		completarProfesionalDeTurnos(gdb, r, turnos, turnosOut, true)

		verificado, err := pacienteEstaVerificado(gdb, paciente)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el paciente")
			return
		}

		emailsOut, telsOut, err := alternativosDeContactoDePaciente(gdb, pacienteID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el paciente")
			return
		}

		tutores, err := tutoresDePaciente(gdb, pacienteID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el paciente")
			return
		}
		tutorTelAlt, err := telefonosAlternativosDeTutoresDePaciente(gdb, pacienteID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el paciente")
			return
		}

		writeJSON(w, http.StatusOK, pacienteDetalleResponse{
			pacienteResponse: toPacienteResponse(paciente, verificado, tutores, emailsOut, telsOut, tutorTelAlt),
			Turnos:           turnosOut,
		})
	}
}

// alternativosDeContactoDePaciente — los mails y teléfonos alternativos
// de UNA ficha, en el orden en que se sumaron. Lo usan el GET y el PATCH
// de la ficha, que tienen que devolver exactamente lo mismo.
func alternativosDeContactoDePaciente(tx *gorm.DB, pacienteID uuid.UUID) ([]string, []string, error) {
	var emails []string
	if err := tx.Model(&db.PacienteEmailAlternativo{}).Where("paciente_id = ?", pacienteID).
		Order("created_at").Pluck("email", &emails).Error; err != nil {
		return nil, nil, err
	}
	var telefonos []string
	if err := tx.Model(&db.PacienteTelefonoAlternativo{}).Where("paciente_id = ?", pacienteID).
		Order("created_at").Pluck("telefono", &telefonos).Error; err != nil {
		return nil, nil, err
	}
	return emails, telefonos, nil
}

// normalizarAlternativos — la lista de alternativos tal como se va a
// guardar: sin vacíos, sin repetidos y sin el principal, que no es
// "otro" mail o teléfono. Devuelve un mensaje si alguno tiene formato
// inválido. Los mails van en minúscula, igual que el principal.
func normalizarAlternativos(valores []string, principal string, sonMails bool) ([]string, string) {
	vistos := map[string]bool{principal: true}
	out := make([]string, 0, len(valores))
	for _, v := range valores {
		v = strings.TrimSpace(v)
		if sonMails {
			v = strings.ToLower(v)
		}
		if v == "" || vistos[v] {
			continue
		}
		if sonMails {
			if _, err := mail.ParseAddress(v); err != nil {
				return nil, "el mail " + v + " no tiene un formato válido"
			}
		} else if !telefonoRegex.MatchString(v) {
			return nil, "el teléfono " + v + " no tiene un formato válido"
		}
		vistos[v] = true
		out = append(out, v)
	}
	return out, ""
}

type editarPacienteRequest struct {
	DNI      string `json:"dni"`
	Telefono string `json:"telefono"`
	Email    string `json:"email"`
	// Contactos principales y alternativos (2026-09-23). Punteros a
	// slice, mismo criterio que `Modulos *[]moduloRequest`: `nil` es "no
	// vino, no tocar" y `[]` es "borrar todos". Así este endpoint sigue
	// sirviéndole a quien manda solo DNI, teléfono y mail.
	//
	// Son la lista COMPLETA de alternativos, no un agregado: la pantalla
	// arma el estado final —editar, quitar, promover a principal— y se
	// guarda de una vez, en una transacción. Promover es mandar el viejo
	// principal en la lista y el alternativo como principal.
	EmailsAlternativos    *[]string `json:"emailsAlternativos"`
	TelefonosAlternativos *[]string `json:"telefonosAlternativos"`
	// Tutores — los que se editan, cada uno por su id. Los que no vienen
	// no se tocan. Cada id tiene que ser un tutor de ESTA ficha.
	Tutores *[]editarTutorRequest `json:"tutores"`
}

// editarTutorRequest — el mail y los teléfonos de un tutor.
//
// Un tutor tiene UN mail y no una lista, a propósito: el mail es su
// identidad (`idx_paciente_tutor` es único por paciente y mail) y un mail
// nuevo en el wizard es un tutor nuevo — mamá y papá son dos tutores, no
// uno con dos mails (TR-116). Lo que sí acumula son teléfonos
// (`PacienteTutorTelefonoAlternativo`).
type editarTutorRequest struct {
	ID                    string   `json:"id"`
	Email                 string   `json:"email"`
	Telefono              string   `json:"telefono"`
	TelefonosAlternativos []string `json:"telefonosAlternativos"`
}

// editarPacienteHandler — PATCH /pacientes/{id} (pedido explícito del
// cliente, 2026-08-23): corrige DNI, teléfono y email de la ficha del
// paciente "por si hay alguna actualización en estos datos" — a diferencia
// de editar un turno puntual (que solo toca el snapshot de contacto de ESE
// turno), esto actualiza el dato real del paciente para todos sus turnos
// futuros. Nombre y apellido no son editables acá todavía (fuera de
// alcance de este pedido). Mismas reglas de formato que TR-002.
func editarPacienteHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		pacienteID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de paciente inválido")
			return
		}

		var req editarPacienteRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.DNI = strings.TrimSpace(req.DNI)
		req.Telefono = strings.TrimSpace(req.Telefono)
		req.Email = strings.TrimSpace(strings.ToLower(req.Email))

		if !dniRegex.MatchString(req.DNI) {
			writeError(w, http.StatusBadRequest, "el DNI debe tener 7 u 8 dígitos, sin puntos")
			return
		}

		var paciente db.Paciente
		// 404 y no 403 si la ficha es de un colega: que exista no es
		// información que este profesional deba tener (Fase 3.2.2).
		if err := gdb.Scopes(soloMisPacientes(r)).
			Where("id = ? AND clinic_id = ?", pacienteID, profesionalID).First(&paciente).Error; err != nil {
			writeError(w, http.StatusNotFound, "paciente no encontrado")
			return
		}

		// MAIL Y TELÉFONO OBLIGATORIOS SALVO QUE TENGA TUTOR — la misma
		// regla que el alta (TR-147). Una ficha manual sin mail es
		// irreconocible para siempre (`pacienteEstaVerificado` la da por
		// verificada y `pacienteRespondeAlMail` no tiene contra qué
		// comparar), así que vaciarlo desde acá recreaba el problema que
		// TR-147 cerró en el alta. Con tutor, la identidad la aporta el
		// tutor y el paciente puede no tener ni mail ni teléfono propios.
		//
		// Hasta el 2026-09-23 este endpoint exigía el teléfono SIEMPRE:
		// editar a un paciente con tutor y sin teléfono propio fallaba.
		var cantidadTutores int64
		if err := gdb.Model(&db.PacienteTutor{}).Where("paciente_id = ?", paciente.ID).
			Count(&cantidadTutores).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar el paciente")
			return
		}
		conTutor := cantidadTutores > 0

		if req.Telefono == "" && !conTutor {
			writeError(w, http.StatusBadRequest, "el teléfono es obligatorio")
			return
		}
		if req.Telefono != "" && !telefonoRegex.MatchString(req.Telefono) {
			writeError(w, http.StatusBadRequest, "el teléfono no tiene un formato válido")
			return
		}
		if req.Email == "" && !conTutor {
			writeError(w, http.StatusBadRequest, "el mail es obligatorio")
			return
		}
		if req.Email != "" {
			if _, err := mail.ParseAddress(req.Email); err != nil {
				writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
				return
			}
		}

		// Los alternativos, normalizados: sin vacíos, sin repetidos y sin el
		// principal (que no es "otro" teléfono). Cada uno con el mismo
		// formato que el principal.
		var emailsAlt, telefonosAlt []string
		if req.EmailsAlternativos != nil {
			var msg string
			if emailsAlt, msg = normalizarAlternativos(*req.EmailsAlternativos, req.Email, true); msg != "" {
				writeError(w, http.StatusBadRequest, msg)
				return
			}
			if len(emailsAlt) > 0 && req.Email == "" {
				writeError(w, http.StatusBadRequest, "si tiene más de un mail, uno tiene que ser el principal")
				return
			}
		}
		if req.TelefonosAlternativos != nil {
			var msg string
			if telefonosAlt, msg = normalizarAlternativos(*req.TelefonosAlternativos, req.Telefono, false); msg != "" {
				writeError(w, http.StatusBadRequest, msg)
				return
			}
			if len(telefonosAlt) > 0 && req.Telefono == "" {
				writeError(w, http.StatusBadRequest, "si tiene más de un teléfono, uno tiene que ser el principal")
				return
			}
		}

		// Los tutores: mail y teléfono obligatorios, igual que en el alta.
		type tutorAEditar struct {
			id           uuid.UUID
			email        string
			telefono     string
			telefonosAlt []string
		}
		var tutoresAEditar []tutorAEditar
		if req.Tutores != nil {
			for _, t := range *req.Tutores {
				id, err := uuid.Parse(strings.TrimSpace(t.ID))
				if err != nil {
					writeError(w, http.StatusBadRequest, "id de tutor inválido")
					return
				}
				email := strings.TrimSpace(strings.ToLower(t.Email))
				if _, err := mail.ParseAddress(email); err != nil || email == "" {
					writeError(w, http.StatusBadRequest, "el mail del tutor no tiene un formato válido")
					return
				}
				telefono := strings.TrimSpace(t.Telefono)
				if !telefonoRegex.MatchString(telefono) {
					writeError(w, http.StatusBadRequest, "el teléfono del tutor no tiene un formato válido")
					return
				}
				alts, msg := normalizarAlternativos(t.TelefonosAlternativos, telefono, false)
				if msg != "" {
					writeError(w, http.StatusBadRequest, msg)
					return
				}
				tutoresAEditar = append(tutoresAEditar, tutorAEditar{id, email, telefono, alts})
			}
		}

		paciente.DNI = req.DNI
		paciente.Telefono = nil
		if req.Telefono != "" {
			paciente.Telefono = &req.Telefono
		}
		paciente.Email = nil
		if req.Email != "" {
			paciente.Email = &req.Email
		}

		// Todo en UNA transacción: el estado final que armó la pantalla se
		// guarda entero o no se guarda. Un guardado a medias dejaría, por
		// ejemplo, el alternativo promovido duplicado con el principal.
		errTutorAjeno := errors.New("tutor ajeno")
		err = gdb.Transaction(func(tx *gorm.DB) error {
			if err := tx.Save(&paciente).Error; err != nil {
				return err
			}
			if req.EmailsAlternativos != nil {
				if err := tx.Where("paciente_id = ?", paciente.ID).Delete(&db.PacienteEmailAlternativo{}).Error; err != nil {
					return err
				}
				for _, e := range emailsAlt {
					if err := tx.Create(&db.PacienteEmailAlternativo{PacienteID: paciente.ID, Email: e}).Error; err != nil {
						return err
					}
				}
			}
			if req.TelefonosAlternativos != nil {
				if err := tx.Where("paciente_id = ?", paciente.ID).Delete(&db.PacienteTelefonoAlternativo{}).Error; err != nil {
					return err
				}
				for _, t := range telefonosAlt {
					if err := tx.Create(&db.PacienteTelefonoAlternativo{PacienteID: paciente.ID, Telefono: t}).Error; err != nil {
						return err
					}
				}
			}
			for _, t := range tutoresAEditar {
				// El tutor tiene que ser de ESTA ficha — que ya pasó por
				// soloMisPacientes. Un id de tutor de otra ficha no existe
				// para este request.
				res := tx.Model(&db.PacienteTutor{}).
					Where("id = ? AND paciente_id = ?", t.id, paciente.ID).
					Updates(map[string]any{"email": t.email, "telefono": t.telefono})
				if res.Error != nil {
					return res.Error
				}
				if res.RowsAffected == 0 {
					return errTutorAjeno
				}
				if err := tx.Where("paciente_tutor_id = ?", t.id).Delete(&db.PacienteTutorTelefonoAlternativo{}).Error; err != nil {
					return err
				}
				for _, tel := range t.telefonosAlt {
					if err := tx.Create(&db.PacienteTutorTelefonoAlternativo{PacienteTutorID: t.id, Telefono: tel}).Error; err != nil {
						return err
					}
				}
			}
			return nil
		})
		if err != nil {
			switch {
			case errors.Is(err, errTutorAjeno):
				writeError(w, http.StatusNotFound, "tutor no encontrado")
			case isUniqueViolation(err):
				// Dos restricciones únicas pueden saltar acá: el DNI por
				// clínica (Extra 2.3.5, E5.1) y el mail de tutor por
				// paciente. Mismo criterio que writeTurnoAgendadoError: un
				// error legible en el modal, nunca un 500 crudo.
				if strings.Contains(err.Error(), "idx_paciente_tutor") {
					writeError(w, http.StatusConflict, "otro tutor de este paciente ya usa ese mail")
					return
				}
				writeError(w, http.StatusConflict, "ya existe otro paciente con ese DNI")
			default:
				writeError(w, http.StatusInternalServerError, "no se pudo actualizar el paciente")
			}
			return
		}

		verificado, err := pacienteEstaVerificado(gdb, paciente)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar el paciente")
			return
		}
		// La ficha completa, como la devuelve el GET: hasta el 2026-09-23 esta
		// respuesta mandaba los alternativos del paciente en nil, y la
		// pantalla los perdía de vista hasta refrescar.
		emailsOut, telsOut, err := alternativosDeContactoDePaciente(gdb, paciente.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar el paciente")
			return
		}
		tutores, err := tutoresDePaciente(gdb, paciente.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar el paciente")
			return
		}
		tutorTelAlt, err := telefonosAlternativosDeTutoresDePaciente(gdb, paciente.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar el paciente")
			return
		}
		writeJSON(w, http.StatusOK, toPacienteResponse(paciente, verificado, tutores, emailsOut, telsOut, tutorTelAlt))
	}
}

type crearPacienteRequest struct {
	// ProfesionalUserID — de quién va a ser esta ficha (Fase 3.2.6).
	// Vacío = el profesional en foco, o uno mismo. Recepción tiene que
	// elegirlo: sin dueño la ficha no aparece en la lista de nadie.
	ProfesionalUserID string `json:"profesionalUserId"`
	Nombre            string `json:"nombre"`
	Apellido          string `json:"apellido"`
	DNI               string `json:"dni"`
	Telefono          string `json:"telefono"`
	Email             string `json:"email"`
	// ConTutor/Tutor* (Fase 2.4.2) — opción "Con tutor" del alta directa
	// desde el panel (`docs/Fases post MVP/Fase 2/turnero_pagina/ArquitecturaPeticionesTurno.md` 3.7bis): con
	// ConTutor=true, Telefono/Email pasan a ser opcionales (son del
	// PACIENTE, igual criterio que el wizard público) y los 5 campos de
	// tutor son obligatorios.
	// TutorDNI existió hasta la tercera ronda de correcciones (2026-09-06)
	// — eliminado del todo, pedido textual del cliente.
	ConTutor      bool   `json:"conTutor"`
	TutorRelacion string `json:"tutorRelacion"`
	TutorNombre   string `json:"tutorNombre"`
	TutorTelefono string `json:"tutorTelefono"`
	TutorEmail    string `json:"tutorEmail"`
}

// crearPacienteHandler — POST /pacientes (Extra 2.3.5, E5.5): alta directa
// de un paciente sin pasar por un turno, pedido explícito del cliente
// ("+ Agregar paciente" en la sección Pacientes). A diferencia de
// crearOBuscarPacientePorDNI (turnos.go) — que REUSA un paciente existente
// porque viene de un flujo que necesita seguir creando el turno igual —
// acá un DNI repetido es un error real: el profesional está tratando de
// dar de alta a alguien que ya tiene ficha, así que se lo manda a buscarlo
// en vez de crear una segunda fila o reusar en silencio una que no eligió.
func crearPacienteHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var req crearPacienteRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.Nombre = strings.TrimSpace(req.Nombre)
		req.Apellido = strings.TrimSpace(req.Apellido)
		req.DNI = strings.TrimSpace(req.DNI)
		req.Telefono = strings.TrimSpace(req.Telefono)
		req.Email = strings.TrimSpace(strings.ToLower(req.Email))
		req.TutorRelacion = strings.TrimSpace(req.TutorRelacion)
		req.TutorNombre = strings.TrimSpace(req.TutorNombre)
		req.TutorTelefono = strings.TrimSpace(req.TutorTelefono)
		req.TutorEmail = strings.TrimSpace(strings.ToLower(req.TutorEmail))

		if req.Nombre == "" || req.Apellido == "" {
			writeError(w, http.StatusBadRequest, "nombre y apellido son obligatorios")
			return
		}
		if !dniRegex.MatchString(req.DNI) {
			writeError(w, http.StatusBadRequest, "el DNI debe tener 7 u 8 dígitos, sin puntos")
			return
		}
		// Teléfono/email del paciente — obligatorio el teléfono solo sin
		// tutor (Fase 2.4.2, mismo criterio que el wizard público: "para
		// otro" los deja opcionales, son del paciente, no de quien lo
		// trae).
		if !req.ConTutor && !telefonoRegex.MatchString(req.Telefono) {
			writeError(w, http.StatusBadRequest, "el teléfono no tiene un formato válido")
			return
		}
		if req.ConTutor && req.Telefono != "" && !telefonoRegex.MatchString(req.Telefono) {
			writeError(w, http.StatusBadRequest, "el teléfono no tiene un formato válido")
			return
		}
		// EL MAIL ES OBLIGATORIO SIN TUTOR (2026-09-15, pedido del
		// cliente), y no es una validación de formulario más: es la causa
		// raíz de un bug real.
		//
		// Una ficha cargada a mano cuenta como VERIFICADA por su origen
		// (pacienteEstaVerificado: `origen == "manual"` y nada más). Sin
		// mail, el wizard público no tiene con qué reconocerla: cualquier
		// pedido con ese DNI falla el "¿esta ficha responde a este mail?"
		// —no hay contra qué comparar— y, por estar verificada, dispara un
		// conflicto de identidad. Uno por pedido, para siempre.
		//
		// Con tutor el mail propio sigue siendo opcional (un menor puede
		// no tener): ahí la identidad la aporta el tutor, cuyo mail sí se
		// exige más abajo, y el wizard lo reconoce por él
		// (pacienteTieneTutorConMail).
		if !req.ConTutor && req.Email == "" {
			writeError(w, http.StatusBadRequest, "el email del paciente es obligatorio")
			return
		}
		if req.Email != "" {
			if _, err := mail.ParseAddress(req.Email); err != nil {
				writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
				return
			}
		}
		if req.ConTutor {
			if req.TutorRelacion != "familiar" && req.TutorRelacion != "amigo" && req.TutorRelacion != "otro" {
				writeError(w, http.StatusBadRequest, "elegí una relación válida con el paciente")
				return
			}
			if req.TutorNombre == "" {
				writeError(w, http.StatusBadRequest, "el nombre del tutor es obligatorio")
				return
			}
			if !telefonoRegex.MatchString(req.TutorTelefono) {
				writeError(w, http.StatusBadRequest, "el teléfono del tutor no tiene un formato válido")
				return
			}
			if _, err := mail.ParseAddress(req.TutorEmail); err != nil {
				writeError(w, http.StatusBadRequest, "el email del tutor no tiene un formato válido")
				return
			}
		}

		var existente db.Paciente
		if err := gdb.Where("clinic_id = ? AND dni = ?", profesionalID, req.DNI).First(&existente).Error; err == nil {
			writeError(w, http.StatusConflict, "ya existe un paciente con ese DNI")
			return
		}

		// DE QUIÉN VA A SER ESTA FICHA (Fase 3.2.6, mockup
		// `pacientes-recepcion.html`: "Profesional · Obligatorio").
		//
		// `creado_por_user_id` es uno de los tres criterios de
		// `soloMisPacientes`, así que sin dueño la ficha nace invisible:
		// no aparece en la lista de nadie hasta que alguien le invente un
		// turno. Recepción sin profesional elegido no tiene a quién
		// asignársela, y adivinar sería peor — por eso el modal lo pide
		// antes que cualquier otro dato, y acá se rechaza con 409.
		duenio, ok := agendaAConfigurar(w, r, gdb, profesionalID, req.ProfesionalUserID)
		if !ok {
			return
		}
		if duenio == uuid.Nil {
			writeError(w, http.StatusConflict, errFaltaElegirProfesional.Error())
			return
		}

		paciente := db.Paciente{
			ClinicID: profesionalID,
			// Quién la cargó — lo que hace que siga siendo visible para esa
			// persona antes de que exista el primer turno (Fase 3.2.3, ver
			// soloMisPacientes).
			CreadoPorUserID: &duenio,
			Nombre:          req.Nombre,
			Apellido:        req.Apellido,
			DNI:             req.DNI,
			// Origen "manual" (corrección de QA, Fase 2.4.1) — alta directa
			// por el profesional, que ya tiene a la persona en frente:
			// queda VERIFICADA de entrada (ver pacienteEstaVerificado).
			Origen: "manual",
		}
		if req.Telefono != "" {
			paciente.Telefono = &req.Telefono
		}
		if req.Email != "" {
			paciente.Email = &req.Email
		}

		var tutores []db.PacienteTutor
		err := gdb.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(&paciente).Error; err != nil {
				return err
			}
			if req.ConTutor {
				tutor := db.PacienteTutor{
					PacienteID: paciente.ID,
					Relacion:   req.TutorRelacion,
					Nombre:     req.TutorNombre,
					Telefono:   req.TutorTelefono,
					Email:      req.TutorEmail,
				}
				if err := tx.Create(&tutor).Error; err != nil {
					return err
				}
				tutores = []db.PacienteTutor{tutor}
			}
			return nil
		})
		if err != nil {
			if isUniqueViolation(err) {
				writeError(w, http.StatusConflict, "ya existe un paciente con ese DNI")
				return
			}
			writeError(w, http.StatusInternalServerError, "no se pudo crear el paciente")
			return
		}

		verificado, err := pacienteEstaVerificado(gdb, paciente)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo crear el paciente")
			return
		}
		writeJSON(w, http.StatusCreated, toPacienteResponse(paciente, verificado, tutores, nil, nil, nil))
	}
}

// profesionalesPorPaciente — para cada ficha de la clínica, quiénes la
// tienen entre sus pacientes (Fase 3.2.6).
//
// LOS MISMOS TRES CRITERIOS QUE `soloMisPacientes`, leídos al revés. Allá
// la pregunta es "¿esta ficha es mía?"; acá, "¿de quiénes es esta ficha?".
// Si divergen, la columna diría que un paciente es de alguien que no lo
// ve en su propia lista — y eso no se nota mirando una sola pantalla.
//
//  1. tengo turnos con esa persona,
//  2. yo cargué la ficha (`creado_por_user_id`),
//  3. la sumé a mi lista desde "+ Agregar paciente > De la clínica".
//
// Un UNION y no tres consultas: es una sola pasada por la lista entera,
// mismo criterio de lote que `pacientesVerificadosIDs` y los otros
// helpers de este archivo — una consulta por fila sería N+1 sobre una
// tabla que se pinta completa.
func profesionalesPorPaciente(
	gdb *gorm.DB, clinicID uuid.UUID,
) (map[uuid.UUID][]profesionalDePacienteResponse, error) {
	type fila struct {
		PacienteID uuid.UUID
		UserID     uuid.UUID
	}
	var filas []fila
	if err := gdb.Raw(`
		SELECT t.paciente_id AS paciente_id, t.atendido_por_user_id AS user_id
		  FROM turnos t
		 WHERE t.clinic_id = ? AND t.paciente_id IS NOT NULL AND t.atendido_por_user_id IS NOT NULL
		UNION
		SELECT p.id AS paciente_id, p.creado_por_user_id AS user_id
		  FROM pacientes p
		 WHERE p.clinic_id = ? AND p.creado_por_user_id IS NOT NULL
		UNION
		SELECT l.paciente_id AS paciente_id, l.user_id AS user_id
		  FROM pacientes_en_mi_lista l
		  JOIN pacientes p2 ON p2.id = l.paciente_id
		 WHERE p2.clinic_id = ?
	`, clinicID, clinicID, clinicID).Scan(&filas).Error; err != nil {
		return nil, err
	}
	if len(filas) == 0 {
		return map[uuid.UUID][]profesionalDePacienteResponse{}, nil
	}

	// Los nombres en una sola pasada, igual que nombresDeQuienesAtienden.
	ids := make([]uuid.UUID, 0, len(filas))
	vistos := map[uuid.UUID]bool{}
	for _, f := range filas {
		if !vistos[f.UserID] {
			vistos[f.UserID] = true
			ids = append(ids, f.UserID)
		}
	}
	nombres := make(map[uuid.UUID]string, len(ids))
	var perfiles []db.ProfessionalProfile
	_ = gdb.Where("user_id IN ?", ids).Find(&perfiles).Error
	for _, perfil := range perfiles {
		nombres[perfil.UserID] = strings.TrimSpace(perfil.Nombre + " " + perfil.Apellido)
	}
	// Quien todavía no cargó perfil, por su mail — nunca un id crudo.
	var users []db.User
	_ = gdb.Where("id IN ?", ids).Find(&users).Error
	for _, u := range users {
		if nombres[u.ID] == "" {
			nombres[u.ID] = u.Email
		}
	}

	out := map[uuid.UUID][]profesionalDePacienteResponse{}
	for _, f := range filas {
		nombre := nombres[f.UserID]
		if nombre == "" {
			// Un usuario que ya no existe: no se inventa una inicial.
			continue
		}
		out[f.PacienteID] = append(out[f.PacienteID], profesionalDePacienteResponse{
			UserID: f.UserID.String(),
			Nombre: nombre,
		})
	}
	// Orden estable: la columna no puede reordenarse sola entre recargas.
	for id := range out {
		sort.Slice(out[id], func(i, j int) bool { return out[id][i].Nombre < out[id][j].Nombre })
	}
	return out, nil
}
