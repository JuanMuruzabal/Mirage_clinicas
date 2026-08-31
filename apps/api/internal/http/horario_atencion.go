package http

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// horaRegex valida "HH:MM" en 24hs — mismo formato que <input type="time">
// del frontend. Usado también por bloqueos_horario.go (F2.3.3).
var horaRegex = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

// Default cuando la clínica todavía no guardó ningún horario general
// propio (F2.3.2) — mismo valor que el default histórico de la columna
// (antes en el modelo GORM; ahora las columnas son nullable, así que este
// fallback vive solo acá).
const (
	horarioAtencionDefaultDesde = "08:00"
	horarioAtencionDefaultHasta = "18:00"
)

// registerHorarioAtencionRoutes monta las rutas de horario de atención
// (F2.3.2, rediseño 2026-09-01 — corrección de QA: "puede que un
// profesional tenga horarios de atención variable"). El horario GENERAL
// (el de siempre, sin fecha de vigencia) se administra con GET/PUT, igual
// que antes; las excepciones TEMPORALES (esta semana/este mes/un rango a
// mano) son un CRUD aparte, mismo patrón que /bloqueos.
func registerHorarioAtencionRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/horario-atencion", listHorarioAtencionHandler(gdb))
	r.Put("/horario-atencion", putHorarioAtencionGeneralHandler(gdb))
	r.Post("/horario-atencion", crearHorarioAtencionHandler(gdb))
	r.Patch("/horario-atencion/{id}", editarHorarioAtencionHandler(gdb))
	r.Delete("/horario-atencion/{id}", eliminarHorarioAtencionHandler(gdb))
}

type horarioAtencionResponse struct {
	ID         string  `json:"id"`
	Alcance    string  `json:"alcance"`
	FechaDesde *string `json:"fechaDesde,omitempty"`
	FechaHasta *string `json:"fechaHasta,omitempty"`
	HoraDesde  *string `json:"horaDesde,omitempty"`
	HoraHasta  *string `json:"horaHasta,omitempty"`
}

func toHorarioAtencionResponse(h db.HorarioAtencion) horarioAtencionResponse {
	return horarioAtencionResponse{
		ID:         h.ID.String(),
		Alcance:    h.Alcance,
		FechaDesde: formatFechaPtr(h.FechaDesde),
		FechaHasta: formatFechaPtr(h.FechaHasta),
		HoraDesde:  h.HoraDesde,
		HoraHasta:  h.HoraHasta,
	}
}

// listHorarioAtencionHandler — GET /horario-atencion: TODAS las filas
// vigentes de la clínica, la general primero (corrección de QA, para que
// la UI la muestre siempre arriba sin tener que ordenar del lado del
// cliente). Si la clínica nunca guardó una general propia, se sintetiza
// una virtual con el default (id vacío) — mismo criterio "sin escribir
// nada en la base todavía" que la versión anterior de este endpoint.
func listHorarioAtencionHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var horarios []db.HorarioAtencion
		if err := gdb.Where("clinic_id = ?", clinicID).Order("created_at").Find(&horarios).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el horario de atención")
			return
		}

		var general *horarioAtencionResponse
		overrides := make([]horarioAtencionResponse, 0, len(horarios))
		for _, h := range horarios {
			resp := toHorarioAtencionResponse(h)
			if h.Alcance == db.HorarioAtencionAlcanceGeneral {
				general = &resp
				continue
			}
			overrides = append(overrides, resp)
		}
		if general == nil {
			d, hh := horarioAtencionDefaultDesde, horarioAtencionDefaultHasta
			general = &horarioAtencionResponse{Alcance: db.HorarioAtencionAlcanceGeneral, HoraDesde: &d, HoraHasta: &hh}
		}

		out := append([]horarioAtencionResponse{*general}, overrides...)
		writeJSON(w, http.StatusOK, out)
	}
}

type putHorarioAtencionGeneralRequest struct {
	HoraDesde string `json:"horaDesde"`
	HoraHasta string `json:"horaHasta"`
}

// putHorarioAtencionGeneralHandler — PUT /horario-atencion: upsert de la
// fila "general" (la única sin vigencia acotada) — nunca "no trabaja",
// siempre necesita un horario concreto (para eso están las excepciones
// temporales del CRUD de abajo).
func putHorarioAtencionGeneralHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var req putHorarioAtencionGeneralRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.HoraDesde = strings.TrimSpace(req.HoraDesde)
		req.HoraHasta = strings.TrimSpace(req.HoraHasta)
		if !horaRegex.MatchString(req.HoraDesde) || !horaRegex.MatchString(req.HoraHasta) {
			writeError(w, http.StatusBadRequest, "el horario debe tener el formato HH:MM")
			return
		}
		if req.HoraHasta <= req.HoraDesde {
			writeError(w, http.StatusBadRequest, "la hora de fin debe ser posterior a la de inicio")
			return
		}

		var existente db.HorarioAtencion
		err := gdb.Where("clinic_id = ? AND alcance = ?", clinicID, db.HorarioAtencionAlcanceGeneral).First(&existente).Error
		if err == nil {
			existente.HoraDesde, existente.HoraHasta = &req.HoraDesde, &req.HoraHasta
			if err := gdb.Save(&existente).Error; err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo guardar el horario de atención")
				return
			}
			writeJSON(w, http.StatusOK, toHorarioAtencionResponse(existente))
			return
		}

		nuevo := db.HorarioAtencion{
			ClinicID:  clinicID,
			Alcance:   db.HorarioAtencionAlcanceGeneral,
			HoraDesde: &req.HoraDesde,
			HoraHasta: &req.HoraHasta,
		}
		if err := gdb.Create(&nuevo).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo guardar el horario de atención")
			return
		}
		writeJSON(w, http.StatusCreated, toHorarioAtencionResponse(nuevo))
	}
}

type crearHorarioAtencionRequest struct {
	Alcance    string `json:"alcance"`
	FechaDesde string `json:"fechaDesde"`
	FechaHasta string `json:"fechaHasta"`
	HoraDesde  string `json:"horaDesde"`
	HoraHasta  string `json:"horaHasta"`
	// NoTrabaja (corrección de QA, 2026-09-01): "si hay un día que no
	// trabaja el profesional" — explícito en vez de inferir de horas
	// vacías, para que un typo en las horas nunca se confunda con
	// "cerrado a propósito".
	NoTrabaja bool `json:"noTrabaja"`
}

// parsearHorarioAtencionRequest valida el cuerpo de POST/PATCH
// /horario-atencion (excepciones temporales, nunca la general — esa va
// por PUT) y arma los campos de un db.HorarioAtencion listos para
// Create/Save. Devuelve un mensaje de error si algo no es válido (nunca
// un 500 por datos mal formados).
func parsearHorarioAtencionRequest(req *crearHorarioAtencionRequest) (db.HorarioAtencion, string) {
	req.Alcance = strings.TrimSpace(req.Alcance)
	req.FechaDesde = strings.TrimSpace(req.FechaDesde)
	req.FechaHasta = strings.TrimSpace(req.FechaHasta)
	req.HoraDesde = strings.TrimSpace(req.HoraDesde)
	req.HoraHasta = strings.TrimSpace(req.HoraHasta)

	if req.Alcance == db.HorarioAtencionAlcanceGeneral {
		return db.HorarioAtencion{}, "el horario general se guarda con PUT /horario-atencion, no acá"
	}

	horario := db.HorarioAtencion{}
	switch req.Alcance {
	case db.HorarioAtencionAlcanceSemana:
		desde := startOfWeek(clock.Today())
		hasta := desde.AddDate(0, 0, 6)
		horario.FechaDesde, horario.FechaHasta = &desde, &hasta
	case db.HorarioAtencionAlcanceMes:
		desde := startOfMonth(clock.Today())
		hasta := endOfMonth(desde)
		horario.FechaDesde, horario.FechaHasta = &desde, &hasta
	case db.HorarioAtencionAlcanceRango:
		desde, err := clock.ParseDate(req.FechaDesde)
		if err != nil {
			return db.HorarioAtencion{}, "la fecha desde debe tener el formato YYYY-MM-DD"
		}
		hasta, err := clock.ParseDate(req.FechaHasta)
		if err != nil {
			return db.HorarioAtencion{}, "la fecha hasta debe tener el formato YYYY-MM-DD"
		}
		if hasta.Before(desde) {
			return db.HorarioAtencion{}, "la fecha hasta debe ser igual o posterior a la fecha desde"
		}
		horario.FechaDesde, horario.FechaHasta = &desde, &hasta
	default:
		return db.HorarioAtencion{}, "el alcance debe ser 'semana', 'mes' o 'rango'"
	}
	horario.Alcance = req.Alcance

	if req.NoTrabaja {
		if req.HoraDesde != "" || req.HoraHasta != "" {
			return db.HorarioAtencion{}, "un período sin horario (no trabaja) no lleva horas"
		}
		return horario, ""
	}

	if !horaRegex.MatchString(req.HoraDesde) || !horaRegex.MatchString(req.HoraHasta) {
		return db.HorarioAtencion{}, "el horario debe tener el formato HH:MM"
	}
	if req.HoraHasta <= req.HoraDesde {
		return db.HorarioAtencion{}, "la hora de fin debe ser posterior a la de inicio"
	}
	horario.HoraDesde, horario.HoraHasta = &req.HoraDesde, &req.HoraHasta
	return horario, ""
}

// crearHorarioAtencionHandler — POST /horario-atencion: una EXCEPCIÓN
// temporal (esta semana/este mes/un rango a mano), nunca la general.
func crearHorarioAtencionHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var req crearHorarioAtencionRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}

		horario, errMsg := parsearHorarioAtencionRequest(&req)
		if errMsg != "" {
			writeError(w, http.StatusBadRequest, errMsg)
			return
		}
		horario.ClinicID = clinicID

		if err := gdb.Create(&horario).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo crear el horario de atención")
			return
		}

		writeJSON(w, http.StatusCreated, toHorarioAtencionResponse(horario))
	}
}

// editarHorarioAtencionHandler — PATCH /horario-atencion/{id}: solo
// excepciones temporales (la fila "general" se edita con PUT).
func editarHorarioAtencionHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id inválido")
			return
		}

		var existente db.HorarioAtencion
		if err := gdb.Where("id = ? AND clinic_id = ?", id, clinicID).First(&existente).Error; err != nil {
			writeError(w, http.StatusNotFound, "horario de atención no encontrado")
			return
		}
		if existente.Alcance == db.HorarioAtencionAlcanceGeneral {
			writeError(w, http.StatusBadRequest, "el horario general se edita con PUT /horario-atencion")
			return
		}

		var req crearHorarioAtencionRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		nuevo, errMsg := parsearHorarioAtencionRequest(&req)
		if errMsg != "" {
			writeError(w, http.StatusBadRequest, errMsg)
			return
		}

		existente.Alcance = nuevo.Alcance
		existente.FechaDesde = nuevo.FechaDesde
		existente.FechaHasta = nuevo.FechaHasta
		existente.HoraDesde = nuevo.HoraDesde
		existente.HoraHasta = nuevo.HoraHasta

		if err := gdb.Save(&existente).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar el horario de atención")
			return
		}
		writeJSON(w, http.StatusOK, toHorarioAtencionResponse(existente))
	}
}

// eliminarHorarioAtencionHandler — DELETE /horario-atencion/{id}: solo
// excepciones temporales, la general no se puede borrar (siempre tiene
// que quedar un horario base).
func eliminarHorarioAtencionHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id inválido")
			return
		}

		var existente db.HorarioAtencion
		if err := gdb.Where("id = ? AND clinic_id = ?", id, clinicID).First(&existente).Error; err != nil {
			writeError(w, http.StatusNotFound, "horario de atención no encontrado")
			return
		}
		if existente.Alcance == db.HorarioAtencionAlcanceGeneral {
			writeError(w, http.StatusBadRequest, "el horario general no se puede eliminar, solo editar")
			return
		}

		if err := gdb.Delete(&existente).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo eliminar el horario de atención")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
