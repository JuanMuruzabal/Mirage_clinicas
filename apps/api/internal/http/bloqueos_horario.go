package http

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// registerBloqueoHorarioRoutes monta GET/POST/DELETE /bloqueos (F2.3.3,
// docs/implementation-plan.md §11.3) — reglas GENERALES y ESPECÍFICAS por
// el mismo recurso, distinguidas por el campo `especifico` (TR-084 en
// docs/tradeoffs.md). La resolución de conflictos (una específica gana
// sobre una general que se solape) no vive acá — se resuelve al calcular
// disponibilidad (F2.4.1), este CRUD solo guarda/borra reglas.
func registerBloqueoHorarioRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/bloqueos", listBloqueosHandler(gdb))
	r.Post("/bloqueos", crearBloqueoHandler(gdb))
	r.Patch("/bloqueos/{id}", editarBloqueoHandler(gdb))
	r.Delete("/bloqueos/{id}", eliminarBloqueoHandler(gdb))
}

type bloqueoHorarioResponse struct {
	ID         string  `json:"id"`
	Especifico bool    `json:"especifico"`
	Alcance    *string `json:"alcance,omitempty"`
	DiaSemana  *int    `json:"diaSemana,omitempty"`
	FechaDesde *string `json:"fechaDesde,omitempty"`
	FechaHasta *string `json:"fechaHasta,omitempty"`
	Fecha      *string `json:"fecha,omitempty"`
	HoraDesde  string  `json:"horaDesde"`
	HoraHasta  string  `json:"horaHasta"`
	TipoRegla  string  `json:"tipoRegla"`
	Motivo     *string `json:"motivo,omitempty"`
}

func formatFechaPtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format("2006-01-02")
	return &s
}

func toBloqueoHorarioResponse(b db.BloqueoHorario) bloqueoHorarioResponse {
	return bloqueoHorarioResponse{
		ID:         b.ID.String(),
		Especifico: b.Especifico,
		Alcance:    b.Alcance,
		DiaSemana:  b.DiaSemana,
		FechaDesde: formatFechaPtr(b.FechaDesde),
		FechaHasta: formatFechaPtr(b.FechaHasta),
		Fecha:      formatFechaPtr(b.Fecha),
		HoraDesde:  b.HoraDesde,
		HoraHasta:  b.HoraHasta,
		TipoRegla:  b.TipoRegla,
		Motivo:     b.Motivo,
	}
}

// listBloqueosHandler — GET /bloqueos, opcionalmente ?especifico=true|false
// para pedir solo una de las dos tablas de la UI de configuración
// (F2.3.5): reglas generales y reglas específicas por separado.
func listBloqueosHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		query := gdb.Where("clinic_id = ?", clinicID)
		if v := r.URL.Query().Get("especifico"); v != "" {
			especifico, err := strconv.ParseBool(v)
			if err != nil {
				writeError(w, http.StatusBadRequest, "el parámetro especifico debe ser true o false")
				return
			}
			query = query.Where("especifico = ?", especifico)
		}

		var bloqueos []db.BloqueoHorario
		if err := query.Order("created_at").Find(&bloqueos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los bloqueos horarios")
			return
		}

		out := make([]bloqueoHorarioResponse, len(bloqueos))
		for i, b := range bloqueos {
			out[i] = toBloqueoHorarioResponse(b)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

type crearBloqueoHorarioRequest struct {
	Especifico bool   `json:"especifico"`
	Alcance    string `json:"alcance"`
	DiaSemana  *int   `json:"diaSemana"`
	Fecha      string `json:"fecha"`
	HoraDesde  string `json:"horaDesde"`
	HoraHasta  string `json:"horaHasta"`
	TipoRegla  string `json:"tipoRegla"`
	// Motivo (corrección de QA, F2.3): descriptivo, opcional — "una
	// general puede ser limpieza semanal, una específica puede ser
	// reposición de inventario".
	Motivo string `json:"motivo"`
}

// startOfWeek/startOfMonth/endOfMonth resuelven el rango concreto de una
// regla general "esta semana"/"este mes" EN EL MOMENTO de crearla (TR-084:
// "de una sola vez", no recurrente) — misma convención de semana
// lunes-a-domingo que apps/web/src/lib/calendar-utils.ts (`startOfWeek`),
// replicada acá porque el frontend y el backend no comparten código JS/Go.
func startOfWeek(d time.Time) time.Time {
	dow := int(d.Weekday()) // 0 = domingo
	diff := 1 - dow
	if dow == 0 {
		diff = -6
	}
	return d.AddDate(0, 0, diff)
}

func startOfMonth(d time.Time) time.Time {
	return time.Date(d.Year(), d.Month(), 1, 0, 0, 0, 0, d.Location())
}

func endOfMonth(d time.Time) time.Time {
	return startOfMonth(d).AddDate(0, 1, -1)
}

// combinarFechaYHora arma el instante completo de una fecha (medianoche,
// ya en la zona horaria de Argentina — clock.ParseDate/clock.Today) más
// una hora de pared "HH:MM" ya validada por horaRegex — para comparar
// contra clock.Now() sin perder la parte de horario (ver el chequeo de
// "no reservar en el pasado" en parsearBloqueoRequest).
func combinarFechaYHora(fecha time.Time, hhmm string) time.Time {
	h, _ := strconv.Atoi(hhmm[0:2])
	m, _ := strconv.Atoi(hhmm[3:5])
	return time.Date(fecha.Year(), fecha.Month(), fecha.Day(), h, m, 0, 0, fecha.Location())
}

// parsearBloqueoRequest valida el cuerpo de POST/PATCH /bloqueos (mismas
// reglas para alta y edición, F2.3.3/F2.3.6) y arma los campos de un
// db.BloqueoHorario listos para Create/Save — ID/ClinicID/CreatedAt quedan
// afuera, los pone el caller. Devuelve un mensaje de error si algo no es
// válido (nunca un 500 por datos mal formados).
func parsearBloqueoRequest(req *crearBloqueoHorarioRequest) (db.BloqueoHorario, string) {
	req.HoraDesde = strings.TrimSpace(req.HoraDesde)
	req.HoraHasta = strings.TrimSpace(req.HoraHasta)
	req.Alcance = strings.TrimSpace(req.Alcance)
	req.Fecha = strings.TrimSpace(req.Fecha)
	req.TipoRegla = strings.TrimSpace(req.TipoRegla)
	req.Motivo = strings.TrimSpace(req.Motivo)

	if !horaRegex.MatchString(req.HoraDesde) || !horaRegex.MatchString(req.HoraHasta) {
		return db.BloqueoHorario{}, "el horario debe tener el formato HH:MM"
	}
	if req.HoraHasta <= req.HoraDesde {
		return db.BloqueoHorario{}, "la hora de fin debe ser posterior a la de inicio"
	}
	if req.TipoRegla == "" {
		req.TipoRegla = db.TipoReglaBloquearHorario
	}
	if req.TipoRegla != db.TipoReglaBloquearHorario {
		return db.BloqueoHorario{}, "tipo de regla no soportado"
	}

	bloqueo := db.BloqueoHorario{
		Especifico: req.Especifico,
		HoraDesde:  req.HoraDesde,
		HoraHasta:  req.HoraHasta,
		TipoRegla:  req.TipoRegla,
	}
	if req.Motivo != "" {
		bloqueo.Motivo = &req.Motivo
	}

	if req.Especifico {
		if req.Alcance != "" || req.DiaSemana != nil {
			return db.BloqueoHorario{}, "una regla específica no lleva alcance ni día de la semana"
		}
		fecha, err := clock.ParseDate(req.Fecha)
		if err != nil {
			return db.BloqueoHorario{}, "la fecha debe tener el formato YYYY-MM-DD"
		}
		// Pedido explícito del cliente (2026-09-04): "no puedo reservar un
		// horario atrás en el tiempo, cosa que se puede ahora" — mismo
		// criterio que turnos.go ("no se puede agendar/reprogramar en una
		// fecha pasada"), comparando el instante COMPLETO (fecha + hora de
		// fin), no solo la fecha calendario — así HOY con un horario que ya
		// terminó también se rechaza, no solo un día anterior. Las reglas
		// generales (alcance "semana"/"mes"/etc.) nunca necesitan este
		// chequeo: su fechaDesde/fechaHasta se calculan más abajo siempre
		// a partir de HOY (clock.Today()), nunca pueden nacer en el pasado.
		if combinarFechaYHora(fecha, req.HoraHasta).Before(clock.Now()) {
			return db.BloqueoHorario{}, "no se puede reservar un horario en una fecha u hora que ya pasó"
		}
		bloqueo.Fecha = &fecha
		return bloqueo, ""
	}

	if req.Fecha != "" {
		return db.BloqueoHorario{}, "una regla general no lleva una fecha específica"
	}
	if req.DiaSemana == nil || *req.DiaSemana < 0 || *req.DiaSemana > 6 {
		return db.BloqueoHorario{}, "el día de la semana debe estar entre 0 (domingo) y 6 (sábado)"
	}
	bloqueo.DiaSemana = req.DiaSemana

	switch req.Alcance {
	case db.BloqueoAlcanceTodos:
		// Sin fecha de fin — se repite indefinido, por DiaSemana solo.
	case db.BloqueoAlcanceSemana:
		desde := startOfWeek(clock.Today())
		hasta := desde.AddDate(0, 0, 6)
		bloqueo.FechaDesde = &desde
		bloqueo.FechaHasta = &hasta
	case db.BloqueoAlcanceProximaSemana:
		// La semana SIGUIENTE a la actual — mismo criterio "de una sola
		// vez" que "semana" (TR-084), ancla distinta (corrección de QA,
		// 2026-08-30).
		desde := startOfWeek(clock.Today()).AddDate(0, 0, 7)
		hasta := desde.AddDate(0, 0, 6)
		bloqueo.FechaDesde = &desde
		bloqueo.FechaHasta = &hasta
	case db.BloqueoAlcanceMes:
		desde := startOfMonth(clock.Today())
		hasta := endOfMonth(clock.Today())
		bloqueo.FechaDesde = &desde
		bloqueo.FechaHasta = &hasta
	case db.BloqueoAlcanceProximoMes:
		desde := startOfMonth(clock.Today()).AddDate(0, 1, 0)
		hasta := endOfMonth(desde)
		bloqueo.FechaDesde = &desde
		bloqueo.FechaHasta = &hasta
	default:
		return db.BloqueoHorario{}, "el alcance debe ser 'semana', 'proxima_semana', 'mes', 'proximo_mes' o 'todos'"
	}
	bloqueo.Alcance = &req.Alcance

	return bloqueo, ""
}

// crearBloqueoHandler — POST /bloqueos. El cuerpo esperado depende de
// `especifico`: una regla específica manda `fecha` (sin `alcance`/
// `diaSemana`); una regla general manda `diaSemana` + `alcance` (sin
// `fecha`) y acá se resuelve fechaDesde/fechaHasta según ese alcance.
func crearBloqueoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var req crearBloqueoHorarioRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}

		bloqueo, errMsg := parsearBloqueoRequest(&req)
		if errMsg != "" {
			writeError(w, http.StatusBadRequest, errMsg)
			return
		}
		bloqueo.ClinicID = clinicID

		if err := gdb.Create(&bloqueo).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo crear la regla")
			return
		}

		writeJSON(w, http.StatusCreated, toBloqueoHorarioResponse(bloqueo))
	}
}

// editarBloqueoHandler — PATCH /bloqueos/{id} (F2.3.6, corrección de QA:
// "agregar la edición para reglas globales y específicas") — mismo cuerpo
// y validación que POST, reemplaza todos los campos editables de la
// regla existente (mismo criterio de "PATCH de reemplazo completo" que
// editarTipoConsultaHandler en tipos_consulta.go).
func editarBloqueoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		bloqueoID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de regla inválido")
			return
		}

		var req crearBloqueoHorarioRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}

		nuevo, errMsg := parsearBloqueoRequest(&req)
		if errMsg != "" {
			writeError(w, http.StatusBadRequest, errMsg)
			return
		}

		var bloqueo db.BloqueoHorario
		if err := gdb.Where("id = ? AND clinic_id = ?", bloqueoID, clinicID).First(&bloqueo).Error; err != nil {
			writeError(w, http.StatusNotFound, "regla no encontrada")
			return
		}

		bloqueo.Especifico = nuevo.Especifico
		bloqueo.Alcance = nuevo.Alcance
		bloqueo.DiaSemana = nuevo.DiaSemana
		bloqueo.FechaDesde = nuevo.FechaDesde
		bloqueo.FechaHasta = nuevo.FechaHasta
		bloqueo.Fecha = nuevo.Fecha
		bloqueo.HoraDesde = nuevo.HoraDesde
		bloqueo.HoraHasta = nuevo.HoraHasta
		bloqueo.TipoRegla = nuevo.TipoRegla
		bloqueo.Motivo = nuevo.Motivo

		if err := gdb.Save(&bloqueo).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar la regla")
			return
		}

		writeJSON(w, http.StatusOK, toBloqueoHorarioResponse(bloqueo))
	}
}

func eliminarBloqueoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		bloqueoID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de regla inválido")
			return
		}

		result := gdb.Where("id = ? AND clinic_id = ?", bloqueoID, clinicID).Delete(&db.BloqueoHorario{})
		if result.Error != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo eliminar la regla")
			return
		}
		if result.RowsAffected == 0 {
			writeError(w, http.StatusNotFound, "regla no encontrada")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
