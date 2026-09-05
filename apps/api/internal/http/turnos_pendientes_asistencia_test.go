package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// TestTurnosPendientesAsistencia_VacioSinTurnos — sin turnos, la
// respuesta es una lista vacía y ningún próximo vencimiento.
func TestTurnosPendientesAsistencia_VacioSinTurnos(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pendientes1@example.com")

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos/pendientes-asistencia", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusOK)
	}
	var got turnosPendientesAsistenciaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got.Vencidos) != 0 {
		t.Errorf("Vencidos = %+v, esperaba vacío", got.Vencidos)
	}
	if got.ProximoVencimiento != nil {
		t.Errorf("ProximoVencimiento = %v, esperaba nil", got.ProximoVencimiento)
	}
}

// TestTurnosPendientesAsistencia_IncluyeVencidosSinImportarLaFecha —
// corrección de QA (rediseño del cartel en tiempo real): a diferencia de
// las tarjetas del dashboard, acá NO hay ningún tope de "hoy" — un turno
// resuelto sin marcar de hace varios días sigue apareciendo, pedido
// textual del cliente ("el cartel siempre debe aparecer... aunque cierre
// la app").
func TestTurnosPendientesAsistencia_IncluyeVencidosSinImportarLaFecha(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "pendientes2@example.com")

	deHaceDias := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-72*time.Hour))

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos/pendientes-asistencia", reg.Token, nil)
	var got turnosPendientesAsistenciaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got.Vencidos) != 1 || got.Vencidos[0].ID != deHaceDias.ID.String() {
		t.Errorf("Vencidos = %+v, esperaba solo el turno de hace 3 días (%s)", got.Vencidos, deHaceDias.ID)
	}
}

// TestTurnosPendientesAsistencia_NoIncluyeYaMarcados — un turno resuelto
// que YA tiene asistencia marcada no vuelve a aparecer (ya se resolvió).
func TestTurnosPendientesAsistencia_NoIncluyeYaMarcados(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "pendientes3@example.com")

	marcado := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-2*time.Hour))
	asistio := "asistio"
	if err := gdb.Model(&db.Turno{}).Where("id = ?", marcado.ID).Update("asistencia", &asistio).Error; err != nil {
		t.Fatalf("no se pudo marcar la asistencia de prueba: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos/pendientes-asistencia", reg.Token, nil)
	var got turnosPendientesAsistenciaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got.Vencidos) != 0 {
		t.Errorf("Vencidos = %+v, esperaba vacío (ya está marcado)", got.Vencidos)
	}
}

// TestTurnosPendientesAsistencia_OrdenaDelMasAntiguoAlMasNuevo — pedido
// textual del cliente: "si hay más de uno se deben acumular hasta
// marcarlos todos" — el cartel los muestra de a uno, el más antiguo
// primero.
func TestTurnosPendientesAsistencia_OrdenaDelMasAntiguoAlMasNuevo(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "pendientes4@example.com")

	masNuevo := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-1*time.Hour))
	masViejo := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-5*time.Hour))

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos/pendientes-asistencia", reg.Token, nil)
	var got turnosPendientesAsistenciaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got.Vencidos) != 2 {
		t.Fatalf("Vencidos = %+v, esperaba 2", got.Vencidos)
	}
	if got.Vencidos[0].ID != masViejo.ID.String() || got.Vencidos[1].ID != masNuevo.ID.String() {
		t.Errorf("orden = [%s, %s], esperaba [%s, %s] (más antiguo primero)",
			got.Vencidos[0].ID, got.Vencidos[1].ID, masViejo.ID, masNuevo.ID)
	}
}

// TestTurnosPendientesAsistencia_ProximoVencimientoDelTurnoVigenteMasProximo
// — el timer preciso del frontend necesita saber cuándo resuelve el
// PRÓXIMO turno vigente, para disparar el cartel apenas cruce su hora de
// fin sin esperar al sondeo periódico.
func TestTurnosPendientesAsistencia_ProximoVencimientoDelTurnoVigenteMasProximo(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "pendientes5@example.com")

	masLejano := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, clock.Today().AddDate(0, 0, 2).Add(10*time.Hour))
	masProximo := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, clock.Today().AddDate(0, 0, 1).Add(10*time.Hour))
	_ = masLejano

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos/pendientes-asistencia", reg.Token, nil)
	var got turnosPendientesAsistenciaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.ProximoVencimiento == nil {
		t.Fatal("ProximoVencimiento = nil, esperaba la hora de fin del turno más próximo")
	}
	esperado := masProximo.HoraFin.Format(time.RFC3339)
	if *got.ProximoVencimiento != esperado {
		t.Errorf("ProximoVencimiento = %s, esperaba %s", *got.ProximoVencimiento, esperado)
	}
}

// TestTurnosPendientesAsistencia_DeOtroProfesionalNoAparece — scoping
// básico, mismo criterio que el resto de los endpoints del panel.
func TestTurnosPendientesAsistencia_DeOtroProfesionalNoAparece(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	regOtro, tipoOtroID := profesionalConTipoConsulta(t, gdb, router, "pendientes6a@example.com")
	crearTurnoAgendadoDePrueba(t, gdb, regOtro.Profesional.ID, tipoOtroID, time.Now().Add(-2*time.Hour))

	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pendientes6b@example.com")
	rec := doJSONAuth(t, router, http.MethodGet, "/turnos/pendientes-asistencia", reg.Token, nil)
	var got turnosPendientesAsistenciaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got.Vencidos) != 0 {
		t.Errorf("Vencidos = %+v, esperaba vacío (turno de otro profesional)", got.Vencidos)
	}
}
