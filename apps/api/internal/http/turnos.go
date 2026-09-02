package http

import (
	"errors"
	"fmt"
	"net/http"
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
// token, nunca a un profesional_id que venga del body/query.
func registerTurnoRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/turnos", listTurnosHandler(gdb))
	r.Post("/turnos", crearTurnoManualHandler(gdb))
	r.Patch("/turnos/{id}/agendar", agendarTurnoHandler(gdb))
	r.Patch("/turnos/{id}/cancelar", cancelarTurnoHandler(gdb))
	r.Patch("/turnos/{id}/hora", reprogramarTurnoHandler(gdb))
	r.Post("/turnos/autoreservar", autoreservarTurnosHandler(gdb))
	r.Patch("/turnos/{id}/asistencia", marcarAsistenciaHandler(gdb))
	r.Patch("/turnos/{id}", editarTurnoHandler(gdb))
	r.Get("/panel/resumen", resumenPanelHandler(gdb))
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
	// Asistencia (pedido explícito del cliente, 2026-09-04): nil hasta que
	// se marca desde un turno ya resuelto (ver marcarAsistenciaHandler).
	Asistencia *string `json:"asistencia,omitempty"`
	// Autoreservado (2026-09-08): true si este turno se movió con el botón
	// "Autoreservar turnos" del modal de conflicto — el frontend lo pinta
	// con rayas en el calendario y lo avisa en TurnoDetalle.
	Autoreservado bool `json:"autoreservado"`
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
	out.Autoreservado = t.Autoreservado
	return out
}

// listTurnosHandler — GET /turnos?estado=&desde=&hasta=&q=&resuelto=.
// `estado` filtra por columna exacta (pendiente/agendado/cancelada);
// `desde`/`hasta` (RFC3339) filtran por hora_inicio — lo que usa el
// calendario (T2.3) para pedir solo el rango visible. `q` (T3.3) busca por
// nombre/apellido/DNI/email de contacto, igual que el buscador de la vista
// Turnos. `resuelto` (true/false, pedido explícito del cliente,
// 2026-08-23) filtra turnos `agendado` cuya hora de fin ya pasó (pestaña
// "Resueltos" de la vista Turnos) — solo tiene efecto si además se manda
// `estado=agendado`; nunca cambia el significado de `estado=agendado` por
// sí solo, así el calendario (que pide `estado=agendado` sin este
// parámetro, para pintar pasados en gris y futuros normal) sigue trayendo
// ambos. Sin filtros, devuelve todos los turnos del profesional (usado por
// T2.2 para calcular el resumen si hiciera falta, y por el modal T2.4 para
// listar pendientes con estado=pendiente).
func listTurnosHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		query := gdb.Where("profesional_id = ?", profesionalID)
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
				return
			}
		}
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
				return
			}
			query = query.Where("hora_inicio >= ?", t)
		}
		if hasta := r.URL.Query().Get("hasta"); hasta != "" {
			t, err := time.Parse(time.RFC3339, hasta)
			if err != nil {
				writeError(w, http.StatusBadRequest, "el parámetro 'hasta' debe ser una fecha válida")
				return
			}
			query = query.Where("hora_inicio <= ?", t)
		}

		var turnos []db.Turno
		if err := query.Order("created_at").Find(&turnos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los turnos")
			return
		}

		out := make([]turnoResponse, len(turnos))
		for i, t := range turnos {
			out[i] = toTurnoResponse(t)
		}
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
	// PacienteID (opcional) — camino "paciente conocido" del modal: en vez
	// de crear un Paciente nuevo a partir de los datos de contacto, vincula
	// el turno a un paciente que ya existe (pedido explícito del cliente,
	// 2026-08-23, para no duplicar la ficha de alguien que ya fue atendido).
	// Los campos de contacto igual viajan en la request — el frontend los
	// precarga con los datos actuales del paciente elegido — y quedan
	// guardados como el snapshot de contacto de este turno puntual.
	PacienteID string `json:"pacienteId,omitempty"`
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
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}

		turno, err := buildTurnoAgendado(profesionalID, req.NombreContacto, req.ApellidoContacto, req.DNIContacto,
			req.TelefonoContacto, req.EmailContacto, req.Motivo, req.TipoConsultaID, req.HoraInicio, req.HoraFin)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		turno.Origen = "manual"

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

type agendarTurnoRequest struct {
	TipoConsultaID string `json:"tipoConsultaId"`
	HoraInicio     string `json:"horaInicio"`
	HoraFin        string `json:"horaFin"`
	// Motivo (opcional, pedido explícito del cliente 2026-08-23): el
	// profesional puede completar o corregir el motivo de consulta en este
	// mismo paso de confirmar el turno pendiente, no solo al crear uno
	// manual — el frontend siempre manda el valor vigente (el que trajo el
	// turno pendiente, editado o no), así que se pisa sin condicional, igual
	// que editarTurnoHandler.
	Motivo string `json:"motivo"`
}

// agendarTurnoHandler — PATCH /turnos/{id}/agendar: camino "desde turnos
// pendientes" del modal — el turno ya existe (llegó de la página pública),
// solo le falta tipo de consulta + horario para pasar a `agendado`.
func agendarTurnoHandler(gdb *gorm.DB) http.HandlerFunc {
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

		var req agendarTurnoRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}

		var turno db.Turno
		if err := gdb.Where("id = ? AND profesional_id = ?", turnoID, profesionalID).First(&turno).Error; err != nil {
			writeError(w, http.StatusNotFound, "turno no encontrado")
			return
		}
		if turno.Estado != "pendiente" {
			writeError(w, http.StatusConflict, "este turno ya fue agendado o cancelado")
			return
		}

		tipoConsultaID, err := uuid.Parse(req.TipoConsultaID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "el tipo de consulta no es válido")
			return
		}
		horaInicio, horaFin, err := parseRangoHorario(req.HoraInicio, req.HoraFin)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		// Pedido explícito del cliente (2026-08-23): no se puede confirmar un
		// turno pendiente con una fecha/hora que ya pasó.
		if horaInicio.Before(clock.Now()) {
			writeError(w, http.StatusBadRequest, "no se puede agendar un turno en una fecha pasada")
			return
		}

		turno.TipoConsultaID = &tipoConsultaID
		turno.HoraInicio = &horaInicio
		turno.HoraFin = &horaFin
		turno.Motivo = strings.TrimSpace(req.Motivo)
		turno.Estado = "agendado"

		if err := crearTurnoAgendadoConPaciente(gdb, profesionalID, &turno, nil); err != nil {
			writeTurnoAgendadoError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, toTurnoResponse(turno))
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
		if err := gdb.Where("id = ? AND profesional_id = ?", turnoID, profesionalID).First(&turno).Error; err != nil {
			writeError(w, http.StatusNotFound, "turno no encontrado")
			return
		}

		if turno.Estado != "cancelada" {
			if err := gdb.Model(&turno).Update("estado", "cancelada").Error; err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo cancelar el turno")
				return
			}
			turno.Estado = "cancelada"
		}

		writeJSON(w, http.StatusOK, toTurnoResponse(turno))
	}
}

type editarTurnoRequest struct {
	NombreContacto   string `json:"nombreContacto"`
	ApellidoContacto string `json:"apellidoContacto"`
	DNIContacto      string `json:"dniContacto"`
	TelefonoContacto string `json:"telefonoContacto"`
	EmailContacto    string `json:"emailContacto"`
	Motivo           string `json:"motivo"`
}

// editarTurnoHandler — PATCH /turnos/{id} (T3.3, acción "Editar" de un
// turno `pendiente`): corrige los datos de contacto. Ajuste pedido por el
// cliente (2026-08-23): una vez que el turno pasa a `agendado`, sus datos
// de contacto ya se usaron para crear el `paciente` — de ahí en más, lo
// único editable acá es el horario, vía /turnos/{id}/hora
// (reprogramarTurnoHandler), nunca el nombre/DNI/motivo desde este
// endpoint. Nunca el tipo de consulta tampoco, eso sigue siendo solo cosa
// de /agendar (T2.4), para no esquivar el exclusion constraint (T2.5).
func editarTurnoHandler(gdb *gorm.DB) http.HandlerFunc {
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
		if err := gdb.Where("id = ? AND profesional_id = ?", turnoID, profesionalID).First(&turno).Error; err != nil {
			writeError(w, http.StatusNotFound, "turno no encontrado")
			return
		}
		if turno.Estado != "pendiente" {
			writeError(w, http.StatusConflict, "un turno confirmado solo permite editar el horario, no los datos de contacto")
			return
		}

		var req editarTurnoRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.NombreContacto = strings.TrimSpace(req.NombreContacto)
		req.ApellidoContacto = strings.TrimSpace(req.ApellidoContacto)
		req.DNIContacto = strings.TrimSpace(req.DNIContacto)
		req.TelefonoContacto = strings.TrimSpace(req.TelefonoContacto)
		if req.NombreContacto == "" || req.ApellidoContacto == "" || req.DNIContacto == "" || req.TelefonoContacto == "" {
			writeError(w, http.StatusBadRequest, "nombre, apellido, DNI y teléfono son obligatorios")
			return
		}

		turno.NombreContacto = req.NombreContacto
		turno.ApellidoContacto = req.ApellidoContacto
		turno.DNIContacto = req.DNIContacto
		turno.TelefonoContacto = req.TelefonoContacto
		turno.EmailContacto = strings.TrimSpace(req.EmailContacto)
		turno.Motivo = strings.TrimSpace(req.Motivo)

		if err := gdb.Save(&turno).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo editar el turno")
			return
		}

		writeJSON(w, http.StatusOK, toTurnoResponse(turno))
	}
}

type reprogramarTurnoRequest struct {
	HoraInicio string `json:"horaInicio"`
	HoraFin    string `json:"horaFin"`
	// Motivo (opcional, pedido explícito del cliente 2026-08-23): un turno
	// confirmado solo permite cambiar horario y motivo por acá, nunca los
	// datos de contacto — el frontend siempre manda el valor vigente, así
	// que se pisa sin condicional, igual que editarTurnoHandler.
	Motivo string `json:"motivo"`
}

// reprogramarTurnoHandler — PATCH /turnos/{id}/hora: acción "Editar" de un
// turno ya `agendado` (ajuste pedido por el cliente, 2026-08-23) — a
// diferencia de editarTurnoHandler (turnos `pendiente`), acá solo se puede
// cambiar el horario y el motivo de consulta, nunca los datos de contacto.
// El cambio de horario pasa por el mismo exclusion constraint (T2.5) que
// agendar por primera vez: un solapamiento se traduce a 409, nunca un 500.
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
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		horaInicio, horaFin, err := parseRangoHorario(req.HoraInicio, req.HoraFin)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		var turno db.Turno
		if err := gdb.Where("id = ? AND profesional_id = ?", turnoID, profesionalID).First(&turno).Error; err != nil {
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
		if err := gdb.Save(&turno).Error; err != nil {
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
		if err := decodeJSON(r, &req); err != nil {
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

		var turnos []db.Turno
		if err := gdb.Where("id IN ? AND profesional_id = ?", ids, profesionalID).Find(&turnos).Error; err != nil {
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
				if err := tx.Where("id = ? AND profesional_id = ?", *t.TipoConsultaID, profesionalID).First(&tipo).Error; err != nil {
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
					slots, err := calcularDisponibilidad(tx, profesionalID, tipo, fechaCandidata, &t.ID)
					if err != nil {
						return err
					}
					if len(slots) == 0 {
						continue
					}
					nuevaHoraInicio = combinarFechaYHora(fechaCandidata, slots[0])
					nuevaHoraFin = nuevaHoraInicio.Add(time.Duration(tipo.DuracionMinutos) * time.Minute)
					encontrado = true
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
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.Asistencia = strings.TrimSpace(req.Asistencia)
		if req.Asistencia != "asistio" && req.Asistencia != "ausente" {
			writeError(w, http.StatusBadRequest, "asistencia debe ser 'asistio' o 'ausente'")
			return
		}

		var turno db.Turno
		if err := gdb.Where("id = ? AND profesional_id = ?", turnoID, profesionalID).First(&turno).Error; err != nil {
			writeError(w, http.StatusNotFound, "turno no encontrado")
			return
		}
		if turno.Estado != "agendado" || turno.HoraFin == nil || turno.HoraFin.After(clock.Now()) {
			writeError(w, http.StatusConflict, "solo se puede marcar asistencia en un turno ya resuelto")
			return
		}
		if turno.Asistencia != nil {
			writeError(w, http.StatusConflict, "la asistencia ya fue marcada y no se puede modificar")
			return
		}

		// UPDATE directo por columna (no gdb.Model(&turno).Update con un
		// *string): un valor por struct puede quedar ambiguo según cómo
		// GORM detecte "zero value" — acá el valor ya está validado arriba
		// (siempre "asistio" o "ausente"), así que un UPDATE explícito es
		// lo más simple y no deja dudas.
		if err := gdb.Exec("UPDATE turnos SET asistencia = ? WHERE id = ?", req.Asistencia, turno.ID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo guardar la asistencia")
			return
		}
		turno.Asistencia = &req.Asistencia

		writeJSON(w, http.StatusOK, toTurnoResponse(turno))
	}
}

// buildTurnoAgendado arma (sin tocar la base) un Turno ya validado a nivel
// de negocio, para el camino "paciente nuevo" de crearTurnoManualHandler.
func buildTurnoAgendado(profesionalID uuid.UUID, nombre, apellido, dni, telefono, email, motivo, tipoConsultaIDRaw, horaInicioRaw, horaFinRaw string) (db.Turno, error) {
	nombre = strings.TrimSpace(nombre)
	apellido = strings.TrimSpace(apellido)
	dni = strings.TrimSpace(dni)
	telefono = strings.TrimSpace(telefono)
	if nombre == "" || apellido == "" || dni == "" || telefono == "" {
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
		ProfesionalID:    profesionalID,
		Estado:           "agendado",
		TipoConsultaID:   &tipoConsultaID,
		HoraInicio:       &horaInicio,
		HoraFin:          &horaFin,
		NombreContacto:   nombre,
		ApellidoContacto: apellido,
		DNIContacto:      dni,
		TelefonoContacto: telefono,
		EmailContacto:    strings.TrimSpace(email),
		Motivo:           strings.TrimSpace(motivo),
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
			if err := tx.Where("id = ? AND profesional_id = ?", *pacienteExistenteID, profesionalID).First(&paciente).Error; err != nil {
				return errPacienteNoEncontrado
			}
			turno.PacienteID = &paciente.ID
		} else {
			paciente := db.Paciente{
				ProfesionalID: profesionalID,
				Nombre:        turno.NombreContacto,
				Apellido:      turno.ApellidoContacto,
				DNI:           turno.DNIContacto,
				Telefono:      turno.TelefonoContacto,
			}
			if turno.EmailContacto != "" {
				paciente.Email = &turno.EmailContacto
			}
			if err := tx.Create(&paciente).Error; err != nil {
				return err
			}
			turno.PacienteID = &paciente.ID
		}

		if turno.ID == uuid.Nil {
			return tx.Create(turno).Error
		}
		return tx.Save(turno).Error
	})
}

// writeTurnoAgendadoError traduce los errores de crearTurnoAgendadoConPaciente
// (y de reprogramarTurnoHandler, que comparte el mismo tipo de error de
// solapamiento) a respuestas HTTP — T2.5: el solapamiento de horario
// (exclusion constraint de Postgres) tiene que ser un error de validación
// legible en el modal, nunca un 500 crudo.
func writeTurnoAgendadoError(w http.ResponseWriter, err error) {
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
	ID      string `json:"id"`
	Fecha   string `json:"fecha"`   // YYYY-MM-DD, Córdoba
	Hora    string `json:"hora"`    // HH:MM, Córdoba
	HoraFin string `json:"horaFin"` // HH:MM, Córdoba — corrección de QA: "agregar de que hora a que hora porque solo dice la hora de inicio"
	Nombre  string `json:"nombre"`
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
}

// resumenPanelResponse — F2.3 extra, ítem 1 (rediseño del "Turnero"):
// reemplaza los 2 contadores viejos (pendientes/confirmados) por los
// datos de las 5 tarjetas nuevas. "Turnos pendientes" deja de tener
// tarjeta propia acá (el brief saca ese concepto del dashboard) — el
// estado `pendiente` en sí sigue existiendo en la base hasta el ítem
// F2.3 extra 2.3.3/2.3.5 (docs/implementation-plan.md §11.5), esto solo
// deja de contarlo en ESTE endpoint puntual.
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
		if err := gdb.Where(
			"profesional_id = ? AND estado = ? AND hora_inicio >= ? AND hora_inicio < ? AND (hora_fin IS NULL OR hora_fin >= ?)",
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
		if err := gdb.Where(
			"profesional_id = ? AND estado = ? AND hora_inicio >= ? AND hora_inicio < ?",
			profesionalID, "agendado", mañana, pasadoMañana,
		).
			Order("hora_inicio").
			Limit(resumenListLimit).
			Find(&turnosProximosDB).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}

		var totalConfirmados int64
		if err := gdb.Model(&db.Turno{}).
			Where("profesional_id = ? AND estado = ? AND (hora_fin IS NULL OR hora_fin >= ?)", profesionalID, "agendado", ahora).
			Count(&totalConfirmados).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}

		// Corrección de QA: "una vez marcado como asistido/ausente debe
		// dejar de aparecer en la tarjeta" — esta lista es una bandeja de
		// "todavía falta marcar", no un historial completo (ese sigue
		// siendo la pestaña "Resueltos" de /panel/turnos, sin este filtro).
		var turnosResueltosDB []db.Turno
		if err := gdb.Where(
			"profesional_id = ? AND estado = ? AND hora_fin < ? AND asistencia IS NULL",
			profesionalID, "agendado", ahora,
		).
			Order("hora_fin DESC").
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
		if err := gdb.Where(
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
		if err := gdb.Model(&db.Turno{}).
			Where("profesional_id = ? AND estado = ? AND asistencia = ?", profesionalID, "agendado", "asistio").
			Count(&turnosAsistidos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}
		if err := gdb.Model(&db.Turno{}).
			Where("profesional_id = ? AND estado = ? AND asistencia = ?", profesionalID, "agendado", "ausente").
			Count(&turnosAusentes).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}

		writeJSON(w, http.StatusOK, resumenPanelResponse{
			TurnosHoy:          toResumenTurnoItems(turnosHoyDB),
			TurnosProximos:     toResumenTurnoItems(turnosProximosDB),
			HorariosReservados: toResumenHorarioItems(bloqueos, hoy),
			TotalConfirmados:   totalConfirmados,
			TurnosResueltos:    toResumenTurnoItems(turnosResueltosDB),
			TurnosAsistidos:    turnosAsistidos,
			TurnosAusentes:     turnosAusentes,
		})
	}
}

func toResumenTurnoItems(turnos []db.Turno) []resumenTurnoItem {
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
		out[i] = resumenTurnoItem{
			ID:      t.ID.String(),
			Fecha:   fecha,
			Hora:    hora,
			HoraFin: horaFin,
			Nombre:  strings.TrimSpace(t.NombreContacto + " " + t.ApellidoContacto),
		}
	}
	return out
}

// toResumenHorarioItems arma las filas de la tarjeta "Horarios
// reservados" y las ordena por fecha — una regla GENERAL no tiene una
// única fecha en la base (se repite por día de semana), así que se le
// calcula la próxima ocurrencia desde hoy: sin eso, la tarjeta no tendría
// a qué semana real del calendario llevar al tocarla.
func toResumenHorarioItems(bloqueos []db.BloqueoHorario, hoy time.Time) []resumenHorarioReservadoItem {
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
		items = append(items, resumenHorarioReservadoItem{
			ID:              b.ID.String(),
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
// docs/feature-sumarte-login.md (cuando "profesional" y "clínica" eran la
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
