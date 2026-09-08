package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Tests de aislamiento entre clínicas (cross-tenant) — Fase B de la
// auditoría de seguridad (docs/Seguridad y optimizacion/).
//
// Por qué existe este archivo, además de los tests de dominio que ya
// cubren cada handler: la auditoría verificó A MANO que los ~20 lookups
// por id de todo `internal/http` filtran por `profesional_id`, y en ese
// momento estaban todos bien. Pero esa garantía es puramente humana — la
// sostiene la disciplina de quien escribe cada endpoint nuevo, y no hay
// nada automatizado que la haga fallar si alguien la rompe. Con más
// endpoints y más manos sobre el repo, "un handler nuevo se olvidó el
// filtro" es la regresión de seguridad más probable de todo el sistema,
// y la más silenciosa: no rompe ningún test existente, no tira ningún
// error — simplemente deja que una clínica lea o modifique los datos de
// otra.
//
// Cada test de acá arma DOS clínicas independientes y confirma que la
// primera no puede tocar nada de la segunda. Son deliberadamente
// repetitivos y aburridos: la idea es que agregar un endpoint nuevo al
// grupo autenticado sin su filtro de tenant haga fallar algo acá.
//
// Criterio de "aislado" (los dos son válidos, ver cada caso): 404 "no
// encontrado" — nunca 403 — para no distinguir "no existe" de "existe
// pero es de otro", y listados que simplemente no incluyen lo ajeno.

// dosClinicasDePrueba arma dos clínicas separadas, cada una con su token
// y su tipo de consulta — la base de todos los tests de este archivo.
func dosClinicasDePrueba(t *testing.T, gdb *gorm.DB, router http.Handler, sufijo string) (a, b clinicaDePruebaResult, tipoA, tipoB string) {
	t.Helper()
	a, tipoA = profesionalConTipoConsulta(t, gdb, router, "aisl-a-"+sufijo+"@example.com")
	b, tipoB = profesionalConTipoConsulta(t, gdb, router, "aisl-b-"+sufijo+"@example.com")
	return a, b, tipoA, tipoB
}

// TestAislamiento_ListarTurnosNoIncluyeLosDeOtraClinica — el listado
// principal del panel: pedir /turnos con el token de A nunca puede
// devolver un turno de B.
func TestAislamiento_ListarTurnosNoIncluyeLosDeOtraClinica(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, b, _, tipoB := dosClinicasDePrueba(t, gdb, router, "listturnos")

	// B crea un turno propio.
	turnoDeB := crearTurnoAgendadoDePrueba(t, gdb, b.Profesional.ID, tipoB, time.Now().Add(72*time.Hour))

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos", a.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var turnos []turnoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &turnos); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	for _, tr := range turnos {
		if tr.ID == turnoDeB.ID.String() {
			t.Fatalf("el listado de A incluyó el turno %s, que es de B", tr.ID)
		}
	}
}

// TestAislamiento_CancelarTurnoAjenoNoEncuentra — acción destructiva: A
// no puede cancelar un turno de B ni enterarse de que existe.
func TestAislamiento_CancelarTurnoAjenoNoEncuentra(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, b, _, tipoB := dosClinicasDePrueba(t, gdb, router, "cancelar")
	turnoDeB := crearTurnoAgendadoDePrueba(t, gdb, b.Profesional.ID, tipoB, time.Now().Add(72*time.Hour))

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoDeB.ID.String()+"/cancelar", a.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperaba %d — A pudo tocar un turno de B. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}

	// Y el turno de B sigue intacto.
	var recargado db.Turno
	if err := gdb.First(&recargado, "id = ?", turnoDeB.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno de B: %v", err)
	}
	if recargado.Estado != "agendado" {
		t.Errorf("Estado del turno de B = %q, esperaba que siguiera 'agendado'", recargado.Estado)
	}
}

// TestAislamiento_ReprogramarTurnoAjenoNoEncuentra — misma idea sobre el
// otro endpoint que muta un turno por id.
func TestAislamiento_ReprogramarTurnoAjenoNoEncuentra(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, b, _, tipoB := dosClinicasDePrueba(t, gdb, router, "reprogramar")
	turnoDeB := crearTurnoAgendadoDePrueba(t, gdb, b.Profesional.ID, tipoB, time.Now().Add(72*time.Hour))

	nuevaHora := time.Now().Add(96 * time.Hour)
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoDeB.ID.String()+"/hora", a.Token, reprogramarTurnoRequest{
		HoraInicio: nuevaHora.Format(time.RFC3339),
		HoraFin:    nuevaHora.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d — A pudo reprogramar un turno de B. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

// TestAislamiento_MarcarAsistenciaEnTurnoAjenoNoEncuentra — el endpoint
// de asistencia es IRREVERSIBLE (TR-092), así que un cruce acá sería
// especialmente grave: no hay forma de deshacerlo.
func TestAislamiento_MarcarAsistenciaEnTurnoAjenoNoEncuentra(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, b, _, tipoB := dosClinicasDePrueba(t, gdb, router, "asistencia")
	// Un turno ya resuelto (en el pasado) es el único que admite asistencia.
	turnoDeB := crearTurnoAgendadoDePrueba(t, gdb, b.Profesional.ID, tipoB, time.Now().Add(-72*time.Hour))

	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoDeB.ID.String()+"/asistencia", a.Token, map[string]string{
		"asistencia": "asistio",
	})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperaba %d — A pudo marcar asistencia en un turno de B. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}

	var recargado db.Turno
	if err := gdb.First(&recargado, "id = ?", turnoDeB.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno de B: %v", err)
	}
	if recargado.Asistencia != nil {
		t.Errorf("Asistencia del turno de B = %v, esperaba que siguiera sin marcar", *recargado.Asistencia)
	}
}

// TestAislamiento_VerPacienteAjenoNoEncuentra — la ficha de paciente es
// el dato más sensible del sistema (datos personales de salud).
func TestAislamiento_VerPacienteAjenoNoEncuentra(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, b, _, tipoB := dosClinicasDePrueba(t, gdb, router, "verpaciente")
	pacienteDeB := crearPacienteVerificadoDePrueba(t, gdb, b.Profesional.ID, tipoB, "40555111", "paciente-de-b@example.com")

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/"+pacienteDeB.ID.String(), a.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d — A pudo leer la ficha de un paciente de B. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

// TestAislamiento_EditarPacienteAjenoNoEncuentra — y tampoco puede
// modificarla.
func TestAislamiento_EditarPacienteAjenoNoEncuentra(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, b, _, tipoB := dosClinicasDePrueba(t, gdb, router, "editpaciente")
	pacienteDeB := crearPacienteVerificadoDePrueba(t, gdb, b.Profesional.ID, tipoB, "40555222", "paciente-de-b2@example.com")

	rec := doJSONAuth(t, router, http.MethodPatch, "/pacientes/"+pacienteDeB.ID.String(), a.Token, map[string]string{
		"nombre": "Pisado", "apellido": "PorOtraClinica", "dni": "40555222", "telefono": "+5493511234567",
	})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperaba %d — A pudo editar un paciente de B. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}

	var recargado db.Paciente
	if err := gdb.First(&recargado, "id = ?", pacienteDeB.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el paciente de B: %v", err)
	}
	if recargado.Nombre == "Pisado" {
		t.Error("los datos del paciente de B fueron modificados por A")
	}
}

// TestAislamiento_ListarPacientesNoIncluyeLosDeOtraClinica
func TestAislamiento_ListarPacientesNoIncluyeLosDeOtraClinica(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, b, _, tipoB := dosClinicasDePrueba(t, gdb, router, "listpacientes")
	pacienteDeB := crearPacienteVerificadoDePrueba(t, gdb, b.Profesional.ID, tipoB, "40555333", "paciente-de-b3@example.com")

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes", a.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusOK)
	}
	var pacientes []pacienteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &pacientes); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	for _, p := range pacientes {
		if p.ID == pacienteDeB.ID.String() {
			t.Fatalf("el listado de A incluyó al paciente %s, que es de B", p.ID)
		}
	}
}

// TestAislamiento_EliminarTipoConsultaAjenoNoEncuentra — borrar un tipo
// de consulta ajeno rompería los turnos de la otra clínica.
func TestAislamiento_EliminarTipoConsultaAjenoNoEncuentra(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, _, _, tipoB := dosClinicasDePrueba(t, gdb, router, "deltipo")

	rec := doJSONAuth(t, router, http.MethodDelete, "/tipos-consulta/"+tipoB, a.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperaba %d — A pudo borrar un tipo de consulta de B. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}

	var sigueExistiendo db.TipoConsulta
	if err := gdb.First(&sigueExistiendo, "id = ?", tipoB).Error; err != nil {
		t.Errorf("el tipo de consulta de B ya no existe — A lo borró: %v", err)
	}
}

// TestAislamiento_EditarTipoConsultaAjenoNoEncuentra
func TestAislamiento_EditarTipoConsultaAjenoNoEncuentra(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, _, _, tipoB := dosClinicasDePrueba(t, gdb, router, "edittipo")

	rec := doJSONAuth(t, router, http.MethodPatch, "/tipos-consulta/"+tipoB, a.Token, tipoConsultaRequest{
		Nombre: "Pisado por otra clínica", Color: "#AABBCC", DuracionMinutos: 30,
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d — A pudo editar un tipo de consulta de B. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

// TestAislamiento_ListarTiposConsultaNoIncluyeLosDeOtraClinica
func TestAislamiento_ListarTiposConsultaNoIncluyeLosDeOtraClinica(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, _, _, tipoB := dosClinicasDePrueba(t, gdb, router, "listtipos")

	rec := doJSONAuth(t, router, http.MethodGet, "/tipos-consulta", a.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusOK)
	}
	var tipos []tipoConsultaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &tipos); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	for _, tc := range tipos {
		if tc.ID == tipoB {
			t.Fatalf("el listado de A incluyó el tipo de consulta %s, que es de B", tc.ID)
		}
	}
}

// TestAislamiento_ResumenDelPanelNoMezclaClinicas — el dashboard suma
// contadores; un cruce acá no se ve como "datos ajenos" sino como
// números mal, que es más difícil de notar.
func TestAislamiento_ResumenDelPanelNoMezclaClinicas(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, b, _, tipoB := dosClinicasDePrueba(t, gdb, router, "resumen")
	crearTurnoAgendadoDePrueba(t, gdb, b.Profesional.ID, tipoB, time.Now().Add(72*time.Hour))

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", a.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var resumen struct {
		TurnosConfirmados int `json:"turnosConfirmados"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resumen); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if resumen.TurnosConfirmados != 0 {
		t.Errorf("turnosConfirmados de A = %d, esperaba 0 — el único turno cargado es de B", resumen.TurnosConfirmados)
	}
}

// TestAislamiento_BloqueosDeSeguridadNoSeVenEntreClinicas — /panel/seguridad
// expone mails/IPs bloqueados: datos sensibles de los pacientes de esa
// clínica puntual.
func TestAislamiento_BloqueosDeSeguridadNoSeVenEntreClinicas(t *testing.T) {
	router, gdb := newTestRouter(t)
	a, b, _, _ := dosClinicasDePrueba(t, gdb, router, "bloqueos")

	// B tiene un mail bloqueado.
	bID := uuid.MustParse(b.Profesional.ID)
	if err := gdb.Create(&db.EmailBloqueadoTurnoPublico{
		ProfesionalID: bID, Email: "bloqueado-en-b@example.com", BloqueadoHasta: time.Now().Add(72 * time.Hour),
	}).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo de prueba: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/seguridad/bloqueos", a.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var out bloqueosSeguridadResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	for _, m := range out.MailsBloqueados {
		if m.Email == "bloqueado-en-b@example.com" {
			t.Fatal("A vio un mail bloqueado de B")
		}
	}
}
