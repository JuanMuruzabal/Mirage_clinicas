package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// Fase 3.2.5, corrección del 2026-09-14 — los dos agujeros que encontró el
// cliente probando con un colega de verdad.
//
// Los dos comparten una causa de forma: eran simplificaciones escritas
// cuando una clínica tenía exactamente un profesional, su dueño, y
// dejaron de ser ciertas apenas la 3.2.4 permitió invitar a un segundo.
// Ninguna se nota mirando la pantalla propia — se notan en la del otro.

// TestColega_ElTurnoQueCargaEsSuyo — EL AGUJERO GRAVE. Un profesional
// invitado cargaba un turno y el turno se le asignaba al TITULAR: le
// aparecía en la agenda al titular y no en la suya. Y el paciente detrás
// también, porque "los pacientes de X" se derivan de sus turnos.
//
// Es exactamente la fuga que el aislamiento de la 3.2.2 existe para
// impedir, entrando por la puerta de al lado: no por una query que
// filtraba mal, sino por el dato que esas queries leen.
func TestColega_ElTurnoQueCargaEsSuyo(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "aisl-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Aislamiento",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "aisl-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "aisl-colega@example.com")

	// El colega necesita un tipo de consulta propio para cargar el turno.
	tipo := tipoDe(t, gdb, clinicID, colegaID, "Consulta del colega", 30)

	inicio := time.Now().Add(48 * time.Hour).Truncate(time.Hour)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", tokenColega, map[string]any{
		"nombreContacto":   "Paciente",
		"apellidoContacto": "Del Colega",
		"dniContacto":      "40111222",
		"telefonoContacto": "+5493511234567",
		"emailContacto":    "paciente-colega@example.com",
		"tipoConsultaId":   tipo.ID.String(),
		"horaInicio":       inicio.Format(time.RFC3339),
		"horaFin":          inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear turno: status=%d body=%s", rec.Code, rec.Body.String())
	}

	var turno db.Turno
	if err := gdb.Where("clinic_id = ?", clinicID).First(&turno).Error; err != nil {
		t.Fatalf("no se encontró el turno: %v", err)
	}
	if turno.AtendidoPorUserID == nil {
		t.Fatal("el turno quedó sin profesional")
	}
	if *turno.AtendidoPorUserID != colegaID {
		t.Errorf("el turno se asignó a %v, esperaba al colega %v que lo cargó", *turno.AtendidoPorUserID, colegaID)
	}

	// Y la consecuencia que se ve en pantalla: es SUYO en su listado, y no
	// está en el del titular. Las dos direcciones, porque arreglar una sin
	// la otra deja el agujero abierto del lado que no se miró.
	if n := len(listarTurnosDePrueba(t, router, tokenColega)); n != 1 {
		t.Errorf("el colega ve %d turnos propios, esperaba 1", n)
	}
	if n := len(listarTurnosDePrueba(t, router, titular.Token)); n != 0 {
		t.Errorf("el titular ve %d turnos del colega, esperaba 0", n)
	}
}

func listarTurnosDePrueba(t *testing.T, router http.Handler, token string) []map[string]any {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/turnos", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /turnos: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return out
}

// TestColega_PuedeEntrarSinTenerClinicaPropia — el otro: un invitado que
// nunca creó una clínica quedaba con el onboarding incompleto para
// siempre, porque ese paso solo se marca al crear una clínica propia. El
// guard del frontend lo rebotaba, y la única forma de entrar era crear una
// clínica que no quería — justo lo que la 3.2.3 quiso evitar.
func TestColega_PuedeEntrarSinTenerClinicaPropia(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "onb-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Onboarding",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "onb-colega@example.com", db.RoleProfesional)

	// Precondición: el colega NO tiene clínica propia, y su paso de
	// onboarding sigue sin marcarse como completo.
	var user db.User
	if err := gdb.First(&user, "email = ?", "onb-colega@example.com").Error; err != nil {
		t.Fatalf("no se encontró al colega: %v", err)
	}
	if user.OnboardingStep == db.OnboardingStepCompleto {
		t.Fatal("precondición inválida: el colega ya tenía el paso completo")
	}

	// Le falta el perfil todavía: sin él, no puede usar la app.
	rec := doJSONAuth(t, router, http.MethodGet, "/me", tokenColega, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /me: status=%d", rec.Code)
	}
	var sinPerfil meResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &sinPerfil)
	if sinPerfil.OnboardingCompletado {
		t.Error("sin perfil cargado no puede estar completo")
	}

	// Carga el perfil, y con eso ya tiene todo: perfil + una clínica donde
	// trabajar. No hace falta que cree una propia.
	var especialidad db.Especialidad
	if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
		t.Fatalf("no se encontró la especialidad: %v", err)
	}
	rec = doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", tokenColega, onboardingPerfilRequest{
		Nombre: "Beto", Apellido: "Colega", Telefono: "+5493511234567",
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: matriculaDePrueba("onb-colega@example.com"),
		EspecialidadIDs: []string{especialidad.ID.String()},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("cargar perfil: status=%d body=%s", rec.Code, rec.Body.String())
	}

	rec = doJSONAuth(t, router, http.MethodGet, "/me", tokenColega, nil)
	var conPerfil meResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &conPerfil)
	if !conPerfil.OnboardingCompletado {
		t.Error("con perfil y una clínica donde trabajar, el onboarding tiene que estar completo")
	}
	if conPerfil.Clinica == nil || conPerfil.Clinica.Nombre != "Clínica Onboarding" {
		t.Errorf("la clínica activa del colega = %+v, esperaba la del titular", conPerfil.Clinica)
	}
}

// --- La AGENDA también es de cada profesional -----------------------
//
// Arreglar a quién se le asigna un turno sin arreglar esto deja el
// aislamiento a medias: los turnos dejan de cruzarse, pero los huecos
// donde entran seguirían saliendo de datos mezclados.

// TestColega_ElHorarioDeAtencionEsDeCadaUno — el PUT del horario general
// buscaba la fila `general` de la CLÍNICA y la pisaba: guardar el propio
// le cambiaba el horario al colega, y ninguno se enteraba hasta que el
// calendario ofrecía huecos equivocados.
func TestColega_ElHorarioDeAtencionEsDeCadaUno(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "ag-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Agenda",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "ag-colega@example.com", db.RoleProfesional)

	// El titular abre a las 08:00; el colega, a las 14:00.
	if rec := doJSONAuth(t, router, http.MethodPut, "/horario-atencion", titular.Token, map[string]any{
		"horaDesde": "08:00", "horaHasta": "12:00",
	}); rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("horario del titular: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if rec := doJSONAuth(t, router, http.MethodPut, "/horario-atencion", tokenColega, map[string]any{
		"horaDesde": "14:00", "horaHasta": "18:00",
	}); rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("horario del colega: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Cada uno conserva el suyo. Sin el arreglo, el segundo PUT pisaba el
	// primero y los dos leían 14:00.
	if desde := horarioGeneralDePrueba(t, router, titular.Token); desde != "08:00" {
		t.Errorf("el titular lee %q, esperaba 08:00 — se lo pisó el colega", desde)
	}
	if desde := horarioGeneralDePrueba(t, router, tokenColega); desde != "14:00" {
		t.Errorf("el colega lee %q, esperaba 14:00", desde)
	}
}

func horarioGeneralDePrueba(t *testing.T, router http.Handler, token string) string {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/horario-atencion", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /horario-atencion: status=%d body=%s", rec.Code, rec.Body.String())
	}
	// El listado devuelve un array con el general PRIMERO y las
	// excepciones después (ver listHorariosAtencionHandler).
	var resp []struct {
		Alcance   string  `json:"alcance"`
		HoraDesde *string `json:"horaDesde"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	for _, h := range resp {
		if h.Alcance == db.HorarioAtencionAlcanceGeneral && h.HoraDesde != nil {
			return *h.HoraDesde
		}
	}
	return ""
}

// TestColega_LosHorariosReservadosNoSeCruzan — un horario reservado es de
// quien lo reserva. Las dos direcciones: el propio se ve, el ajeno no.
func TestColega_LosHorariosReservadosNoSeCruzan(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "bl-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Bloqueos",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "bl-colega@example.com", db.RoleProfesional)

	rec := doJSONAuth(t, router, http.MethodPost, "/bloqueos", tokenColega, map[string]any{
		"motivo": "Almuerzo del colega", "alcance": db.BloqueoAlcanceTodos,
		"diaSemana": 1, "horaDesde": "13:00", "horaHasta": "14:00",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear bloqueo: status=%d body=%s", rec.Code, rec.Body.String())
	}

	if n := len(listarBloqueosDePrueba(t, router, tokenColega)); n != 1 {
		t.Errorf("el colega ve %d horarios reservados propios, esperaba 1", n)
	}
	if n := len(listarBloqueosDePrueba(t, router, titular.Token)); n != 0 {
		t.Errorf("el titular ve %d horarios reservados del colega, esperaba 0", n)
	}
}

func listarBloqueosDePrueba(t *testing.T, router http.Handler, token string) []map[string]any {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/bloqueos", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /bloqueos: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return out
}

// TestColega_ElTurnoDelOtroNoOcupaMiHorario — el que cierra el círculo.
//
// El cálculo de disponibilidad contaba los turnos de TODA la clínica, así
// que el turno del colega a las 10 bloqueaba las 10 propias. Es el mismo
// bug que la 3.2.1 sacó del exclusion constraint al mudarlo a
// `atendido_por_user_id` —"sobre la clínica rechazaría dos turnos
// simultáneos en sillones distintos"— reaparecido un nivel más arriba: el
// motor ya los dejaba convivir, pero la pantalla no los ofrecía.
func TestColega_ElTurnoDelOtroNoOcupaMiHorario(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "disp-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Disponibilidad",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "disp-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "disp-colega@example.com")

	tipoColega := tipoDe(t, gdb, clinicID, colegaID, "Consulta colega", 30)
	tipoTitular := leerMisTipos(t, router, titular.Token)[0]

	// Un día hábil futuro, dentro del horario por default.
	dia := clock.Today().AddDate(0, 0, 7)
	for dia.Weekday() == time.Saturday || dia.Weekday() == time.Sunday {
		dia = dia.AddDate(0, 0, 1)
	}
	inicio := time.Date(dia.Year(), dia.Month(), dia.Day(), 10, 0, 0, 0, dia.Location())

	antes := slotsDePrueba(t, router, titular.Token, tipoTitular.ID, dia)
	if !contiene(antes, "10:00") {
		t.Fatalf("precondición: las 10:00 tenían que estar libres para el titular. slots=%v", antes)
	}

	// El COLEGA toma las 10:00.
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", tokenColega, map[string]any{
		"nombreContacto": "Paciente", "apellidoContacto": "Del Colega", "dniContacto": "41222333",
		"telefonoContacto": "+5493511234567", "emailContacto": "p-colega@example.com",
		"tipoConsultaId": tipoColega.ID.String(),
		"horaInicio":     inicio.Format(time.RFC3339),
		"horaFin":        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear turno del colega: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Al titular le siguen quedando libres: son dos sillones distintos.
	despues := slotsDePrueba(t, router, titular.Token, tipoTitular.ID, dia)
	if !contiene(despues, "10:00") {
		t.Errorf("el turno del colega bloqueó las 10:00 del titular. slots=%v", despues)
	}
	// Y al colega ya no: la otra dirección, que es la que prueba que el
	// filtro no desactivó el cálculo entero.
	suyos := slotsDePrueba(t, router, tokenColega, tipoColega.ID.String(), dia)
	if contiene(suyos, "10:00") {
		t.Errorf("el colega tiene su propio turno a las 10:00 y le siguen apareciendo libres. slots=%v", suyos)
	}
}

func contiene(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func slotsDePrueba(t *testing.T, router http.Handler, token, tipoID string, dia time.Time) []string {
	t.Helper()
	ruta := "/disponibilidad?tipoConsultaId=" + tipoID + "&fecha=" + dia.Format("2006-01-02")
	rec := doJSONAuth(t, router, http.MethodGet, ruta, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET %s: status=%d body=%s", ruta, rec.Code, rec.Body.String())
	}
	var resp struct {
		Slots []string `json:"slots"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return resp.Slots
}
