package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// autoreservar_test.go — nueva función, pedido textual del cliente
// (2026-09-08): botón "Autoreservar turnos" del modal de conflicto.
// Reutiliza crearClinicaDePruebaDisponibilidad/crearTipoDePrueba de
// disponibilidad_test.go (mismo paquete de test).

func crearTurnoDePrueba(t *testing.T, gdb *gorm.DB, clinicID, tipoID uuid.UUID, horaInicio, horaFin time.Time, estado string) db.Turno {
	t.Helper()
	turno := db.Turno{
		ProfesionalID: clinicID, TipoConsultaID: &tipoID, Estado: estado,
		HoraInicio: &horaInicio, HoraFin: &horaFin,
		NombreContacto: "Paciente", ApellidoContacto: "De Prueba",
		DNIContacto: "1", TelefonoContacto: "1", EmailContacto: "paciente@example.com",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno de prueba: %v", err)
	}
	return turno
}

func TestAutoreservar_MueveAlProximoHuecoLibreAunqueSeaOtroDia(t *testing.T) {
	router, gdb, reg := crearClinicaDePruebaDisponibilidad(t, "auto1@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "09:00"})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)
	clinicID := uuid.MustParse(reg.Profesional.ID)
	tipoID := uuid.MustParse(tipo.ID)
	fecha, err := clock.ParseDate(fechaDePruebaDisponibilidad)
	if err != nil {
		t.Fatalf("ParseDate: %v", err)
	}

	inicio := combinarFechaYHora(fecha, "08:00")
	fin := combinarFechaYHora(fecha, "08:30")
	turno := crearTurnoDePrueba(t, gdb, clinicID, tipoID, inicio, fin, "agendado")

	// Bloqueo específico que cubre TODA la ventana de atención de ese día
	// (08:00-09:00) — sin ningún hueco libre ese día, el turno tiene que
	// rodar al día siguiente.
	motivo := "Reunión"
	bloqueo := db.BloqueoHorario{
		ClinicID: clinicID, Especifico: true, Fecha: &fecha,
		HoraDesde: "08:00", HoraHasta: "09:00", TipoRegla: "bloquear_horario", Motivo: &motivo,
	}
	if err := gdb.Create(&bloqueo).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo de prueba: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodPost, "/turnos/autoreservar", reg.Token, autoreservarTurnosRequest{TurnoIds: []string{turno.ID.String()}})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got autoreservarTurnosResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got.Resultados) != 1 {
		t.Fatalf("Resultados = %+v, esperaba 1", got.Resultados)
	}
	item := got.Resultados[0]
	if !item.Reprogramado {
		t.Fatalf("Reprogramado = false, esperaba true. item=%+v", item)
	}
	esperadoInicio := combinarFechaYHora(fecha.AddDate(0, 0, 1), "08:00").Format(time.RFC3339)
	if item.HoraInicioNueva == nil || *item.HoraInicioNueva != esperadoInicio {
		t.Errorf("HoraInicioNueva = %v, esperaba %q (día siguiente, mismo horario)", item.HoraInicioNueva, esperadoInicio)
	}

	var recargado db.Turno
	if err := gdb.First(&recargado, "id = ?", turno.ID).Error; err != nil {
		t.Fatalf("no se pudo recargar el turno: %v", err)
	}
	if !recargado.Autoreservado {
		t.Error("Autoreservado = false en la base, esperaba true")
	}
	if recargado.HoraInicio == nil || !recargado.HoraInicio.Equal(combinarFechaYHora(fecha.AddDate(0, 0, 1), "08:00")) {
		t.Errorf("HoraInicio en la base = %v, esperaba el día siguiente a las 08:00", recargado.HoraInicio)
	}
}

func TestAutoreservar_PrioridadPorHoraOriginalAscendente(t *testing.T) {
	router, gdb, reg := crearClinicaDePruebaDisponibilidad(t, "auto2@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "09:00"})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)
	clinicID := uuid.MustParse(reg.Profesional.ID)
	tipoID := uuid.MustParse(tipo.ID)
	fecha, _ := clock.ParseDate(fechaDePruebaDisponibilidad)

	turnoA := crearTurnoDePrueba(t, gdb, clinicID, tipoID, combinarFechaYHora(fecha, "08:00"), combinarFechaYHora(fecha, "08:30"), "agendado")
	turnoB := crearTurnoDePrueba(t, gdb, clinicID, tipoID, combinarFechaYHora(fecha, "08:30"), combinarFechaYHora(fecha, "09:00"), "agendado")

	motivo := "Reunión"
	bloqueo := db.BloqueoHorario{
		ClinicID: clinicID, Especifico: true, Fecha: &fecha,
		HoraDesde: "08:00", HoraHasta: "09:00", TipoRegla: "bloquear_horario", Motivo: &motivo,
	}
	if err := gdb.Create(&bloqueo).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo de prueba: %v", err)
	}

	// A propósito en orden INVERSO en el request (B primero) — el handler
	// tiene que reordenar por HoraInicio ORIGINAL, no confiar en el orden
	// de la lista que mandó el frontend.
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos/autoreservar", reg.Token, autoreservarTurnosRequest{
		TurnoIds: []string{turnoB.ID.String(), turnoA.ID.String()},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got autoreservarTurnosResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	porID := map[string]autoreservarResultadoItem{}
	for _, item := range got.Resultados {
		porID[item.TurnoID] = item
	}

	siguiente := fecha.AddDate(0, 0, 1)
	esperadoA := combinarFechaYHora(siguiente, "08:00").Format(time.RFC3339)
	esperadoB := combinarFechaYHora(siguiente, "08:30").Format(time.RFC3339)

	itemA, okA := porID[turnoA.ID.String()]
	itemB, okB := porID[turnoB.ID.String()]
	if !okA || !okB {
		t.Fatalf("faltan resultados: %+v", got.Resultados)
	}
	if itemA.HoraInicioNueva == nil || *itemA.HoraInicioNueva != esperadoA {
		t.Errorf("turno A (original 08:00, primera prioridad) = %v, esperaba %q", itemA.HoraInicioNueva, esperadoA)
	}
	if itemB.HoraInicioNueva == nil || *itemB.HoraInicioNueva != esperadoB {
		t.Errorf("turno B (original 08:30, segunda prioridad) = %v, esperaba %q (el hueco que dejó A libre en el día siguiente)", itemB.HoraInicioNueva, esperadoB)
	}
}

func TestAutoreservar_SinNingunHuecoLibreEnLaVentanaDeBusqueda(t *testing.T) {
	router, gdb, reg := crearClinicaDePruebaDisponibilidad(t, "auto3@example.com")
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)
	clinicID := uuid.MustParse(reg.Profesional.ID)
	tipoID := uuid.MustParse(tipo.ID)
	fecha, _ := clock.ParseDate(fechaDePruebaDisponibilidad)

	// Inserta directo en la base un horario general "no trabajo" (sin
	// pasar por PUT /horario-atencion, que no lo permite) — ningún día
	// tiene nada disponible, en ninguna ventana de búsqueda.
	general := db.HorarioAtencion{ClinicID: clinicID, Alcance: db.HorarioAtencionAlcanceGeneral}
	if err := gdb.Create(&general).Error; err != nil {
		t.Fatalf("no se pudo crear el horario de atención de prueba: %v", err)
	}

	inicio := combinarFechaYHora(fecha, "08:00")
	fin := combinarFechaYHora(fecha, "08:30")
	turno := crearTurnoDePrueba(t, gdb, clinicID, tipoID, inicio, fin, "agendado")

	rec := doJSONAuth(t, router, http.MethodPost, "/turnos/autoreservar", reg.Token, autoreservarTurnosRequest{TurnoIds: []string{turno.ID.String()}})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got autoreservarTurnosResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got.Resultados) != 1 || got.Resultados[0].Reprogramado {
		t.Fatalf("Resultados = %+v, esperaba 1 con Reprogramado=false", got.Resultados)
	}
	if got.Resultados[0].HoraInicioNueva != nil {
		t.Errorf("HoraInicioNueva = %v, esperaba nil", got.Resultados[0].HoraInicioNueva)
	}

	var recargado db.Turno
	if err := gdb.First(&recargado, "id = ?", turno.ID).Error; err != nil {
		t.Fatalf("no se pudo recargar el turno: %v", err)
	}
	if recargado.Autoreservado {
		t.Error("Autoreservado = true, esperaba que quedara sin tocar (no se encontró hueco)")
	}
	if !recargado.HoraInicio.Equal(inicio) {
		t.Errorf("HoraInicio en la base = %v, esperaba que quedara igual (%v)", recargado.HoraInicio, inicio)
	}
}

func TestAutoreservar_TurnoNoAgendadoRechaza(t *testing.T) {
	router, gdb, reg := crearClinicaDePruebaDisponibilidad(t, "auto4@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "18:00"})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)
	clinicID := uuid.MustParse(reg.Profesional.ID)
	tipoID := uuid.MustParse(tipo.ID)
	fecha, _ := clock.ParseDate(fechaDePruebaDisponibilidad)

	turno := crearTurnoDePrueba(t, gdb, clinicID, tipoID, combinarFechaYHora(fecha, "08:00"), combinarFechaYHora(fecha, "08:30"), "cancelada")

	rec := doJSONAuth(t, router, http.MethodPost, "/turnos/autoreservar", reg.Token, autoreservarTurnosRequest{TurnoIds: []string{turno.ID.String()}})
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}
}

func TestAutoreservar_TurnoInexistenteOAjenoDaNotFound(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "auto5@example.com")

	rec := doJSONAuth(t, router, http.MethodPost, "/turnos/autoreservar", reg.Token, autoreservarTurnosRequest{TurnoIds: []string{uuid.New().String()}})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

func TestAutoreservar_TurnoIdsVacioRechaza(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "auto6@example.com")

	rec := doJSONAuth(t, router, http.MethodPost, "/turnos/autoreservar", reg.Token, autoreservarTurnosRequest{TurnoIds: []string{}})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}
