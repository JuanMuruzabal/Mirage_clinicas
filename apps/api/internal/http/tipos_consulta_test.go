package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

func TestListTiposConsulta_DevuelveLosDelProfesionalAutenticado(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "tipos1@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	req := httptest.NewRequest(http.MethodGet, "/tipos-consulta", nil)
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got []tipoConsultaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, esperaba 2 (TR-001)", len(got))
	}
	nombres := map[string]string{}
	for _, tc := range got {
		nombres[tc.Nombre] = tc.Color
	}
	if nombres["Consulta general"] != "#E7D9BE" {
		t.Errorf("color de Consulta general = %q, esperaba #E7D9BE", nombres["Consulta general"])
	}
	if nombres["Urgencia"] != "#D6563A" {
		t.Errorf("color de Urgencia = %q, esperaba #D6563A", nombres["Urgencia"])
	}
}

func TestListTiposConsulta_NoDevuelveLosDeOtroProfesional(t *testing.T) {
	router, gdb := newTestRouter(t)
	registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Uno", Email: "tipos-otro1@example.com", Password: "password123456", NombreClinica: "Clínica Uno",
	})
	reg2 := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Dos", Email: "tipos-otro2@example.com", Password: "password123456", NombreClinica: "Clínica Dos",
	})

	req := httptest.NewRequest(http.MethodGet, "/tipos-consulta", nil)
	req.Header.Set("Authorization", "Bearer "+reg2.Token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var got []tipoConsultaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, esperaba 2 (solo los propios, no los de 'Uno')", len(got))
	}
}

func TestListTiposConsulta_RequiereAutenticacion(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	req := httptest.NewRequest(http.MethodGet, "/tipos-consulta", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

// F2.3.4 (docs/implementation-plan.md §11.3) — CRUD completo, antes solo
// existía GET.

func TestCrearTipoConsulta(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "crear-tipo1@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	sesiones := 3

	rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", reg.Token, tipoConsultaRequest{
		Nombre: "Ortodoncia", Color: "#123ABC", DuracionMinutos: 45, TiempoPostConsultaMinutos: 20, CantidadSesiones: &sesiones,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var got tipoConsultaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.Nombre != "Ortodoncia" || got.Color != "#123ABC" || got.DuracionMinutos != 45 ||
		got.TiempoPostConsultaMinutos != 20 || got.CantidadSesiones == nil || *got.CantidadSesiones != 3 {
		t.Errorf("got = %+v, no coincide con lo enviado", got)
	}
}

func TestCrearTipoConsulta_Validaciones(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "crear-tipo2@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	sesionesCero := 0

	casos := map[string]tipoConsultaRequest{
		"nombre vacío":                   {Nombre: "  ", Color: "#123ABC", DuracionMinutos: 30},
		"color sin formato hex":          {Nombre: "X", Color: "azul", DuracionMinutos: 30},
		"color de 3 dígitos":             {Nombre: "X", Color: "#123", DuracionMinutos: 30},
		"duración cero":                  {Nombre: "X", Color: "#123ABC", DuracionMinutos: 0},
		"duración negativa":              {Nombre: "X", Color: "#123ABC", DuracionMinutos: -10},
		"duración mayor a 8 horas":       {Nombre: "X", Color: "#123ABC", DuracionMinutos: 481},
		"tiempo post-consulta negativo":  {Nombre: "X", Color: "#123ABC", DuracionMinutos: 30, TiempoPostConsultaMinutos: -1},
		"tiempo post-consulta > 4 horas": {Nombre: "X", Color: "#123ABC", DuracionMinutos: 30, TiempoPostConsultaMinutos: 241},
		"cantidad de sesiones cero":      {Nombre: "X", Color: "#123ABC", DuracionMinutos: 30, CantidadSesiones: &sesionesCero},
	}

	for nombre, body := range casos {
		t.Run(nombre, func(t *testing.T) {
			rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", reg.Token, body)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
			}
		})
	}
}

func TestEditarTipoConsulta(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "editar-tipo1@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	crearRec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", reg.Token, tipoConsultaRequest{
		Nombre: "Original", Color: "#111111", DuracionMinutos: 30,
	})
	var creado tipoConsultaResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	editRec := doJSONAuth(t, router, http.MethodPatch, "/tipos-consulta/"+creado.ID, reg.Token, tipoConsultaRequest{
		Nombre: "Editado", Color: "#222222", DuracionMinutos: 60, TiempoPostConsultaMinutos: 15,
	})
	if editRec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", editRec.Code, http.StatusOK, editRec.Body.String())
	}
	var got tipoConsultaResponse
	_ = json.Unmarshal(editRec.Body.Bytes(), &got)
	if got.Nombre != "Editado" || got.Color != "#222222" || got.DuracionMinutos != 60 || got.TiempoPostConsultaMinutos != 15 {
		t.Errorf("got = %+v, no refleja la edición", got)
	}
}

func TestEditarTipoConsulta_DeOtraClinicaDevuelve404(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg1 := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Uno", Email: "editar-tipo-otro1@example.com", Password: "password123456", NombreClinica: "Clínica Uno",
	})
	reg2 := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Dos", Email: "editar-tipo-otro2@example.com", Password: "password123456", NombreClinica: "Clínica Dos",
	})
	crearRec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", reg1.Token, tipoConsultaRequest{
		Nombre: "De uno", Color: "#111111", DuracionMinutos: 30,
	})
	var creado tipoConsultaResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	editRec := doJSONAuth(t, router, http.MethodPatch, "/tipos-consulta/"+creado.ID, reg2.Token, tipoConsultaRequest{
		Nombre: "Hackeado", Color: "#222222", DuracionMinutos: 60,
	})
	if editRec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", editRec.Code, http.StatusNotFound)
	}
}

func TestEliminarTipoConsulta_SinTurnosAsociados(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "eliminar-tipo1@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	crearRec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", reg.Token, tipoConsultaRequest{
		Nombre: "Descartable", Color: "#111111", DuracionMinutos: 30,
	})
	var creado tipoConsultaResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	delRec := doJSONAuth(t, router, http.MethodDelete, "/tipos-consulta/"+creado.ID, reg.Token, nil)
	if delRec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, esperaba %d. body=%s", delRec.Code, http.StatusNoContent, delRec.Body.String())
	}
}

// R2F-4 (docs/implementation-plan.md §11.4): un tipo de consulta con
// turnos asociados no se puede borrar — dejaría esos turnos con un
// tipo_consulta_id huérfano.
func TestEliminarTipoConsulta_ConTurnosAsociadosDevuelve409(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "eliminar-tipo2@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	crearRec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", reg.Token, tipoConsultaRequest{
		Nombre: "En uso", Color: "#111111", DuracionMinutos: 30,
	})
	var creado tipoConsultaResponse
	_ = json.Unmarshal(crearRec.Body.Bytes(), &creado)

	clinicID := uuid.MustParse(reg.Profesional.ID)
	tipoID := uuid.MustParse(creado.ID)
	turno := db.Turno{
		ProfesionalID: clinicID, TipoConsultaID: &tipoID, Estado: "pendiente",
		NombreContacto: "P", ApellidoContacto: "Q", DNIContacto: "1", TelefonoContacto: "1",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno de prueba: %v", err)
	}

	delRec := doJSONAuth(t, router, http.MethodDelete, "/tipos-consulta/"+creado.ID, reg.Token, nil)
	if delRec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d. body=%s", delRec.Code, http.StatusConflict, delRec.Body.String())
	}
}

func TestEliminarTipoConsulta_Inexistente(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "eliminar-tipo3@example.com", Password: "password123456", NombreClinica: "Clínica",
	})

	delRec := doJSONAuth(t, router, http.MethodDelete, "/tipos-consulta/00000000-0000-0000-0000-000000000000", reg.Token, nil)
	if delRec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", delRec.Code, http.StatusNotFound)
	}
}
