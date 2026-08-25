package http

import (
	"errors"
	"net/http"
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

type resumenPanelResponse struct {
	TurnosPendientes  int64 `json:"turnosPendientes"`
	TurnosConfirmados int64 `json:"turnosConfirmados"`
}

// resumenPanelHandler — GET /panel/resumen (T2.2, dashboard General):
// conteo de turnos pendientes/confirmados para las dos tarjetas
// clickeables del dashboard. "Confirmados" cuenta solo los turnos
// `agendado` que todavía no pasaron (pedido explícito del cliente,
// 2026-08-23: la tarjeta pasa a leerse como "Turnos próximos") — un turno
// ya resuelto no es lo que un profesional espera ver como "lo que viene",
// mismo criterio que separa la pestaña "Resueltos" en la vista Turnos
// (GET /turnos?resuelto=).
func resumenPanelHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var pendientes, confirmados int64
		if err := gdb.Model(&db.Turno{}).Where("profesional_id = ? AND estado = ?", profesionalID, "pendiente").Count(&pendientes).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}
		if err := gdb.Model(&db.Turno{}).
			Where("profesional_id = ? AND estado = ? AND (hora_fin IS NULL OR hora_fin >= ?)", profesionalID, "agendado", clock.Now()).
			Count(&confirmados).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular el resumen")
			return
		}

		writeJSON(w, http.StatusOK, resumenPanelResponse{TurnosPendientes: pendientes, TurnosConfirmados: confirmados})
	}
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
