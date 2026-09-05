package http

import (
	"encoding/json"
	"errors"
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

// TestListTurnos_PacienteVerificadoEnLaRespuestaYFiltro — corrección de
// seguridad (Fase 2.4.1): `pacienteVerificado` en la respuesta y el
// filtro `?verificacion=` le dan al profesional visibilidad sobre turnos
// de pacientes que todavía no demostraron ser reales. El turno "manual"
// (POST /turnos, panel) crea una ficha con Origen "manual" — verificada
// de entrada (pacienteEstaVerificado) — y el turno "sin verificar" imita
// el camino público sin ningún turno resuelto/asistido detrás.
func TestListTurnos_PacienteVerificadoEnLaRespuestaYFiltro(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "verificacionfiltro@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	recManual := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Verificado", ApellidoContacto: "Q", DNIContacto: "30111111", TelefonoContacto: "+5493511111111",
		TipoConsultaID: tipoID, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if recManual.Code != http.StatusCreated {
		t.Fatalf("no se pudo crear el turno manual: status=%d body=%s", recManual.Code, recManual.Body.String())
	}

	_, pacienteSinVerificar := crearTurnoAgendadoConPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, inicio.Add(2*time.Hour))
	_ = pacienteSinVerificar

	var todos []turnoResponse
	rec := doJSONAuth(t, router, http.MethodGet, "/turnos", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &todos)
	if len(todos) != 2 {
		t.Fatalf("len(todos) = %d, esperaba 2", len(todos))
	}
	for _, tn := range todos {
		esperaVerificado := tn.NombreContacto == "Verificado"
		if tn.PacienteVerificado != esperaVerificado {
			t.Errorf("turno %q: PacienteVerificado = %v, esperaba %v", tn.NombreContacto, tn.PacienteVerificado, esperaVerificado)
		}
	}

	var soloVerificados []turnoResponse
	recVerificado := doJSONAuth(t, router, http.MethodGet, "/turnos?verificacion=verificado", reg.Token, nil)
	if recVerificado.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", recVerificado.Code, http.StatusOK, recVerificado.Body.String())
	}
	_ = json.Unmarshal(recVerificado.Body.Bytes(), &soloVerificados)
	if len(soloVerificados) != 1 || soloVerificados[0].NombreContacto != "Verificado" {
		t.Errorf("verificacion=verificado devolvió %+v, esperaba solo el turno de 'Verificado'", soloVerificados)
	}

	var soloSinVerificar []turnoResponse
	recSinVerificar := doJSONAuth(t, router, http.MethodGet, "/turnos?verificacion=sin_verificar", reg.Token, nil)
	if recSinVerificar.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", recSinVerificar.Code, http.StatusOK, recSinVerificar.Body.String())
	}
	_ = json.Unmarshal(recSinVerificar.Body.Bytes(), &soloSinVerificar)
	if len(soloSinVerificar) != 1 || soloSinVerificar[0].NombreContacto != "Bruno" {
		t.Errorf("verificacion=sin_verificar devolvió %+v, esperaba solo el turno sin verificar", soloSinVerificar)
	}
}

func TestListTurnos_VerificacionInvalidaFalla(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "verificacionfiltroinvalida@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?verificacion=algo-raro", reg.Token, nil)
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
// horaResueltaDeHoy — mismo criterio que el resto de este archivo
// (`time.Now().Add(-N)` para simular "ya resuelto"), pero clampeado a no
// cruzar la medianoche de HOY — a los tests de esta sección sí les
// importa que el turno caiga en el día de hoy (a diferencia del resto
// del archivo, donde nunca importó antes de este rediseño).
func horaResueltaDeHoy(t *testing.T) time.Time {
	t.Helper()
	ahora := clock.Now()
	inicio := ahora.Add(-1 * time.Hour)
	if clock.In(inicio).Format("2006-01-02") != clock.In(ahora).Format("2006-01-02") {
		inicio = clock.Today().Add(1 * time.Minute)
	}
	if !inicio.Add(30 * time.Minute).Before(ahora) {
		t.Skip("no se puede construir un turno resuelto de HOY a menos de 30 minutos de la medianoche — correr de nuevo en unos minutos")
	}
	return inicio
}

// TestResumenPanel_TurnosResueltos — corrección de QA (rediseño del
// cartel de asistencia en tiempo real, `AsistenciaCartelGlobal`): esta
// tarjeta deja de ser una bandeja de "todavía falta marcar" (el cartel,
// siempre encima bloqueando hasta que se resuelva, ya cubre eso desde
// cualquier pantalla) y pasa a ser un reporte de HOY — los turnos que YA
// se marcaron, con el resultado.
func TestResumenPanel_TurnosResueltos(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resumen4@example.com")

	marcado := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, horaResueltaDeHoy(t))
	asistio := "asistio"
	if err := gdb.Model(&db.Turno{}).Where("id = ?", marcado.ID).Update("asistencia", &asistio).Error; err != nil {
		t.Fatalf("no se pudo marcar la asistencia de prueba: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	if len(got.TurnosResueltos) != 1 || got.TurnosResueltos[0].ID != marcado.ID.String() {
		t.Errorf("TurnosResueltos = %+v, esperaba solo el turno ya marcado (%s)", got.TurnosResueltos, marcado.ID)
	}
	if got.TurnosResueltos[0].Asistencia != "asistio" {
		t.Errorf("Asistencia = %q, esperaba \"asistio\"", got.TurnosResueltos[0].Asistencia)
	}
}

// TestResumenPanel_TurnosResueltos_NoIncluyeSinMarcar — reemplaza al
// viejo TestResumenPanel_TurnosResueltos_NoIncluyeYaMarcados: la regla se
// invirtió del todo (antes escondía lo YA marcado, ahora esta tarjeta
// ÚNICAMENTE muestra lo ya marcado) — un turno resuelto sin asistencia
// todavía no corresponde acá, es responsabilidad exclusiva del cartel.
func TestResumenPanel_TurnosResueltos_NoIncluyeSinMarcar(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resumen4b@example.com")

	crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, horaResueltaDeHoy(t))

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	if len(got.TurnosResueltos) != 0 {
		t.Errorf("TurnosResueltos = %+v, esperaba vacío (todavía sin marcar)", got.TurnosResueltos)
	}
}

// TestResumenPanel_TurnosResueltos_SoloDeHoy — un turno marcado AYER no
// corresponde en el reporte de hoy (sigue contando para "Estadística",
// que sí es un acumulado histórico sin acotar).
func TestResumenPanel_TurnosResueltos_SoloDeHoy(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "resumen4c@example.com")

	deAyer := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-27*time.Hour))
	asistio := "asistio"
	if err := gdb.Model(&db.Turno{}).Where("id = ?", deAyer.ID).Update("asistencia", &asistio).Error; err != nil {
		t.Fatalf("no se pudo marcar la asistencia de prueba: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", reg.Token, nil)
	var got resumenPanelResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	if len(got.TurnosResueltos) != 0 {
		t.Errorf("TurnosResueltos = %+v, esperaba vacío (el turno marcado es de ayer, no de hoy)", got.TurnosResueltos)
	}
	if got.TurnosAsistidos != 1 {
		t.Errorf("TurnosAsistidos = %d, esperaba 1 (la Estadística sí es acumulado histórico)", got.TurnosAsistidos)
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

// TestCancelarTurnosSinVerificar_CancelaSoloLosNoVerificadosYVigentes —
// corrección de seguridad (Fase 2.4.1): "cómo se hace para borrar todos
// los turnos sin verificar" — un turno de un paciente VERIFICADO nunca se
// toca, y un turno sin verificar que ya pasó (resuelto) tampoco, porque no
// ocupa ningún horario que valga la pena liberar.
func TestCancelarTurnosSinVerificar_CancelaSoloLosNoVerificadosYVigentes(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "sinverificar1@example.com")

	// Verificado (manual, panel) — no se toca.
	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	recManual := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Verificado", ApellidoContacto: "Q", DNIContacto: "30111111", TelefonoContacto: "+5493511111111",
		TipoConsultaID: tipoID, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if recManual.Code != http.StatusCreated {
		t.Fatalf("no se pudo crear el turno manual: status=%d body=%s", recManual.Code, recManual.Body.String())
	}

	// Sin verificar, VIGENTE (a futuro) — se cancela.
	turnoVigenteSinVerificar, pacienteVigente := crearTurnoAgendadoConPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoID, inicio.Add(2*time.Hour))

	// Sin verificar, ya RESUELTO (a pasado) — no se toca, no ocupa ningún
	// horario. DNI distinto del de arriba: idx_paciente_dni_unico no
	// permite dos fichas EnConflicto=false con el mismo DNI.
	pid, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	tid, err := uuid.Parse(tipoID)
	if err != nil {
		t.Fatalf("tipoConsultaID inválido: %v", err)
	}
	pacienteResuelto := db.Paciente{ProfesionalID: pid, Nombre: "Otro", Apellido: "Resuelto", DNI: "30111333", Telefono: "+5493512222222"}
	if err := gdb.Create(&pacienteResuelto).Error; err != nil {
		t.Fatalf("no se pudo crear el paciente resuelto de prueba: %v", err)
	}
	horaPasada := time.Now().Add(-72 * time.Hour).Truncate(time.Second)
	finPasado := horaPasada.Add(30 * time.Minute)
	turnoResueltoSinVerificar := db.Turno{
		ProfesionalID: pid, PacienteID: &pacienteResuelto.ID, Estado: "agendado", TipoConsultaID: &tid,
		HoraInicio: &horaPasada, HoraFin: &finPasado,
		NombreContacto: pacienteResuelto.Nombre, ApellidoContacto: pacienteResuelto.Apellido,
		DNIContacto: pacienteResuelto.DNI, TelefonoContacto: pacienteResuelto.Telefono, Origen: "pagina_publica",
	}
	if err := gdb.Create(&turnoResueltoSinVerificar).Error; err != nil {
		t.Fatalf("no se pudo crear el turno resuelto de prueba: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodPost, "/turnos/cancelar-sin-verificar", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got cancelarTurnosSinVerificarResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Cancelados != 1 {
		t.Errorf("Cancelados = %d, esperaba 1", got.Cancelados)
	}

	var turnoActualizado db.Turno
	if err := gdb.First(&turnoActualizado, "id = ?", turnoVigenteSinVerificar.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno vigente sin verificar: %v", err)
	}
	if turnoActualizado.Estado != "cancelada" {
		t.Errorf("Estado = %q, esperaba cancelada", turnoActualizado.Estado)
	}

	// El paciente sin verificar, sin ningún turno que lo "salve", se borra
	// (borrarPacienteNoVerificadoSiSinHistorialReal) — mismo criterio que
	// cancelarTurnoHandler.
	var count int64
	gdb.Model(&db.Paciente{}).Where("id = ?", pacienteVigente.ID).Count(&count)
	if count != 0 {
		t.Errorf("el paciente sin verificar debería haberse borrado, count=%d", count)
	}

	var turnoResueltoActualizado db.Turno
	if err := gdb.First(&turnoResueltoActualizado, "id = ?", turnoResueltoSinVerificar.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno resuelto: %v", err)
	}
	if turnoResueltoActualizado.Estado != "agendado" {
		t.Errorf("el turno ya resuelto no debería haberse tocado, Estado = %q", turnoResueltoActualizado.Estado)
	}

	var turnoManual []turnoResponse
	recTurnos := doJSONAuth(t, router, http.MethodGet, "/turnos?tipoConsultaId="+tipoID, reg.Token, nil)
	_ = json.Unmarshal(recTurnos.Body.Bytes(), &turnoManual)
	for _, tn := range turnoManual {
		if tn.NombreContacto == "Verificado" && tn.Estado != "agendado" {
			t.Errorf("el turno del paciente verificado no debería haberse cancelado, Estado = %q", tn.Estado)
		}
	}
}

func TestCancelarTurnosSinVerificar_SinNadaQueCancelarDevuelveCero(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "sinverificar2@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodPost, "/turnos/cancelar-sin-verificar", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got cancelarTurnosSinVerificarResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Cancelados != 0 {
		t.Errorf("Cancelados = %d, esperaba 0", got.Cancelados)
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

// crearTurnoAgendadoConPacienteDePrueba — Fase 2.4.1: mismo criterio que
// crearTurnoAgendadoDePrueba, pero VINCULADO a un `Paciente` real (esa
// no lo hace, la mayoría de sus usos no lo necesitan) — hace falta para
// probar la regla nueva de auto-borrado en marcarAsistenciaHandler.
func crearTurnoAgendadoConPacienteDePrueba(t *testing.T, gdb *gorm.DB, profesionalID, tipoConsultaID string, inicio time.Time) (db.Turno, db.Paciente) {
	t.Helper()
	pid, err := uuid.Parse(profesionalID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	tid, err := uuid.Parse(tipoConsultaID)
	if err != nil {
		t.Fatalf("tipoConsultaID inválido: %v", err)
	}
	paciente := db.Paciente{ProfesionalID: pid, Nombre: "Bruno", Apellido: "Iglesias", DNI: "30111222", Telefono: "+5493511234567"}
	if err := gdb.Create(&paciente).Error; err != nil {
		t.Fatalf("no se pudo crear el paciente de prueba: %v", err)
	}
	inicio = inicio.Truncate(time.Second)
	fin := inicio.Add(30 * time.Minute)
	turno := db.Turno{
		ProfesionalID:    pid,
		PacienteID:       &paciente.ID,
		Estado:           "agendado",
		TipoConsultaID:   &tid,
		HoraInicio:       &inicio,
		HoraFin:          &fin,
		NombreContacto:   paciente.Nombre,
		ApellidoContacto: paciente.Apellido,
		DNIContacto:      paciente.DNI,
		TelefonoContacto: paciente.Telefono,
		Origen:           "manual",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno de prueba: %v", err)
	}
	return turno, paciente
}

// crearFichaEnConflictoConTurnoDePrueba — corrección de QA (Fase 2.4.1):
// arma la ficha "hermana" (mismo DNI, mail distinto, EnConflicto=true) y
// su turno vigente — mismo escenario que
// crearPacientePublicoConDeteccionDeConflicto arma en producción. El
// ConflictoPaciente NO se crea acá — desde la corrección de QA que
// revirtió esto a "solo si hay alguien verificado" (ver el comentario
// grande en paciente_conflicto_publico.go), cada test arma el suyo con
// crearConflictoDePruebaEntre solo cuando el escenario lo necesita
// (ticket ya existente); si el test quiere probar la detección
// RETROACTIVA (sin ticket previo), no lo llama.
func crearFichaEnConflictoConTurnoDePrueba(t *testing.T, gdb *gorm.DB, profesionalID, dni, tipoConsultaID string, inicio time.Time) (db.Paciente, db.Turno) {
	t.Helper()
	pid, err := uuid.Parse(profesionalID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	tid, err := uuid.Parse(tipoConsultaID)
	if err != nil {
		t.Fatalf("tipoConsultaID inválido: %v", err)
	}
	hermana := db.Paciente{ProfesionalID: pid, Nombre: "Otro", Apellido: "Apellido", DNI: dni, Telefono: "+5493519999999", EnConflicto: true}
	if err := gdb.Create(&hermana).Error; err != nil {
		t.Fatalf("no se pudo crear la ficha en conflicto de prueba: %v", err)
	}
	inicio = inicio.Truncate(time.Second)
	fin := inicio.Add(30 * time.Minute)
	turno := db.Turno{
		ProfesionalID:    pid,
		PacienteID:       &hermana.ID,
		Estado:           "agendado",
		TipoConsultaID:   &tid,
		HoraInicio:       &inicio,
		HoraFin:          &fin,
		NombreContacto:   hermana.Nombre,
		ApellidoContacto: hermana.Apellido,
		DNIContacto:      hermana.DNI,
		TelefonoContacto: hermana.Telefono,
		Origen:           "pagina_publica",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno de la ficha en conflicto: %v", err)
	}
	return hermana, turno
}

// crearConflictoDePruebaEntre — arma el ConflictoPaciente que vincula dos
// fichas de prueba, para los tests que necesitan simular un ticket que
// ya existía ANTES de que se dispare la verificación (por ejemplo,
// porque la ficha original ya estaba verificada al momento del segundo
// pedido — ver crearPacientePublicoConDeteccionDeConflicto).
func crearConflictoDePruebaEntre(t *testing.T, gdb *gorm.DB, profesionalID uuid.UUID, original, hermana db.Paciente, turnoHermana db.Turno) db.ConflictoPaciente {
	t.Helper()
	conflicto := db.ConflictoPaciente{
		ProfesionalID:         profesionalID,
		PacienteVerificadoID:  original.ID,
		PacienteEnConflictoID: hermana.ID,
		TurnoEnConflictoID:    turnoHermana.ID,
		Motivo:                "se registró con un mail distinto",
	}
	if err := gdb.Create(&conflicto).Error; err != nil {
		t.Fatalf("no se pudo crear el conflicto de prueba: %v", err)
	}
	return conflicto
}

// TestMarcarAsistencia_ConflictoExistenteBloqueaAsistencia — corrección de
// QA, pedido textual del cliente (revisión sobre un diseño anterior que
// auto-resolvía esto): "no dejar poner asistencia o ausencia hasta que se
// resuelva el conflicto". Con un ConflictoPaciente ya pendiente (esté o no
// verificada la ficha original), marcar "asistió" en CUALQUIERA de las dos
// fichas involucradas se rechaza con 409 — nada se toca hasta que el
// profesional resuelva manualmente desde /panel/pacientes.
func TestMarcarAsistencia_ConflictoExistenteBloqueaAsistencia(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "conflicto-silencioso1@example.com")
	turnoVerificado, pacienteVerificado := crearTurnoAgendadoConPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-2*time.Hour))
	hermana, turnoHermana := crearFichaEnConflictoConTurnoDePrueba(t, gdb, reg.Profesional.ID, pacienteVerificado.DNI, tipoConsultaID, time.Now().Add(2*time.Hour))
	conflicto := crearConflictoDePruebaEntre(t, gdb, hermana.ProfesionalID, pacienteVerificado, hermana, turnoHermana)

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoVerificado.ID.String()+"/asistencia", reg.Token, marcarAsistenciaRequest{
		Asistencia: "asistio",
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d (conflicto pendiente bloquea asistencia). body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}

	// Nada se tocó: ni el turno que se intentó marcar, ni la hermana, ni
	// el ticket.
	var turnoRecargado db.Turno
	if err := gdb.First(&turnoRecargado, "id = ?", turnoVerificado.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno: %v", err)
	}
	if turnoRecargado.Asistencia != nil {
		t.Error("Asistencia debería seguir sin marcarse")
	}
	var turnoHermanaActualizado db.Turno
	if err := gdb.First(&turnoHermanaActualizado, "id = ?", turnoHermana.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno de la hermana: %v", err)
	}
	if turnoHermanaActualizado.Estado != "agendado" {
		t.Errorf("Estado = %q, esperaba agendado (nada se toca)", turnoHermanaActualizado.Estado)
	}
	var count int64
	gdb.Model(&db.Paciente{}).Where("id = ?", hermana.ID).Count(&count)
	if count != 1 {
		t.Errorf("la ficha hermana no debería haberse tocado, count=%d", count)
	}
	var conflictoActualizado db.ConflictoPaciente
	gdb.First(&conflictoActualizado, "id = ?", conflicto.ID)
	if conflictoActualizado.Resuelto {
		t.Error("Resuelto = true, esperaba false (sigue pendiente, sin resolución manual)")
	}
}

// TestMarcarAsistencia_AsistioEnTurnoDisputadoResuelveConflictoComoVerdadero
// — TR-107 (1.3bis): marcar "asistió" en el turno puntual que originó un
// ConflictoPaciente pendiente (TurnoEnConflictoID) es la ÚNICA excepción al
// bloqueo de TestMarcarAsistencia_ConflictoExistenteBloqueaAsistencia — lo
// resuelve ahí mismo como "es la misma persona" (misma dirección fija que
// el botón manual: la ficha en conflicto se fusiona en la verificada,
// nunca al revés), y el turno disputado en sí se MIGRA (no se borra, a
// pesar de estar resuelto) para no perder la asistencia real que se acaba
// de confirmar.
func TestMarcarAsistencia_AsistioEnTurnoDisputadoResuelveConflictoComoVerdadero(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "conflicto-asistio1@example.com")
	_, pacienteVerificado := crearTurnoAgendadoConPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-2*time.Hour))
	hermana, turnoHermana := crearFichaEnConflictoConTurnoDePrueba(t, gdb, reg.Profesional.ID, pacienteVerificado.DNI, tipoConsultaID, time.Now().Add(-1*time.Hour))
	conflicto := crearConflictoDePruebaEntre(t, gdb, hermana.ProfesionalID, pacienteVerificado, hermana, turnoHermana)

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoHermana.ID.String()+"/asistencia", reg.Token, marcarAsistenciaRequest{
		Asistencia: "asistio",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var turnoRecargado db.Turno
	if err := gdb.First(&turnoRecargado, "id = ?", turnoHermana.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno: %v", err)
	}
	if turnoRecargado.Asistencia == nil || *turnoRecargado.Asistencia != "asistio" {
		t.Errorf("Asistencia = %v, esperaba \"asistio\"", turnoRecargado.Asistencia)
	}
	if turnoRecargado.Estado != "agendado" {
		t.Errorf("Estado = %q, esperaba agendado (nunca se cancela un turno con asistencia real)", turnoRecargado.Estado)
	}
	if turnoRecargado.PacienteID == nil || *turnoRecargado.PacienteID != pacienteVerificado.ID {
		t.Errorf("PacienteID = %v, esperaba %q (migrado al paciente verificado, no borrado)", turnoRecargado.PacienteID, pacienteVerificado.ID)
	}

	var countHermana int64
	gdb.Model(&db.Paciente{}).Where("id = ?", hermana.ID).Count(&countHermana)
	if countHermana != 0 {
		t.Errorf("la ficha en conflicto debería haberse borrado, count=%d", countHermana)
	}

	var conflictoActualizado db.ConflictoPaciente
	gdb.First(&conflictoActualizado, "id = ?", conflicto.ID)
	if !conflictoActualizado.Resuelto {
		t.Error("Resuelto = false, esperaba true")
	}
}

// TestMarcarAsistencia_AusenteEnTurnoDisputadoBorraFichaSinBloquearMail —
// TR-107 (1.3bis), punto explícito del cliente ("puede que sea
// verdaderamente" quien dice ser): marcar "ausente" en el turno disputado
// también resuelve el conflicto (borra la ficha en conflicto, cierra el
// ticket) pero SIN bloquear su mail — a diferencia del botón manual "el
// mail NO es del paciente verificado", que sí bloquea 7 días. El turno en
// sí queda como historial real (agendado, asistencia="ausente",
// desvinculado), nunca cancelado.
func TestMarcarAsistencia_AusenteEnTurnoDisputadoBorraFichaSinBloquearMail(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "conflicto-ausente1@example.com")
	_, pacienteVerificado := crearTurnoAgendadoConPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-2*time.Hour))
	hermana, turnoHermana := crearFichaEnConflictoConTurnoDePrueba(t, gdb, reg.Profesional.ID, pacienteVerificado.DNI, tipoConsultaID, time.Now().Add(-1*time.Hour))
	email := "hermana-disputada@example.com"
	if err := gdb.Model(&db.Paciente{}).Where("id = ?", hermana.ID).Update("email", email).Error; err != nil {
		t.Fatalf("no se pudo setear el mail de la hermana: %v", err)
	}
	conflicto := crearConflictoDePruebaEntre(t, gdb, hermana.ProfesionalID, pacienteVerificado, hermana, turnoHermana)

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoHermana.ID.String()+"/asistencia", reg.Token, marcarAsistenciaRequest{
		Asistencia: "ausente",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var turnoRecargado db.Turno
	if err := gdb.First(&turnoRecargado, "id = ?", turnoHermana.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno: %v", err)
	}
	if turnoRecargado.Asistencia == nil || *turnoRecargado.Asistencia != "ausente" {
		t.Errorf("Asistencia = %v, esperaba \"ausente\"", turnoRecargado.Asistencia)
	}
	if turnoRecargado.Estado != "agendado" {
		t.Errorf("Estado = %q, esperaba agendado (nunca se cancela — se desvincula nomás)", turnoRecargado.Estado)
	}
	if turnoRecargado.PacienteID != nil {
		t.Errorf("PacienteID = %v, esperaba nil (la ficha se borró)", turnoRecargado.PacienteID)
	}

	var countHermana int64
	gdb.Model(&db.Paciente{}).Where("id = ?", hermana.ID).Count(&countHermana)
	if countHermana != 0 {
		t.Errorf("la ficha en conflicto debería haberse borrado, count=%d", countHermana)
	}

	var conflictoActualizado db.ConflictoPaciente
	gdb.First(&conflictoActualizado, "id = ?", conflicto.ID)
	if !conflictoActualizado.Resuelto {
		t.Error("Resuelto = false, esperaba true")
	}

	var countBloqueo int64
	gdb.Model(&db.EmailBloqueadoTurnoPublico{}).Where("email = ?", email).Count(&countBloqueo)
	if countBloqueo != 0 {
		t.Errorf("no esperaba que el mail quedara bloqueado, count=%d", countBloqueo)
	}
}

// TestMarcarAsistencia_ConflictoYaResueltoNoAplicaCarveOut — TR-107, item
// 27 de la checklist de docs/ArquitecturaPeticionesTurno.md: si el
// conflicto que originó este turno ya se resolvió por otra vía (a mano,
// desde el panel) antes de esta fecha, el carve-out de 1.3bis no aplica —
// marcar asistencia en ese turno sigue el flujo normal, sin efecto
// especial sobre ninguna ficha.
func TestMarcarAsistencia_ConflictoYaResueltoNoAplicaCarveOut(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "conflicto-yaresuelto1@example.com")
	_, pacienteVerificado := crearTurnoAgendadoConPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-2*time.Hour))
	hermana, turnoHermana := crearFichaEnConflictoConTurnoDePrueba(t, gdb, reg.Profesional.ID, pacienteVerificado.DNI, tipoConsultaID, time.Now().Add(-1*time.Hour))
	conflicto := crearConflictoDePruebaEntre(t, gdb, hermana.ProfesionalID, pacienteVerificado, hermana, turnoHermana)
	if err := gdb.Model(&conflicto).Update("resuelto", true).Error; err != nil {
		t.Fatalf("no se pudo marcar el conflicto como ya resuelto: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoHermana.ID.String()+"/asistencia", reg.Token, marcarAsistenciaRequest{
		Asistencia: "asistio",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d (conflicto ya resuelto, flujo normal). body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var turnoRecargado db.Turno
	if err := gdb.First(&turnoRecargado, "id = ?", turnoHermana.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno: %v", err)
	}
	if turnoRecargado.PacienteID == nil || *turnoRecargado.PacienteID != hermana.ID {
		t.Errorf("PacienteID = %v, esperaba %q (sin efecto especial, la ficha hermana sigue como estaba)", turnoRecargado.PacienteID, hermana.ID)
	}
	var countHermana int64
	gdb.Model(&db.Paciente{}).Where("id = ?", hermana.ID).Count(&countHermana)
	if countHermana != 1 {
		t.Errorf("la ficha hermana no debería haberse tocado, count=%d", countHermana)
	}
}

// TestMarcarAsistencia_GeneraConflictoRetroactivoPendiente — corrección de
// QA, pedido textual del cliente: "no marcar el conflicto aún [mientras
// ninguna de las dos fichas esté verificada]... una vez que Juan verdadero
// venga primero y se resuelva su turno confirmado, ahí recién marcar el
// conflicto" — y, revisión posterior, sobre cómo sigue desde ahí: "esto no
// se tiene que auto solucionar, se debe marcar al profesional para que lo
// resuelva manualmente". Acá NO hay ningún ConflictoPaciente previo — se
// crea recién al verificarse, PENDIENTE (nunca resuelto solo), sin tocar
// ni la ficha ni el turno de la hermana.
func TestMarcarAsistencia_GeneraConflictoRetroactivoPendiente(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "conflicto-retroactivo1@example.com")
	turnoVerificado, pacienteVerificado := crearTurnoAgendadoConPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-2*time.Hour))
	hermana, turnoHermana := crearFichaEnConflictoConTurnoDePrueba(t, gdb, reg.Profesional.ID, pacienteVerificado.DNI, tipoConsultaID, time.Now().Add(2*time.Hour))

	var countPrevio int64
	gdb.Model(&db.ConflictoPaciente{}).Count(&countPrevio)
	if countPrevio != 0 {
		t.Fatalf("no debería existir ningún ConflictoPaciente todavía, count=%d", countPrevio)
	}

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoVerificado.ID.String()+"/asistencia", reg.Token, marcarAsistenciaRequest{
		Asistencia: "asistio",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	// El turno/ficha de la hermana NO se tocan — la resolución queda
	// 100% manual, vía resolverConflictoPacienteHandler.
	var turnoHermanaActualizado db.Turno
	if err := gdb.First(&turnoHermanaActualizado, "id = ?", turnoHermana.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno de la hermana: %v", err)
	}
	if turnoHermanaActualizado.Estado != "agendado" {
		t.Errorf("Estado = %q, esperaba agendado (no se toca hasta la resolución manual)", turnoHermanaActualizado.Estado)
	}
	var count int64
	gdb.Model(&db.Paciente{}).Where("id = ?", hermana.ID).Count(&count)
	if count != 1 {
		t.Errorf("la ficha hermana no debería haberse borrado todavía, count=%d", count)
	}

	var conflicto db.ConflictoPaciente
	if err := gdb.Where("paciente_en_conflicto_id = ?", hermana.ID).First(&conflicto).Error; err != nil {
		t.Fatalf("esperaba que se creara un ConflictoPaciente retroactivo: %v", err)
	}
	if conflicto.Resuelto {
		t.Error("Resuelto = true, esperaba false (pendiente de resolución manual)")
	}
	if conflicto.PacienteVerificadoID != pacienteVerificado.ID {
		t.Errorf("PacienteVerificadoID = %q, esperaba %q", conflicto.PacienteVerificadoID, pacienteVerificado.ID)
	}
}

// TestGenerarConflictosRetroactivosPorDNI_NoDuplicaTicketPendiente —
// corrección de QA: llamar a la función dos veces para el mismo par (p.
// ej. la ficha verificada tiene más de un turno y ambos disparan la
// detección) no debe crear un segundo ticket. Se ejercita la función
// directo (no vía HTTP): una vez que existe un ticket pendiente para una
// ficha, marcarAsistenciaHandler bloquea cualquier otro "asistió" sobre
// ella (ver TestMarcarAsistencia_ConflictoExistenteBloqueaAsistencia), así
// que en la práctica esta función nunca se llama dos veces para el mismo
// par por esa vía — el guard queda como red de seguridad igual.
func TestGenerarConflictosRetroactivosPorDNI_NoDuplicaTicketPendiente(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "conflicto-retroactivo2@example.com")
	_, pacienteVerificado := crearTurnoAgendadoConPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-2*time.Hour))
	_, _ = crearFichaEnConflictoConTurnoDePrueba(t, gdb, reg.Profesional.ID, pacienteVerificado.DNI, tipoConsultaID, time.Now().Add(2*time.Hour))

	if err := generarConflictosRetroactivosPorDNI(gdb, pacienteVerificado); err != nil {
		t.Fatalf("primera llamada: error inesperado: %v", err)
	}
	if err := generarConflictosRetroactivosPorDNI(gdb, pacienteVerificado); err != nil {
		t.Fatalf("segunda llamada: error inesperado: %v", err)
	}

	var count int64
	gdb.Model(&db.ConflictoPaciente{}).Where("paciente_verificado_id = ?", pacienteVerificado.ID).Count(&count)
	if count != 1 {
		t.Errorf("count = %d, esperaba 1 (sin duplicar el ticket)", count)
	}
}

// TestMarcarAsistencia_BorraPacienteNoVerificadoEnPrimerAusente — Fase
// 2.4.1, regla nueva pedida textualmente por el cliente: "para un
// paciente no verificado si se ausenta a lo que vendría siendo su PRIMER
// turno, eliminar de la tabla pacientes este paciente".
func TestMarcarAsistencia_BorraPacienteNoVerificadoEnPrimerAusente(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "asistencia6@example.com")
	turno, paciente := crearTurnoAgendadoConPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-72*time.Hour))

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turno.ID.String()+"/asistencia", reg.Token, marcarAsistenciaRequest{
		Asistencia: "ausente",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	if err := gdb.First(&db.Paciente{}, "id = ?", paciente.ID).Error; !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("el paciente debería haberse borrado, err = %v", err)
	}
	var recargado db.Turno
	if err := gdb.First(&recargado, "id = ?", turno.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno: %v", err)
	}
	if recargado.PacienteID != nil {
		t.Errorf("PacienteID = %v, esperaba nil (huérfano tras el borrado)", *recargado.PacienteID)
	}
}

// TestMarcarAsistencia_NoBorraPacienteConMasDeUnTurno — la guarda solo
// dispara en el PRIMER turno del paciente; con un segundo turno ya
// cargado, ausentarse no borra la ficha (todavía puede tratarse de un
// paciente real que faltó una vez).
func TestMarcarAsistencia_NoBorraPacienteConMasDeUnTurno(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "asistencia7@example.com")
	turno1, paciente := crearTurnoAgendadoConPacienteDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(-72*time.Hour))
	// Segundo turno para el MISMO paciente — en el futuro, no hace falta
	// que también esté resuelto para que cuente en el total.
	turno2 := crearTurnoAgendadoDePrueba(t, gdb, reg.Profesional.ID, tipoConsultaID, time.Now().Add(72*time.Hour))
	if err := gdb.Model(&turno2).Update("paciente_id", paciente.ID).Error; err != nil {
		t.Fatalf("no se pudo vincular el segundo turno al paciente: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turno1.ID.String()+"/asistencia", reg.Token, marcarAsistenciaRequest{
		Asistencia: "ausente",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	if err := gdb.First(&db.Paciente{}, "id = ?", paciente.ID).Error; err != nil {
		t.Errorf("el paciente NO debería haberse borrado (tiene más de un turno): %v", err)
	}
}
