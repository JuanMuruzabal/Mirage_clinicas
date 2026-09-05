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
	"dental-mirage/api/internal/testdb"
)

// TestPanelNotificaciones_VacioSinNada — sin conflictos de ningún tipo,
// los dos contadores dan 0.
func TestPanelNotificaciones_VacioSinNada(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "notif1@example.com")

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/notificaciones", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusOK)
	}
	var got panelNotificacionesResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.ConflictosPacientes != 0 || got.ConflictosCalendario != 0 {
		t.Errorf("got = %+v, esperaba los dos en 0", got)
	}
}

// TestPanelNotificaciones_ContConflictoDePacientesPendiente — cuenta los
// ConflictoPaciente con Resuelto=false; uno ya resuelto no cuenta.
func TestPanelNotificaciones_ContConflictoDePacientesPendiente(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "notif2@example.com")

	_, pacienteVerificado := crearTurnoAgendadoConPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-2*time.Hour))
	hermana, turnoHermana := crearFichaEnConflictoConTurnoDePrueba(t, gdb, reg.Profesional.ID, pacienteVerificado.DNI, tipoConsultaID, time.Now().Add(2*time.Hour))
	pendiente := crearConflictoDePruebaEntre(t, gdb, hermana.ProfesionalID, pacienteVerificado, hermana, turnoHermana)

	hermana2, turnoHermana2 := crearFichaEnConflictoConTurnoDePrueba(t, gdb, reg.Profesional.ID, pacienteVerificado.DNI, tipoConsultaID, time.Now().Add(3*time.Hour))
	yaResuelto := crearConflictoDePruebaEntre(t, gdb, hermana2.ProfesionalID, pacienteVerificado, hermana2, turnoHermana2)
	if err := gdb.Model(&yaResuelto).Update("resuelto", true).Error; err != nil {
		t.Fatalf("no se pudo marcar el segundo conflicto como resuelto: %v", err)
	}
	_ = pendiente

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/notificaciones", reg.Token, nil)
	var got panelNotificacionesResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.ConflictosPacientes != 1 {
		t.Errorf("ConflictosPacientes = %d, esperaba 1 (uno pendiente, uno ya resuelto)", got.ConflictosPacientes)
	}
}

// crearBloqueoEspecificoDePrueba — bloqueo de horario para un día
// concreto, mismo patrón directo por GORM que TestResumenPanel_HorariosReservados.
func crearBloqueoEspecificoDePrueba(t *testing.T, gdb *gorm.DB, clinicID uuid.UUID, fecha time.Time, horaDesde, horaHasta string) db.BloqueoHorario {
	t.Helper()
	b := db.BloqueoHorario{
		ClinicID:   clinicID,
		Especifico: true,
		Fecha:      &fecha,
		HoraDesde:  horaDesde,
		HoraHasta:  horaHasta,
		TipoRegla:  "bloquear_horario",
	}
	if err := gdb.Create(&b).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo específico de prueba: %v", err)
	}
	return b
}

// TestPanelNotificaciones_ContTurnoVigenteQueChocaConBloqueoEspecifico —
// un turno vigente cuyo horario se superpone con un bloqueo específico
// vigente cuenta como conflicto de calendario.
func TestPanelNotificaciones_ContTurnoVigenteQueChocaConBloqueoEspecifico(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "notif3@example.com")
	clinicID, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}

	fecha := clock.Today().AddDate(0, 0, 2)
	crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, fecha.Add(8*time.Hour+30*time.Minute))
	crearBloqueoEspecificoDePrueba(t, gdb, clinicID, fecha, "08:00", "09:00")

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/notificaciones", reg.Token, nil)
	var got panelNotificacionesResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.ConflictosCalendario != 1 {
		t.Errorf("ConflictosCalendario = %d, esperaba 1", got.ConflictosCalendario)
	}
}

// TestPanelNotificaciones_NoCuentaSiNoHaySuperposicionDeHorario — un
// bloqueo el mismo día pero en un horario distinto no genera conflicto.
func TestPanelNotificaciones_NoCuentaSiNoHaySuperposicionDeHorario(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "notif4@example.com")
	clinicID, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}

	fecha := clock.Today().AddDate(0, 0, 2)
	crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, fecha.Add(8*time.Hour+30*time.Minute))
	crearBloqueoEspecificoDePrueba(t, gdb, clinicID, fecha, "14:00", "15:00")

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/notificaciones", reg.Token, nil)
	var got panelNotificacionesResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.ConflictosCalendario != 0 {
		t.Errorf("ConflictosCalendario = %d, esperaba 0 (horarios distintos)", got.ConflictosCalendario)
	}
}

// TestPanelNotificaciones_NoCuentaTurnoYaResuelto — TR-090: un conflicto
// cuyo turno ya pasó deja de contar como activo.
func TestPanelNotificaciones_NoCuentaTurnoYaResuelto(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "notif5@example.com")
	clinicID, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}

	crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-3*time.Hour))
	// Bloqueo específico de HOY que cubriría ese horario si el turno
	// siguiera vigente — pero ya pasó, así que no debería contar.
	crearBloqueoEspecificoDePrueba(t, gdb, clinicID, clock.Today(), "00:00", "23:59")

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/notificaciones", reg.Token, nil)
	var got panelNotificacionesResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.ConflictosCalendario != 0 {
		t.Errorf("ConflictosCalendario = %d, esperaba 0 (el turno ya está resuelto)", got.ConflictosCalendario)
	}
}
