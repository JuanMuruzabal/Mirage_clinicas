package http

import (
	"encoding/json"
	"net/http"
	"testing"

	"dental-mirage/api/internal/db"
)

// strVal — deref seguro de *string para asserts de test (HoraDesde/
// HoraHasta ahora son nullable, "no trabaja" se representa con nil).
func strVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// buscarAlcance — la fila del listado con el Alcance pedido, o nil si no
// está (GET /horario-atencion siempre trae la general, aunque sea la
// sintetizada por default; las excepciones solo si se crearon).
func buscarAlcance(lista []horarioAtencionResponse, alcance string) *horarioAtencionResponse {
	for i := range lista {
		if lista[i].Alcance == alcance {
			return &lista[i]
		}
	}
	return nil
}

func listarHorarioAtencion(t *testing.T, router http.Handler, token string) []horarioAtencionResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/horario-atencion", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var out []horarioAtencionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	return out
}

func TestGetHorarioAtencion_SinFilaDevuelveElDefault(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario1@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	lista := listarHorarioAtencion(t, router, reg.Token)
	if len(lista) != 1 {
		t.Fatalf("lista = %+v, esperaba solo la general sintetizada por default", lista)
	}
	general := lista[0]
	if general.Alcance != db.HorarioAtencionAlcanceGeneral {
		t.Errorf("alcance = %q, esperaba %q", general.Alcance, db.HorarioAtencionAlcanceGeneral)
	}
	if strVal(general.HoraDesde) != "08:00" || strVal(general.HoraHasta) != "18:00" {
		t.Errorf("general = %+v, esperaba el default 08:00-18:00", general)
	}
}

func TestPutHorarioAtencion_GuardaYElGetLoDevuelve(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario2@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	putRec := doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{
		HoraDesde: "09:30", HoraHasta: "17:00",
	})
	if putRec.Code != http.StatusCreated {
		t.Fatalf("PUT status = %d, esperaba %d. body=%s", putRec.Code, http.StatusCreated, putRec.Body.String())
	}

	lista := listarHorarioAtencion(t, router, reg.Token)
	general := buscarAlcance(lista, "general")
	if general == nil || strVal(general.HoraDesde) != "09:30" || strVal(general.HoraHasta) != "17:00" {
		t.Errorf("general = %+v, esperaba lo guardado por PUT", general)
	}

	// Un segundo PUT actualiza la misma fila (upsert), no crea una segunda.
	putRec2 := doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{
		HoraDesde: "10:00", HoraHasta: "16:00",
	})
	if putRec2.Code != http.StatusOK {
		t.Fatalf("segundo PUT status = %d, esperaba %d. body=%s", putRec2.Code, http.StatusOK, putRec2.Body.String())
	}
	lista2 := listarHorarioAtencion(t, router, reg.Token)
	if len(lista2) != 1 {
		t.Fatalf("lista2 = %+v, el segundo PUT no debería crear una segunda general", lista2)
	}
	general2 := buscarAlcance(lista2, "general")
	if general2 == nil || strVal(general2.HoraDesde) != "10:00" || strVal(general2.HoraHasta) != "16:00" {
		t.Errorf("general2 = %+v, esperaba el segundo PUT pisando al primero", general2)
	}
}

func TestPutHorarioAtencion_FormatoInvalido(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario3@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{
		HoraDesde: "9:30", HoraHasta: "17:00", // falta el cero a la izquierda
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestPutHorarioAtencion_HoraHastaAntesQueHoraDesde(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario4@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{
		HoraDesde: "18:00", HoraHasta: "08:00",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestHorarioAtencion_RequiereAutenticacion(t *testing.T) {
	router, _ := newTestRouter(t)

	rec := doJSON(t, router, http.MethodGet, "/horario-atencion", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestPutHorarioAtencion_NoAfectaAOtraClinica(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg1 := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Uno", Email: "horario-otro1@example.com", Password: "password123456", NombreClinica: "Clínica Uno",
	})
	reg2 := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Dos", Email: "horario-otro2@example.com", Password: "password123456", NombreClinica: "Clínica Dos",
	})

	doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg1.Token, putHorarioAtencionGeneralRequest{
		HoraDesde: "07:00", HoraHasta: "12:00",
	})

	lista := listarHorarioAtencion(t, router, reg2.Token)
	general := buscarAlcance(lista, "general")
	if general == nil || strVal(general.HoraDesde) != "08:00" || strVal(general.HoraHasta) != "18:00" {
		t.Errorf("general = %+v, la clínica 2 no guardó nada — esperaba seguir viendo el default", general)
	}
}

// Corrección de QA (2026-09-01): "puede que un profesional tenga
// horarios de atención variable" — excepciones temporales (esta semana/
// este mes/un rango a mano), CRUD aparte del PUT de la general.

func TestCrearHorarioAtencion_ExcepcionSemana_SeReflejaEnElListado(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario-semana@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodPost, "/horario-atencion", reg.Token, crearHorarioAtencionRequest{
		Alcance: "semana", HoraDesde: "09:00", HoraHasta: "13:00",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	lista := listarHorarioAtencion(t, router, reg.Token)
	semana := buscarAlcance(lista, "semana")
	if semana == nil {
		t.Fatalf("lista = %+v, esperaba una excepción con alcance semana", lista)
	}
	if strVal(semana.HoraDesde) != "09:00" || strVal(semana.HoraHasta) != "13:00" {
		t.Errorf("semana = %+v, esperaba 09:00-13:00", semana)
	}
	if semana.FechaDesde == nil || semana.FechaHasta == nil {
		t.Errorf("semana = %+v, esperaba fechaDesde/fechaHasta resueltas (\"de una sola vez\")", semana)
	}
}

func TestCrearHorarioAtencion_NoTrabaja_GuardaSinHoras(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario-notrabaja@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodPost, "/horario-atencion", reg.Token, crearHorarioAtencionRequest{
		Alcance: "mes", NoTrabaja: true,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	lista := listarHorarioAtencion(t, router, reg.Token)
	mes := buscarAlcance(lista, "mes")
	if mes == nil {
		t.Fatalf("lista = %+v, esperaba una excepción con alcance mes", lista)
	}
	if mes.HoraDesde != nil || mes.HoraHasta != nil {
		t.Errorf("mes = %+v, esperaba horaDesde/horaHasta ausentes (no trabaja)", mes)
	}
}

func TestCrearHorarioAtencion_NoTrabajaConHoras_Rechazado(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario-notrabaja-horas@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodPost, "/horario-atencion", reg.Token, crearHorarioAtencionRequest{
		Alcance: "semana", NoTrabaja: true, HoraDesde: "09:00", HoraHasta: "13:00",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestCrearHorarioAtencion_AlcanceGeneral_Rechazado(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario-general-post@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodPost, "/horario-atencion", reg.Token, crearHorarioAtencionRequest{
		Alcance: "general", HoraDesde: "09:00", HoraHasta: "13:00",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d (la general se guarda con PUT). body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestCrearHorarioAtencion_Rango_RequiereFechas(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario-rango-sinfechas@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodPost, "/horario-atencion", reg.Token, crearHorarioAtencionRequest{
		Alcance: "rango", HoraDesde: "09:00", HoraHasta: "13:00",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d (rango sin fechaDesde/fechaHasta). body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestCrearHorarioAtencion_Rango_GuardaLasFechasElegidas(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario-rango@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	rec := doJSONAuth(t, router, http.MethodPost, "/horario-atencion", reg.Token, crearHorarioAtencionRequest{
		Alcance: "rango", FechaDesde: "2030-01-10", FechaHasta: "2030-01-20", HoraDesde: "09:00", HoraHasta: "13:00",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	lista := listarHorarioAtencion(t, router, reg.Token)
	rango := buscarAlcance(lista, "rango")
	if rango == nil || strVal(rango.FechaDesde) != "2030-01-10" || strVal(rango.FechaHasta) != "2030-01-20" {
		t.Errorf("rango = %+v, esperaba las fechas elegidas a mano", rango)
	}
}

func TestEditarHorarioAtencion_ActualizaLaExcepcion(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario-editar@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	crearRec := doJSONAuth(t, router, http.MethodPost, "/horario-atencion", reg.Token, crearHorarioAtencionRequest{
		Alcance: "semana", HoraDesde: "09:00", HoraHasta: "13:00",
	})
	var creado horarioAtencionResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	editRec := doJSONAuth(t, router, http.MethodPatch, "/horario-atencion/"+creado.ID, reg.Token, crearHorarioAtencionRequest{
		Alcance: "mes", HoraDesde: "10:00", HoraHasta: "14:00",
	})
	if editRec.Code != http.StatusOK {
		t.Fatalf("PATCH status = %d, esperaba %d. body=%s", editRec.Code, http.StatusOK, editRec.Body.String())
	}

	lista := listarHorarioAtencion(t, router, reg.Token)
	if buscarAlcance(lista, "semana") != nil {
		t.Errorf("lista = %+v, la excepción vieja (semana) no debería seguir existiendo tras editarla a mes", lista)
	}
	mes := buscarAlcance(lista, "mes")
	if mes == nil || strVal(mes.HoraDesde) != "10:00" || strVal(mes.HoraHasta) != "14:00" {
		t.Errorf("mes = %+v, esperaba los valores editados", mes)
	}
}

func TestEditarHorarioAtencion_NoPermiteEditarLaGeneral(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario-editar-general@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	putRec := doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{
		HoraDesde: "08:00", HoraHasta: "18:00",
	})
	var general horarioAtencionResponse
	_ = json.Unmarshal(putRec.Body.Bytes(), &general)

	editRec := doJSONAuth(t, router, http.MethodPatch, "/horario-atencion/"+general.ID, reg.Token, crearHorarioAtencionRequest{
		Alcance: "semana", HoraDesde: "09:00", HoraHasta: "13:00",
	})
	if editRec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d (la general se edita con PUT). body=%s", editRec.Code, http.StatusBadRequest, editRec.Body.String())
	}
}

func TestEliminarHorarioAtencion_BorraLaExcepcion(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario-eliminar@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	crearRec := doJSONAuth(t, router, http.MethodPost, "/horario-atencion", reg.Token, crearHorarioAtencionRequest{
		Alcance: "semana", HoraDesde: "09:00", HoraHasta: "13:00",
	})
	var creado horarioAtencionResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	delRec := doJSONAuth(t, router, http.MethodDelete, "/horario-atencion/"+creado.ID, reg.Token, nil)
	if delRec.Code != http.StatusNoContent {
		t.Fatalf("DELETE status = %d, esperaba %d. body=%s", delRec.Code, http.StatusNoContent, delRec.Body.String())
	}

	lista := listarHorarioAtencion(t, router, reg.Token)
	if buscarAlcance(lista, "semana") != nil {
		t.Errorf("lista = %+v, esperaba que la excepción eliminada ya no aparezca", lista)
	}
}

func TestEliminarHorarioAtencion_NoPermiteEliminarLaGeneral(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "horario-eliminar-general@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	putRec := doJSONAuth(t, router, http.MethodPut, "/horario-atencion", reg.Token, putHorarioAtencionGeneralRequest{
		HoraDesde: "08:00", HoraHasta: "18:00",
	})
	var general horarioAtencionResponse
	_ = json.Unmarshal(putRec.Body.Bytes(), &general)

	delRec := doJSONAuth(t, router, http.MethodDelete, "/horario-atencion/"+general.ID, reg.Token, nil)
	if delRec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d (la general no se puede eliminar). body=%s", delRec.Code, http.StatusBadRequest, delRec.Body.String())
	}
}
