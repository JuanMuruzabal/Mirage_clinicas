package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"dental-mirage/api/internal/testdb"
)

// La ventana de asistencia se abre 5 minutos ANTES del turno
// (2026-09-19, pedido del cliente: "el profesional podrá anotar de
// antemano su presencia y evitar que al final del turno aparezca el otro
// cartel... estos botones aparecerán solo 5 min antes de la hora de
// comienzo del turno").
//
// Hasta acá el backend exigía que el turno ya hubiera TERMINADO. Estos
// tests fijan los dos bordes: se puede marcar apenas se abre la ventana,
// y no se puede marcar antes.

// TestMarcarAsistencia_SePuedeMarcarAntesDeQueEmpiece — el caso que la
// tarjeta de "Turnos de hoy" necesita: la persona ya está en el
// consultorio, faltan tres minutos, y el profesional lo registra ahí
// mismo en vez de esperar media hora a que salte el cartel.
func TestMarcarAsistencia_SePuedeMarcarAntesDeQueEmpiece(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "anticipada1@example.com")
	// Empieza en 3 minutos: dentro de la ventana de 5.
	porEmpezar := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(3*time.Minute))

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+porEmpezar.ID.String()+"/asistencia", reg.Token,
		marcarAsistenciaRequest{Asistencia: "asistio"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Asistencia == nil || *got.Asistencia != "asistio" {
		t.Errorf("asistencia = %v, esperaba \"asistio\"", got.Asistencia)
	}
}

// TestMarcarAsistencia_TodaviaNoSePuedeMarcarMuchoAntes — el otro borde,
// y el que de verdad hay que proteger: "asistió" a algo que empieza en
// media hora es adivinar. El frontend no dibuja los botones todavía,
// pero eso es una decisión de pantalla — el rechazo tiene que vivir acá,
// porque marcar es irreversible.
func TestMarcarAsistencia_TodaviaNoSePuedeMarcarMuchoAntes(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "anticipada2@example.com")
	lejano := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(2*time.Hour))

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+lejano.ID.String()+"/asistencia", reg.Token,
		marcarAsistenciaRequest{Asistencia: "asistio"})
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}
}

// TestMarcarAsistencia_ElTurnoDeAyerSigueSiendoMarcable — la ventana se
// abre y no se cierra: el cartel incerrable nunca tuvo tope de
// antigüedad (trae CUALQUIER turno resuelto sin marcar), así que abrirla
// antes no puede haberla cerrado después.
func TestMarcarAsistencia_ElTurnoDeAyerSigueSiendoMarcable(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "anticipada3@example.com")
	viejo := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-48*time.Hour))

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+viejo.ID.String()+"/asistencia", reg.Token,
		marcarAsistenciaRequest{Asistencia: "ausente"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

// TestResumenPanel_ElTurnoMarcadoDeAntemanoSaleDeTurnosDeHoy — la
// consecuencia de poder marcar antes, en el dashboard.
//
// "Turnos de hoy" es la cola de lo que falta atender y "Turnos resueltos
// hoy" el reporte de lo ya marcado. Mientras solo se podía marcar al
// terminar, las dos listas no se pisaban nunca: un turno vigente no
// podía tener asistencia. Con la ventana abierta antes, un turno marcado
// de antemano cumplía las dos condiciones a la vez y aparecía duplicado.
func TestResumenPanel_ElTurnoMarcadoDeAntemanoSaleDeTurnosDeHoy(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "anticipada4@example.com")
	porEmpezar := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(3*time.Minute))

	// Antes de marcar: es un turno de hoy que falta atender.
	var antes resumenPanelResponse
	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	_ = json.Unmarshal(rec.Body.Bytes(), &antes)
	if !contieneTurno(antes.TurnosHoy, porEmpezar.ID.String()) {
		t.Fatalf("TurnosHoy = %+v, esperaba que incluyera el turno por empezar", antes.TurnosHoy)
	}

	marcar := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+porEmpezar.ID.String()+"/asistencia", reg.Token,
		marcarAsistenciaRequest{Asistencia: "asistio"})
	if marcar.Code != http.StatusOK {
		t.Fatalf("marcar: status = %d body=%s", marcar.Code, marcar.Body.String())
	}

	var despues resumenPanelResponse
	rec = doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	_ = json.Unmarshal(rec.Body.Bytes(), &despues)
	if contieneTurno(despues.TurnosHoy, porEmpezar.ID.String()) {
		t.Errorf("TurnosHoy sigue trayendo el turno ya marcado: %+v", despues.TurnosHoy)
	}
	if !contieneTurno(despues.TurnosResueltos, porEmpezar.ID.String()) {
		t.Errorf("TurnosResueltos = %+v, esperaba que lo incluyera", despues.TurnosResueltos)
	}
}

// TestResumenPanel_LosItemsLlevanLosInstantes — la tarjeta deriva el
// estado y la ventana de asistencia del reloj, y para eso necesita un
// instante: con "15:04" el navegador tendría que reinterpretarlo en su
// propia zona horaria.
func TestResumenPanel_LosItemsLlevanLosInstantes(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "anticipada5@example.com")
	inicio := time.Now().Add(2 * time.Hour)
	creado := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, inicio)

	var got resumenPanelResponse
	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	item := turnoDelResumen(got.TurnosHoy, creado.ID.String())
	if item == nil {
		t.Fatalf("TurnosHoy = %+v, esperaba el turno creado", got.TurnosHoy)
	}
	if item.HoraInicioISO == "" || item.HoraFinISO == "" {
		t.Fatalf("faltan los instantes: %+v", *item)
	}
	leido, err := time.Parse(time.RFC3339, item.HoraInicioISO)
	if err != nil {
		t.Fatalf("horaInicioIso no es RFC3339: %v", err)
	}
	if !leido.Equal(inicio.Truncate(time.Second)) && leido.Sub(inicio).Abs() > time.Second {
		t.Errorf("horaInicioIso = %v, esperaba %v", leido, inicio)
	}
	// Y sigue viajando el texto de siempre: la fila lo muestra tal cual,
	// ya resuelto en hora de Córdoba por el backend.
	if item.Hora == "" || item.HoraFin == "" {
		t.Errorf("hora/horaFin vacíos: %+v", *item)
	}
}

func contieneTurno(items []resumenTurnoItem, id string) bool {
	return turnoDelResumen(items, id) != nil
}

func turnoDelResumen(items []resumenTurnoItem, id string) *resumenTurnoItem {
	for i := range items {
		if items[i].ID == id {
			return &items[i]
		}
	}
	return nil
}
