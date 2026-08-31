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

// fechaDePruebaDisponibilidad: fija a propósito (no "hoy") para que el
// piso de "no ofrecer horarios ya pasados" (calcularDisponibilidad) nunca
// entre en juego en estos tests — 2030-06-03 es lunes (diaSemana=1).
const fechaDePruebaDisponibilidad = "2030-06-03"

func crearClinicaDePruebaDisponibilidad(t *testing.T, email string) (http.Handler, *gorm.DB, clinicaDePruebaResult) {
	t.Helper()
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: email, Password: "password123456", NombreClinica: "Clínica",
	})
	return router, gdb, reg
}

func crearTipoDePrueba(t *testing.T, router http.Handler, token string, duracion, tiempoPost int) tipoConsultaResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", token, tipoConsultaRequest{
		Nombre: "Tipo de prueba", Color: "#123ABC", DuracionMinutos: duracion, TiempoPostConsultaMinutos: tiempoPost,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("no se pudo crear el tipo de consulta de prueba: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var tipo tipoConsultaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &tipo); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	return tipo
}

func pedirDisponibilidad(t *testing.T, router http.Handler, token, tipoConsultaID, fecha, excluirTurnoID string) *disponibilidadResponse {
	t.Helper()
	path := "/disponibilidad?tipoConsultaId=" + tipoConsultaID + "&fecha=" + fecha
	if excluirTurnoID != "" {
		path += "&excluirTurnoId=" + excluirTurnoID
	}
	rec := doJSONAuth(t, router, http.MethodGet, path, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var out disponibilidadResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	return &out
}

func contieneSlot(slots []string, slot string) bool {
	for _, s := range slots {
		if s == slot {
			return true
		}
	}
	return false
}

func TestDisponibilidad_RequiereAutenticacion(t *testing.T) {
	router, _ := newTestRouter(t)
	rec := doJSON(t, router, http.MethodGet, "/disponibilidad?tipoConsultaId=x&fecha=2030-01-01", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestDisponibilidad_TipoConsultaIdInvalido(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp1@example.com")
	rec := doJSONAuth(t, router, http.MethodGet, "/disponibilidad?tipoConsultaId=no-es-un-uuid&fecha="+fechaDePruebaDisponibilidad, reg.Token, nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestDisponibilidad_TipoConsultaNoEncontrado(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp2@example.com")
	rec := doJSONAuth(t, router, http.MethodGet, "/disponibilidad?tipoConsultaId="+uuid.New().String()+"&fecha="+fechaDePruebaDisponibilidad, reg.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestDisponibilidad_FechaInvalida(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp3@example.com")
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)
	rec := doJSONAuth(t, router, http.MethodGet, "/disponibilidad?tipoConsultaId="+tipo.ID+"&fecha=03-06-2030", reg.Token, nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestDisponibilidad_UsaHorarioPorDefectoSinFilaGuardada(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp4@example.com")
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)

	out := pedirDisponibilidad(t, router, reg.Token, tipo.ID, fechaDePruebaDisponibilidad, "")

	if !contieneSlot(out.Slots, "08:00") {
		t.Errorf("slots = %v, esperaba que incluyera 08:00 (default de horario de atención)", out.Slots)
	}
	if contieneSlot(out.Slots, "17:45") {
		t.Errorf("slots = %v, 17:45+30min no entra antes del cierre default (18:00)", out.Slots)
	}
}

func TestDisponibilidad_RangoCompletoSinBloqueosNiTurnos(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp5@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "10:00"})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)

	out := pedirDisponibilidad(t, router, reg.Token, tipo.ID, fechaDePruebaDisponibilidad, "")

	esperado := []string{"08:00", "08:15", "08:30", "08:45", "09:00", "09:15", "09:30"}
	if len(out.Slots) != len(esperado) {
		t.Fatalf("slots = %v, esperaba %v", out.Slots, esperado)
	}
	for i, s := range esperado {
		if out.Slots[i] != s {
			t.Errorf("slots[%d] = %q, esperaba %q", i, out.Slots[i], s)
		}
	}
}

func TestDisponibilidad_ConsideraTiempoPostConsulta(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp6@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "09:30"})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 15) // necesita 45 min por turno

	out := pedirDisponibilidad(t, router, reg.Token, tipo.ID, fechaDePruebaDisponibilidad, "")

	esperado := []string{"08:00", "08:15", "08:30", "08:45"}
	if len(out.Slots) != len(esperado) {
		t.Fatalf("slots = %v, esperaba %v (30+15=45 min por turno)", out.Slots, esperado)
	}
}

func TestDisponibilidad_TurnoAgendadoBloqueaSuFranjaMasElPostBufferDeSuPropioTipo(t *testing.T) {
	router, gdb, reg := crearClinicaDePruebaDisponibilidad(t, "disp7@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "10:00"})
	tipoOcupante := crearTipoDePrueba(t, router, reg.Token, 30, 15) // 08:00-08:30 + 15min post = ocupado hasta 08:45
	tipoConsultado := crearTipoDePrueba(t, router, reg.Token, 15, 0)

	clinicID := uuid.MustParse(reg.Profesional.ID)
	tipoOcupanteID := uuid.MustParse(tipoOcupante.ID)
	fecha, err := clock.ParseDate(fechaDePruebaDisponibilidad)
	if err != nil {
		t.Fatalf("ParseDate: %v", err)
	}
	inicio := fecha.Add(8 * time.Hour)             // 08:00
	fin := fecha.Add(8*time.Hour + 30*time.Minute) // 08:30
	turno := db.Turno{
		ProfesionalID: clinicID, TipoConsultaID: &tipoOcupanteID, Estado: "agendado",
		HoraInicio: &inicio, HoraFin: &fin,
		NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1", EmailContacto: "p@example.com",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno de prueba: %v", err)
	}

	out := pedirDisponibilidad(t, router, reg.Token, tipoConsultado.ID, fechaDePruebaDisponibilidad, "")

	for _, ocupado := range []string{"08:00", "08:15", "08:30"} {
		if contieneSlot(out.Slots, ocupado) {
			t.Errorf("slots = %v, %q debería estar ocupado (turno + su tiempo post-consulta)", out.Slots, ocupado)
		}
	}
	if !contieneSlot(out.Slots, "08:45") {
		t.Errorf("slots = %v, esperaba 08:45 libre (justo después del post-consulta)", out.Slots)
	}
}

func TestDisponibilidad_ExcluirTurnoIdLoDejaVerComoLibreASuPropioHorario(t *testing.T) {
	router, gdb, reg := crearClinicaDePruebaDisponibilidad(t, "disp8@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "10:00"})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)

	clinicID := uuid.MustParse(reg.Profesional.ID)
	tipoID := uuid.MustParse(tipo.ID)
	fecha, _ := clock.ParseDate(fechaDePruebaDisponibilidad)
	inicio := fecha.Add(9 * time.Hour)
	fin := fecha.Add(9*time.Hour + 30*time.Minute)
	turno := db.Turno{
		ProfesionalID: clinicID, TipoConsultaID: &tipoID, Estado: "agendado",
		HoraInicio: &inicio, HoraFin: &fin,
		NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1", EmailContacto: "p@example.com",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno de prueba: %v", err)
	}

	sinExcluir := pedirDisponibilidad(t, router, reg.Token, tipo.ID, fechaDePruebaDisponibilidad, "")
	if contieneSlot(sinExcluir.Slots, "09:00") {
		t.Errorf("slots sin excluir = %v, 09:00 debería estar ocupado por el propio turno", sinExcluir.Slots)
	}

	conExcluir := pedirDisponibilidad(t, router, reg.Token, tipo.ID, fechaDePruebaDisponibilidad, turno.ID.String())
	if !contieneSlot(conExcluir.Slots, "09:00") {
		t.Errorf("slots excluyendo el turno = %v, esperaba 09:00 libre (es el propio turno que se está reprogramando)", conExcluir.Slots)
	}
}

func TestDisponibilidad_BloqueoGeneralBloqueaHorario(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp9@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "12:00"})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)
	diaSemana := 1 // lunes, ver fechaDePruebaDisponibilidad

	crearRec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceTodos, DiaSemana: &diaSemana, HoraDesde: "10:00", HoraHasta: "11:00",
	})
	if crearRec.Code != http.StatusCreated {
		t.Fatalf("no se pudo crear el bloqueo de prueba: status=%d body=%s", crearRec.Code, crearRec.Body.String())
	}

	out := pedirDisponibilidad(t, router, reg.Token, tipo.ID, fechaDePruebaDisponibilidad, "")

	for _, bloqueado := range []string{"10:00", "10:30"} {
		if contieneSlot(out.Slots, bloqueado) {
			t.Errorf("slots = %v, %q debería estar bloqueado por la regla general", out.Slots, bloqueado)
		}
	}
	if !contieneSlot(out.Slots, "09:30") || !contieneSlot(out.Slots, "11:00") {
		t.Errorf("slots = %v, esperaba 09:30 y 11:00 libres (fuera del bloqueo)", out.Slots)
	}
}

// Corrección de QA (2026-08-30) sobre un bug real: la versión anterior
// de esta prueba esperaba que 10:30 quedara LIBRE porque la específica
// "tapaba" a la general entera con solo solaparla parcialmente — el
// cliente encontró el caso real donde eso deja disponible una franja que
// el profesional sigue queriendo bloqueada. Ahora ambas reglas aportan
// su propio rango a la disponibilidad (unión, sin "gana"), así que
// 10:00-11:00 completo sigue bloqueado — la específica (10:00-10:30) no
// cubre la totalidad de la general (10:00-11:00).
func TestDisponibilidad_HorarioReservadoGeneralSigueBloqueandoLoQueLaEspecificaNoCubre(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp10@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "12:00"})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)
	diaSemana := 1

	// General: bloquea 10:00-11:00 todos los lunes.
	doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceTodos, DiaSemana: &diaSemana, HoraDesde: "10:00", HoraHasta: "11:00",
	})
	// Específica ESE lunes puntual: bloquea solo 10:00-10:30 — NO cubre
	// la totalidad de la general (10:00-11:00), así que la general sigue
	// bloqueando su propio tramo expuesto (10:30-11:00).
	doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: fechaDePruebaDisponibilidad, HoraDesde: "10:00", HoraHasta: "10:30",
	})

	out := pedirDisponibilidad(t, router, reg.Token, tipo.ID, fechaDePruebaDisponibilidad, "")

	for _, bloqueado := range []string{"10:00", "10:30"} {
		if contieneSlot(out.Slots, bloqueado) {
			t.Errorf("slots = %v, %q debería seguir bloqueado — la específica no cubre toda la general", out.Slots, bloqueado)
		}
	}
	if !contieneSlot(out.Slots, "09:30") || !contieneSlot(out.Slots, "11:00") {
		t.Errorf("slots = %v, esperaba 09:30 y 11:00 libres (fuera de los dos bloqueos)", out.Slots)
	}
}

// Cuando la específica SÍ cubre la totalidad de la general, el resultado
// (unión de rangos) es el mismo que si la general no aportara nada
// nuevo — no hace falta ninguna lógica de "gana" para llegar al
// resultado correcto acá tampoco, la unión ya lo resuelve solo.
func TestDisponibilidad_EspecificaQueCubreTodaLaGeneralNoBloqueaDeMas(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp11@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "12:00"})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)
	diaSemana := 1

	// General: bloquea 10:00-10:30 todos los lunes.
	doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: false, Alcance: db.BloqueoAlcanceTodos, DiaSemana: &diaSemana, HoraDesde: "10:00", HoraHasta: "10:30",
	})
	// Específica ESE lunes puntual: bloquea 10:00-11:00 — cubre la
	// totalidad de la general.
	doJSONAuth(t, router, http.MethodPost, "/bloqueos", reg.Token, crearBloqueoHorarioRequest{
		Especifico: true, Fecha: fechaDePruebaDisponibilidad, HoraDesde: "10:00", HoraHasta: "11:00",
	})

	out := pedirDisponibilidad(t, router, reg.Token, tipo.ID, fechaDePruebaDisponibilidad, "")

	for _, bloqueado := range []string{"10:00", "10:30"} {
		if contieneSlot(out.Slots, bloqueado) {
			t.Errorf("slots = %v, %q debería estar bloqueado (dentro del rango de la específica)", out.Slots, bloqueado)
		}
	}
	if !contieneSlot(out.Slots, "09:30") || !contieneSlot(out.Slots, "11:00") {
		t.Errorf("slots = %v, esperaba 09:30 y 11:00 libres (fuera del bloqueo)", out.Slots)
	}
}

// diaDeEstaSemanaDistintoDeHoy — un día dentro de "esta semana" (mismo
// rango que resuelve el alcance "semana" de horario_atencion.go) que no
// sea HOY, para no activar el piso de "no ofrecer horarios ya pasados"
// de calcularDisponibilidad al probar una excepción de alcance semana.
func diaDeEstaSemanaDistintoDeHoy(t *testing.T) string {
	t.Helper()
	hoy := clock.Today()
	desde := startOfWeek(hoy)
	for i := 0; i < 7; i++ {
		d := desde.AddDate(0, 0, i)
		if !d.Equal(hoy) {
			return d.Format("2006-01-02")
		}
	}
	t.Fatal("no se encontró un día de esta semana distinto de hoy")
	return ""
}

// Corrección de QA (2026-09-01): "puede que un profesional tenga
// horarios de atención variable" — una excepción de horario_atencion
// (alcance semana/mes/rango) pisa a la general mientras está vigente,
// mismo criterio de prioridad "más específica gana" que bloqueos_horario.
func TestDisponibilidad_ExcepcionSemanaTieneMasPrioridadQueLaGeneral(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp-var1@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "18:00"})
	doJSONAuth(t, router, http.MethodPost, "/horario-atencion", reg.Token, crearHorarioAtencionRequest{
		Alcance: "semana", HoraDesde: "09:00", HoraHasta: "11:00",
	})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)
	fecha := diaDeEstaSemanaDistintoDeHoy(t)

	out := pedirDisponibilidad(t, router, reg.Token, tipo.ID, fecha, "")

	if !contieneSlot(out.Slots, "09:00") || !contieneSlot(out.Slots, "10:30") {
		t.Errorf("slots = %v, esperaba horarios dentro de la excepción (09:00-11:00)", out.Slots)
	}
	if contieneSlot(out.Slots, "08:00") || contieneSlot(out.Slots, "17:00") {
		t.Errorf("slots = %v, la excepción (09:00-11:00) debería tapar a la general (08:00-18:00) esta semana", out.Slots)
	}
}

// "si hay un día que no trabaja el profesional, mostrar no hay horarios
// disponibles para hoy" — una excepción "no trabaja" deja el día sin
// ningún horario ofrecido, sin importar que la general tenga horario.
func TestDisponibilidad_ExcepcionSinHorario_NoOfreceNadaEseDia(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp-var2@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "18:00"})
	doJSONAuth(t, router, http.MethodPost, "/horario-atencion", reg.Token, crearHorarioAtencionRequest{
		Alcance: "semana", NoTrabaja: true,
	})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)
	fecha := diaDeEstaSemanaDistintoDeHoy(t)

	out := pedirDisponibilidad(t, router, reg.Token, tipo.ID, fecha, "")

	if len(out.Slots) != 0 {
		t.Errorf("slots = %v, esperaba ninguno (el profesional no trabaja esta semana)", out.Slots)
	}
}

// "rango" es la única excepción con fechas elegidas a mano — solo debe
// aplicar DENTRO de ese rango, nunca afuera.
func TestDisponibilidad_ExcepcionRango_SoloAplicaDentroDelRangoElegido(t *testing.T) {
	router, _, reg := crearClinicaDePruebaDisponibilidad(t, "disp-var3@example.com")
	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{HoraDesde: "08:00", HoraHasta: "18:00"})
	doJSONAuth(t, router, http.MethodPost, "/horario-atencion", reg.Token, crearHorarioAtencionRequest{
		Alcance: "rango", FechaDesde: "2030-06-01", FechaHasta: "2030-06-10", HoraDesde: "09:00", HoraHasta: "11:00",
	})
	tipo := crearTipoDePrueba(t, router, reg.Token, 30, 0)

	// fechaDePruebaDisponibilidad (2030-06-03) cae DENTRO del rango.
	dentro := pedirDisponibilidad(t, router, reg.Token, tipo.ID, fechaDePruebaDisponibilidad, "")
	if !contieneSlot(dentro.Slots, "09:00") || contieneSlot(dentro.Slots, "08:00") {
		t.Errorf("slots dentro del rango = %v, esperaba 09:00-11:00 (la excepción), no el horario general", dentro.Slots)
	}

	// Un día bien afuera del rango sigue usando la general.
	fuera := pedirDisponibilidad(t, router, reg.Token, tipo.ID, "2030-07-15", "")
	if !contieneSlot(fuera.Slots, "08:00") {
		t.Errorf("slots fuera del rango = %v, esperaba el horario general (08:00-18:00), la excepción no debería aplicar ahí", fuera.Slots)
	}
}
