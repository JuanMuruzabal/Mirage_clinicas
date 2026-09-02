package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// tipoConsultaIDDePrueba registra un profesional y devuelve su token junto
// con el id de su tipo de consulta "Consulta general" (sembrado en el
// registro, TR-001).
func profesionalConTipoConsulta(t *testing.T, gdb *gorm.DB, router http.Handler, email string) (clinicaDePruebaResult, string) {
	t.Helper()
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: email, Password: "password123456", NombreClinica: "Clínica " + email,
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

// crearTurnoAgendadoConContactoDePrueba — TR-104: reemplaza a la vieja
// crearTurnoPendienteDePrueba (el estado `pendiente` se sacó del todo, ver
// tradeoffs.md) para los tests que necesitan un turno con datos de
// contacto CONOCIDOS (Bruno Iglesias, DNI 30111222) — a diferencia de
// crearTurnoAgendadoDePrueba (turnos_test.go original, contacto genérico
// "P"/"Q"), que alcanza cuando el test no busca por esos datos.
func crearTurnoAgendadoConContactoDePrueba(t *testing.T, gdb *gorm.DB, profesionalID, tipoConsultaID string, inicio time.Time) db.Turno {
	t.Helper()
	pid, err := uuid.Parse(profesionalID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	tid, err := uuid.Parse(tipoConsultaID)
	if err != nil {
		t.Fatalf("tipoConsultaID inválido: %v", err)
	}
	inicio = inicio.Truncate(time.Second)
	fin := inicio.Add(30 * time.Minute)
	turno := db.Turno{
		ProfesionalID:    pid,
		Estado:           "agendado",
		TipoConsultaID:   &tid,
		HoraInicio:       &inicio,
		HoraFin:          &fin,
		NombreContacto:   "Bruno",
		ApellidoContacto: "Iglesias",
		DNIContacto:      "30111222",
		TelefonoContacto: "+5493511234567",
		EmailContacto:    "bruno@example.com",
		Motivo:           "Dolor de muela",
		Origen:           "manual",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno agendado de prueba: %v", err)
	}
	return turno
}

func TestTurnos_RequierenAutenticacion(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	for _, req := range []*http.Request{
		httptest.NewRequest(http.MethodGet, "/turnos", nil),
		httptest.NewRequest(http.MethodPost, "/turnos", nil),
		httptest.NewRequest(http.MethodPatch, "/turnos/00000000-0000-0000-0000-000000000000/cancelar", nil),
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
	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "list1@example.com")
	crearTurnoAgendadoConContactoDePrueba(t, gdb, reg.Profesional.ID, tipoID, inicio)

	otro, tipoOtro := profesionalConTipoConsulta(t, gdb, router, "list2@example.com")
	crearTurnoAgendadoConContactoDePrueba(t, gdb, otro.Profesional.ID, tipoOtro, inicio)

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?estado=agendado", reg.Token, nil)
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

	base := time.Date(2030, 9, 1, 9, 0, 0, 0, time.UTC)
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
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "resuelto2@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?resuelto=quizas", reg.Token, nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

// TestListTurnos_FiltraPorTipoConsulta — corrección de QA (Extra 2.3.3):
// "faltó el filtro de tipo de consulta" en la vista Turnos. Mismo criterio
// que TestListTurnos_FiltraPorEstadoYEsPorProfesional: dos turnos del
// mismo profesional, cada uno con un tipo de consulta distinto, filtrar
// por uno de los dos ids trae solo ese turno.
func TestListTurnos_FiltraPorTipoConsulta(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoGeneralID := profesionalConTipoConsulta(t, gdb, router, "tipofiltro@example.com")

	profesionalID, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	tipoUrgencia := db.TipoConsulta{ProfesionalID: profesionalID, Nombre: "Urgencia", Color: "#D6563A", DuracionMinutos: 30}
	if err := gdb.Create(&tipoUrgencia).Error; err != nil {
		t.Fatalf("no se pudo crear el segundo tipo de consulta: %v", err)
	}

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "General", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoGeneralID, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	inicioUrgencia := inicio.Add(2 * time.Hour)
	doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Urgente", ApellidoContacto: "Q", DNIContacto: "2", TelefonoContacto: "2",
		TipoConsultaID: tipoUrgencia.ID.String(), HoraInicio: inicioUrgencia.Format(time.RFC3339), HoraFin: inicioUrgencia.Add(30 * time.Minute).Format(time.RFC3339),
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?tipoConsultaId="+tipoUrgencia.ID.String(), reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got []turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 {
		t.Fatalf("len(got) = %d, esperaba 1 (solo el turno de Urgencia)", len(got))
	}
	if got[0].NombreContacto != "Urgente" {
		t.Errorf("NombreContacto = %q, esperaba Urgente", got[0].NombreContacto)
	}
}

func TestListTurnos_TipoConsultaInvalidoFalla(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "tipofiltroinvalido@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?tipoConsultaId=no-es-un-uuid", reg.Token, nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestCrearTurnoManual_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "manual1@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
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

// TestCrearTurnoManual_IgnoraDatosDelFormularioSiElDNIYaExiste — corrección
// de bug reportado por el cliente: "si genero un turno, modificando el
// nombre apellido o algunos de estos datos, el turno se me va a generar
// con ese nuevo nombre o datos cambiados, pero asignado al paciente con el
// dni puesto... sin importar lo que pongan en el formulario, si el DNI ya
// existe... los datos que mostrará en el calendario son los datos del
// paciente que hay en el sistema y no los del formulario". "Paciente
// nuevo" con un DNI ya cargado no debe poder disfrazarse de otra persona.
func TestCrearTurnoManual_IgnoraDatosDelFormularioSiElDNIYaExiste(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "manual-dni-existente@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "30222333", TelefonoContacto: "+5493511111111",
		EmailContacto:  "julian@example.com",
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})

	// Segundo turno, mismo DNI pero con nombre/teléfono/email DISTINTOS.
	otroInicio := inicio.Add(time.Hour)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Otro", ApellidoContacto: "Apellido", DNIContacto: "30222333", TelefonoContacto: "+5493519999999",
		EmailContacto:  "otro@example.com",
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     otroInicio.Format(time.RFC3339),
		HoraFin:        otroInicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var got turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.NombreContacto != "Julián" || got.ApellidoContacto != "Ortiz" {
		t.Errorf("nombreContacto/apellidoContacto = %q/%q, esperaba Julián/Ortiz (datos reales del paciente existente)", got.NombreContacto, got.ApellidoContacto)
	}
	if got.TelefonoContacto != "+5493511111111" {
		t.Errorf("telefonoContacto = %q, esperaba el teléfono real del paciente, no el tipeado en el segundo turno", got.TelefonoContacto)
	}
	if got.EmailContacto != "julian@example.com" {
		t.Errorf("emailContacto = %q, esperaba el email real del paciente, no el tipeado en el segundo turno", got.EmailContacto)
	}

	var count int64
	gdb.Model(&db.Paciente{}).Where("dni = ?", "30222333").Count(&count)
	if count != 1 {
		t.Errorf("count de pacientes con ese DNI = %d, esperaba 1 (sin duplicar)", count)
	}
}

func TestCrearTurnoManual_CamposObligatoriosFaltantes(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "manual2@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
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

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
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

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
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

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
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
	if got.TotalConfirmados != 1 {
		t.Errorf("TotalConfirmados = %d, esperaba 1 (solo el futuro, no el resuelto)", got.TotalConfirmados)
	}
}

// TestResumenPanel_TurnosHoyYProximos — F2.3 extra ítem 1: "turnos de
// hoy" y "turnos próximos" son listas separadas y mutuamente excluyentes
// (un turno de hoy nunca aparece en "próximos", ver el brief en
// docs/fase2.3-extra-dental-mirage.md). `clock.Now().Add(1*time.Minute)`
// (no una hora fija del día): garantiza que el turno todavía NO está
// resuelto sea cual sea la hora real a la que corra el test — corrección
// de QA posterior ("turnos de hoy no muestra turnos resueltos") excluye
// los ya resueltos de esta lista, así que un horario fijo como "hoy a las
// 10" sería flaky corriendo el test de tarde.
func TestResumenPanel_TurnosHoyYProximos(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resumen3@example.com")

	hoyTurno := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, clock.Now().Add(1*time.Minute))
	mananaTurno := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, clock.Today().AddDate(0, 0, 1).Add(10*time.Hour))

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	if len(got.TurnosHoy) != 1 || got.TurnosHoy[0].ID != hoyTurno.ID.String() {
		t.Errorf("TurnosHoy = %+v, esperaba solo el turno de hoy (%s)", got.TurnosHoy, hoyTurno.ID)
	}
	if got.TurnosHoy[0].Nombre != "P Q" {
		t.Errorf("TurnosHoy[0].Nombre = %q, esperaba \"P Q\"", got.TurnosHoy[0].Nombre)
	}
	// horaFin (corrección de QA: "agregar de que hora a que hora") —
	// crearTurnoAgendadoDePrueba arma un turno de 30 minutos.
	horaFinEsperada := clock.In(*hoyTurno.HoraFin).Format("15:04")
	if got.TurnosHoy[0].HoraFin != horaFinEsperada {
		t.Errorf("TurnosHoy[0].HoraFin = %q, esperaba %q", got.TurnosHoy[0].HoraFin, horaFinEsperada)
	}
	if len(got.TurnosProximos) != 1 || got.TurnosProximos[0].ID != mananaTurno.ID.String() {
		t.Errorf("TurnosProximos = %+v, esperaba solo el turno de mañana (%s)", got.TurnosProximos, mananaTurno.ID)
	}
}

// TestResumenPanel_TurnosProximos_NoIncluyeMasAlladeManana — corrección
// de QA, 2026-09-08: "turnos próximos solo me mostrará los turnos de
// mañana" — antes esta lista traía cualquier turno futuro sin techo
// (semanas hacia adelante); ahora se acota estrictamente al día
// siguiente, un turno de pasado mañana no debe aparecer.
func TestResumenPanel_TurnosProximos_NoIncluyeMasAlladeManana(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resumen3c@example.com")

	mananaTurno := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, clock.Today().AddDate(0, 0, 1).Add(10*time.Hour))
	crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, clock.Today().AddDate(0, 0, 2).Add(10*time.Hour))

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	if len(got.TurnosProximos) != 1 || got.TurnosProximos[0].ID != mananaTurno.ID.String() {
		t.Errorf("TurnosProximos = %+v, esperaba solo el de mañana (%s), sin el de pasado mañana", got.TurnosProximos, mananaTurno.ID)
	}
}

// TestResumenPanel_TurnosHoy_NoIncluyeResueltos — corrección de QA
// (2026-09-06): "turnos de hoy no muestra turnos resueltos" — un turno de
// hoy cuya hora de fin ya pasó vive únicamente en la tarjeta "Turnos
// resueltos", no acá.
func TestResumenPanel_TurnosHoy_NoIncluyeResueltos(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resumen3b@example.com")

	crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-1*time.Hour))

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	if len(got.TurnosHoy) != 0 {
		t.Errorf("TurnosHoy = %+v, esperaba vacío (el turno ya está resuelto)", got.TurnosHoy)
	}
}

// TestResumenPanel_TurnosResueltos — un turno `agendado` cuya hora de fin
// ya pasó, y todavía sin asistencia marcada, aparece en la lista.
func TestResumenPanel_TurnosResueltos(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resumen4@example.com")

	resuelto := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-3*time.Hour))

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	if len(got.TurnosResueltos) != 1 || got.TurnosResueltos[0].ID != resuelto.ID.String() {
		t.Errorf("TurnosResueltos = %+v, esperaba solo el turno resuelto (%s)", got.TurnosResueltos, resuelto.ID)
	}
}

// TestResumenPanel_TurnosResueltos_NoIncluyeYaMarcados — corrección de QA
// (2026-09-06): "una vez que esté marcado como asistido y ausente debe
// dejar de aparecer en la tarjeta" — esta lista es "todavía falta
// marcar", no el historial completo de resueltos.
func TestResumenPanel_TurnosResueltos_NoIncluyeYaMarcados(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resumen4b@example.com")

	yaMarcado := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-3*time.Hour))
	asistio := "asistio"
	if err := gdb.Model(&db.Turno{}).Where("id = ?", yaMarcado.ID).Update("asistencia", &asistio).Error; err != nil {
		t.Fatalf("no se pudo marcar la asistencia de prueba: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	if len(got.TurnosResueltos) != 0 {
		t.Errorf("TurnosResueltos = %+v, esperaba vacío (el turno ya tiene asistencia marcada)", got.TurnosResueltos)
	}
	if got.TurnosAsistidos != 1 {
		t.Errorf("TurnosAsistidos = %d, esperaba 1", got.TurnosAsistidos)
	}
}

// TestResumenPanel_Estadistica — tarjeta "Estadística" (F2.3 extra ítem
// 1, corrección de QA 2026-09-06): cuenta el total histórico de
// asistidos/ausentes, sin acotar por fecha.
func TestResumenPanel_Estadistica(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resumen6@example.com")

	asistio1 := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-3*time.Hour))
	asistio2 := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-96*time.Hour))
	ausente := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-5*time.Hour))

	valorAsistio, valorAusente := "asistio", "ausente"
	for _, m := range []struct {
		id    string
		valor *string
	}{
		{asistio1.ID.String(), &valorAsistio},
		{asistio2.ID.String(), &valorAsistio},
		{ausente.ID.String(), &valorAusente},
	} {
		if err := gdb.Model(&db.Turno{}).Where("id = ?", m.id).Update("asistencia", m.valor).Error; err != nil {
			t.Fatalf("no se pudo marcar la asistencia de prueba: %v", err)
		}
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	if got.TurnosAsistidos != 2 {
		t.Errorf("TurnosAsistidos = %d, esperaba 2", got.TurnosAsistidos)
	}
	if got.TurnosAusentes != 1 {
		t.Errorf("TurnosAusentes = %d, esperaba 1", got.TurnosAusentes)
	}
}

// TestResumenPanel_HorariosReservados — específico y general aparecen los
// dos, cada uno con una fecha concreta (la propia en el específico, la
// próxima ocurrencia del día de semana en el general — no hay una sola
// fecha real en la base para una regla que se repite).
func TestResumenPanel_HorariosReservados(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "resumen5@example.com")
	clinicID, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}

	fechaEspecifica := clock.Today().AddDate(0, 0, 3)
	motivo := "Limpieza"
	especifico := db.BloqueoHorario{
		ClinicID:   clinicID,
		Especifico: true,
		Fecha:      &fechaEspecifica,
		HoraDesde:  "08:00",
		HoraHasta:  "09:00",
		TipoRegla:  "bloquear_horario",
		Motivo:     &motivo,
	}
	if err := gdb.Create(&especifico).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo específico de prueba: %v", err)
	}

	// General: hoy + 30 días de ventana, un día de semana fijo — sea cual
	// sea "hoy" al correr el test, la próxima ocurrencia cae dentro de esa
	// ventana (a lo sumo 6 días después).
	fechaDesde := clock.Today()
	fechaHasta := clock.Today().AddDate(0, 0, 30)
	diaSemana := 3
	alcance := "mes"
	general := db.BloqueoHorario{
		ClinicID:   clinicID,
		Especifico: false,
		Alcance:    &alcance,
		DiaSemana:  &diaSemana,
		FechaDesde: &fechaDesde,
		FechaHasta: &fechaHasta,
		HoraDesde:  "07:00",
		HoraHasta:  "08:00",
		TipoRegla:  "bloquear_horario",
	}
	if err := gdb.Create(&general).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo general de prueba: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	if len(got.HorariosReservados) != 2 {
		t.Fatalf("HorariosReservados = %+v, esperaba 2", got.HorariosReservados)
	}
	var vistoEspecifico, vistoGeneral bool
	for _, h := range got.HorariosReservados {
		if h.ID == especifico.ID.String() {
			vistoEspecifico = true
			if h.Fecha != fechaEspecifica.Format("2006-01-02") {
				t.Errorf("fecha del específico = %q, esperaba %q", h.Fecha, fechaEspecifica.Format("2006-01-02"))
			}
			// EtiquetaGeneral (corrección de QA, 2026-09-08): un específico
			// tiene una fecha real, no hay nada que aclarar — nil.
			if h.EtiquetaGeneral != nil {
				t.Errorf("EtiquetaGeneral del específico = %q, esperaba nil", *h.EtiquetaGeneral)
			}
		}
		if h.ID == general.ID.String() {
			vistoGeneral = true
			fechaCalculada, err := time.Parse("2006-01-02", h.Fecha)
			if err != nil {
				t.Fatalf("fecha del general no parseable: %v", err)
			}
			if int(fechaCalculada.Weekday()) != diaSemana {
				t.Errorf("día de semana calculado = %d, esperaba %d", int(fechaCalculada.Weekday()), diaSemana)
			}
			// alcance "mes" (Este mes) → sin nombrar el mes, se da por
			// sobreentendido.
			if h.EtiquetaGeneral == nil || *h.EtiquetaGeneral != "Todos los mié" {
				t.Errorf("EtiquetaGeneral del general (alcance mes) = %v, esperaba %q", h.EtiquetaGeneral, "Todos los mié")
			}
		}
	}
	if !vistoEspecifico || !vistoGeneral {
		t.Errorf("esperaba ver tanto el bloqueo específico como el general, vistoEspecifico=%v vistoGeneral=%v", vistoEspecifico, vistoGeneral)
	}
}

// TestResumenPanel_EtiquetaGeneralSegunAlcance — corrección de QA,
// 2026-09-08: "si hace referencia a un horario reservado general y está
// configurado para este mes poner TODOS LOS MIE... si está para el
// próximo mes TODOS LOS MIE DE (MES)... si está para todos los meses
// TODOS LOS MIE DE ESTE AÑO" — un caso por Alcance, aparte del ya
// cubierto (mes) en TestResumenPanel_HorariosReservados.
func TestResumenPanel_EtiquetaGeneralSegunAlcance(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "resumen-etiqueta@example.com")
	clinicID, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}

	diaSemana := 3 // miércoles
	proximoMesEsperado := nombresMes[int(startOfMonth(clock.Today()).AddDate(0, 1, 0).Month())-1]

	casos := []struct {
		alcance  string
		esperado string
	}{
		{db.BloqueoAlcanceProximoMes, "Todos los mié de " + proximoMesEsperado},
		{db.BloqueoAlcanceTodos, "Todos los mié de este año"},
	}

	for _, c := range casos {
		alcance := c.alcance
		bloqueo := db.BloqueoHorario{
			ClinicID:   clinicID,
			Especifico: false,
			Alcance:    &alcance,
			DiaSemana:  &diaSemana,
			HoraDesde:  "07:00",
			HoraHasta:  "08:00",
			TipoRegla:  "bloquear_horario",
		}
		if err := gdb.Create(&bloqueo).Error; err != nil {
			t.Fatalf("no se pudo crear el bloqueo de prueba (alcance %q): %v", c.alcance, err)
		}

		rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
		var got resumenPanelResponse
		_ = json.Unmarshal(rec.Body.Bytes(), &got)

		var visto bool
		for _, h := range got.HorariosReservados {
			if h.ID != bloqueo.ID.String() {
				continue
			}
			visto = true
			if h.EtiquetaGeneral == nil || *h.EtiquetaGeneral != c.esperado {
				t.Errorf("alcance %q: EtiquetaGeneral = %v, esperaba %q", c.alcance, h.EtiquetaGeneral, c.esperado)
			}
		}
		if !visto {
			t.Fatalf("alcance %q: no apareció en HorariosReservados = %+v", c.alcance, got.HorariosReservados)
		}

		if err := gdb.Delete(&bloqueo).Error; err != nil {
			t.Fatalf("no se pudo borrar el bloqueo de prueba (alcance %q): %v", c.alcance, err)
		}
	}
}

func TestListTurnos_TokenBasuraEsRechazado(t *testing.T) {
	router, _ := newTestRouter(t)

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos", "esto-no-es-un-token-de-sesion-valido", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListTurnos_BuscaPorNombreDNIOEmail(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "buscarturno1@example.com")
	crearTurnoAgendadoConContactoDePrueba(t, gdb, reg.Profesional.ID, tipoID, time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)) // Bruno Iglesias, DNI 30111222

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
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "cancelar1@example.com")
	turno := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC))

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turno.ID.String()+"/cancelar", reg.Token, nil)
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
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "cancelar2@example.com")
	turno := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC))

	doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turno.ID.String()+"/cancelar", reg.Token, nil)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turno.ID.String()+"/cancelar", reg.Token, nil)

	if rec.Code != http.StatusOK {
		t.Errorf("cancelar dos veces no debería fallar: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestCancelarTurno_DeOtroProfesionalFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	dueño, tipoDueño := profesionalConTipoConsulta(t, gdb, router, "cancelar3a@example.com")
	otro, _ := profesionalConTipoConsulta(t, gdb, router, "cancelar3b@example.com")
	turno := crearTurnoAgendadoDePrueba(t, gdb, dueño.Profesional.ID, tipoDueño, time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC))

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turno.ID.String()+"/cancelar", otro.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestReprogramarTurno_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "reprog1@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
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

// TestReprogramarTurno_CanceladaFalla — solo se reprograma un turno ya
// `agendado`; uno `cancelada` (el único otro estado posible desde TR-104)
// no admite reprogramarse.
func TestReprogramarTurno_CanceladaFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "reprog2@example.com")
	turno := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC))
	doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turno.ID.String()+"/cancelar", reg.Token, nil)

	inicio := time.Date(2030, 9, 1, 11, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turno.ID.String()+"/hora", reg.Token, reprogramarTurnoRequest{
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

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
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
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "reprog4@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
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

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
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

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
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

// TestMarcarAsistencia_EnTurnoResueltoExitoso — pedido explícito del
// cliente (2026-09-04): "los turnos resueltos ahora tienen la opción...
// de marcar asistidos o ausente, cosa de poder guardar ese dato".
func TestMarcarAsistencia_EnTurnoResueltoExitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "asistencia1@example.com")
	resuelto := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-72*time.Hour))

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+resuelto.ID.String()+"/asistencia", reg.Token, marcarAsistenciaRequest{
		Asistencia: "asistio",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Asistencia == nil || *got.Asistencia != "asistio" {
		t.Errorf("asistencia = %v, esperaba \"asistio\"", got.Asistencia)
	}
}

// TestMarcarAsistencia_EsIrreversible — pedido explícito del cliente
// (2026-09-04, textual): "me debe aparecer un aviso que la elección es
// irreversible y confirmar esto" — el aviso del frontend solo tiene
// sentido si el backend de verdad lo hace cumplir: una vez marcada, ni
// cambiar de valor ni volver a mandar el mismo.
func TestMarcarAsistencia_EsIrreversible(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "asistencia2@example.com")
	resuelto := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-72*time.Hour))
	ruta := "/turnos/" + resuelto.ID.String() + "/asistencia"

	primera := doJSONAuth(t, router, http.MethodPatch, ruta, reg.Token, marcarAsistenciaRequest{Asistencia: "asistio"})
	if primera.Code != http.StatusOK {
		t.Fatalf("primera marca: status = %d, esperaba %d. body=%s", primera.Code, http.StatusOK, primera.Body.String())
	}

	// Intentar cambiarla a "ausente" — rechazado.
	cambio := doJSONAuth(t, router, http.MethodPatch, ruta, reg.Token, marcarAsistenciaRequest{Asistencia: "ausente"})
	if cambio.Code != http.StatusConflict {
		t.Errorf("cambiar de valor: status = %d, esperaba %d", cambio.Code, http.StatusConflict)
	}

	// Volver a mandar el mismo valor — también rechazado, no es idempotente.
	repetida := doJSONAuth(t, router, http.MethodPatch, ruta, reg.Token, marcarAsistenciaRequest{Asistencia: "asistio"})
	if repetida.Code != http.StatusConflict {
		t.Errorf("repetir el mismo valor: status = %d, esperaba %d", repetida.Code, http.StatusConflict)
	}

	// El valor original sigue intacto pase lo que pase.
	var turno db.Turno
	if err := gdb.First(&turno, "id = ?", resuelto.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno: %v", err)
	}
	if turno.Asistencia == nil || *turno.Asistencia != "asistio" {
		t.Errorf("asistencia en la base = %v, esperaba que siguiera en \"asistio\"", turno.Asistencia)
	}
}

// TestMarcarAsistencia_ValorInvalidoFalla — solo "asistio"/"ausente"; ""
// ya no es un valor válido (no hay forma de deshacer, ver el test de
// irreversibilidad de arriba).
func TestMarcarAsistencia_ValorInvalidoFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "asistencia3@example.com")
	resuelto := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-72*time.Hour))

	for nombre, valor := range map[string]string{"valor arbitrario": "tal-vez", "vacío": ""} {
		t.Run(nombre, func(t *testing.T) {
			rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+resuelto.ID.String()+"/asistencia", reg.Token, marcarAsistenciaRequest{
				Asistencia: valor,
			})
			if rec.Code != http.StatusBadRequest {
				t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
			}
		})
	}
}

// TestMarcarAsistencia_TurnoTodaviaNoResueltoFalla — "los turnos
// resueltos ahora tienen la opción" (no uno que todavía no pasó).
func TestMarcarAsistencia_TurnoTodaviaNoResueltoFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "asistencia4@example.com")

	futuro := time.Now().Add(72 * time.Hour)
	rec1 := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipoConsultaID, HoraInicio: futuro.Format(time.RFC3339), HoraFin: futuro.Add(30 * time.Minute).Format(time.RFC3339),
	})
	var creado turnoResponse
	_ = json.Unmarshal(rec1.Body.Bytes(), &creado)

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+creado.ID+"/asistencia", reg.Token, marcarAsistenciaRequest{
		Asistencia: "asistio",
	})
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusConflict)
	}
}

// TestMarcarAsistencia_DeOtroProfesionalFalla — mismo criterio que el
// resto de los endpoints de turnos: nunca operar sobre un turno ajeno.
func TestMarcarAsistencia_DeOtroProfesionalFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	dueño, tipoDueño := profesionalConTipoConsulta(t, gdb, router, "asistencia5a@example.com")
	otro, _ := profesionalConTipoConsulta(t, gdb, router, "asistencia5b@example.com")
	resuelto := crearTurnoAgendadoDePrueba(t, gdb, dueño.Profesional.ID, tipoDueño, time.Now().Add(-72*time.Hour))

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+resuelto.ID.String()+"/asistencia", otro.Token, marcarAsistenciaRequest{
		Asistencia: "asistio",
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}
