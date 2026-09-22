package http

import (
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// registerTurnoRoutes monta las rutas del calendario/turnero (spec §4.3,
// §4.4) — todas autenticadas y siempre acotadas al profesional dueño del
// token, nunca a un clinic_id que venga del body/query.
func registerTurnoRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/turnos", listTurnosHandler(gdb))
	r.Get("/turnos/contadores", contadoresDeTurnosHandler(gdb))
	r.Post("/turnos", crearTurnoManualHandler(gdb))
	r.Patch("/turnos/{id}/cancelar", cancelarTurnoHandler(gdb))
	r.Post("/turnos/cancelar-sin-verificar", cancelarTurnosSinVerificarHandler(gdb))
	r.Patch("/turnos/{id}/hora", reprogramarTurnoHandler(gdb))
	r.Post("/turnos/autoreservar", autoreservarTurnosHandler(gdb))
	r.Patch("/turnos/{id}/asistencia", marcarAsistenciaHandler(gdb))
	r.Get("/turnos/pendientes-asistencia", turnosPendientesAsistenciaHandler(gdb))
	r.Get("/panel/resumen", resumenPanelHandler(gdb))
	r.Get("/panel/notificaciones", panelNotificacionesHandler(gdb))
}

// turnoResponse no incluye nombre/color de tipo_consulta a propósito — el
// front ya pide GET /tipos-consulta para el selector del modal (T2.4) y
// cruza por tipoConsultaId, sin necesitar que este endpoint haga el join.
type turnoResponse struct {
	ID               string  `json:"id"`
	Estado           string  `json:"estado"`
	Origen           string  `json:"origen"`
	TipoConsultaID   *string `json:"tipoConsultaId,omitempty"`
	HoraInicio       *string `json:"horaInicio,omitempty"`
	HoraFin          *string `json:"horaFin,omitempty"`
	PacienteID       *string `json:"pacienteId,omitempty"`
	NombreContacto   string  `json:"nombreContacto"`
	ApellidoContacto string  `json:"apellidoContacto"`
	DNIContacto      string  `json:"dniContacto"`
	TelefonoContacto string  `json:"telefonoContacto"`
	EmailContacto    string  `json:"emailContacto"`
	Motivo           string  `json:"motivo"`
	CreatedAt        string  `json:"createdAt"`
	// Quién atiende este turno (Fase 3.2.5, 2026-09-14). La ficha de un
	// paciente muestra TODOS sus turnos —el paciente es de la clínica, y
	// un historial partido por profesional no sirve como historial— así
	// que cada fila tiene que decir con quién fue o va a ser.
	//
	// `EsMio` lo decide el backend y no el frontend comparando ids: la
	// pantalla lo usa para saber qué puede tocar, y esa es una decisión
	// de permisos, no de presentación.
	AtendidoPorUserID *string `json:"atendidoPorUserId,omitempty"`
	AtendidoPorNombre string  `json:"atendidoPorNombre,omitempty"`
	EsMio             bool    `json:"esMio"`
	// El NOMBRE del tipo de consulta, además del id (2026-09-15).
	//
	// La ficha de un paciente muestra turnos de varios profesionales, y
	// resolvía el tipo contra la lista PROPIA: el turno de un colega
	// referencia el id del tipo de ÉL, que no está en esa lista, y salía
	// "—". Un historial que no dice qué se hizo no es un historial.
	//
	// Viaja EL NOMBRE Y NADA MÁS (TR-145). El nombre es lo compartido
	// —"Limpieza dental" es lo mismo en toda la clínica—; el color es
	// preferencia de la agenda de cada uno, así que el del colega no tiene
	// por qué cruzarse: si yo tengo ese tipo en beige, en mi pantalla se
	// pinta beige aunque él lo tenga en verde. Esa resolución la hace el
	// frontend contra mis propios tipos, por nombre — mandar también el
	// color de él sería mandar un dato que la pantalla debe ignorar.
	TipoConsultaNombre string `json:"tipoConsultaNombre,omitempty"`
	// Asistencia (pedido explícito del cliente, 2026-09-04): nil hasta que
	// se marca desde un turno ya resuelto (ver marcarAsistenciaHandler).
	Asistencia *string `json:"asistencia,omitempty"`
	// AsistenciaPreliminar — lo anotado por adelantado desde la tarjeta
	// de "Turnos de hoy", todavía reversible (2026-09-19). Ver el
	// comentario del campo en models.go: es un borrador, no la
	// asistencia. Se vuelve definitivo solo cuando el turno termina.
	AsistenciaPreliminar *string `json:"asistenciaPreliminar,omitempty"`
	// Autoreservado (2026-09-08): true si este turno se movió con el botón
	// "Autoreservar turnos" del modal de conflicto — el frontend lo pinta
	// con rayas en el calendario y lo avisa en TurnoDetalle.
	Autoreservado bool `json:"autoreservado"`
	// PacienteVerificado (corrección de seguridad, Fase 2.4.1) — mismo
	// criterio que Paciente.verificado (pacienteEstaVerificado): false si
	// el turno no tiene paciente vinculado. Se completa aparte, solo en
	// listTurnosHandler (necesita el set de pacientes verificados del
	// profesional, no algo que toTurnoResponse pueda calcular con un solo
	// Turno) — da visibilidad al profesional sobre turnos de pacientes que
	// todavía no demostraron ser reales, pedido explícito del cliente tras
	// la charla de seguridad sobre el formulario público.
	PacienteVerificado bool `json:"pacienteVerificado"`
	// EsParaOtro/Tutor* (Fase 2.4.2) — presentes solo si el turno se
	// originó por el camino "sacar turno para otro" del wizard público
	// (ver models.go). El panel usa EsParaOtro para la columna "Sacado
	// por otro" en Turnos.
	EsParaOtro    bool    `json:"esParaOtro"`
	TutorRelacion *string `json:"tutorRelacion,omitempty"`
	TutorNombre   *string `json:"tutorNombre,omitempty"`
	TutorTelefono *string `json:"tutorTelefono,omitempty"`
	TutorEmail    *string `json:"tutorEmail,omitempty"`
}

// completarProfesionalDeTurnos rellena, para un lote de turnos, quién
// atiende cada uno, si es de quien mira, y cómo se llama su tipo de
// consulta.
//
// En un lote y no por fila: resolver turno por turno sería N+1 sobre una
// lista que se pinta entera, el mismo criterio que ya usa
// nombresDeLosMiembros.
//
// `conNombre` decide SOLO si viaja el nombre del profesional, nunca el
// resto. La distinción no es cosmética y se pagó con un test en rojo: lo
// que esta función completa además del nombre es `esMio` —si el turno se
// puede tocar— y el nombre del tipo de consulta. Saltearla entera para
// esconder una columna dejaba a recepción, parada en la vista de un
// profesional, con TODOS sus turnos en solo lectura: justo lo contrario
// de *"el recepcionista puede navegar en todas las vistas... e
// interactuar con estas vistas"*.
func completarProfesionalDeTurnos(
	gdb *gorm.DB, r *http.Request, turnos []db.Turno, out []turnoResponse, conNombre bool,
) {
	// El foco y no la sesión: `esMio` significa "es de la agenda que
	// estoy mirando". Recepción parada en la vista de un profesional
	// tiene que poder tocar los turnos de ESA agenda; en la vista
	// general no es de nadie en particular y todos quedan en solo
	// lectura, que es lo correcto — desde ahí no se sabe sobre qué
	// agenda se estaría actuando.
	yo, _ := profesionalEnFoco(r)

	ids := make([]uuid.UUID, 0, len(turnos))
	vistos := make(map[uuid.UUID]bool, len(turnos))
	for _, t := range turnos {
		if t.AtendidoPorUserID != nil && !vistos[*t.AtendidoPorUserID] {
			vistos[*t.AtendidoPorUserID] = true
			ids = append(ids, *t.AtendidoPorUserID)
		}
	}
	nombres := make(map[uuid.UUID]string, len(ids))
	if len(ids) > 0 {
		var perfiles []db.ProfessionalProfile
		_ = gdb.Where("user_id IN ?", ids).Find(&perfiles).Error
		for _, p := range perfiles {
			nombres[p.UserID] = strings.TrimSpace(p.Nombre + " " + p.Apellido)
		}
		// Quien todavía no cargó perfil, por su mail — nunca un id crudo.
		var users []db.User
		_ = gdb.Where("id IN ?", ids).Find(&users).Error
		for _, u := range users {
			if nombres[u.ID] == "" {
				nombres[u.ID] = u.Email
			}
		}
	}

	// Los tipos de consulta de este lote, sin importar de quién sean: se
	// lee la fila ajena solo para sacarle el nombre.
	tiposIDs := make([]uuid.UUID, 0, len(turnos))
	vistosTipo := make(map[uuid.UUID]bool, len(turnos))
	for _, t := range turnos {
		if t.TipoConsultaID != nil && !vistosTipo[*t.TipoConsultaID] {
			vistosTipo[*t.TipoConsultaID] = true
			tiposIDs = append(tiposIDs, *t.TipoConsultaID)
		}
	}
	tipos := make(map[uuid.UUID]db.TipoConsulta, len(tiposIDs))
	if len(tiposIDs) > 0 {
		var encontrados []db.TipoConsulta
		// Solo id y nombre: es lo único que se expone de la fila de un
		// colega, y decirlo en la query lo deja escrito.
		_ = gdb.Select("id", "nombre").Where("id IN ?", tiposIDs).Find(&encontrados).Error
		for _, t := range encontrados {
			tipos[t.ID] = t
		}
	}

	for i := range out {
		if i >= len(turnos) {
			break
		}
		if id := turnos[i].TipoConsultaID; id != nil {
			if tipo, hay := tipos[*id]; hay {
				out[i].TipoConsultaNombre = tipo.Nombre
			}
		}
		id := turnos[i].AtendidoPorUserID
		if id == nil {
			continue
		}
		s := id.String()
		out[i].AtendidoPorUserID = &s
		if conNombre {
			out[i].AtendidoPorNombre = nombres[*id]
		}
		out[i].EsMio = *id == yo
	}
}

func toTurnoResponse(t db.Turno) turnoResponse {
	out := turnoResponse{
		ID:               t.ID.String(),
		Estado:           t.Estado,
		Origen:           t.Origen,
		NombreContacto:   t.NombreContacto,
		ApellidoContacto: t.ApellidoContacto,
		DNIContacto:      t.DNIContacto,
		TelefonoContacto: t.TelefonoContacto,
		EmailContacto:    t.EmailContacto,
		Motivo:           t.Motivo,
		CreatedAt:        t.CreatedAt.Format(time.RFC3339),
	}
	if t.PacienteID != nil {
		id := t.PacienteID.String()
		out.PacienteID = &id
	}
	if t.TipoConsultaID != nil {
		id := t.TipoConsultaID.String()
		out.TipoConsultaID = &id
	}
	if t.HoraInicio != nil {
		s := t.HoraInicio.Format(time.RFC3339)
		out.HoraInicio = &s
	}
	if t.HoraFin != nil {
		s := t.HoraFin.Format(time.RFC3339)
		out.HoraFin = &s
	}
	out.Asistencia = t.Asistencia
	out.AsistenciaPreliminar = t.AsistenciaPreliminar
	out.Autoreservado = t.Autoreservado
	out.EsParaOtro = t.EsParaOtro
	out.TutorRelacion = t.TutorRelacion
	out.TutorNombre = t.TutorNombre
	out.TutorTelefono = t.TutorTelefono
	out.TutorEmail = t.TutorEmail
	return out
}

// listTurnosHandler — GET /turnos?estado=&desde=&hasta=&q=&resuelto=&tipoConsultaId=&verificacion=.
// `estado` filtra por columna exacta (agendado/cancelada — TR-104: ya no
// existe `pendiente`); `desde`/`hasta` (RFC3339) filtran por hora_inicio —
// lo que usa el calendario (T2.3) para pedir solo el rango visible. `q`
// (T3.3) busca por nombre/apellido/DNI/email de contacto, igual que el
// buscador de la vista Turnos. `resuelto` (true/false, pedido explícito
// del cliente, 2026-08-23) filtra turnos `agendado` cuya hora de fin ya
// pasó (pestaña "Resueltos" de la vista Turnos) — solo tiene efecto si
// además se manda `estado=agendado`; nunca cambia el significado de
// `estado=agendado` por sí solo, así el calendario (que pide
// `estado=agendado` sin este parámetro, para pintar pasados en gris y
// futuros normal) sigue trayendo ambos. `tipoConsultaId` (corrección de
// QA, Extra 2.3.3: "faltó el filtro de tipo de consulta" en la vista
// Turnos) filtra por columna exacta — mismo filtro que ya existía del
// lado del cliente en "Turnos activos"/"Historial" de la ficha de
// paciente (paciente-turnos-table.tsx), acá resuelto en el servidor.
// `verificacion` (corrección de seguridad, Fase 2.4.1) — "verificado" o
// "sin_verificar", filtra según si el paciente vinculado ya demostró ser
// real (ver pacienteEstaVerificado/pacientesVerificadosQuery) — le da al
// profesional una forma rápida de encontrar turnos de pacientes que
// todavía nadie confirmó, sin abrir ficha por ficha. Un turno sin
// paciente vinculado cuenta como "sin_verificar".
// Sin filtros, devuelve todos los turnos del profesional (usado por T2.2
// para calcular el resumen si hiciera falta).
// filtrosComunesDeTurnos — todo lo que /turnos y /turnos/contadores
// filtran IGUAL: el aislamiento entre colegas y los filtros que la
// persona eligió en pantalla (búsqueda, rango de fechas, tipo de
// consulta, verificación del paciente).
//
// Está extraído para que no puedan divergir. Las pestañas de /panel/turnos
// muestran un número al lado de cada nombre y la lista debajo: si el
// contador filtrara distinto que el listado, la pestaña diría "12" y
// abajo se verían 9 — el mismo tipo de bug que la 3.2.7d ya tuvo cuando
// dos pantallas respondían distinto sobre la misma ficha.
//
// Lo que NO entra acá es `estado`/`resuelto`: es justamente lo que
// distingue a una pestaña de otra.
func filtrosComunesDeTurnos(
	w http.ResponseWriter, r *http.Request, gdb *gorm.DB, clinicID uuid.UUID,
) (*gorm.DB, bool) {
	// Aislamiento entre colegas (Fase 3.2.2): un profesional ve su
	// agenda; recepción, admin y owner ven la de toda la clínica.
	query := gdb.Where("clinic_id = ?", clinicID).Scopes(soloMisTurnos(r))

	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		like := "%" + q + "%"
		query = query.Where(
			"nombre_contacto ILIKE ? OR apellido_contacto ILIKE ? OR dni_contacto ILIKE ? OR email_contacto ILIKE ?",
			like, like, like, like,
		)
	}
	if desde := r.URL.Query().Get("desde"); desde != "" {
		t, err := time.Parse(time.RFC3339, desde)
		if err != nil {
			writeError(w, http.StatusBadRequest, "el parámetro 'desde' debe ser una fecha válida")
			return nil, false
		}
		query = query.Where("hora_inicio >= ?", t)
	}
	if hasta := r.URL.Query().Get("hasta"); hasta != "" {
		t, err := time.Parse(time.RFC3339, hasta)
		if err != nil {
			writeError(w, http.StatusBadRequest, "el parámetro 'hasta' debe ser una fecha válida")
			return nil, false
		}
		query = query.Where("hora_inicio <= ?", t)
	}
	if tipoConsultaID := r.URL.Query().Get("tipoConsultaId"); tipoConsultaID != "" {
		id, err := uuid.Parse(tipoConsultaID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "el parámetro 'tipoConsultaId' debe ser un id válido")
			return nil, false
		}
		query = query.Where("tipo_consulta_id = ?", id)
	}
	// verificacion (corrección de seguridad, Fase 2.4.1) — "sin_verificar"
	// es el filtro que le da al profesional visibilidad sobre turnos de
	// pacientes que todavía no demostraron ser reales (ver
	// pacientesVerificadosQuery), para poder revisarlos/limpiarlos de un
	// vistazo en vez de abrir ficha por ficha.
	if verificacion := r.URL.Query().Get("verificacion"); verificacion != "" {
		sub := pacientesVerificadosQuery(gdb, clinicID)
		switch verificacion {
		case "verificado":
			query = query.Where("paciente_id IN (?)", sub)
		case "sin_verificar":
			query = query.Where("paciente_id IS NULL OR paciente_id NOT IN (?)", sub)
		default:
			writeError(w, http.StatusBadRequest, "el parámetro 'verificacion' debe ser 'verificado' o 'sin_verificar'")
			return nil, false
		}
	}
	return query, true
}

// filtroDePestaña — `estado` y `resuelto`, lo único que separa una
// pestaña de /panel/turnos de las otras.
func filtroDePestaña(w http.ResponseWriter, r *http.Request, query *gorm.DB) (*gorm.DB, bool) {
	if estado := r.URL.Query().Get("estado"); estado != "" {
		query = query.Where("estado = ?", estado)
	}
	if resuelto := r.URL.Query().Get("resuelto"); resuelto != "" {
		ahora := clock.Now()
		switch resuelto {
		case "true":
			query = query.Where("hora_fin < ?", ahora)
		case "false":
			query = query.Where("hora_fin IS NULL OR hora_fin >= ?", ahora)
		default:
			writeError(w, http.StatusBadRequest, "el parámetro 'resuelto' debe ser true o false")
			return nil, false
		}
	}
	return query, true
}

func listTurnosHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		query, ok := filtrosComunesDeTurnos(w, r, gdb, profesionalID)
		if !ok {
			return
		}
		query, ok = filtroDePestaña(w, r, query)
		if !ok {
			return
		}

		// Paginación opt-in (ver paginacion.go): sin `limit` esto se
		// comporta igual que siempre — es lo que mantiene intacto al
		// calendario, que necesita el rango de fechas COMPLETO.
		if limit, offset, aplicar := paginacionDeRequest(r); aplicar {
			var err error
			query, err = aplicarPaginacion(w, query, &db.Turno{}, limit, offset)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo obtener los turnos")
				return
			}
		}

		var turnos []db.Turno
		if err := query.Order("created_at").Find(&turnos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los turnos")
			return
		}

		verificados, err := pacientesVerificadosIDs(gdb, profesionalID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los turnos")
			return
		}

		out := make([]turnoResponse, len(turnos))
		for i, t := range turnos {
			out[i] = toTurnoResponse(t)
			if t.PacienteID != nil {
				out[i].PacienteVerificado = verificados[*t.PacienteID]
			}
		}
		// QUIÉN ATIENDE CADA TURNO, solo en la VISTA GENERAL de recepción
		// (Fase 3.2.6). Hasta acá esto solo se completaba en la ficha del
		// paciente, y con razón: en la vista de un profesional todos los
		// turnos son suyos, decirlo en cada fila sería ruido — y la
		// columna que lo muestra sería una palabra repetida.
		//
		// La vista general cambia eso: son los turnos de TODOS los
		// profesionales mezclados, y una lista que no dice de quién es
		// cada uno no sirve para atender un teléfono. Es el mismo lote de
		// dos consultas que ya usa la ficha, no un N+1.
		//
		// La condición vive acá y no en el frontend a propósito: la
		// tabla dibuja la columna cuando el dato viene, así que "cuándo
		// viene" es la regla, y tiene un solo dueño.
		completarProfesionalDeTurnos(gdb, r, turnos, out, veTodaLaClinica(r))
		writeJSON(w, http.StatusOK, out)
	}
}

type crearTurnoManualRequest struct {
	NombreContacto   string `json:"nombreContacto"`
	ApellidoContacto string `json:"apellidoContacto"`
	DNIContacto      string `json:"dniContacto"`
	TelefonoContacto string `json:"telefonoContacto"`
	EmailContacto    string `json:"emailContacto"`
	Motivo           string `json:"motivo"`
	TipoConsultaID   string `json:"tipoConsultaId"`
	HoraInicio       string `json:"horaInicio"`
	HoraFin          string `json:"horaFin"`
	// ProfesionalUserID — a qué agenda entra este turno (QA de la Fase
	// 3.2.6). Vacío = la regla de siempre (quien lo carga, o el
	// profesional en foco si es recepción).
	//
	// Antes de esto, recepción en la vista general no podía cargar nada:
	// el backend le pedía pararse primero en una agenda. Pedírselo
	// mientras llena el formulario, en el formulario, es lo mismo sin el
	// rodeo — y sin moverle la pantalla de atrás.
	ProfesionalUserID string `json:"profesionalUserId"`
	// PacienteID (opcional) — camino "paciente conocido" del modal: en vez
	// de crear un Paciente nuevo a partir de los datos de contacto, vincula
	// el turno a un paciente que ya existe (pedido explícito del cliente,
	// 2026-08-23, para no duplicar la ficha de alguien que ya fue atendido).
	// Los campos de contacto igual viajan en la request — el frontend los
	// precarga con los datos actuales del paciente elegido — y quedan
	// guardados como el snapshot de contacto de este turno puntual.
	PacienteID string `json:"pacienteId,omitempty"`
	// ParaOtro/Tutor* (Fase 2.4.2) — mismo esquema y validación que
	// solicitarTurnoPublicoRequest (turno_publico.go): "Agregar turno >
	// paciente nuevo" es el otro camino de alta directa que necesita poder
	// cargar un paciente sin datos de contacto propios (los tiene el
	// tutor). Camino "paciente conocido" (PacienteID no vacío) no usa
	// estos campos — la ficha existente ya trae los suyos.
	// TutorDNI existió hasta la tercera ronda de correcciones (2026-09-06)
	// — eliminado del todo, pedido textual del cliente.
	ParaOtro      bool   `json:"paraOtro"`
	TutorRelacion string `json:"tutorRelacion"`
	TutorNombre   string `json:"tutorNombre"`
	TutorTelefono string `json:"tutorTelefono"`
	TutorEmail    string `json:"tutorEmail"`
}

// crearTurnoManualHandler — POST /turnos: caminos "paciente nuevo" y
// "paciente conocido" del modal (spec §4.3, "para consultas que no
// llegaron por la página") — crea el Turno YA agendado; con Paciente
// nuevo o vinculado a uno existente según venga `pacienteId`.
func crearTurnoManualHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var req crearTurnoManualRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.TutorRelacion = strings.TrimSpace(req.TutorRelacion)
		req.TutorNombre = strings.TrimSpace(req.TutorNombre)
		req.TutorTelefono = strings.TrimSpace(req.TutorTelefono)
		req.TutorEmail = strings.TrimSpace(strings.ToLower(req.TutorEmail))

		// Con tutor (Fase 2.4.2) solo aplica al camino "paciente nuevo" —
		// "paciente conocido" (PacienteID no vacío) ya trae su propia
		// ficha, con o sin tutor propio, sin que este alta puntual la
		// toque (mismo criterio que "paciente conocido" no valida/pisa
		// nombre/DNI tampoco).
		if req.ParaOtro && req.PacienteID == "" {
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

		// EL MAIL ES OBLIGATORIO AL CREAR UNA FICHA NUEVA (2026-09-15,
		// pedido del cliente), y no es una validación de formulario más:
		// es la causa raíz de un bug real.
		//
		// Una ficha cargada a mano cuenta como VERIFICADA por su origen
		// (pacienteEstaVerificado: `origen == "manual"` y nada más). Sin
		// mail, el wizard público no tiene con qué reconocerla: cualquier
		// pedido con ese DNI falla el "¿esta ficha responde a este mail?"
		// —no hay contra qué comparar— y, por estar verificada, dispara un
		// conflicto de identidad. Uno por pedido, para siempre. Y esos
		// conflictos pendientes bloquean marcar asistencia.
		//
		// Solo en "paciente nuevo": con "paciente conocido" la ficha ya
		// existe con los datos que tenga y este alta no los pisa (mismo
		// criterio que con el nombre y el DNI). En "para otro" el mail
		// propio del paciente queda opcional — la identidad la aporta el
		// tutor, cuyo mail sí se exige arriba.
		if req.PacienteID == "" && !req.ParaOtro {
			if req.EmailContacto == "" {
				writeError(w, http.StatusBadRequest, "el email del paciente es obligatorio")
				return
			}
			if _, err := mail.ParseAddress(req.EmailContacto); err != nil {
				writeError(w, http.StatusBadRequest, "el email del paciente no tiene un formato válido")
				return
			}
		}

		paraOtro := req.ParaOtro && req.PacienteID == ""
		// QUIÉN ATIENDE ES QUIEN LO CARGA, si atiende (corregido el
		// 2026-09-14, reportado por el cliente).
		//
		// Hasta acá era SIEMPRE el owner de la clínica. Era una
		// simplificación correcta en la 3.2.1 —cuando toda clínica tenía
		// exactamente un profesional, su dueño— y quedó escrita como
		// "hasta que el modal deje elegir profesional (Fase 3.2.6)". Dejó
		// de ser cierta en la 3.2.4, apenas se pudo invitar a un segundo:
		// un colega cargaba un turno y el turno —y con él el paciente, que
		// se deriva de sus turnos— aparecía en la agenda del titular y no
		// en la suya. Eso no es un detalle de UI pendiente: es la fuga
		// exacta que el aislamiento de la 3.2.2 existe para impedir, y no
		// se nota mirando la pantalla propia, se nota en la del otro.
		//
		// La regla: si quien carga el turno es `profesional` de esta
		// clínica, el turno es suyo. Si no —recepción cargando para el
		// equipo—, sigue cayendo al owner hasta que la 3.2.6 traiga el
		// selector de profesional, que es el caso que de verdad lo
		// necesita.
		elegida, ok := agendaElegida(w, r, gdb, profesionalID, req.ProfesionalUserID)
		if !ok {
			return
		}
		atiende, err := profesionalQueAtiende(gdb, r, profesionalID)
		if elegida != nil {
			// El carrusel del modal gana sobre el foco de la sesión: es
			// una decisión tomada PARA ESTE turno, delante de la persona.
			atiende, err = *elegida, nil
		}
		if errors.Is(err, errFaltaElegirProfesional) {
			// No es una falla del servidor: recepción está en la vista
			// general y hay que decirle de qué agenda se trata.
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo resolver el profesional de la clínica")
			return
		}
		turno, err := buildTurnoAgendado(profesionalID, atiende, req.NombreContacto, req.ApellidoContacto, req.DNIContacto,
			req.TelefonoContacto, req.EmailContacto, req.Motivo, req.TipoConsultaID, req.HoraInicio, req.HoraFin, paraOtro)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		turno.Origen = "manual"
		if paraOtro {
			turno.EsParaOtro = true
			turno.TutorRelacion = &req.TutorRelacion
			turno.TutorNombre = &req.TutorNombre
			turno.TutorTelefono = &req.TutorTelefono
			turno.TutorEmail = &req.TutorEmail
		}

		var pacienteExistenteID *uuid.UUID
		if req.PacienteID != "" {
			id, err := uuid.Parse(req.PacienteID)
			if err != nil {
				writeError(w, http.StatusBadRequest, "el paciente elegido no es válido")
				return
			}
			pacienteExistenteID = &id
		}

		if err := crearTurnoAgendadoConPaciente(gdb, profesionalID, &turno, pacienteExistenteID); err != nil {
			writeTurnoAgendadoError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, toTurnoResponse(turno))
	}
}

// cancelarTurnoHandler — PATCH /turnos/{id}/cancelar (T3.3, acción
// "Cancelar" de la vista Turnos). `cancelada` es terminal — spec §4.4 no
// prevé "reabrir" un turno cancelado, así que cancelar uno que ya está
// cancelado es simplemente un no-op idempotente, no un error.
func cancelarTurnoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		turnoID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de turno inválido")
			return
		}

		var turno db.Turno
		// El de un colega NO: 404 y no 403, mismo criterio que la ficha de
		// un paciente ajeno (TR-138). Sin el scope, cualquier profesional
		// podía abrir, cancelar, reprogramar y marcar la asistencia de un
		// turno ajeno con solo tener el id — y marcar asistencia es
		// IRREVERSIBLE (TR-092).
		if err := gdb.Scopes(soloMisTurnos(r)).
			Where("id = ? AND clinic_id = ?", turnoID, profesionalID).First(&turno).Error; err != nil {
			writeError(w, http.StatusNotFound, "turno no encontrado")
			return
		}

		if turno.Estado != "cancelada" {
			// Transacción (Fase 2.4.1, corrección de QA): cancelar puede
			// ser el último turno que "salvaba" a una ficha no verificada
			// (borrarPacienteNoVerificadoSiSinHistorialReal) — si esa
			// segunda parte falla, no debe quedar el turno cancelado de
			// un lado y el paciente sin evaluar del otro.
			err := gdb.Transaction(func(tx *gorm.DB) error {
				if err := tx.Model(&turno).Update("estado", "cancelada").Error; err != nil {
					return err
				}
				if turno.PacienteID != nil {
					borrado, err := borrarPacienteNoVerificadoSiSinHistorialReal(tx, *turno.PacienteID)
					if err != nil {
						return err
					}
					if borrado {
						turno.PacienteID = nil
					}
				}
				return nil
			})
			if err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo cancelar el turno")
				return
			}
			turno.Estado = "cancelada"
		}

		writeJSON(w, http.StatusOK, toTurnoResponse(turno))
	}
}

type cancelarTurnosSinVerificarResponse struct {
	Cancelados int `json:"cancelados"`
}

// cancelarTurnosSinVerificarHandler — POST /turnos/cancelar-sin-verificar
// (corrección de seguridad, Fase 2.4.1): "cómo se hace para borrar todos
// los turnos sin verificar" — acción explícita del profesional, pedida
// desde el filtro "Sin verificar" de /panel/turnos (turnos-table.tsx), un
// clic en vez de cancelar fila por fila. Mismo criterio "nunca se borra un
// turno" que cancelarTurnoHandler — CANCELA (no un DELETE de la fila),
// queda como registro histórico. Alcance: solo turnos VIGENTES
// (`estado='agendado' AND hora_fin >= now()`, mismo criterio que
// turnoVigenteDeTipo) de pacientes que todavía no demostraron ser reales
// (pacientesVerificadosQuery) — un turno ya resuelto no ocupa ningún
// horario, no hay nada que "liberar" cancelándolo.
func cancelarTurnosSinVerificarHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var cancelados int
		err := gdb.Transaction(func(tx *gorm.DB) error {
			// Los MÍOS, y acá importa más que en ningún otro lado: esto
			// cancela EN MASA, de un botón, sin elegir cuáles. Sin el
			// scope, un profesional le limpiaba la agenda entera a su
			// colega —todos sus turnos vigentes de pacientes sin
			// verificar— y del otro lado no quedaba ni un aviso, solo
			// turnos cancelados que nadie canceló.
			sub := pacientesVerificadosQuery(tx, profesionalID)
			var turnos []db.Turno
			if err := tx.Scopes(soloMisTurnos(r)).Where(
				"clinic_id = ? AND estado = 'agendado' AND hora_fin >= now() AND (paciente_id IS NULL OR paciente_id NOT IN (?))",
				profesionalID, sub,
			).Find(&turnos).Error; err != nil {
				return err
			}
			for _, turno := range turnos {
				if err := tx.Model(&db.Turno{}).Where("id = ?", turno.ID).Update("estado", "cancelada").Error; err != nil {
					return err
				}
				if turno.PacienteID != nil {
					if _, err := borrarPacienteNoVerificadoSiSinHistorialReal(tx, *turno.PacienteID); err != nil {
						return err
					}
				}
			}
			cancelados = len(turnos)
			return nil
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron cancelar los turnos")
			return
		}

		writeJSON(w, http.StatusOK, cancelarTurnosSinVerificarResponse{Cancelados: cancelados})
	}
}

type reprogramarTurnoRequest struct {
	HoraInicio string `json:"horaInicio"`
	HoraFin    string `json:"horaFin"`
	// Motivo (opcional, pedido explícito del cliente 2026-08-23): un turno
	// confirmado solo permite cambiar horario y motivo por acá, nunca los
	// datos de contacto — el frontend siempre manda el valor vigente, así
	// que se pisa sin condicional. TR-104: es el ÚNICO endpoint que edita un
	// turno ya creado (editarTurnoHandler, el que corregía datos de contacto
	// de un turno `pendiente`, se sacó del todo junto con ese estado).
	Motivo string `json:"motivo"`
}

// reprogramarTurnoHandler — PATCH /turnos/{id}/hora: acción "Editar" de la
// vista Turnos/calendario (ajuste pedido por el cliente, 2026-08-23) —
// solo cambia el horario y el motivo de consulta, nunca los datos de
// contacto (esos ya se usaron para crear el `paciente` al crear el turno;
// se corrigen desde "Editar paciente", no desde acá). El cambio de horario
// pasa por el mismo exclusion constraint (T2.5) que agendar por primera
// vez: un solapamiento se traduce a 409, nunca un 500.
func reprogramarTurnoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		turnoID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de turno inválido")
			return
		}

		var req reprogramarTurnoRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		horaInicio, horaFin, err := parseRangoHorario(req.HoraInicio, req.HoraFin)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		var turno db.Turno
		// El de un colega NO: 404 y no 403, mismo criterio que la ficha de
		// un paciente ajeno (TR-138). Sin el scope, cualquier profesional
		// podía abrir, cancelar, reprogramar y marcar la asistencia de un
		// turno ajeno con solo tener el id — y marcar asistencia es
		// IRREVERSIBLE (TR-092).
		if err := gdb.Scopes(soloMisTurnos(r)).
			Where("id = ? AND clinic_id = ?", turnoID, profesionalID).First(&turno).Error; err != nil {
			writeError(w, http.StatusNotFound, "turno no encontrado")
			return
		}
		if turno.Estado != "agendado" {
			writeError(w, http.StatusConflict, "solo se puede reprogramar un turno confirmado")
			return
		}
		// Pedido explícito del cliente (2026-08-23): no se puede mover un
		// turno a una fecha/hora pasada. No rechaza el caso "no tocó el
		// horario, solo corrigió el motivo" de un turno ya resuelto — ahí el
		// horario nuevo es igual al que ya tenía, no un movimiento real.
		if !horaInicio.Equal(*turno.HoraInicio) && horaInicio.Before(clock.Now()) {
			writeError(w, http.StatusBadRequest, "no se puede reprogramar un turno a una fecha pasada")
			return
		}

		turno.HoraInicio = &horaInicio
		turno.HoraFin = &horaFin
		turno.Motivo = strings.TrimSpace(req.Motivo)
		// El paciente tampoco puede quedar en dos sillones a la vez al
		// MOVER un turno (2026-09-15). El alta ya lo controlaba, esto no:
		// se podía agendar en un hueco libre y después arrastrarlo encima
		// del turno que esa misma persona tiene con un colega. Es la misma
		// regla — lo que cambiaba era por qué puerta se entra.
		//
		// En una transacción, como en el alta: chequear afuera dejaría la
		// ventana entre el chequeo y el Save.
		if err := gdb.Transaction(func(tx *gorm.DB) error {
			if turno.PacienteID != nil && turno.AtendidoPorUserID != nil {
				if choca, quien := turnoSuperpuestoDeOtroProfesional(
					tx, profesionalID, *turno.PacienteID, *turno.AtendidoPorUserID,
					horaInicio, horaFin, &turno.ID,
				); choca != nil {
					return &errPacienteOcupadoConOtro{
						Profesional: quien,
						Desde:       *choca.HoraInicio,
						Hasta:       *choca.HoraFin,
					}
				}
			}
			return tx.Save(&turno).Error
		}); err != nil {
			writeTurnoAgendadoError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, toTurnoResponse(turno))
	}
}

// autoreservarBusquedaMaxDias — tope de días hacia adelante que se
// escanean buscando un hueco libre antes de rendirse con un turno puntual
// (pedido del cliente: "el horario más próximo autoreservado no
// necesariamente tiene que ser el mismo día" — sin un tope, un
// profesional sin ningún hueco libre real dejaría esto buscando para
// siempre en cada request).
const autoreservarBusquedaMaxDias = 90

type autoreservarTurnosRequest struct {
	TurnoIds []string `json:"turnoIds"`
}

// autoreservarResultadoItem — un turno del lote, con su horario ANTERIOR
// (siempre) y el NUEVO (solo si `Reprogramado`) — el frontend arma la
// pantalla "horario viejo → horario nuevo" con esto, mostrando también los
// que no se pudieron mover (`Reprogramado: false`, ningún hueco libre
// dentro de autoreservarBusquedaMaxDias) en vez de fallar todo el lote.
type autoreservarResultadoItem struct {
	TurnoID            string  `json:"turnoId"`
	Nombre             string  `json:"nombre"`
	HoraInicioAnterior string  `json:"horaInicioAnterior"`
	HoraFinAnterior    string  `json:"horaFinAnterior"`
	HoraInicioNueva    *string `json:"horaInicioNueva,omitempty"`
	HoraFinNueva       *string `json:"horaFinNueva,omitempty"`
	Reprogramado       bool    `json:"reprogramado"`
}

type autoreservarTurnosResponse struct {
	Resultados []autoreservarResultadoItem `json:"resultados"`
}

// autoreservarTurnosHandler — POST /turnos/autoreservar: botón
// "Autoreservar turnos" del modal de conflicto (nueva función, pedido
// textual del cliente, 2026-09-08): "dar un botón de autoreservar turno
// para los afectados, una vez que se da click, por orden de prioridad
// (quien tiene el turno antes que el otro) si es que hay más de un turno
// afectado, auto reservar el turno al horario más próximo disponible...
// no necesariamente tiene que ser el mismo día".
//
// Prioridad = orden de HoraInicio ORIGINAL ascendente (quien tenía el
// turno más temprano se procesa primero). Cada turno se mueve al primer
// hueco libre calculado con la MISMA lógica que "Agregar turno"/"Editar
// turno" (calcularDisponibilidad — horario de atención, bloqueos y demás
// turnos ya agendados), escaneando día por día desde su propio día
// original (o desde hoy, si ese día ya pasó) hasta
// autoreservarBusquedaMaxDias. Todo el lote corre en una sola
// transacción: cada turno se persiste ANTES de buscarle hueco al
// siguiente, así un hueco que el turno A acaba de ocupar nunca se le
// vuelve a ofrecer a B, y el hueco que A dejó libre (su horario viejo)
// sí puede quedar disponible para B — sin esto, el lote podría intentar
// mandar a dos turnos distintos al mismo horario nuevo.
func autoreservarTurnosHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var req autoreservarTurnosRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		if len(req.TurnoIds) == 0 {
			writeError(w, http.StatusBadRequest, "turnoIds es obligatorio")
			return
		}
		ids := make([]uuid.UUID, 0, len(req.TurnoIds))
		for _, s := range req.TurnoIds {
			id, err := uuid.Parse(s)
			if err != nil {
				writeError(w, http.StatusBadRequest, "turnoIds tiene un id inválido")
				return
			}
			ids = append(ids, id)
		}

		// Los MÍOS. Autoreservar MUEVE turnos de día: sin el scope, un
		// profesional podía reprogramarle la agenda a un colega pasándole
		// los ids. Es la misma escritura que /turnos/{id}/hora, pero en
		// lote — y en lote es peor, porque nadie revisa uno por uno lo que
		// mandó.
		var turnos []db.Turno
		if err := gdb.Scopes(soloMisTurnos(r)).
			Where("id IN ? AND clinic_id = ?", ids, profesionalID).Find(&turnos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron cargar los turnos")
			return
		}
		if len(turnos) != len(ids) {
			writeError(w, http.StatusNotFound, "alguno de los turnos no existe")
			return
		}
		for _, t := range turnos {
			if t.Estado != "agendado" || t.HoraInicio == nil || t.HoraFin == nil {
				writeError(w, http.StatusConflict, "solo se pueden autoreservar turnos confirmados")
				return
			}
		}

		sort.Slice(turnos, func(i, j int) bool { return turnos[i].HoraInicio.Before(*turnos[j].HoraInicio) })

		resultados := make([]autoreservarResultadoItem, 0, len(turnos))
		err := gdb.Transaction(func(tx *gorm.DB) error {
			for i := range turnos {
				t := &turnos[i]
				item := autoreservarResultadoItem{
					TurnoID:            t.ID.String(),
					Nombre:             strings.TrimSpace(t.NombreContacto + " " + t.ApellidoContacto),
					HoraInicioAnterior: t.HoraInicio.Format(time.RFC3339),
					HoraFinAnterior:    t.HoraFin.Format(time.RFC3339),
				}

				var tipo db.TipoConsulta
				if t.TipoConsultaID == nil {
					resultados = append(resultados, item)
					continue
				}
				if err := tx.Where("id = ? AND clinic_id = ?", *t.TipoConsultaID, profesionalID).First(&tipo).Error; err != nil {
					resultados = append(resultados, item)
					continue
				}

				local := clock.In(*t.HoraInicio)
				dia := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, local.Location())
				if dia.Before(clock.Today()) {
					dia = clock.Today()
				}

				var nuevaHoraInicio, nuevaHoraFin time.Time
				encontrado := false
				for d := 0; d < autoreservarBusquedaMaxDias; d++ {
					fechaCandidata := dia.AddDate(0, 0, d)
					// El del turno que se está reprogramando: autoreservar
					// mueve el turno de alguien, no lo cambia de dueño.
					// Todo turno `agendado` tiene profesional
					// (chk_turno_agendado_profesional), pero la columna es
					// nullable en el modelo: sin el chequeo, un dato
					// inconsistente calcularía la disponibilidad del uuid
					// cero y devolvería cualquier cosa.
					if t.AtendidoPorUserID == nil {
						continue
					}
					atiendeEste := *t.AtendidoPorUserID
					slots, err := calcularDisponibilidad(tx, profesionalID, atiendeEste, tipo, fechaCandidata, &t.ID)
					if err != nil {
						return err
					}
					if len(slots) == 0 {
						continue
					}
					// NO el primer hueco: el primero LIBRE PARA ESTA
					// PERSONA (2026-09-19, pedido del cliente).
					//
					// `calcularDisponibilidad` mira la agenda del
					// PROFESIONAL —su horario de atención, sus bloqueos,
					// sus turnos—, que es exactamente lo que necesita
					// para ofrecer huecos. Pero el paciente también tiene
					// una agenda, y puede tener turno con un colega a esa
					// misma hora: autoreservar lo mandaba ahí sin ver
					// nada, y creaba justo el encimado que
					// `turnoSuperpuestoDeOtroProfesional` rechaza en el
					// alta y en el reprogramar a mano. Era el único
					// camino por el que todavía se podía dejar a alguien
					// con dos turnos a la vez.
					//
					// Sin paciente vinculado (un turno cargado a mano sin
					// ficha) no hay a quién chequearle la agenda, y el
					// primer hueco sigue valiendo.
					for _, slot := range slots {
						inicioCandidato := combinarFechaYHora(fechaCandidata, slot)
						finCandidato := inicioCandidato.Add(time.Duration(tipo.DuracionMinutos) * time.Minute)
						if t.PacienteID != nil {
							choca, _ := turnoSuperpuestoDeOtroProfesional(
								tx, profesionalID, *t.PacienteID, atiendeEste, inicioCandidato, finCandidato, &t.ID,
							)
							if choca != nil {
								continue
							}
						}
						nuevaHoraInicio = inicioCandidato
						nuevaHoraFin = finCandidato
						encontrado = true
						break
					}
					if !encontrado {
						continue
					}
					break
				}
				if !encontrado {
					resultados = append(resultados, item)
					continue
				}

				t.HoraInicio = &nuevaHoraInicio
				t.HoraFin = &nuevaHoraFin
				t.Autoreservado = true
				if err := tx.Save(t).Error; err != nil {
					return err
				}

				nuevaInicioStr := nuevaHoraInicio.Format(time.RFC3339)
				nuevaFinStr := nuevaHoraFin.Format(time.RFC3339)
				item.HoraInicioNueva = &nuevaInicioStr
				item.HoraFinNueva = &nuevaFinStr
				item.Reprogramado = true
				resultados = append(resultados, item)
			}
			return nil
		})
		if err != nil {
			writeTurnoAgendadoError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, autoreservarTurnosResponse{Resultados: resultados})
	}
}

type marcarAsistenciaRequest struct {
	// Asistencia: "asistio" | "ausente" — pedido explícito del cliente
	// (2026-09-04): "me debe aparecer un aviso que la elección es
	// irreversible y confirmar esto" — una vez marcada, no se acepta
	// ninguna otra request sobre este turno (ver el chequeo de abajo), así
	// que ya no hace falta un valor "" para deshacerla.
	Asistencia string `json:"asistencia"`
}

// marcarAsistenciaHandler — PATCH /turnos/{id}/asistencia (pedido
// explícito del cliente, 2026-09-04): "los turnos resueltos ahora tienen
// la opción al ser tocados de marcar asistidos o ausente, cosa de poder
// guardar ese dato, opción marcable tanto en el calendario, como de la
// sección de turnos resueltos en la pestaña de turnos" — este único
// endpoint atiende los dos lugares del frontend (TurnoDetalle y
// turnos-table.tsx). Solo tiene sentido en un turno YA resuelto (agendado
// + hora de fin ya pasada) — marcarlo antes no tiene sentido, todavía no
// pasó. Irreversible (corrección de QA, 2026-09-04, textual): una vez que
// `Asistencia` ya tiene un valor, cualquier request posterior sobre este
// turno se rechaza con 409 — el aviso de "esto no se puede deshacer" que
// pide el cliente en el frontend solo tiene sentido si es cierto acá,
// nunca solo un texto en la UI sin nada que lo respalde del lado del
// servidor.
// errConflictoPacienteSinResolver — corrección de QA, pedido textual del
// cliente (revisión sobre el diseño anterior, que resolvía solo el
// conflicto retroactivo): "no dejar poner asistencia o ausencia hasta que
// se resuelva el conflicto". Evita el escenario real encontrado en QA: un
// conflicto ya pendiente (ConflictoPaciente.Resuelto = false) donde el
// lado "en conflicto" consigue su propia asistencia después, sin que el
// profesional haya resuelto nada — el sistema terminaba decidiendo solo
// cuál de las dos identidades prevalece, y podía borrar a la que en
// realidad era la real. Con este bloqueo, mientras el ticket siga
// pendiente, ninguna de las dos fichas puede marcar asistencia/ausencia en
// NINGÚN turno propio — de paso evita otro caso real: marcar "ausente" en
// la ficha en conflicto (sin este bloqueo) la borraría sola
// (borrarPacienteNoVerificadoSiSinHistorialReal) dejando el ticket
// pendiente apuntando a una ficha que ya no existe.
var errConflictoPacienteSinResolver = errors.New(
	"hay un conflicto de identidad sin resolver con este paciente — resolvelo desde Pacientes antes de marcar asistencia",
)

// AnticipoAsistencia — cuánto ANTES del comienzo del turno se puede
// marcar la asistencia (2026-09-19, pedido del cliente: "estos botones
// aparecerán solo 5 min antes de la hora de comienzo del turno").
//
// Hasta acá la única forma de marcar era el cartel incerrable que
// aparece cuando el turno TERMINA, y el backend lo imponía: "solo se
// puede marcar asistencia en un turno ya resuelto". Eso obligaba al
// profesional a esperar a que el turno se cumpliera para registrar algo
// que ya sabe apenas la persona entra —o no entra— al consultorio.
//
// La ventana se abre 5 minutos antes del comienzo y no se cierra nunca:
// marcar tarde siempre estuvo permitido (el cartel no tiene tope de
// antigüedad), lo único que cambia es que ahora también se puede marcar
// a tiempo. Lo que sigue prohibido es marcar un turno que todavía no
// empezó de verdad — "asistió" a algo que falta un día es adivinar.
//
// Todo lo demás del endpoint no se toca: sigue siendo irreversible,
// sigue resolviendo el conflicto de identidad que ese turno originó, y
// sigue bloqueado mientras haya un conflicto sin resolver del lado en
// disputa. Marcar antes ADELANTA esas consecuencias, no las saltea.
const AnticipoAsistencia = 5 * time.Minute

// aplicarAsistencia escribe la asistencia DEFINITIVA de un turno ya
// terminado, con todas sus consecuencias: resuelve el conflicto de
// identidad que ese turno originó, borra la ficha de un paciente sin
// verificar que se ausentó a su primer turno, y deja conflictos
// retroactivos si este turno acaba de verificar a alguien.
//
// Extraída de marcarAsistenciaHandler el 2026-09-19, cuando el sondeo de
// turnos pendientes pasó a aplicar el borrador de la tarjeta al vencer
// el turno. Tiene que ser EL MISMO camino y no una copia parecida: si
// divergen, un turno marcado desde la tarjeta y otro marcado desde el
// cartel dejarían la base en estados distintos, y justo en la parte
// irreversible.
//
// Devuelve errConflictoPacienteSinResolver cuando hay un conflicto
// pendiente del lado en disputa — el llamador decide qué hacer con eso
// (el handler responde 409; el sondeo lo deja pendiente para que el
// cartel lo pida a mano).
func aplicarAsistencia(gdb *gorm.DB, turno *db.Turno, clinicID uuid.UUID, valor string) error {
	return gdb.Transaction(func(tx *gorm.DB) error {
		// Carve-out de TR-107 (1.3bis): si ESTE turno puntual es el
		// que originó un ConflictoPaciente todavía pendiente
		// (TurnoEnConflictoID), marcar su asistencia resuelve el
		// conflicto ahí mismo en vez de chocar con el bloqueo general
		// de abajo — "asistió" confirma que la ficha en conflicto es
		// la misma persona (fusión estándar, dirección fija: nunca
		// puede terminar borrando a la ya verificada, a diferencia
		// del bug de TR-106); "ausente" borra la ficha en conflicto y
		// cierra el ticket SIN bloquear su mail (un ausente no prueba
		// fraude). Si el conflicto ya se resolvió por otra vía antes
		// de esta fecha, el lookup no encuentra nada y cae al chequeo
		// general de siempre (item 27 de la checklist del doc).
		var conflictoDisputado db.ConflictoPaciente
		errConflicto := tx.Where("turno_en_conflicto_id = ? AND resuelto = false", turno.ID).First(&conflictoDisputado).Error
		if errConflicto != nil && !errors.Is(errConflicto, gorm.ErrRecordNotFound) {
			return errConflicto
		}
		esCarveOutDeConflicto := errConflicto == nil

		// SOLO EL LADO EN DISPUTA (corrección del 2026-09-15, pedido
		// del cliente).
		//
		// El bloqueo miraba los DOS lados del ticket, así que un
		// conflicto nuevo congelaba también los turnos de la ficha
		// VERIFICADA — incluso turnos anteriores al conflicto, que no
		// tienen nada que ver con él. Ese era el caso reportado: un
		// turno viejo, de una ficha verificada, imposible de marcar
		// porque alguien pidió turno con ese DNI horas después.
		//
		// Lo que la regla tiene que impedir sigue impedido: que la
		// ficha EN CONFLICTO se verifique sola marcando asistencia en
		// otro turno suyo, y que un "ausente" la borre dejando el
		// ticket apuntando a una ficha que ya no existe. La verificada
		// no necesita protección: su identidad no está en discusión —
		// es el otro lado el que tiene que probar quién es.
		//
		// El turno que originó el conflicto queda afuera igual, por el
		// carve-out de arriba: marcarle asistencia es justamente la
		// forma de resolverlo.
		if !esCarveOutDeConflicto && turno.PacienteID != nil {
			var conflictosPendientes int64
			if err := tx.Model(&db.ConflictoPaciente{}).
				Where("resuelto = false AND paciente_en_conflicto_id = ?", *turno.PacienteID).
				Count(&conflictosPendientes).Error; err != nil {
				return err
			}
			if conflictosPendientes > 0 {
				return errConflictoPacienteSinResolver
			}
		}

		if err := tx.Exec("UPDATE turnos SET asistencia = ? WHERE id = ?", valor, turno.ID).Error; err != nil {
			return err
		}

		if esCarveOutDeConflicto {
			if valor == "asistio" {
				if err := resolverConflictoComoVerdadero(tx, conflictoDisputado, &turno.ID); err != nil {
					return err
				}
				turno.PacienteID = &conflictoDisputado.PacienteVerificadoID
			} else {
				if err := resolverConflictoComoFalso(tx, conflictoDisputado, clinicID, false, &turno.ID); err != nil {
					return err
				}
				turno.PacienteID = nil
			}
			return nil
		}
		// Fase 2.4.1 (`docs/Fases post MVP/Fase 2/FASE 2.4 - detallada y bien especificada.docx`),
		// regla nueva pedida textualmente por el cliente: "para un
		// paciente no verificado si se ausenta a lo que vendría siendo
		// su PRIMER turno, eliminar de la tabla pacientes este
		// paciente" — nunca llegó a demostrar que es real.
		if valor == "ausente" && turno.PacienteID != nil {
			borrado, err := borrarPacienteNoVerificadoSiSinHistorialReal(tx, *turno.PacienteID)
			if err != nil {
				return err
			}
			if borrado {
				turno.PacienteID = nil
			}
		}
		// Corrección de QA, pedido textual del cliente: "esto no se
		// tiene que auto solucionar, se debe marcar al profesional
		// para que lo resuelva manualmente" — si ESTE turno acaba de
		// verificar a la ficha (o ya estaba verificada por otro lado),
		// se detectan fichas "hermanas" (mismo DNI, sin ticket
		// todavía) y se deja un ConflictoPaciente PENDIENTE para cada
		// una — nunca se migra/cancela/borra nada acá, eso queda para
		// resolverConflictoPacienteHandler (pacientes_conflicto_panel.go).
		if valor == "asistio" && turno.PacienteID != nil {
			var paciente db.Paciente
			if err := tx.First(&paciente, "id = ?", *turno.PacienteID).Error; err == nil {
				verificado, err := pacienteEstaVerificado(tx, paciente)
				if err != nil {
					return err
				}
				if verificado {
					if err := generarConflictosRetroactivosPorDNI(tx, paciente); err != nil {
						return err
					}
				}
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}
		return nil
	})
}

func marcarAsistenciaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		turnoID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de turno inválido")
			return
		}

		var req marcarAsistenciaRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.Asistencia = strings.TrimSpace(req.Asistencia)
		if req.Asistencia != "asistio" && req.Asistencia != "ausente" {
			writeError(w, http.StatusBadRequest, "asistencia debe ser 'asistio' o 'ausente'")
			return
		}

		var turno db.Turno
		// El de un colega NO: 404 y no 403, mismo criterio que la ficha de
		// un paciente ajeno (TR-138). Sin el scope, cualquier profesional
		// podía abrir, cancelar, reprogramar y marcar la asistencia de un
		// turno ajeno con solo tener el id — y marcar asistencia es
		// IRREVERSIBLE (TR-092).
		if err := gdb.Scopes(soloMisTurnos(r)).
			Where("id = ? AND clinic_id = ?", turnoID, profesionalID).First(&turno).Error; err != nil {
			writeError(w, http.StatusNotFound, "turno no encontrado")
			return
		}
		if turno.Estado != "agendado" || turno.HoraInicio == nil || turno.HoraFin == nil {
			writeError(w, http.StatusConflict, "solo se puede marcar asistencia en un turno confirmado")
			return
		}
		if clock.Now().Before(turno.HoraInicio.Add(-AnticipoAsistencia)) {
			writeError(w, http.StatusConflict, "todavía es muy temprano para marcar la asistencia de este turno")
			return
		}
		if turno.Asistencia != nil {
			writeError(w, http.StatusConflict, "la asistencia ya fue marcada y no se puede modificar")
			return
		}

		// MIENTRAS EL TURNO NO TERMINÓ, lo que se guarda es un BORRADOR
		// (2026-09-19, pedido del cliente: "la asistencia de la tarjeta es
		// reversible... el último estado de la tarjeta es el que va a leer
		// la asistencia final cuando el turno pase a estar resuelto").
		//
		// Reversible de verdad: se sobrescribe las veces que haga falta y
		// no dispara NINGUNA de las consecuencias de abajo. Eso no es una
		// simplificación — son irreversibles y destructivas (resolver el
		// conflicto de identidad, borrar la ficha de un paciente sin
		// verificar en un "ausente"), y no pueden colgar de algo que el
		// profesional todavía puede cambiar: marcó ausente a las 10:10, la
		// persona llegó tarde, corrige a asistió, y la ficha ya no está.
		//
		// Se aplica una sola vez cuando el turno cruza su hora de fin —
		// ver aplicarAsistenciaPreliminar en
		// turnos_pendientes_asistencia.go—, y desde ahí vale la regla de
		// siempre.
		if turno.HoraFin.After(clock.Now()) {
			if err := gdb.Exec(
				"UPDATE turnos SET asistencia_preliminar = ? WHERE id = ?", req.Asistencia, turno.ID,
			).Error; err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo guardar la asistencia")
				return
			}
			turno.AsistenciaPreliminar = &req.Asistencia
			writeJSON(w, http.StatusOK, toTurnoResponse(turno))
			return
		}

		// UPDATE directo por columna (no gdb.Model(&turno).Update con un
		// *string): un valor por struct puede quedar ambiguo según cómo
		// GORM detecte "zero value" — acá el valor ya está validado arriba
		// (siempre "asistio" o "ausente"), así que un UPDATE explícito es
		// lo más simple y no deja dudas. Todo en una transacción (Fase
		// 2.4.1: se le suma la regla de auto-borrado de abajo) — si esa
		// segunda parte falla, no queda la asistencia marcada de un lado y
		// el paciente sin borrar del otro (TR-092: la marca es
		// irreversible, un estado a medias sería peor que fallar entero).
		err = aplicarAsistencia(gdb, &turno, profesionalID, req.Asistencia)
		if err != nil {
			if errors.Is(err, errConflictoPacienteSinResolver) {
				writeError(w, http.StatusConflict, err.Error())
				return
			}
			writeError(w, http.StatusInternalServerError, "no se pudo guardar la asistencia")
			return
		}
		turno.Asistencia = &req.Asistencia

		writeJSON(w, http.StatusOK, toTurnoResponse(turno))
	}
}

// buildTurnoAgendado arma (sin tocar la base) un Turno ya validado a nivel
// de negocio, para el camino "paciente nuevo" de crearTurnoManualHandler.
// Fase 3.2.1: recibe además `atiendeUserID`, el profesional que va a
// atender. Hasta que el panel deje elegirlo (Fase 3.2.6) el llamador pasa
// el owner de la clínica.
func buildTurnoAgendado(profesionalID, atiendeUserID uuid.UUID, nombre, apellido, dni, telefono, email, motivo, tipoConsultaIDRaw, horaInicioRaw, horaFinRaw string, paraOtro bool) (db.Turno, error) {
	nombre = strings.TrimSpace(nombre)
	apellido = strings.TrimSpace(apellido)
	dni = strings.TrimSpace(dni)
	telefono = strings.TrimSpace(telefono)
	if nombre == "" || apellido == "" || dni == "" {
		return db.Turno{}, errors.New("nombre, apellido y DNI del paciente son obligatorios")
	}
	// Teléfono (Fase 2.4.2): obligatorio solo en "para mí" — en "para
	// otro" el teléfono PROPIO del paciente queda opcional (lo tiene el
	// tutor). Se mantiene el criterio histórico de esta función (solo
	// "no vacío", sin regex de formato) para no romper el camino
	// "paciente conocido" con datos ya guardados de antes.
	if !paraOtro && telefono == "" {
		return db.Turno{}, errors.New("nombre, apellido, DNI y teléfono del paciente son obligatorios")
	}

	tipoConsultaID, err := uuid.Parse(tipoConsultaIDRaw)
	if err != nil {
		return db.Turno{}, errors.New("el tipo de consulta no es válido")
	}
	horaInicio, horaFin, err := parseRangoHorario(horaInicioRaw, horaFinRaw)
	if err != nil {
		return db.Turno{}, err
	}
	// Pedido explícito del cliente (2026-08-23): no se puede crear un turno
	// nuevo en una fecha/hora que ya pasó.
	if horaInicio.Before(clock.Now()) {
		return db.Turno{}, errors.New("no se puede agendar un turno en una fecha pasada")
	}

	return db.Turno{
		ClinicID:          profesionalID,
		AtendidoPorUserID: &atiendeUserID,
		Estado:            "agendado",
		TipoConsultaID:    &tipoConsultaID,
		HoraInicio:        &horaInicio,
		HoraFin:           &horaFin,
		NombreContacto:    nombre,
		ApellidoContacto:  apellido,
		DNIContacto:       dni,
		TelefonoContacto:  telefono,
		EmailContacto:     strings.TrimSpace(email),
		Motivo:            strings.TrimSpace(motivo),
	}, nil
}

// parseRangoHorario valida el horario de un turno — spec §4.3: hora de
// inicio obligatoria y fin posterior al inicio, siempre (el exclusion
// constraint de la base es la garantía final, T2.5, pero un fin anterior
// al inicio ni siquiera debería llegar a intentarse contra la DB).
func parseRangoHorario(horaInicioRaw, horaFinRaw string) (time.Time, time.Time, error) {
	horaInicio, err := time.Parse(time.RFC3339, horaInicioRaw)
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("la hora de inicio no es válida")
	}
	horaFin, err := time.Parse(time.RFC3339, horaFinRaw)
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("la hora de fin no es válida")
	}
	if !horaFin.After(horaInicio) {
		return time.Time{}, time.Time{}, errors.New("la hora de fin debe ser posterior a la de inicio")
	}
	return horaInicio, horaFin, nil
}

// errPacienteNoEncontrado — sentinel para el camino "paciente conocido":
// el pacienteId que llegó en la request no existe o no es del profesional
// autenticado (nunca vincular un turno a un paciente de otro profesional).
var errPacienteNoEncontrado = errors.New("paciente no encontrado")

// crearTurnoAgendadoConPaciente persiste turno (nuevo o existente,
// actualizado) junto con su Paciente — nuevo, creado a partir de los datos
// de contacto (camino "paciente nuevo"), o uno ya existente que solo se
// vincula (camino "paciente conocido", `pacienteExistenteID` no nil, spec
// §4.3 ampliado 2026-08-23: no duplicar la ficha de alguien ya atendido).
// Todo en una transacción: si el exclusion constraint (T2.5) rechaza el
// horario, no debe quedar un Paciente húerfano sin turno.
func crearTurnoAgendadoConPaciente(gdb *gorm.DB, profesionalID uuid.UUID, turno *db.Turno, pacienteExistenteID *uuid.UUID) error {
	return gdb.Transaction(func(tx *gorm.DB) error {
		if pacienteExistenteID != nil {
			var paciente db.Paciente
			if err := tx.Where("id = ? AND clinic_id = ?", *pacienteExistenteID, profesionalID).First(&paciente).Error; err != nil {
				return errPacienteNoEncontrado
			}
			turno.PacienteID = &paciente.ID
		} else {
			paciente, err := crearOBuscarPacientePorDNI(tx, profesionalID, turno)
			if err != nil {
				return err
			}
			turno.PacienteID = &paciente.ID
		}

		// UN PACIENTE NO PUEDE ESTAR EN DOS SILLONES A LA VEZ (Fase 3.2.5,
		// 2026-09-15). El exclusion constraint protege al PROFESIONAL —no
		// le deja dos turnos encimados— y no dice nada del paciente: dos
		// agendas distintas pueden ofrecer el mismo horario, correctamente,
		// y la misma persona terminar citada en las dos.
		//
		// Va acá dentro, con el paciente ya resuelto y en la MISMA
		// transacción que el insert: chequear antes, afuera, dejaría la
		// ventana en la que el colega agenda entre el chequeo y el insert.
		if turno.PacienteID != nil && turno.HoraInicio != nil && turno.HoraFin != nil && turno.AtendidoPorUserID != nil {
			if choca, quien := turnoSuperpuestoDeOtroProfesional(
				tx, profesionalID, *turno.PacienteID, *turno.AtendidoPorUserID,
				*turno.HoraInicio, *turno.HoraFin, soloSiNoEsNil(turno.ID),
			); choca != nil {
				return &errPacienteOcupadoConOtro{
					Profesional: quien,
					Desde:       *choca.HoraInicio,
					Hasta:       *choca.HoraFin,
				}
			}
		}

		// UN TURNO ACTIVO POR PACIENTE Y TIPO DE CONSULTA, EN TODA LA
		// CLÍNICA (Fase 3.2.5, 2026-09-15, pedido del cliente). La regla
		// existía desde la Fase 3.1 pero solo en el wizard público: cargando
		// a mano no se aplicaba ninguna, y la misma persona podía terminar
		// con dos "Consulta general" pendientes —una por profesional, cada
		// uno sin ver la del otro— que es justo lo que el cliente reportó.
		//
		// Va después del solapamiento a propósito: si los dos turnos se
		// pisan en horario, eso es lo primero que hay que decir.
		if turno.PacienteID != nil && turno.TipoConsultaID != nil {
			if choca, quien, tipo := turnoActivoDelMismoTipoEnLaClinica(
				tx, profesionalID, *turno.PacienteID, *turno.TipoConsultaID, soloSiNoEsNil(turno.ID),
			); choca != nil {
				e := &errPacienteYaTieneEseTipo{Tipo: tipo, Profesional: quien}
				if choca.HoraInicio != nil {
					e.Desde = *choca.HoraInicio
				}
				if choca.AtendidoPorUserID != nil && *choca.AtendidoPorUserID == *turno.AtendidoPorUserID {
					e.Profesional = "vos"
				}
				return e
			}
		}

		if turno.ID == uuid.Nil {
			return tx.Create(turno).Error
		}
		return tx.Save(turno).Error
	})
}

// soloSiNoEsNil — al reprogramar, el turno que se mueve no se cuenta
// contra sí mismo. En un alta el id todavía es cero y no hay nada que
// excluir.
func soloSiNoEsNil(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

// errPacienteOcupadoConOtro — el paciente ya tiene un turno encimado con
// otro profesional de la clínica.
//
// Lleva CON QUIÉN y A QUÉ HORA porque el mensaje es la mitad del valor:
// "ya tiene un turno" obliga a salir a buscarlo a mano; "tiene turno con
// Lucía Ferrer a las 10:00" se resuelve sin salir de la pantalla.
type errPacienteOcupadoConOtro struct {
	Profesional string
	Desde       time.Time
	// Hasta — la hora de cierre, sumada el 2026-09-15 a pedido del
	// cliente. Con solo la hora de inicio, quien carga sabe que choca pero
	// no cuándo se libera la persona, y la agenda del colega no la puede
	// ver: para elegir otro horario tenía que ir probando.
	Hasta time.Time
}

func (e *errPacienteOcupadoConOtro) Error() string {
	return "este paciente ya tiene un turno con " + e.Profesional +
		" de " + clock.In(e.Desde).Format("15:04") + " a " + clock.In(e.Hasta).Format("15:04") +
		" del " + clock.In(e.Desde).Format("02/01") +
		". Una persona no puede estar en dos turnos a la vez."
}

// errPacienteYaTieneEseTipo — el paciente ya tiene un turno activo de ese
// mismo tipo de consulta, con quien sea de la clínica.
//
// Nombra el tipo, el profesional y la fecha por el mismo motivo que el de
// arriba: el turno que choca puede ser de un colega, y su agenda no se ve
// desde acá. "Vos" cuando es de quien está cargando — decirle su propio
// nombre en tercera persona lo mandaría a buscar a otro lado.
type errPacienteYaTieneEseTipo struct {
	Tipo        string
	Profesional string
	Desde       time.Time
}

func (e *errPacienteYaTieneEseTipo) Error() string {
	msg := "este paciente ya tiene un turno activo de \"" + e.Tipo + "\" con " + e.Profesional
	if !e.Desde.IsZero() {
		msg += " el " + clock.In(e.Desde).Format("02/01") + " a las " + clock.In(e.Desde).Format("15:04")
	}
	return msg + ". Cancelá ese turno antes de cargar otro del mismo tipo."
}

// crearOBuscarPacientePorDNI — Extra 2.3.5 (E5.1): "cualquier camino de
// alta" que llega con datos de contacto sueltos (nunca un
// pacienteExistenteID explícito, ese caso ya está resuelto arriba) busca
// primero si ya existe un Paciente con ese DNI para el mismo profesional
// antes de crear uno nuevo — evita fichas duplicadas de la misma persona
// (ej. pide un turno dos veces desde la página pública con el mismo DNI).
//
// Corrección de bug reportado por el cliente: "si genero un turno,
// modificando el nombre apellido o algunos de estos datos, el turno se me
// va a generar con ese nuevo nombre o datos cambiados, pero asignado al
// paciente con el dni puesto... sin importar lo que pongan en el
// formulario, si el DNI ya existe dentro de pacientes, los datos que
// mostrará en el calendario son los datos del paciente que hay en el
// sistema y no los del formulario". Cuando el DNI ya existe, ESTA función
// pisa el snapshot de contacto del `turno` (Nombre/Apellido/Telefono/
// Email) con los datos REALES del paciente encontrado, sin importar qué
// haya llegado tipeado — así el turno nunca puede terminar mostrando un
// nombre distinto al de la ficha a la que en verdad está vinculado (cierra
// el hueco de "generar un turno con datos ajenos" usando el DNI de otra
// persona, en cualquiera de los dos caminos que llegan acá: "Agregar
// turno > paciente nuevo" en el panel, y el formulario público). Los datos
// reales de un paciente solo se corrigen a propósito desde "Editar
// paciente", nunca de rebote al agendar. El índice único (clinic_id,
// dni) de RunMigrations es la red de seguridad final contra una carrera
// entre dos requests concurrentes con el mismo DNI — isUniqueViolation la
// traduce a un error legible más abajo.
func crearOBuscarPacientePorDNI(tx *gorm.DB, profesionalID uuid.UUID, turno *db.Turno) (db.Paciente, error) {
	// `en_conflicto = false` (Fase 2.4.1) — nunca reusar/sincronizar contra
	// una ficha temporaria de un conflicto de pacientes todavía sin
	// resolver (db.Paciente.EnConflicto) — ese no es "el" paciente real
	// para este DNI hasta que el profesional lo resuelva desde
	// /panel/pacientes.
	var existente db.Paciente
	err := tx.Where("clinic_id = ? AND dni = ? AND en_conflicto = false", profesionalID, turno.DNIContacto).First(&existente).Error
	if err == nil {
		// emailTipado/telefonoTipado — ronda de correcciones (2026-09-06):
		// capturados ANTES de sincronizar (que pisa turno.EmailContacto/
		// TelefonoContacto con los de la ficha, si ya tiene) — mismo
		// criterio que crearPacientePublicoConDeteccionDeConflicto.
		emailTipado := turno.EmailContacto
		telefonoTipado := turno.TelefonoContacto
		sincronizarContactoConPaciente(turno, existente)
		if turno.EsParaOtro {
			if err := agregarEmailAlternativoSiNuevo(tx, &existente, emailTipado); err != nil {
				return db.Paciente{}, err
			}
			if err := agregarTelefonoAlternativoSiNuevo(tx, &existente, telefonoTipado); err != nil {
				return db.Paciente{}, err
			}
			if turno.TutorEmail != nil {
				if err := agregarTelefonoDeTutorSiNuevo(tx, existente.ID, *turno.TutorEmail, derefStr(turno.TutorTelefono)); err != nil {
					return db.Paciente{}, err
				}
			}
		}
		return existente, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return db.Paciente{}, err
	}

	paciente := db.Paciente{
		ClinicID: profesionalID,
		Nombre:   turno.NombreContacto,
		Apellido: turno.ApellidoContacto,
		DNI:      turno.DNIContacto,
		// Origen "manual" (corrección de QA, Fase 2.4.1) — esta función
		// solo la usa el panel del profesional ("Agregar turno" con
		// paciente nuevo) — a diferencia del formulario público
		// (crearFichaPacientePublico), acá el profesional ya tiene a la
		// persona en frente, así que la ficha queda VERIFICADA de
		// entrada (ver pacienteEstaVerificado).
		Origen: "manual",
	}
	// Telefono/Email — Fase 2.4.2: vacío pasa a nil, no puntero a string
	// vacío — "para otro" deja el teléfono propio del paciente opcional
	// (mismo criterio que crearFichaPacientePublico).
	if turno.TelefonoContacto != "" {
		paciente.Telefono = &turno.TelefonoContacto
	}
	if turno.EmailContacto != "" {
		paciente.Email = &turno.EmailContacto
	}
	if err := tx.Create(&paciente).Error; err != nil {
		if isUniqueViolation(err) {
			// Carrera real: otra request creó el mismo DNI entre el SELECT
			// de arriba y este INSERT. Se busca una última vez en vez de
			// fallar — el resultado para quien llamó es el mismo "hay un
			// paciente con este DNI, se usa ese" que si lo hubiéramos
			// encontrado desde el principio.
			var ganador db.Paciente
			if err2 := tx.Where("clinic_id = ? AND dni = ?", profesionalID, turno.DNIContacto).First(&ganador).Error; err2 == nil {
				sincronizarContactoConPaciente(turno, ganador)
				return ganador, nil
			}
		}
		return db.Paciente{}, err
	}
	// PacienteTutor — Fase 2.4.2, ronda de correcciones (2026-09-06): la
	// ficha nace con el primero de posiblemente varios tutores a lo largo
	// del tiempo (ver PacienteTutor en models.go) — se inserta como fila
	// aparte, ya no como campos directos en `Paciente`.
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

// derefStr — atajo para volcar un *string potencialmente nil a los campos
// NOT NULL de PacienteTutor (turno.Tutor* siempre viene completo cuando
// EsParaOtro, este helper solo evita el deref manual repetido).
func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// sincronizarContactoConPaciente pisa el snapshot de contacto (datos del
// PACIENTE) de un turno con los datos reales de un Paciente ya existente —
// ver el comentario grande de crearOBuscarPacientePorDNI arriba.
//
// Tutor* / EsParaOtro del turno — Fase 2.4.2, ronda de correcciones
// (2026-09-06): esta función YA NO los toca. Los dos call sites que sí
// necesitan `EsParaOtro`/`Tutor*` en el turno (crearOBuscarPacientePorDNI,
// acá abajo, y crearPacientePublicoConDeteccionDeConflicto, camino
// "responde") reciben esos datos siempre COMPLETOS y frescos en la propia
// request (el wizard/panel pide el tutor de nuevo en cada pedido, incluso
// reservando para un paciente ya conocido) — pisarlos con lo guardado ya
// no tiene sentido ahora que un paciente puede tener MÁS de un tutor (ver
// PacienteTutor en models.go): "cuál de los N tutores conocidos" dejó de
// ser una pregunta con una única respuesta posible. El único camino que
// SÍ necesita completar Tutor*/EsParaOtro a partir de una ficha ya
// verificada — sin volver a pedir esos datos — es "ya he venido antes"
// (turno_publico.go, usaPacienteVerificado), resuelto aparte con
// sincronizarTutorDesdeFichaVerificada.
func sincronizarContactoConPaciente(turno *db.Turno, paciente db.Paciente) {
	turno.NombreContacto = paciente.Nombre
	turno.ApellidoContacto = paciente.Apellido
	if paciente.Telefono != nil {
		turno.TelefonoContacto = *paciente.Telefono
	}
	if paciente.Email != nil {
		turno.EmailContacto = *paciente.Email
	}
}

// writeTurnoAgendadoError traduce los errores de crearTurnoAgendadoConPaciente
// (y de reprogramarTurnoHandler, que comparte el mismo tipo de error de
// solapamiento) a respuestas HTTP — T2.5: el solapamiento de horario
// (exclusion constraint de Postgres) tiene que ser un error de validación
// legible en el modal, nunca un 500 crudo.
func writeTurnoAgendadoError(w http.ResponseWriter, err error) {
	// 409 y no 400: el cuerpo del pedido está bien, lo que está ocupado es
	// la persona. Mismo criterio que el solapamiento del propio
	// profesional.
	var ocupado *errPacienteOcupadoConOtro
	if errors.As(err, &ocupado) {
		writeError(w, http.StatusConflict, ocupado.Error())
		return
	}
	var repetido *errPacienteYaTieneEseTipo
	if errors.As(err, &repetido) {
		writeError(w, http.StatusConflict, repetido.Error())
		return
	}
	if errors.Is(err, errPacienteNoEncontrado) {
		writeError(w, http.StatusBadRequest, "el paciente elegido no existe")
		return
	}
	if isExclusionViolation(err) {
		writeError(w, http.StatusConflict, "ese horario se superpone con otro turno ya agendado")
		return
	}
	writeError(w, http.StatusInternalServerError, "no se pudo agendar el turno")
}

// isExclusionViolation detecta el código de error de Postgres para una
// violación de exclusion constraint (23P01) — sin_solapamiento_turno
// (internal/db/migrate.go).
func isExclusionViolation(err error) bool {
	return strings.Contains(err.Error(), "23P01") || strings.Contains(err.Error(), "exclusion")
}

// resumenListLimit acota las 3 listas del dashboard (turnos próximos,
// resueltos, horarios reservados) — es un preview, no un listado
// completo; la lista entera sigue disponible en Turnos/Configuración de
// calendario vía el link de cabecera de cada tarjeta.
const resumenListLimit = 20

type resumenTurnoItem struct {
	ID string `json:"id"`
	// PacienteID — la ficha de la persona (QA de la 3.2.6, 2026-09-21).
	// En la tarjeta "Turnos de hoy", el horario lleva al turno en el
	// calendario y el NOMBRE lleva a la ficha: son dos preguntas
	// distintas —"¿qué pasa a esta hora?" y "¿quién es esta persona?"— y
	// hasta acá las dos llevaban al mismo lado.
	PacienteID string `json:"pacienteId,omitempty"`
	Fecha      string `json:"fecha"`   // YYYY-MM-DD, Córdoba
	Hora       string `json:"hora"`    // HH:MM, Córdoba
	HoraFin    string `json:"horaFin"` // HH:MM, Córdoba — corrección de QA: "agregar de que hora a que hora porque solo dice la hora de inicio"
	Nombre     string `json:"nombre"`
	// Asistencia (corrección de QA — rediseño de "Turnos resueltos" del
	// dashboard, ver el comentario grande en resumenPanelHandler más
	// abajo): "asistio" | "ausente" | omitido — el resto de las tarjetas
	// no lo necesitan (nunca hay uno marcado en "Turnos de hoy"/"Turnos
	// próximos", son siempre turnos vigentes), así que toResumenTurnoItems
	// lo deja vacío para esas y solo lo completa para turnosResueltos.
	Asistencia string `json:"asistencia,omitempty"`
	// AsistenciaPreliminar — lo anotado por adelantado y todavía
	// reversible. La tarjeta lo usa para pintar el contorno del botón
	// elegido; el turno sigue pendiente o en proceso.
	AsistenciaPreliminar string `json:"asistenciaPreliminar,omitempty"`
	// Profesional / ProfesionalID — quién atiende (Fase 3.2.6). Viajan
	// SOLO en la vista general de recepción, que es la única donde los
	// turnos son de varias personas: en la vista de un profesional todos
	// son suyos y repetir su nombre en cada fila sería ruido.
	//
	// El ID además del nombre porque tocar una fila desde la vista
	// general no solo navega: primero se para en la agenda de ese
	// profesional, así el módulo al que llega muestra lo que la fila
	// prometía (QA de la 3.2.6: "el flujo deberá ser coherente con la
	// vista").
	Profesional   string `json:"profesional,omitempty"`
	ProfesionalID string `json:"profesionalId,omitempty"`
	// Los INSTANTES, además de "15:04" (2026-09-19). La tarjeta "Turnos
	// de hoy" ahora dice si cada turno está PENDIENTE o EN PROCESO, y
	// abre los botones de asistencia 5 minutos antes de que empiece: las
	// tres cosas se resuelven comparando contra el reloj mientras la
	// pantalla está abierta, y para eso hace falta un instante y no un
	// texto de hora local que el navegador tendría que reinterpretar en
	// su propia zona horaria.
	//
	// El estado se deriva del reloj, no de una columna: un turno "en
	// proceso" lo es porque son las 10:20 y va de 10:15 a 10:45, no
	// porque alguien lo haya marcado. Guardarlo obligaría a un trabajo
	// periódico que cambie filas solo, y a que la pantalla igual no se
	// enterara hasta el próximo sondeo.
	HoraInicioISO string `json:"horaInicioIso,omitempty"`
	HoraFinISO    string `json:"horaFinIso,omitempty"`
}

type resumenHorarioReservadoItem struct {
	ID        string  `json:"id"`
	Fecha     string  `json:"fecha"` // fecha real (específico) o próxima ocurrencia (general) — siempre una fecha concreta para poder linkear a una semana real del calendario
	HoraDesde string  `json:"horaDesde"`
	HoraHasta string  `json:"horaHasta"`
	Motivo    *string `json:"motivo"`
	// EtiquetaGeneral (corrección de QA, 2026-09-08): para un horario
	// reservado GENERAL, reemplaza en el dashboard el día corto de la
	// PRÓXIMA ocurrencia (ej. "MIÉ 2") — que sugiere una fecha puntual —
	// por un texto que deja en claro que se repite ("Todos los miércoles
	// de octubre"). nil para un horario ESPECÍFICO (una fecha real, sin
	// nada que aclarar) — el frontend cae al día corto de siempre en ese
	// caso. Ver etiquetaHorarioGeneral más abajo para el texto exacto
	// según el Alcance.
	EtiquetaGeneral *string `json:"etiquetaGeneral"`
	// De quién es esta agenda (Fase 3.2.6), solo en la vista general.
	Profesional   string `json:"profesional,omitempty"`
	ProfesionalID string `json:"profesionalId,omitempty"`
}

// resumenPanelResponse — F2.3 extra, ítem 1 (rediseño del "Turnero"):
// reemplaza los 2 contadores viejos (pendientes/confirmados) por los
// datos de las 5 tarjetas nuevas. "Turnos pendientes" ya no existe ni como
// concepto (TR-104 sacó el estado `pendiente` del todo, Extra 2.3.3).
type resumenPanelResponse struct {
	TurnosHoy          []resumenTurnoItem            `json:"turnosHoy"`
	TurnosProximos     []resumenTurnoItem            `json:"turnosProximos"`
	HorariosReservados []resumenHorarioReservadoItem `json:"horariosReservados"`
	TotalConfirmados   int64                         `json:"totalConfirmados"`
	TurnosResueltos    []resumenTurnoItem            `json:"turnosResueltos"`
	// TurnosAsistidos/TurnosAusentes (F2.3 extra ítem 1, corrección de QA
	// 2026-09-06 — nueva tarjeta "Estadística" al lado de "Turnos
	// confirmados") — total histórico marcado, sin acotar por fecha (a
	// diferencia de las listas de arriba, que son un preview acotado):
	// "estadística" es un acumulado, no un pendiente por revisar.
	TurnosAsistidos int64 `json:"turnosAsistidos"`
	TurnosAusentes  int64 `json:"turnosAusentes"`
}

// resumenPanelHandler — GET /panel/resumen (T2.2, dashboard General; F2.3
// extra ítem 1 lo reescribe de punta a punta). "Confirmados" sigue
// contando solo los turnos `agendado` que todavía no pasaron (pedido
// explícito del cliente, 2026-08-23) — mismo criterio que antes, ahora
// bajo el nombre `totalConfirmados`.
func resumenPanelHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		hoy := clock.Today()
		mañana := hoy.Add(24 * time.Hour)
		pasadoMañana := mañana.Add(24 * time.Hour)
		ahora := clock.Now()

		// Corrección de QA: "turnos de hoy no muestra turnos resueltos" —
		// un turno de hoy cuya hora de fin ya pasó vive en la tarjeta
		// "Turnos resueltos", no acá (mismo criterio que separa esas dos
		// pestañas en /panel/turnos).
		var turnosHoyDB []db.Turno
		// TODO el resumen es de LO PROPIO (corrección del 2026-09-14).
		// "General" es la primera pantalla del panel, y hasta acá cada
		// tarjeta —turnos de hoy, próximos, resueltos, asistidos,
		// ausentes, horarios reservados— contaba lo de toda la clínica.
		// Un profesional entraba y veía como suyo el día de su colega.
		//
		// Un turno ya marcado SIGUE ACÁ hasta que termine (corrección del
		// 2026-09-19, pedido del cliente: "si se marca asistencia en
		// este, el turno no debe pasar automáticamente a resuelto, solo
		// guardará el estado de que asistió").
		//
		// Marcar por adelantado no adelanta el turno: la persona sigue
		// sentada en la sala y el turno sigue siendo de las 10:15. Lo
		// único que se guardó es qué va a decir cuando termine. La
		// tarjeta muestra "Asistido"/"No asistió" en la columna de
		// asistencia y el estado sigue saliendo del reloj; recién cuando
		// pasa la hora de fin el turno sale de acá y aparece, con esa
		// misma marca, en "Turnos resueltos hoy".
		if err := gdb.Scopes(soloMisTurnos(r)).Where(
			"clinic_id = ? AND estado = ? AND hora_inicio >= ? AND hora_inicio < ? AND (hora_fin IS NULL OR hora_fin >= ?)",
			profesionalID, "agendado", hoy, mañana, ahora,
		).
			Order("hora_inicio").
			Find(&turnosHoyDB).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}

		// "Turnos próximos" — corrección de QA, 2026-09-08: acotado a
		// MAÑANA nomás (antes traía cualquier turno futuro sin techo) —
		// "hoy" ya tiene su propia tarjeta, esta muestra el día siguiente
		// concreto, no una lista larga de semanas hacia adelante.
		var turnosProximosDB []db.Turno
		if err := gdb.Scopes(soloMisTurnos(r)).Where(
			"clinic_id = ? AND estado = ? AND hora_inicio >= ? AND hora_inicio < ?",
			profesionalID, "agendado", mañana, pasadoMañana,
		).
			Order("hora_inicio").
			Limit(resumenListLimit).
			Find(&turnosProximosDB).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}

		var totalConfirmados int64
		if err := gdb.Model(&db.Turno{}).Scopes(soloMisTurnos(r)).
			Where("clinic_id = ? AND estado = ? AND (hora_fin IS NULL OR hora_fin >= ?)", profesionalID, "agendado", ahora).
			Count(&totalConfirmados).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}

		// Corrección de QA (rediseño del cartel de asistencia en tiempo
		// real, `AsistenciaCartelGlobal` — la marca ya no espera a que el
		// profesional entre a ninguna pantalla en particular, dispara
		// SOLA apenas se cumple la hora de fin): esta tarjeta deja de ser
		// una bandeja de "todavía falta marcar" (ese pendiente, con el
		// cartel siempre encima bloqueando hasta que se resuelva, ya no
		// tiene sentido como concepto — nunca debería acumularse) y pasa
		// a ser un reporte de HOY: los turnos que YA se marcaron
		// (asistio/ausente), en el mismo formato que "Turnos de hoy"
		// (hora, nombre) más el resultado.
		//
		// `hora_fin < ahora` (2026-09-19): "resuelto" es un turno que YA
		// TERMINÓ, no uno que ya tiene marca. Desde que la asistencia se
		// puede marcar por adelantado, las dos cosas dejaron de ser lo
		// mismo — sin esta condición, un turno marcado a las 10:10 para
		// las 10:15 aparecía en esta tarjeta y en "Turnos de hoy" a la
		// vez. Las dos listas son complementarias: la de arriba pide
		// `hora_fin >= ahora`, esta pide lo contrario.
		//
		// LOS BORRADORES QUE YA VENCIERON, PRIMERO (QA de la 3.2.6,
		// 2026-09-20). Lo anotado por adelantado desde la tarjeta "Turnos
		// de hoy" se vuelve definitivo cuando el turno cruza su hora de
		// fin, y hasta ahora eso lo disparaba SOLO el sondeo del cartel
		// global. Ese cartel dejó de montarse para recepción, así que sin
		// esto la marca que recepción anotó se quedaba en borrador hasta
		// que el profesional abriera la app — y la tarjeta de resueltos
		// diría "asistencia pendiente" sobre un turno que alguien ya
		// resolvió.
		//
		// Escribir desde un GET es el mismo patrón que ya usan
		// /turnos/pendientes-asistencia y /equipo/presencia: el dato tiene
		// que estar al día para responder, y no hay proceso de fondo.
		var borradoresVencidos []db.Turno
		if err := gdb.Scopes(soloMisTurnos(r)).Where(
			"clinic_id = ? AND estado = 'agendado' AND hora_fin < ? AND asistencia IS NULL AND asistencia_preliminar IS NOT NULL",
			profesionalID, ahora,
		).Find(&borradoresVencidos).Error; err == nil && len(borradoresVencidos) > 0 {
			aplicarLosBorradoresQueVencieron(gdb, borradoresVencidos, profesionalID)
		}

		// SIN `asistencia IS NOT NULL` (QA de la 3.2.6, 2026-09-20). Un
		// turno que terminó y al que nadie le marcó nada desaparecía de
		// las DOS tarjetas: de "Turnos de hoy" porque ya pasó su hora de
		// fin, y de esta porque no tenía marca. Quedaba solo en el cartel
		// global, que es justamente lo que el cliente pidió sacarle a
		// recepción.
		//
		// El pedido: *"el turno, si no se marca asistencia o ausencia
		// desde la tarjeta de turnos de hoy, pasará a la tarjeta de turnos
		// resueltos pero en asistencia pendiente hasta que el profesional
		// marque"*. Resuelto es un hecho del reloj; la asistencia es un
		// acto de alguien, y puede no haber ocurrido todavía.
		var turnosResueltosDB []db.Turno
		if err := gdb.Scopes(soloMisTurnos(r)).Where(
			"clinic_id = ? AND estado = ? AND hora_inicio >= ? AND hora_inicio < ? AND hora_fin < ?",
			profesionalID, "agendado", hoy, mañana, ahora,
		).
			Order("hora_inicio").
			Limit(resumenListLimit).
			Find(&turnosResueltosDB).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}

		// Horarios reservados vigentes: específicos que no pasaron todavía
		// (a nivel de día calendario, sin precisión de hora — es un preview
		// del dashboard, no la fuente de verdad de disponibilidad) y
		// generales cuya ventana (fecha_hasta) no venció.
		var bloqueos []db.BloqueoHorario
		// Los horarios reservados van por soloMiAgenda, no por
		// soloMisTurnos: son otra tabla y otro dueño.
		if err := gdb.Scopes(soloMiAgenda(r)).Where(
			"clinic_id = ? AND ((especifico = true AND fecha >= ?) OR (especifico = false AND (fecha_hasta IS NULL OR fecha_hasta >= ?)))",
			profesionalID, hoy, hoy,
		).Find(&bloqueos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}

		// Tarjeta "Estadística" (F2.3 extra ítem 1, corrección de QA): total
		// histórico de turnos marcados asistió/ausente, sin acotar por
		// fecha — a diferencia de las listas de arriba, acá interesa el
		// acumulado completo, no un pendiente por revisar.
		var turnosAsistidos, turnosAusentes int64
		if err := gdb.Model(&db.Turno{}).Scopes(soloMisTurnos(r)).
			Where("clinic_id = ? AND estado = ? AND asistencia = ?", profesionalID, "agendado", "asistio").
			Count(&turnosAsistidos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}
		if err := gdb.Model(&db.Turno{}).Scopes(soloMisTurnos(r)).
			Where("clinic_id = ? AND estado = ? AND asistencia = ?", profesionalID, "agendado", "ausente").
			Count(&turnosAusentes).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}

		// Los nombres de quién atiende, SOLO en la vista general de
		// recepción (Fase 3.2.6): es la única donde los turnos son de
		// varias personas y una lista que no lo diga no sirve para
		// atender un teléfono. En la vista de un profesional el mapa
		// queda vacío y no se consulta nada de más.
		nombres := map[uuid.UUID]string{}
		if veTodaLaClinica(r) {
			nombres = nombresDeQuienesAtienden(gdb, turnosHoyDB, turnosProximosDB, turnosResueltosDB)
			// Los dueños de los horarios reservados salen de otra tabla,
			// así que se suman aparte al mismo mapa.
			for _, b := range bloqueos {
				if b.UserID != nil {
					if _, ya := nombres[*b.UserID]; !ya {
						nombres[*b.UserID] = nombreDelProfesional(gdb, b.UserID)
					}
				}
			}
		}

		writeJSON(w, http.StatusOK, resumenPanelResponse{
			TurnosHoy:          toResumenTurnoItems(turnosHoyDB, nombres),
			TurnosProximos:     toResumenTurnoItems(turnosProximosDB, nombres),
			HorariosReservados: toResumenHorarioItems(bloqueos, hoy, nombres),
			TotalConfirmados:   totalConfirmados,
			TurnosResueltos:    toResumenTurnoItems(turnosResueltosDB, nombres),
			TurnosAsistidos:    turnosAsistidos,
			TurnosAusentes:     turnosAusentes,
		})
	}
}

// toResumenTurnoItems — `nombres` viene vacío salvo en la vista general
// de recepción (ver resumenPanelHandler).
func toResumenTurnoItems(turnos []db.Turno, nombres map[uuid.UUID]string) []resumenTurnoItem {
	out := make([]resumenTurnoItem, len(turnos))
	for i, t := range turnos {
		var fecha, hora, horaFin string
		if t.HoraInicio != nil {
			local := clock.In(*t.HoraInicio)
			fecha = local.Format("2006-01-02")
			hora = local.Format("15:04")
		}
		if t.HoraFin != nil {
			horaFin = clock.In(*t.HoraFin).Format("15:04")
		}
		var asistencia string
		if t.Asistencia != nil {
			asistencia = *t.Asistencia
		}
		var preliminar string
		if t.AsistenciaPreliminar != nil {
			preliminar = *t.AsistenciaPreliminar
		}
		var inicioISO, finISO string
		if t.HoraInicio != nil {
			inicioISO = t.HoraInicio.Format(time.RFC3339)
		}
		if t.HoraFin != nil {
			finISO = t.HoraFin.Format(time.RFC3339)
		}
		var profesional, profesionalID string
		if t.AtendidoPorUserID != nil {
			profesional = nombres[*t.AtendidoPorUserID]
			if profesional != "" {
				profesionalID = t.AtendidoPorUserID.String()
			}
		}
		var pacienteID string
		if t.PacienteID != nil {
			pacienteID = t.PacienteID.String()
		}
		out[i] = resumenTurnoItem{
			ID:                   t.ID.String(),
			PacienteID:           pacienteID,
			Profesional:          profesional,
			ProfesionalID:        profesionalID,
			Fecha:                fecha,
			Hora:                 hora,
			HoraFin:              horaFin,
			Nombre:               strings.TrimSpace(t.NombreContacto + " " + t.ApellidoContacto),
			Asistencia:           asistencia,
			AsistenciaPreliminar: preliminar,
			HoraInicioISO:        inicioISO,
			HoraFinISO:           finISO,
		}
	}
	return out
}

// nombresDeQuienesAtienden — un lote, no una consulta por turno. Mismo
// criterio que completarProfesionalDeTurnos, con el que comparte la
// fuente: el perfil si lo cargó, el mail si todavía no.
func nombresDeQuienesAtienden(gdb *gorm.DB, lotes ...[]db.Turno) map[uuid.UUID]string {
	vistos := map[uuid.UUID]bool{}
	ids := make([]uuid.UUID, 0)
	for _, lote := range lotes {
		for _, t := range lote {
			if t.AtendidoPorUserID != nil && !vistos[*t.AtendidoPorUserID] {
				vistos[*t.AtendidoPorUserID] = true
				ids = append(ids, *t.AtendidoPorUserID)
			}
		}
	}
	nombres := make(map[uuid.UUID]string, len(ids))
	if len(ids) == 0 {
		return nombres
	}
	var perfiles []db.ProfessionalProfile
	_ = gdb.Where("user_id IN ?", ids).Find(&perfiles).Error
	for _, p := range perfiles {
		nombres[p.UserID] = strings.TrimSpace(p.Nombre + " " + p.Apellido)
	}
	var users []db.User
	_ = gdb.Where("id IN ?", ids).Find(&users).Error
	for _, u := range users {
		if nombres[u.ID] == "" {
			nombres[u.ID] = u.Email
		}
	}
	return nombres
}

// toResumenHorarioItems arma las filas de la tarjeta "Horarios
// reservados" y las ordena por fecha — una regla GENERAL no tiene una
// única fecha en la base (se repite por día de semana), así que se le
// calcula la próxima ocurrencia desde hoy: sin eso, la tarjeta no tendría
// a qué semana real del calendario llevar al tocarla.
func toResumenHorarioItems(
	bloqueos []db.BloqueoHorario, hoy time.Time, nombres map[uuid.UUID]string,
) []resumenHorarioReservadoItem {
	items := make([]resumenHorarioReservadoItem, 0, len(bloqueos))
	for _, b := range bloqueos {
		var fecha time.Time
		switch {
		case b.Especifico && b.Fecha != nil:
			fecha = *b.Fecha
		case !b.Especifico && b.DiaSemana != nil:
			fecha = proximaFechaDeDiaSemana(hoy, *b.DiaSemana)
		default:
			continue // dato inconsistente (chk_bloqueo_horario_forma ya lo evita) — se salta por las dudas
		}
		var profesional, profesionalID string
		if b.UserID != nil {
			profesional = nombres[*b.UserID]
			if profesional != "" {
				profesionalID = b.UserID.String()
			}
		}
		items = append(items, resumenHorarioReservadoItem{
			ID:              b.ID.String(),
			Profesional:     profesional,
			ProfesionalID:   profesionalID,
			Fecha:           fecha.Format("2006-01-02"),
			HoraDesde:       b.HoraDesde,
			HoraHasta:       b.HoraHasta,
			Motivo:          b.Motivo,
			EtiquetaGeneral: etiquetaHorarioGeneral(b, hoy),
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Fecha < items[j].Fecha })
	if len(items) > resumenListLimit {
		items = items[:resumenListLimit]
	}
	return items
}

// proximaFechaDeDiaSemana — próxima fecha, hoy inclusive, que cae en
// diaSemana (0=domingo…6=sábado, mismo criterio que time.Weekday).
func proximaFechaDeDiaSemana(hoy time.Time, diaSemana int) time.Time {
	delta := (diaSemana - int(hoy.Weekday()) + 7) % 7
	return hoy.AddDate(0, 0, delta)
}

// diasSemanaCorto — misma abreviatura de 3 letras que ya usa el frontend
// para el día corto de las etiquetas de fecha puntual (formatDiaCorto,
// calendar-utils.ts, ej. "MIÉ 2") — pedido textual del cliente: "TODOS
// LOS MIE", no el nombre completo del día (más largo, no entra tan bien
// en una etiqueta chica).
var diasSemanaCorto = [7]string{"dom", "lun", "mar", "mié", "jue", "vie", "sáb"}
var nombresMes = [12]string{
	"enero", "febrero", "marzo", "abril", "mayo", "junio",
	"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
}

// formatFechaLargaEs — "8 de septiembre de 2026", hora Córdoba (mismo
// criterio de timezone que el resto del archivo — clock.In, nunca la
// hora cruda del timestamp). Usado en el mail de "turno confirmado"
// (turno_publico.go) — Go no localiza nombres de mes por su cuenta,
// reusa el mismo array que etiquetaHorarioGeneral más abajo.
func formatFechaLargaEs(t time.Time) string {
	local := clock.In(t)
	return fmt.Sprintf("%d de %s de %d", local.Day(), nombresMes[int(local.Month())-1], local.Year())
}

// etiquetaHorarioGeneral — corrección de QA, 2026-09-08: un horario
// reservado GENERAL se repite todas las semanas por DiaSemana, así que
// mostrar en el dashboard solo la fecha de su PRÓXIMA ocurrencia (ej.
// "MIÉ 2") sugiere una fecha puntual, cuando en realidad se repite. Este
// texto reemplaza esa etiqueta, con el alcance exacto que ya configura el
// profesional (mismo campo `Alcance` que usa Configuración de calendario):
//   - "mes" (Este mes): "Todos los miércoles" a secas — el mes actual se
//     da por sobreentendido.
//   - "proximo_mes" (Próximo mes): "Todos los miércoles de octubre", con
//     el nombre real del mes que sigue (calculado con startOfMonth antes
//     de sumar un mes — sumarle un mes directo a `hoy` desborda mal en
//     los días 29/30/31 si el mes siguiente es más corto, ver
//     bloqueos_horario.go).
//   - "todos" (Este año — antes "Todos los meses" en Configuración de
//     calendario, renombrado en esta misma corrección: la regla en
//     realidad no se guarda "para siempre" en la práctica, el profesional
//     la revisa/renueva año a año): "Todos los miércoles de este año".
//   - "semana"/"proxima_semana": nil — esas ya son "de una sola vez", la
//     fecha puntual que ya se calcula (la próxima ocurrencia) no es
//     engañosa en ese caso.
func etiquetaHorarioGeneral(b db.BloqueoHorario, hoy time.Time) *string {
	if b.Especifico || b.DiaSemana == nil || b.Alcance == nil {
		return nil
	}
	dia := diasSemanaCorto[*b.DiaSemana]

	var texto string
	switch *b.Alcance {
	case db.BloqueoAlcanceMes:
		texto = fmt.Sprintf("Todos los %s", dia)
	case db.BloqueoAlcanceProximoMes:
		proximoMes := startOfMonth(hoy).AddDate(0, 1, 0)
		texto = fmt.Sprintf("Todos los %s de %s", dia, nombresMes[int(proximoMes.Month())-1])
	case db.BloqueoAlcanceTodos:
		texto = fmt.Sprintf("Todos los %s de este año", dia)
	default:
		return nil
	}
	return &texto
}

// profesionalIDFromRequest resuelve el ID de clínica del caller — helper
// compartido por todos los handlers de este archivo (y por
// pagina_publica.go), todos requieren auth y siempre operan sobre la
// clínica del caller. El nombre quedó igual que antes de
// docs/Login/feature-sumarte-login.md (cuando "profesional" y "clínica" eran la
// misma fila) a propósito: así estos handlers, y los de pacientes.go/
// tipos_consulta.go/pagina_publica.go, no cambiaron una sola línea de
// lógica de negocio con la reescritura — solo cambió de dónde sale el ID
// (antes: claims de un JWT; ahora: el middleware requireClinic ya lo
// resolvió y lo dejó en el contexto).
func profesionalIDFromRequest(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	clinicID, ok := r.Context().Value(clinicIDContextKey).(uuid.UUID)
	if !ok {
		writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
		return uuid.Nil, false
	}
	return clinicID, true
}
