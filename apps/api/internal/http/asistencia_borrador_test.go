package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// El borrador de asistencia — 2026-09-19, pedido del cliente: "la
// asistencia de la tarjeta es reversible, es decir, que yo puedo marcar
// no asistió y después asistió... el último estado de la tarjeta es el
// que va a leer la asistencia final cuando el turno pase a estar
// resuelto".
//
// Lo que estos tests protegen es la línea entre las dos cosas: mientras
// el turno no terminó, lo anotado es un BORRADOR reversible y sin
// consecuencias; cuando termina, se vuelve la asistencia definitiva con
// todas ellas, y desde ahí es irreversible como siempre.

func marcar(t *testing.T, router http.Handler, token, turnoID, valor string) int {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoID+"/asistencia", token,
		marcarAsistenciaRequest{Asistencia: valor})
	return rec.Code
}

func turnoDeLaBase(t *testing.T, gdb *gorm.DB, id string) db.Turno {
	t.Helper()
	var turno db.Turno
	if err := gdb.First(&turno, "id = ?", id).Error; err != nil {
		t.Fatalf("no se pudo recargar el turno: %v", err)
	}
	return turno
}

// empujarTurnoAlPasado simula el paso del tiempo: mueve el turno para
// que su hora de fin ya haya pasado, que es lo que en producción hace
// simplemente el reloj. Sin esto habría que esperar media hora real.
func empujarTurnoAlPasado(t *testing.T, gdb *gorm.DB, id string) {
	t.Helper()
	inicio := time.Now().Add(-2 * time.Hour)
	fin := inicio.Add(30 * time.Minute)
	if err := gdb.Model(&db.Turno{}).Where("id = ?", id).
		Updates(map[string]any{"hora_inicio": inicio, "hora_fin": fin}).Error; err != nil {
		t.Fatalf("no se pudo empujar el turno al pasado: %v", err)
	}
}

// TestBorradorAsistencia_SePuedeCambiarDeOpinion — el caso que motivó
// todo: se anota "ausente" porque la persona no llegó, llega tarde, y se
// corrige a "asistió". Sin esto, la primera elección quedaba grabada.
func TestBorradorAsistencia_SePuedeCambiarDeOpinion(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "borrador1@example.com")
	enCurso := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(2*time.Minute))

	if code := marcar(t, router, reg.Token, enCurso.ID.String(), "ausente"); code != http.StatusOK {
		t.Fatalf("primera marca: status = %d", code)
	}
	if code := marcar(t, router, reg.Token, enCurso.ID.String(), "asistio"); code != http.StatusOK {
		t.Fatalf("segunda marca: status = %d — mientras el turno no termina tiene que ser reversible", code)
	}

	turno := turnoDeLaBase(t, gdb, enCurso.ID.String())
	if turno.AsistenciaPreliminar == nil || *turno.AsistenciaPreliminar != "asistio" {
		t.Errorf("asistencia_preliminar = %v, esperaba la ÚLTIMA elección", turno.AsistenciaPreliminar)
	}
	// Y lo importante: la asistencia de verdad sigue sin tocarse.
	if turno.Asistencia != nil {
		t.Errorf("asistencia = %v, esperaba nil — el turno todavía no terminó", turno.Asistencia)
	}
}

// TestBorradorAsistencia_NoDisparaLasConsecuencias — la razón de que sea
// una columna aparte. `Asistencia` resuelve conflictos de identidad y un
// "ausente" puede BORRAR la ficha de un paciente sin verificar; nada de
// eso puede colgar de algo que todavía se puede cambiar de opinión.
func TestBorradorAsistencia_NoDisparaLasConsecuencias(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "borrador2@example.com")
	enCurso := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(2*time.Minute))

	// Una ficha sin verificar, vinculada a ese turno: con la asistencia
	// definitiva, un "ausente" la borraría.
	pacienteID := crearPacienteDePruebaPaginaPublica(t, gdb, uuid.MustParse(reg.Profesional.ID), "45123456")
	if err := gdb.Model(&db.Turno{}).Where("id = ?", enCurso.ID).Update("paciente_id", pacienteID).Error; err != nil {
		t.Fatalf("no se pudo vincular el paciente: %v", err)
	}

	if code := marcar(t, router, reg.Token, enCurso.ID.String(), "ausente"); code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}

	var cuantos int64
	if err := gdb.Model(&db.Paciente{}).Where("id = ?", pacienteID).Count(&cuantos).Error; err != nil {
		t.Fatalf("no se pudo contar: %v", err)
	}
	if cuantos != 1 {
		t.Error("la ficha se borró con un borrador: eso solo puede pasar cuando el turno TERMINÓ")
	}
}

// TestBorradorAsistencia_AlVencerSeVuelveDefinitivo — la otra mitad: el
// sondeo que alimenta el cartel aplica el borrador de los turnos que
// acaban de terminar, y por eso NO los devuelve como pendientes. Es
// exactamente lo que el profesional compró al anotarlo antes: ahorrarse
// el cartel.
func TestBorradorAsistencia_AlVencerSeVuelveDefinitivo(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "borrador3@example.com")
	porVencer := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(2*time.Minute))

	if code := marcar(t, router, reg.Token, porVencer.ID.String(), "asistio"); code != http.StatusOK {
		t.Fatalf("anotar: status = %d", code)
	}
	// El turno termina: se lo empuja al pasado, como haría el reloj.
	empujarTurnoAlPasado(t, gdb, porVencer.ID.String())

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos/pendientes-asistencia", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("sondeo: status = %d body=%s", rec.Code, rec.Body.String())
	}
	var pend turnosPendientesAsistenciaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &pend)
	for _, v := range pend.Vencidos {
		if v.ID == porVencer.ID.String() {
			t.Fatal("el turno volvió como pendiente: el cartel iba a aparecer igual, que es justo lo que se evita anotando antes")
		}
	}

	turno := turnoDeLaBase(t, gdb, porVencer.ID.String())
	if turno.Asistencia == nil || *turno.Asistencia != "asistio" {
		t.Errorf("asistencia = %v, esperaba que el borrador se hubiera vuelto definitivo", turno.Asistencia)
	}
}

// TestBorradorAsistencia_YaDefinitivaEsIrreversible — la regla de
// siempre (TR-092) no se relajó: una vez que el turno terminó y la
// asistencia quedó escrita, no se cambia más.
func TestBorradorAsistencia_YaDefinitivaEsIrreversible(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "borrador4@example.com")
	terminado := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-48*time.Hour))

	if code := marcar(t, router, reg.Token, terminado.ID.String(), "asistio"); code != http.StatusOK {
		t.Fatalf("primera marca: status = %d", code)
	}
	if code := marcar(t, router, reg.Token, terminado.ID.String(), "ausente"); code != http.StatusConflict {
		t.Errorf("segunda marca: status = %d, esperaba 409 — un turno terminado no se cambia", code)
	}

	turno := turnoDeLaBase(t, gdb, terminado.ID.String())
	if turno.Asistencia == nil || *turno.Asistencia != "asistio" {
		t.Errorf("asistencia = %v, esperaba que siguiera en la primera", turno.Asistencia)
	}
}

// TestBorradorAsistencia_SinBorradorElCartelSigueApareciendo — el caso
// que no cambió: un turno que terminó sin que nadie anotara nada sigue
// volviendo como pendiente, y el cartel lo pide.
func TestBorradorAsistencia_SinBorradorElCartelSigueApareciendo(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "borrador5@example.com")
	terminado := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-3*time.Hour))

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos/pendientes-asistencia", reg.Token, nil)
	var pend turnosPendientesAsistenciaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &pend)

	encontrado := false
	for _, v := range pend.Vencidos {
		if v.ID == terminado.ID.String() {
			encontrado = true
		}
	}
	if !encontrado {
		t.Errorf("Vencidos = %+v, esperaba el turno sin anotar", pend.Vencidos)
	}
}
