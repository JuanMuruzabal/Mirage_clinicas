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

// La vista del recepcionista — Fase 3.2.6.
//
// Lo que estos tests protegen son las dos mitades del pedido, que tiran
// en direcciones opuestas:
//
//   - Recepción tiene que PODER pararse en la vista de cualquier
//     profesional e interactuar con ella (el brief: "acceso a todas las
//     vistas de los N profesionales").
//   - Y nadie más tiene que poder hacerlo, porque el mismo brief pide en
//     mayúsculas que la vista de cada profesional esté aislada del resto.
//
// La implementación entera es un concepto —el profesional en foco— que
// entra por `visibilidad.go`, así que estos tests son también la
// verificación de que los seis scopes lo respetan sin haber tocado sus
// consultas.

// clinicaConDosProfesionalesYRecepcion arma el escenario completo: el
// titular (que atiende), un colega que atiende, y alguien en recepción.
type escenarioRecepcion struct {
	clinicID   uuid.UUID
	titular    clinicaDePruebaResult
	colegaID   uuid.UUID
	recepToken string
	tipoID     string
}

func clinicaConDosProfesionalesYRecepcion(t *testing.T, gdb *gorm.DB, router http.Handler, sufijo string) escenarioRecepcion {
	t.Helper()
	titular, tipoID := profesionalConTipoConsulta(t, gdb, router, "titular-"+sufijo+"@example.com")
	clinicID := uuid.MustParse(titular.Profesional.ID)

	sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-"+sufijo+"@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "colega-"+sufijo+"@example.com")

	recepToken := sumarColaboradorDePrueba(t, gdb, router, clinicID, "recep-"+sufijo+"@example.com", db.RoleRecepcion)

	return escenarioRecepcion{
		clinicID: clinicID, titular: titular, colegaID: colegaID,
		recepToken: recepToken, tipoID: tipoID,
	}
}

func elegirVista(t *testing.T, router http.Handler, token, userID string) int {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodPut, "/me/vista", token, elegirVistaRequest{UserID: userID})
	return rec.Code
}

func turnosQueVe(t *testing.T, router http.Handler, token string) []turnoResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/turnos?estado=agendado", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /turnos: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out []turnoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return out
}

// TestVistaRecepcion_SinFocoVeLaClinicaEntera — la vista general, que es
// el estado por default: todos los turnos de todos los profesionales.
func TestVistaRecepcion_SinFocoVeLaClinicaEntera(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "general")

	// Un turno de cada profesional.
	crearTurnoAgendadoDePrueba(t, gdb, esc.titular.Profesional.ID, esc.tipoID, time.Now().Add(2*time.Hour))
	delColega := crearTurnoAgendadoDePrueba(t, gdb, esc.titular.Profesional.ID, esc.tipoID, time.Now().Add(4*time.Hour))
	if err := gdb.Model(&db.Turno{}).Where("id = ?", delColega.ID).
		Update("atendido_por_user_id", esc.colegaID).Error; err != nil {
		t.Fatalf("no se pudo reasignar el turno: %v", err)
	}

	vistos := turnosQueVe(t, router, esc.recepToken)
	if len(vistos) != 2 {
		t.Errorf("turnos = %d, esperaba los 2 de la clínica", len(vistos))
	}
}

// TestVistaRecepcion_ConFocoVeSoloEsaAgenda — la otra mitad: pararse en
// la vista de un profesional acota TODO a esa agenda, sin que ninguna de
// las consultas del panel haya cambiado.
func TestVistaRecepcion_ConFocoVeSoloEsaAgenda(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "foco")

	crearTurnoAgendadoDePrueba(t, gdb, esc.titular.Profesional.ID, esc.tipoID, time.Now().Add(2*time.Hour))
	delColega := crearTurnoAgendadoDePrueba(t, gdb, esc.titular.Profesional.ID, esc.tipoID, time.Now().Add(4*time.Hour))
	if err := gdb.Model(&db.Turno{}).Where("id = ?", delColega.ID).
		Update("atendido_por_user_id", esc.colegaID).Error; err != nil {
		t.Fatalf("no se pudo reasignar el turno: %v", err)
	}

	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}

	vistos := turnosQueVe(t, router, esc.recepToken)
	if len(vistos) != 1 || vistos[0].ID != delColega.ID.String() {
		t.Fatalf("turnos = %+v, esperaba solo el del colega (%s)", vistos, delColega.ID)
	}
	// Y lo puede tocar: en la vista de alguien, sus turnos son "míos".
	if !vistos[0].EsMio {
		t.Error("esMio = false: en la vista de un profesional sus turnos tienen que ser operables")
	}
}

// TestVistaRecepcion_VolverALaVistaGeneral — mandar vacío vuelve atrás.
func TestVistaRecepcion_VolverALaVistaGeneral(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "volver")

	crearTurnoAgendadoDePrueba(t, gdb, esc.titular.Profesional.ID, esc.tipoID, time.Now().Add(2*time.Hour))
	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	if n := len(turnosQueVe(t, router, esc.recepToken)); n != 0 {
		t.Fatalf("en la vista del colega se ven %d turnos, esperaba 0", n)
	}

	if code := elegirVista(t, router, esc.recepToken, ""); code != http.StatusOK {
		t.Fatalf("volver a la general: status=%d", code)
	}
	if n := len(turnosQueVe(t, router, esc.recepToken)); n != 1 {
		t.Errorf("en la vista general se ven %d turnos, esperaba 1", n)
	}
}

// TestVistaRecepcion_ElTurnoEntraEnLaAgendaDelProfesionalEnFoco — acá
// termina el provisorio de la 3.2.1, que asignaba al TITULAR cualquier
// turno cargado por recepción. Era la razón por la que un turno aparecía
// en la agenda del dueño de la clínica en vez de la de quien lo iba a
// atender.
func TestVistaRecepcion_ElTurnoEntraEnLaAgendaDelProfesionalEnFoco(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "alta")

	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}

	inicio := time.Now().Add(48 * time.Hour)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", esc.recepToken, crearTurnoManualRequest{
		NombreContacto: "Ana", ApellidoContacto: "Paciente", DNIContacto: "41222333",
		TelefonoContacto: "3510000000", EmailContacto: "ana-alta@example.com",
		TipoConsultaID: esc.tipoID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear turno: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var creado turnoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &creado)

	// Contra la BASE y no contra la respuesta: `atendidoPorUserId` se
	// completa en los listados (ver completarProfesionalDeTurnos), no en
	// el 201 del alta. Lo que importa acá es en qué agenda quedó.
	var enLaBase db.Turno
	if err := gdb.First(&enLaBase, "id = ?", creado.ID).Error; err != nil {
		t.Fatalf("no se pudo leer el turno creado: %v", err)
	}
	if enLaBase.AtendidoPorUserID == nil || *enLaBase.AtendidoPorUserID != esc.colegaID {
		t.Errorf("atendido_por_user_id = %v, esperaba el colega en foco (%s) y no el titular",
			enLaBase.AtendidoPorUserID, esc.colegaID)
	}
}

// TestVistaRecepcion_SinFocoNoSePuedeCargarUnTurno — la vista general es
// para mirar. Para actuar hay que pararse en una agenda, y adivinar acá
// (caer al owner, como hacía el provisorio) es exactamente el error que
// esto corrige.
func TestVistaRecepcion_SinFocoNoSePuedeCargarUnTurno(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "sinfoco")

	inicio := time.Now().Add(48 * time.Hour)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", esc.recepToken, crearTurnoManualRequest{
		NombreContacto: "Ana", ApellidoContacto: "Paciente", DNIContacto: "41222334",
		TelefonoContacto: "3510000000", EmailContacto: "ana-sinfoco@example.com",
		TipoConsultaID: esc.tipoID,
		HoraInicio:     inicio.Format(time.RFC3339),
		HoraFin:        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("status=%d, esperaba 409 pidiendo elegir vista. body=%s", rec.Code, rec.Body.String())
	}
}

// TestVistaRecepcion_UnProfesionalNoPuedeCambiarDeVista — el aislamiento
// de la 3.2.2, que esta subfase NO relaja. Un 403 explícito y no un
// selector escondido en el frontend: esconder el botón nunca fue cerrar
// la puerta (misma lección que /personalizar-pagina en la 3.2.4).
func TestVistaRecepcion_UnProfesionalNoPuedeCambiarDeVista(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "aislado")

	if code := elegirVista(t, router, esc.titular.Token, esc.colegaID.String()); code != http.StatusForbidden {
		t.Errorf("status=%d, esperaba 403: un profesional no mira la agenda de un colega", code)
	}
}

// TestVistaRecepcion_SoloSePuedeMirarAQuienAtiende — un administrador de
// página o un segundo recepcionista no tienen agenda que mirar.
func TestVistaRecepcion_SoloSePuedeMirarAQuienAtiende(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "sinagenda")

	sumarColaboradorDePrueba(t, gdb, router, esc.clinicID, "admin-sinagenda@example.com", db.RoleAdmin)
	adminID := userIDDelMail(t, gdb, "admin-sinagenda@example.com")

	if code := elegirVista(t, router, esc.recepToken, adminID.String()); code != http.StatusConflict {
		t.Errorf("status=%d, esperaba 409: un administrador de página no tiene agenda", code)
	}
}

// TestVistaRecepcion_NoSePuedeMirarAAlguienDeOtraClinica — mismo criterio
// que la ficha de un paciente ajeno (TR-138): 404, no 403.
func TestVistaRecepcion_NoSePuedeMirarAAlguienDeOtraClinica(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "ajena")

	otra := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-otraclinica@example.com", Password: "unaClaveLarga123",
		Nombre: "Ema", NombreClinica: "Clínica Ajena",
	})
	ajenoID := userIDDelMail(t, gdb, "titular-otraclinica@example.com")
	_ = otra

	if code := elegirVista(t, router, esc.recepToken, ajenoID.String()); code != http.StatusNotFound {
		t.Errorf("status=%d, esperaba 404", code)
	}
}

// TestVistaRecepcion_ElFocoNoSobreviveAQueLoSaquenDelEquipo — la
// elección de mirar una agenda no puede sobrevivir sola a que cambien
// las condiciones. Se cae a la vista general, que es el estado seguro.
func TestVistaRecepcion_ElFocoNoSobreviveAQueLoSaquenDelEquipo(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "removido")

	crearTurnoAgendadoDePrueba(t, gdb, esc.titular.Profesional.ID, esc.tipoID, time.Now().Add(2*time.Hour))
	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	if n := len(turnosQueVe(t, router, esc.recepToken)); n != 0 {
		t.Fatalf("en la vista del colega se ven %d turnos, esperaba 0", n)
	}

	// El titular lo saca del equipo.
	rec := doJSONAuth(t, router, http.MethodDelete, "/equipo/miembros/"+esc.colegaID.String(), esc.titular.Token, nil)
	if rec.Code != http.StatusOK && rec.Code != http.StatusNoContent {
		t.Fatalf("quitar del equipo: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// La sesión de recepción cae sola a la vista general.
	if n := len(turnosQueVe(t, router, esc.recepToken)); n != 1 {
		t.Errorf("turnos = %d, esperaba 1: el foco tenía que caer a la vista general", n)
	}
	rec = doJSONAuth(t, router, http.MethodGet, "/me/vista", esc.recepToken, nil)
	var vista vistaActualResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &vista)
	if vista.Profesional != nil {
		t.Errorf("vista = %+v, esperaba la general", vista.Profesional)
	}
}

// TestVistaRecepcion_SumarPacienteEntraEnLaListaDelProfesionalEnFoco —
// el camino que el cliente describió para pasar un paciente de un
// profesional a otro: recepción se para en la vista del que lo va a
// atender y lo suma desde "De la clínica". Por eso esta subfase NO
// agrega una función propia para eso.
func TestVistaRecepcion_SumarPacienteEntraEnLaListaDelProfesionalEnFoco(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "sumar")

	pacienteID := crearPacienteDePruebaPaginaPublica(t, gdb, esc.clinicID, "46111222")

	if code := elegirVista(t, router, esc.recepToken, esc.colegaID.String()); code != http.StatusOK {
		t.Fatalf("elegir vista: status=%d", code)
	}
	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/"+pacienteID.String()+"/en-mi-lista", esc.recepToken, nil)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("sumar a la lista: status=%d body=%s", rec.Code, rec.Body.String())
	}

	var enLista db.PacienteEnMiLista
	if err := gdb.Where("paciente_id = ?", pacienteID).First(&enLista).Error; err != nil {
		t.Fatalf("no quedó en ninguna lista: %v", err)
	}
	if enLista.UserID != esc.colegaID {
		t.Errorf("user_id = %s, esperaba el colega en foco (%s) y no el recepcionista", enLista.UserID, esc.colegaID)
	}
}

// TestVistaRecepcion_SinFocoNoSePuedeSumarAUnaLista — no hay lista a la
// que sumar desde la vista general.
func TestVistaRecepcion_SinFocoNoSePuedeSumarAUnaLista(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	esc := clinicaConDosProfesionalesYRecepcion(t, gdb, router, "sumarsinfoco")

	pacienteID := crearPacienteDePruebaPaginaPublica(t, gdb, esc.clinicID, "46111223")
	rec := doJSONAuth(t, router, http.MethodPost, "/pacientes/"+pacienteID.String()+"/en-mi-lista", esc.recepToken, nil)
	if rec.Code != http.StatusConflict {
		t.Errorf("status=%d, esperaba 409 pidiendo elegir vista. body=%s", rec.Code, rec.Body.String())
	}
}
