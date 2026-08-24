package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/auth"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// tipoConsultaIDDePrueba registra un profesional y devuelve su token junto
// con el id de su tipo de consulta "Consulta general" (sembrado en el
// registro, TR-001).
func profesionalConTipoConsulta(t *testing.T, gdb *gorm.DB, router http.Handler, email string) (authResponse, string) {
	t.Helper()
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: email, Password: "password123", NombreClinica: "Clínica " + email,
	})
	var tipo db.TipoConsulta
	if err := gdb.Where("profesional_id = ? AND nombre = ?", reg.Profesional.ID, "Consulta general").First(&tipo).Error; err != nil {
		t.Fatalf("no se encontró el tipo de consulta sembrado: %v", err)
	}
	return reg, tipo.ID.String()
}

// crearTurnoAgendadoDePrueba inserta un turno `agendado` directo en la base
// (sin pasar por POST /turnos) — necesario para simular un turno que ya
// pasó ("resuelto"): desde 2026-08-23 el endpoint HTTP rechaza crear un
// turno con horaInicio en el pasado (pedido explícito del cliente), pero
// un turno real llega a estar en el pasado por el simple paso del tiempo
// después de haberse creado válidamente, no porque alguien lo haya creado
// ya vencido.
func crearTurnoAgendadoDePrueba(t *testing.T, gdb *gorm.DB, profesionalID, tipoConsultaID string, inicio time.Time) db.Turno {
	t.Helper()
	pid, err := uuid.Parse(profesionalID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	tid, err := uuid.Parse(tipoConsultaID)
	if err != nil {
		t.Fatalf("tipoConsultaID inválido: %v", err)
	}
	// Trunca a segundos — RFC3339 (lo que manda cualquier request real) no
	// lleva fracción de segundo, así que comparar esto contra un horario
	// reconstruido desde una request (reprogramarTurnoHandler, "no cambió
	// el horario") tiene que dar exactamente igual, no una diferencia de
	// nanosegundos que nadie tipeó.
	inicio = inicio.Truncate(time.Second)
	fin := inicio.Add(30 * time.Minute)
	turno := db.Turno{
		ProfesionalID:    pid,
		Estado:           "agendado",
		TipoConsultaID:   &tid,
		HoraInicio:       &inicio,
		HoraFin:          &fin,
		NombreContacto:   "P",
		ApellidoContacto: "Q",
		DNIContacto:      "1",
		TelefonoContacto: "1",
		Origen:           "manual",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno agendado de prueba: %v", err)
	}
	return turno
}

func crearTurnoPendienteDePrueba(t *testing.T, gdb *gorm.DB, profesionalID string) db.Turno {
	t.Helper()
	pid, err := uuid.Parse(profesionalID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	turno := db.Turno{
		ProfesionalID:    pid,
		Estado:           "pendiente",
		NombreContacto:   "Bruno",
		ApellidoContacto: "Iglesias",
		DNIContacto:      "30111222",
		TelefonoContacto: "+5493511234567",
		EmailContacto:    "bruno@example.com",
		Motivo:           "Dolor de muela",
		Origen:           "pagina_publica",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno pendiente de prueba: %v", err)
	}
	return turno
}

func doJSONAuth(t *testing.T, router http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("no se pudo serializar el body: %v", err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestTurnos_RequierenAutenticacion(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	for _, req := range []*http.Request{
		httptest.NewRequest(http.MethodGet, "/turnos", nil),
		httptest.NewRequest(http.MethodPost, "/turnos", nil),
		httptest.NewRequest(http.MethodPatch, "/turnos/00000000-0000-0000-0000-000000000000/agendar", nil),
		httptest.NewRequest(http.MethodGet, "/panel/resumen", nil),
	} {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s: status = %d, esperaba %d", req.Method, req.URL.Path, rec.Code, http.StatusUnauthorized)
		}
	}
}

func TestListTurnos_FiltraPorEstadoYEsPorProfesional(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "list1@example.com")
	crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)

	otro, _ := profesionalConTipoConsulta(t, gdb, router, "list2@example.com")
	crearTurnoPendienteDePrueba(t, gdb, otro.Profesional.ID)

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?estado=pendiente", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got []turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 {
		t.Fatalf("len(got) = %d, esperaba 1 (solo el propio)", len(got))
	}
	if got[0].NombreContacto != "Bruno" {
		t.Errorf("NombreContacto = %q, esperaba Bruno", got[0].NombreContacto)
	}
}

func TestListTurnos_FiltraPorRangoDeFechas(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "rango@example.com")

	base := time.Date(2026, 9, 1, 9, 0, 0, 0, time.UTC)
	crear := func(inicio time.Time) {
		rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
			NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
			TipoConsultaID: tipoConsultaID,
			HoraInicio:     inicio.Format(time.RFC3339),
			HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
		})
		if rec.Code != http.StatusCreated {
			t.Fatalf("no se pudo crear el turno de prueba: status=%d body=%s", rec.Code, rec.Body.String())
		}
	}
	crear(base)                          // dentro del rango
	crear(base.Add(10 * 24 * time.Hour)) // fuera del rango

	desde := base.Add(-time.Hour).Format(time.RFC3339)
	hasta := base.Add(time.Hour).Format(time.RFC3339)
	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?desde="+desde+"&hasta="+hasta, reg.Token, nil)

	var got []turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 {
		t.Fatalf("len(got) = %d, esperaba 1 (solo el turno dentro del rango)", len(got))
	}
}

// TestListTurnos_FiltraPorResuelto — pedido explícito del cliente
// (2026-08-23): la pestaña "Resueltos" de la vista Turnos separa los
// turnos `agendado` cuya hora de fin ya pasó, sin cambiar el significado
// de `estado=agendado` a secas (que el calendario sigue usando para traer
// pasados y futuros juntos).
func TestListTurnos_FiltraPorResuelto(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resuelto1@example.com")

	// El pasado se inserta directo (simula un turno que envejeció, ver
	// crearTurnoAgendadoDePrueba); el futuro sí pasa por el endpoint real.
	pasado := time.Now().Add(-72 * time.Hour)
	futuro := time.Now().Add(72 * time.Hour)
	crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, pasado)
	doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoConsultaID, HoraInicio: futuro.Format(time.RFC3339), HoraFin: futuro.Add(30 * time.Minute).Format(time.RFC3339),
	})

	recResueltos := doJSONAuth(t, router, http.MethodGet, "/turnos?estado=agendado&resuelto=true", reg.Token, nil)
	var resueltos []turnoResponse
	_ = json.Unmarshal(recResueltos.Body.Bytes(), &resueltos)
	if len(resueltos) != 1 || *resueltos[0].HoraInicio != pasado.Format(time.RFC3339) {
		t.Errorf("resueltos = %+v, esperaba solo el turno pasado", resueltos)
	}

	recFuturos := doJSONAuth(t, router, http.MethodGet, "/turnos?estado=agendado&resuelto=false", reg.Token, nil)
	var futuros []turnoResponse
	_ = json.Unmarshal(recFuturos.Body.Bytes(), &futuros)
	if len(futuros) != 1 || *futuros[0].HoraInicio != futuro.Format(time.RFC3339) {
		t.Errorf("futuros = %+v, esperaba solo el turno futuro", futuros)
	}

	// Sin `resuelto`, estado=agendado sigue trayendo los dos (lo que usa el calendario).
	recTodos := doJSONAuth(t, router, http.MethodGet, "/turnos?estado=agendado", reg.Token, nil)
	var todos []turnoResponse
	_ = json.Unmarshal(recTodos.Body.Bytes(), &todos)
	if len(todos) != 2 {
		t.Errorf("len(todos) = %d, esperaba 2 (sin filtrar por resuelto)", len(todos))
	}
}

func TestListTurnos_ResueltoInvalidoFalla(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: "resuelto2@example.com", Password: "password123", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?resuelto=quizas", reg.Token, nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestCrearTurnoManual_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "manual1@example.com")

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "30222333", TelefonoContacto: "+5493511111111",
		EmailContacto:  "julian@example.com",
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Estado != "agendado" {
		t.Errorf("Estado = %q, esperaba agendado", got.Estado)
	}
	if got.Origen != "manual" {
		t.Errorf("Origen = %q, esperaba manual", got.Origen)
	}
	if got.PacienteID == nil {
		t.Fatal("esperaba que se creara y vinculara un Paciente")
	}

	var count int64
	gdb.Model(&db.Paciente{}).Where("dni = ?", "30222333").Count(&count)
	if count != 1 {
		t.Errorf("count de pacientes con ese DNI = %d, esperaba 1", count)
	}
}

func TestCrearTurnoManual_CamposObligatoriosFaltantes(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "manual2@example.com")

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "", ApellidoContacto: "Ortiz", DNIContacto: "30222333", TelefonoContacto: "+549",
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestCrearTurnoManual_TipoConsultaInvalido(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "manual3@example.com")

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: "no-es-un-uuid",
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestCrearTurnoManual_HorarioInvalido(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "manual4@example.com")

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(-30 * time.Minute).Format(time.RFC3339), // fin antes que inicio
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

// TestCrearTurnoManual_FechaPasadaFalla — pedido explícito del cliente
// (2026-08-23): un profesional no puede crear un turno en el pasado.
func TestCrearTurnoManual_FechaPasadaFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "pasado1@example.com")

	pasado := time.Now().Add(-time.Hour)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     pasado.Format(time.RFC3339),
		HoraFin:        pasado.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestCrearTurnoManual_SolapamientoFallaControlado(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "solapa1@example.com")

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	payload := func(i time.Time) crearTurnoManualRequest {
		return crearTurnoManualRequest{
			NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
			TipoConsultaID: tipoConsultaID,
			HoraInicio:     i.Format(time.RFC3339),
			HoraFin:        i.Add(30 * time.Minute).Format(time.RFC3339),
		}
	}

	rec1 := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, payload(inicio))
	if rec1.Code != http.StatusCreated {
		t.Fatalf("el primer turno debería crearse: status=%d body=%s", rec1.Code, rec1.Body.String())
	}

	// Se solapa 15 minutos con el anterior.
	rec2 := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, payload(inicio.Add(15*time.Minute)))
	if rec2.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d (T2.5: error controlado, no 500). body=%s", rec2.Code, http.StatusConflict, rec2.Body.String())
	}
}

func TestAgendarTurno_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "agendar1@example.com")
	pendiente := crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)

	inicio := time.Date(2026, 9, 1, 11, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/agendar", reg.Token, agendarTurnoRequest{
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Estado != "agendado" {
		t.Errorf("Estado = %q, esperaba agendado", got.Estado)
	}
	if got.PacienteID == nil {
		t.Fatal("esperaba que se creara y vinculara un Paciente al agendar")
	}
	if got.Origen != "pagina_publica" {
		t.Errorf("Origen = %q, esperaba que se conserve pagina_publica", got.Origen)
	}
}

// TestAgendarTurno_ActualizaMotivo — pedido explícito del cliente
// (2026-08-23): confirmar un turno pendiente permite completar/corregir el
// motivo de consulta en el mismo paso.
func TestAgendarTurno_ActualizaMotivo(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "agendarmotivo@example.com")
	pendiente := crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID) // motivo original: "Dolor de muela"

	inicio := time.Date(2026, 9, 1, 11, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/agendar", reg.Token, agendarTurnoRequest{
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
		Motivo:         "Control de rutina",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Motivo != "Control de rutina" {
		t.Errorf("Motivo = %q, esperaba 'Control de rutina'", got.Motivo)
	}
}

// TestAgendarTurno_FechaPasadaFalla — pedido explícito del cliente
// (2026-08-23): no se puede confirmar un turno pendiente con horario pasado.
func TestAgendarTurno_FechaPasadaFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "pasado2@example.com")
	pendiente := crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)

	pasado := time.Now().Add(-time.Hour)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/agendar", reg.Token, agendarTurnoRequest{
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     pasado.Format(time.RFC3339),
		HoraFin:        pasado.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestAgendarTurno_YaAgendadoFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "agendar2@example.com")
	pendiente := crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)

	inicio := time.Date(2026, 9, 1, 11, 0, 0, 0, time.UTC)
	body := agendarTurnoRequest{
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	}
	doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/agendar", reg.Token, body)

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/agendar", reg.Token, body)
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusConflict)
	}
}

func TestAgendarTurno_NoExisteFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "agendar3@example.com")

	inicio := time.Date(2026, 9, 1, 11, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/00000000-0000-0000-0000-000000000000/agendar", reg.Token, agendarTurnoRequest{
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestAgendarTurno_DeOtroProfesionalFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	dueño, _ := profesionalConTipoConsulta(t, gdb, router, "agendar4a@example.com")
	otro, tipoConsultaIDOtro := profesionalConTipoConsulta(t, gdb, router, "agendar4b@example.com")
	pendiente := crearTurnoPendienteDePrueba(t, gdb, dueño.Profesional.ID)

	inicio := time.Date(2026, 9, 1, 11, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/agendar", otro.Token, agendarTurnoRequest{
		TipoConsultaID: tipoConsultaIDOtro,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d (no debe poder agendar un turno ajeno)", rec.Code, http.StatusNotFound)
	}
}

func TestAgendarTurno_SolapamientoFallaControlado(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "agendar5@example.com")

	inicio := time.Date(2026, 9, 1, 11, 0, 0, 0, time.UTC)
	doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})

	pendiente := crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/agendar", reg.Token, agendarTurnoRequest{
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Add(10 * time.Minute).Format(time.RFC3339),
		HoraFin:        inicio.Add(40 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d (T2.5)", rec.Code, http.StatusConflict)
	}
}

func TestResumenPanel_CuentaPendientesYConfirmados(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resumen1@example.com")

	crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)
	crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)

	inicio := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.TurnosPendientes != 2 {
		t.Errorf("TurnosPendientes = %d, esperaba 2", got.TurnosPendientes)
	}
	if got.TurnosConfirmados != 1 {
		t.Errorf("TurnosConfirmados = %d, esperaba 1", got.TurnosConfirmados)
	}
}

// TestResumenPanel_NoCuentaTurnosResueltosComoConfirmados — pedido
// explícito del cliente (2026-08-23): la tarjeta pasa a leerse "Turnos
// próximos", así que un turno `agendado` que ya pasó no debería contar.
func TestResumenPanel_NoCuentaTurnosResueltosComoConfirmados(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resumen2@example.com")

	crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-48*time.Hour))

	futuro := time.Now().Add(48 * time.Hour)
	doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoConsultaID, HoraInicio: futuro.Format(time.RFC3339), HoraFin: futuro.Add(30 * time.Minute).Format(time.RFC3339),
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.TurnosConfirmados != 1 {
		t.Errorf("TurnosConfirmados = %d, esperaba 1 (solo el futuro, no el resuelto)", got.TurnosConfirmados)
	}
}

func TestAgendarTurno_SubjectNoEsUUID(t *testing.T) {
	router := newTestRouter(t)

	claims := auth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "no-es-un-uuid",
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte("un-secret-de-test"))
	if err != nil {
		t.Fatalf("no se pudo firmar el token de prueba: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos", signed, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListTurnos_BuscaPorNombreDNIOEmail(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "buscarturno1@example.com")
	crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID) // Bruno Iglesias, DNI 30111222

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?q=30111222", reg.Token, nil)
	var got []turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 || got[0].DNIContacto != "30111222" {
		t.Errorf("got = %+v, esperaba encontrar el turno por DNI", got)
	}

	rec2 := doJSONAuth(t, router, http.MethodGet, "/turnos?q=noexiste", reg.Token, nil)
	var got2 []turnoResponse
	_ = json.Unmarshal(rec2.Body.Bytes(), &got2)
	if len(got2) != 0 {
		t.Errorf("got2 = %+v, esperaba 0 resultados", got2)
	}
}

func TestCancelarTurno_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "cancelar1@example.com")
	pendiente := crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/cancelar", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Estado != "cancelada" {
		t.Errorf("Estado = %q, esperaba cancelada", got.Estado)
	}
}

func TestCancelarTurno_EsIdempotente(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "cancelar2@example.com")
	pendiente := crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)

	doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/cancelar", reg.Token, nil)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/cancelar", reg.Token, nil)

	if rec.Code != http.StatusOK {
		t.Errorf("cancelar dos veces no debería fallar: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestCancelarTurno_DeOtroProfesionalFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	dueño, _ := profesionalConTipoConsulta(t, gdb, router, "cancelar3a@example.com")
	otro, _ := profesionalConTipoConsulta(t, gdb, router, "cancelar3b@example.com")
	pendiente := crearTurnoPendienteDePrueba(t, gdb, dueño.Profesional.ID)

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/cancelar", otro.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestEditarTurno_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "editar1@example.com")
	pendiente := crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String(), reg.Token, editarTurnoRequest{
		NombreContacto: "Bruno", ApellidoContacto: "Iglesias Editado", DNIContacto: "30111222",
		TelefonoContacto: "+5493511230000", EmailContacto: "nuevo@example.com", Motivo: "Motivo editado",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.ApellidoContacto != "Iglesias Editado" {
		t.Errorf("ApellidoContacto = %q, esperaba 'Iglesias Editado'", got.ApellidoContacto)
	}
	if got.Motivo != "Motivo editado" {
		t.Errorf("Motivo = %q, esperaba 'Motivo editado'", got.Motivo)
	}
}

func TestEditarTurno_CamposObligatoriosFaltantes(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "editar2@example.com")
	pendiente := crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String(), reg.Token, editarTurnoRequest{
		NombreContacto: "", ApellidoContacto: "Iglesias", DNIContacto: "1", TelefonoContacto: "1",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestEditarTurno_NoExisteFalla(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: "editar3@example.com", Password: "password123", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/00000000-0000-0000-0000-000000000000", reg.Token, editarTurnoRequest{
		NombreContacto: "A", ApellidoContacto: "B", DNIContacto: "1", TelefonoContacto: "1",
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

// TestEditarTurno_TurnoAgendadoFalla — ajuste 2026-08-23: un turno ya
// `agendado` solo se reprograma por hora (PATCH /turnos/{id}/hora), nunca
// edita sus datos de contacto por este endpoint.
func TestEditarTurno_TurnoAgendadoFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "editar4@example.com")

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoConsultaID, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	var turnoCreado turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &turnoCreado)

	recEditar := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoCreado.ID, reg.Token, editarTurnoRequest{
		NombreContacto: "Julián", ApellidoContacto: "Otro apellido", DNIContacto: "1", TelefonoContacto: "1",
	})
	if recEditar.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d", recEditar.Code, http.StatusConflict)
	}
}

func TestReprogramarTurno_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "reprog1@example.com")

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoConsultaID, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	var turnoCreado turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &turnoCreado)

	nuevaHora := inicio.Add(2 * time.Hour)
	recHora := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoCreado.ID+"/hora", reg.Token, reprogramarTurnoRequest{
		HoraInicio: nuevaHora.Format(time.RFC3339),
		HoraFin:    nuevaHora.Add(30 * time.Minute).Format(time.RFC3339),
		Motivo:     "Motivo corregido",
	})
	if recHora.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", recHora.Code, http.StatusOK, recHora.Body.String())
	}
	var got turnoResponse
	_ = json.Unmarshal(recHora.Body.Bytes(), &got)
	if got.HoraInicio == nil || *got.HoraInicio != nuevaHora.Format(time.RFC3339) {
		t.Errorf("HoraInicio = %v, esperaba %q", got.HoraInicio, nuevaHora.Format(time.RFC3339))
	}
	if got.Motivo != "Motivo corregido" {
		t.Errorf("Motivo = %q, esperaba 'Motivo corregido'", got.Motivo)
	}
	// El resto de los datos de contacto no debería tocarse.
	if got.NombreContacto != "Julián" || got.ApellidoContacto != "Ortiz" {
		t.Errorf("los datos de contacto no deberían cambiar: got=%+v", got)
	}
}

func TestReprogramarTurno_PendienteFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "reprog2@example.com")
	pendiente := crearTurnoPendienteDePrueba(t, gdb, reg.Profesional.ID)

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+pendiente.ID.String()+"/hora", reg.Token, reprogramarTurnoRequest{
		HoraInicio: inicio.Format(time.RFC3339),
		HoraFin:    inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d (solo se reprograma un turno ya agendado)", rec.Code, http.StatusConflict)
	}
}

// TestReprogramarTurno_MoverAFechaPasadaFalla — pedido explícito del
// cliente (2026-08-23): no se puede mover un turno confirmado a una fecha
// que ya pasó.
func TestReprogramarTurno_MoverAFechaPasadaFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "reprogpasado1@example.com")

	futuro := time.Now().Add(72 * time.Hour)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoConsultaID, HoraInicio: futuro.Format(time.RFC3339), HoraFin: futuro.Add(30 * time.Minute).Format(time.RFC3339),
	})
	var turnoCreado turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &turnoCreado)

	pasado := time.Now().Add(-time.Hour)
	recHora := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoCreado.ID+"/hora", reg.Token, reprogramarTurnoRequest{
		HoraInicio: pasado.Format(time.RFC3339),
		HoraFin:    pasado.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if recHora.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", recHora.Code, http.StatusBadRequest)
	}
}

// TestReprogramarTurno_MotivoDeUnResueltoSinCambiarHorario — un turno ya
// `resuelto` (hora de fin pasada) tiene que poder corregir su motivo sin
// que la validación de "no fecha pasada" lo bloquee, porque su horario no
// cambió — sino un turno resuelto quedaría imposible de tocar nunca más.
func TestReprogramarTurno_MotivoDeUnResueltoSinCambiarHorario(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "reprogpasado2@example.com")

	pasado := time.Now().Add(-72 * time.Hour)
	resuelto := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, pasado)

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+resuelto.ID.String()+"/hora", reg.Token, reprogramarTurnoRequest{
		HoraInicio: pasado.Format(time.RFC3339),
		HoraFin:    pasado.Add(30 * time.Minute).Format(time.RFC3339),
		Motivo:     "Motivo corregido después de la consulta",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d (mismo horario, no debería rechazarse). body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Motivo != "Motivo corregido después de la consulta" {
		t.Errorf("Motivo = %q, esperaba el motivo corregido", got.Motivo)
	}
}

func TestReprogramarTurno_SolapamientoFallaControlado(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "reprog3@example.com")

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	crear := func(i time.Time) turnoResponse {
		rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
			NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
			TipoConsultaID: tipoConsultaID, HoraInicio: i.Format(time.RFC3339), HoraFin: i.Add(30 * time.Minute).Format(time.RFC3339),
		})
		var t2 turnoResponse
		_ = json.Unmarshal(rec.Body.Bytes(), &t2)
		return t2
	}
	crear(inicio)
	segundo := crear(inicio.Add(time.Hour))

	// Reprograma el segundo turno para que se solape con el primero.
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+segundo.ID+"/hora", reg.Token, reprogramarTurnoRequest{
		HoraInicio: inicio.Add(10 * time.Minute).Format(time.RFC3339),
		HoraFin:    inicio.Add(40 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d (T2.5)", rec.Code, http.StatusConflict)
	}
}

func TestReprogramarTurno_NoExisteFalla(t *testing.T) {
	router := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, router, registerRequest{
		Nombre: "María Games", Email: "reprog4@example.com", Password: "password123", NombreClinica: "Clínica",
	})

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/00000000-0000-0000-0000-000000000000/hora", reg.Token, reprogramarTurnoRequest{
		HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

// TestCrearTurnoManual_PacienteConocidoVinculaSinDuplicar — camino
// "paciente conocido" del modal (pedido 2026-08-23): agendar un turno
// nuevo para alguien ya atendido, sin crear una segunda fila en Pacientes.
func TestCrearTurnoManual_PacienteConocidoVinculaSinDuplicar(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "conocido1@example.com")

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	rec1 := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "30222333", TelefonoContacto: "+549",
		TipoConsultaID: tipoConsultaID, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	var primero turnoResponse
	_ = json.Unmarshal(rec1.Body.Bytes(), &primero)

	segunda := inicio.Add(48 * time.Hour)
	rec2 := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "30222333", TelefonoContacto: "+549",
		TipoConsultaID: tipoConsultaID, HoraInicio: segunda.Format(time.RFC3339), HoraFin: segunda.Add(30 * time.Minute).Format(time.RFC3339),
		PacienteID: *primero.PacienteID,
	})
	if rec2.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec2.Code, http.StatusCreated, rec2.Body.String())
	}
	var segundo turnoResponse
	_ = json.Unmarshal(rec2.Body.Bytes(), &segundo)
	if segundo.PacienteID == nil || *segundo.PacienteID != *primero.PacienteID {
		t.Errorf("PacienteID = %v, esperaba que se vincule al mismo paciente %q", segundo.PacienteID, *primero.PacienteID)
	}

	var count int64
	gdb.Model(&db.Paciente{}).Where("dni = ?", "30222333").Count(&count)
	if count != 1 {
		t.Errorf("count de pacientes con ese DNI = %d, esperaba 1 (no duplicar)", count)
	}
}

func TestCrearTurnoManual_PacienteConocidoDeOtroProfesionalFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	dueño, tipoDueño := profesionalConTipoConsulta(t, gdb, router, "conocido2a@example.com")
	otro, tipoOtro := profesionalConTipoConsulta(t, gdb, router, "conocido2b@example.com")

	inicio := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	rec1 := doJSONAuth(t, router, http.MethodPost, "/turnos", dueño.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoDueño, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	var primero turnoResponse
	_ = json.Unmarshal(rec1.Body.Bytes(), &primero)

	rec2 := doJSONAuth(t, router, http.MethodPost, "/turnos", otro.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoOtro, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
		PacienteID: *primero.PacienteID,
	})
	if rec2.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d (no debe poder vincular un paciente ajeno)", rec2.Code, http.StatusBadRequest)
	}
}
