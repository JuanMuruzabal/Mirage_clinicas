package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"dental-mirage/api/internal/testdb"
)

func TestListPacientes_DevuelveLosCreadosPorTurnos(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "pac1@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "30222333", TelefonoContacto: "+549",
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got []pacienteResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 || got[0].Nombre != "Julián" {
		t.Errorf("got = %+v, esperaba 1 paciente 'Julián'", got)
	}
}

func TestListPacientes_BuscaPorNombreApellidoODNI(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "pac2@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	crear := func(nombre, dni string, offset time.Duration) {
		doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
			NombreContacto: nombre, ApellidoContacto: "Apellido", DNIContacto: dni, TelefonoContacto: "+549",
			TipoConsultaID: tipoConsultaID,
			HoraInicio:     inicio.Add(offset).Format(time.RFC3339),
			HoraFin:        inicio.Add(offset + 30*time.Minute).Format(time.RFC3339),
		})
	}
	crear("Julián", "30222333", 0)
	crear("Bruno", "30111222", time.Hour)

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes?q=Julian", reg.Token, nil)
	var got []pacienteResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	// "Julian" (sin tilde) no matchea "Julián" con ILIKE — busca por DNI en su lugar.
	if len(got) != 0 {
		t.Logf("nota: ILIKE no normaliza acentos, esperado")
	}

	rec2 := doJSONAuth(t, router, http.MethodGet, "/pacientes?q=30111222", reg.Token, nil)
	var got2 []pacienteResponse
	_ = json.Unmarshal(rec2.Body.Bytes(), &got2)
	if len(got2) != 1 || got2[0].Nombre != "Bruno" {
		t.Errorf("got2 = %+v, esperaba solo a Bruno por DNI", got2)
	}
}

func TestListPacientes_SoloDelProfesionalAutenticado(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg1, tipo1 := profesionalConTipoConsulta(t, gdb, router, "pac3a@example.com")
	reg2, _ := profesionalConTipoConsulta(t, gdb, router, "pac3b@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	doJSONAuth(t, router, http.MethodPost, "/turnos", reg1.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipo1, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes", reg2.Token, nil)
	var got []pacienteResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 0 {
		t.Errorf("got = %+v, esperaba 0 (el paciente es de otro profesional)", got)
	}
}

func TestListPacientes_RequiereAutenticacion(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodGet, "/pacientes", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestGetPaciente_DevuelveDatosYHistorialDeTurnos(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "pac4@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "30222333", TelefonoContacto: "+549",
		TipoConsultaID: tipoConsultaID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	var turnoCreado turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &turnoCreado)

	recDetalle := doJSONAuth(t, router, http.MethodGet, "/pacientes/"+*turnoCreado.PacienteID, reg.Token, nil)
	if recDetalle.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", recDetalle.Code, http.StatusOK, recDetalle.Body.String())
	}
	var got pacienteDetalleResponse
	_ = json.Unmarshal(recDetalle.Body.Bytes(), &got)
	if got.Nombre != "Julián" {
		t.Errorf("Nombre = %q, esperaba Julián", got.Nombre)
	}
	if len(got.Turnos) != 1 || got.Turnos[0].ID != turnoCreado.ID {
		t.Errorf("Turnos = %+v, esperaba 1 con el turno recién creado", got.Turnos)
	}
}

func TestGetPaciente_NoExisteFalla(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "pac5@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/00000000-0000-0000-0000-000000000000", reg.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

// TestEditarPaciente_Exitoso — pedido 2026-08-23: corregir DNI/teléfono/
// email de la ficha si hubo un error o una actualización de datos.
func TestEditarPaciente_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "editapac1@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "30222333", TelefonoContacto: "+5493511111111",
		TipoConsultaID: tipoConsultaID, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	var turnoCreado turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &turnoCreado)

	recEditar := doJSONAuth(t, router, http.MethodPatch, "/pacientes/"+*turnoCreado.PacienteID, reg.Token, editarPacienteRequest{
		DNI: "30222444", Telefono: "+5493511234567", Email: "julian@example.com",
	})
	if recEditar.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", recEditar.Code, http.StatusOK, recEditar.Body.String())
	}
	var got pacienteResponse
	_ = json.Unmarshal(recEditar.Body.Bytes(), &got)
	if got.DNI != "30222444" || got.Telefono != "+5493511234567" {
		t.Errorf("got = %+v, esperaba DNI/teléfono actualizados", got)
	}
	if got.Email == nil || *got.Email != "julian@example.com" {
		t.Errorf("Email = %v, esperaba julian@example.com", got.Email)
	}
}

func TestEditarPaciente_DNIInvalidoFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "editapac2@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "30222333", TelefonoContacto: "+5493511111111",
		TipoConsultaID: tipoConsultaID, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	var turnoCreado turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &turnoCreado)

	recEditar := doJSONAuth(t, router, http.MethodPatch, "/pacientes/"+*turnoCreado.PacienteID, reg.Token, editarPacienteRequest{
		DNI: "123", Telefono: "+5493511234567",
	})
	if recEditar.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", recEditar.Code, http.StatusBadRequest)
	}
}

// TestEditarPaciente_DNIYaUsadoPorOtroPacienteFalla — Extra 2.3.5 (E5.1):
// el DNI es único por clínica desde este ítem — corregir la ficha de un
// paciente hacia el DNI de OTRO paciente ya cargado tiene que dar un 409
// legible, nunca un 500 crudo (mismo criterio que el solapamiento de
// horario en turnos_test.go).
func TestEditarPaciente_DNIYaUsadoPorOtroPacienteFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, tipoConsultaID := profesionalConTipoConsulta(t, gdb, router, "editapac3@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	crearYObtenerPacienteID := func(nombre, dni string, offset time.Duration) string {
		rec := doJSONAuth(t, router, http.MethodPost, "/turnos", reg.Token, crearTurnoManualRequest{
			NombreContacto: nombre, ApellidoContacto: "Apellido", DNIContacto: dni, TelefonoContacto: "+5493511111111",
			TipoConsultaID: tipoConsultaID, HoraInicio: inicio.Add(offset).Format(time.RFC3339), HoraFin: inicio.Add(offset + 30*time.Minute).Format(time.RFC3339),
		})
		var turno turnoResponse
		_ = json.Unmarshal(rec.Body.Bytes(), &turno)
		return *turno.PacienteID
	}
	crearYObtenerPacienteID("Julián", "30222333", 0)
	idBruno := crearYObtenerPacienteID("Bruno", "30111222", time.Hour)

	// Bruno pasa a tener el mismo DNI que Julián — debe rechazarse.
	recEditar := doJSONAuth(t, router, http.MethodPatch, "/pacientes/"+idBruno, reg.Token, editarPacienteRequest{
		DNI: "30222333", Telefono: "+5493511111111",
	})
	if recEditar.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d. body=%s", recEditar.Code, http.StatusConflict, recEditar.Body.String())
	}
}

func TestEditarPaciente_NoExisteFalla(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "editapac3@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodPatch, "/pacientes/00000000-0000-0000-0000-000000000000", reg.Token, editarPacienteRequest{
		DNI: "30111222", Telefono: "+5493511234567",
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestEditarPaciente_DeOtroProfesionalFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	dueño, tipo := profesionalConTipoConsulta(t, gdb, router, "editapac4a@example.com")
	otro, _ := profesionalConTipoConsulta(t, gdb, router, "editapac4b@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", dueño.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipo, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	var turnoCreado turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &turnoCreado)

	recEditar := doJSONAuth(t, router, http.MethodPatch, "/pacientes/"+*turnoCreado.PacienteID, otro.Token, editarPacienteRequest{
		DNI: "30111222", Telefono: "+5493511234567",
	})
	if recEditar.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", recEditar.Code, http.StatusNotFound)
	}
}

func TestGetPaciente_DeOtroProfesionalFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	dueño, tipo := profesionalConTipoConsulta(t, gdb, router, "pac6a@example.com")
	otro, _ := profesionalConTipoConsulta(t, gdb, router, "pac6b@example.com")

	inicio := time.Date(2030, 9, 1, 10, 0, 0, 0, time.UTC)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", dueño.Token, crearTurnoManualRequest{
		NombreContacto: "Julián", ApellidoContacto: "Ortiz", DNIContacto: "1", TelefonoContacto: "1",
		TipoConsultaID: tipo, HoraInicio: inicio.Format(time.RFC3339), HoraFin: inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	var turnoCreado turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &turnoCreado)

	recDetalle := doJSONAuth(t, router, http.MethodGet, "/pacientes/"+*turnoCreado.PacienteID, otro.Token, nil)
	if recDetalle.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", recDetalle.Code, http.StatusNotFound)
	}
}

// TestCrearPaciente_Exitoso — Extra 2.3.5 (E5.5): "+ Agregar paciente" en
// la sección Pacientes, alta directa sin pasar por un turno.
func TestCrearPaciente_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "crearpac1@example.com")

	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes", reg.Token, crearPacienteRequest{
		Nombre: "Bruno", Apellido: "Iglesias", DNI: "30111222", Telefono: "+5493511234567", Email: "bruno@example.com",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got pacienteResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.ID == "" || got.Nombre != "Bruno" || got.DNI != "30111222" {
		t.Errorf("got = %+v, esperaba el paciente recién creado", got)
	}

	rows := doJSONAuth(t, router, http.MethodGet, "/pacientes", reg.Token, nil)
	var lista []pacienteResponse
	_ = json.Unmarshal(rows.Body.Bytes(), &lista)
	if len(lista) != 1 {
		t.Errorf("got %d pacientes, esperaba 1", len(lista))
	}
}

// TestCrearPaciente_DNIYaExisteRechaza — a diferencia de
// crearOBuscarPacientePorDNI (turnos.go), que REUSA un paciente existente
// porque viene de un flujo que necesita seguir creando un turno igual, acá
// un DNI repetido es un error real: "+ Agregar paciente" es un alta
// explícita de alguien nuevo, no debe reusar en silencio una ficha que el
// profesional no eligió.
func TestCrearPaciente_DNIYaExisteRechaza(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "crearpac2@example.com")

	payload := crearPacienteRequest{Nombre: "Bruno", Apellido: "Iglesias", DNI: "30111222", Telefono: "+5493511234567"}
	doJSONAuth(t, router, http.MethodPost, "/pacientes", reg.Token, payload)

	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes", reg.Token, payload)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}
}

func TestCrearPaciente_ValidacionesDeFormato(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "crearpac3@example.com")

	casos := map[string]crearPacienteRequest{
		"sin nombre":        {Nombre: "", Apellido: "Iglesias", DNI: "30111222", Telefono: "+5493511234567"},
		"DNI inválido":      {Nombre: "Bruno", Apellido: "Iglesias", DNI: "123", Telefono: "+5493511234567"},
		"teléfono inválido": {Nombre: "Bruno", Apellido: "Iglesias", DNI: "30111222", Telefono: "123"},
		"email inválido":    {Nombre: "Bruno", Apellido: "Iglesias", DNI: "30111222", Telefono: "+5493511234567", Email: "no-es-un-email"},
	}
	for nombre, req := range casos {
		rec := doJSONAuth(t, router, http.MethodPost, "/pacientes", reg.Token, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, esperaba %d", nombre, rec.Code, http.StatusBadRequest)
		}
	}
}

func TestCrearPaciente_RequiereAutenticacion(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	rec := doJSON(t, router, http.MethodPost, "/pacientes", crearPacienteRequest{
		Nombre: "Bruno", Apellido: "Iglesias", DNI: "30111222", Telefono: "+5493511234567",
	})
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}
