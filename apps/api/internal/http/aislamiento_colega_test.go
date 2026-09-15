package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

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

// --- El barrido completo de "gestión de clínica" --------------------
//
// Pedido del cliente el 2026-09-14: "TODA la lógica que se maneja en
// gestión de clínica debería ser individual para cada profesional".
//
// Lo que estos tests cubren es la ESCRITURA sobre datos ajenos, que es
// donde el daño es real: ver de más se corrige mirando, marcar la
// asistencia de un turno ajeno no se deshace (TR-092).

// turnoDePrueba deja un turno cargado por `token` y devuelve su id.
func turnoDePrueba(t *testing.T, router http.Handler, gdb *gorm.DB, clinicID uuid.UUID, token, email, dni string) string {
	t.Helper()
	userID := userIDDelMail(t, gdb, email)
	tipo := tipoDe(t, gdb, clinicID, userID, "Tipo de "+dni, 30)
	inicio := time.Now().Add(72 * time.Hour).Truncate(time.Hour)

	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", token, map[string]any{
		"nombreContacto": "Paciente", "apellidoContacto": "De Prueba", "dniContacto": dni,
		"telefonoContacto": "+5493511234567", "emailContacto": "p" + dni + "@example.com",
		"tipoConsultaId": tipo.ID.String(),
		"horaInicio":     inicio.Format(time.RFC3339),
		"horaFin":        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear turno: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var creado struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &creado); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return creado.ID
}

// TestColega_NoSePuedeTocarElTurnoDeOtro — las cuatro escrituras que
// estaban abiertas con solo tener el id: ver, cancelar, reprogramar y
// marcar asistencia. 404 y no 403, mismo criterio que la ficha ajena.
func TestColega_NoSePuedeTocarElTurnoDeOtro(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "esc-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Escrituras",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "esc-colega@example.com", db.RoleProfesional)

	// Un turno DEL COLEGA, y el titular intentando tocarlo.
	turnoID := turnoDePrueba(t, router, gdb, clinicID, tokenColega, "esc-colega@example.com", "42111222")

	casos := []struct {
		nombre string
		ruta   string
		cuerpo any
	}{
		{"cancelar", "/turnos/" + turnoID + "/cancelar", map[string]any{}},
		{"reprogramar", "/turnos/" + turnoID + "/hora", map[string]any{
			"horaInicio": time.Now().Add(96 * time.Hour).Format(time.RFC3339),
			"horaFin":    time.Now().Add(96*time.Hour + 30*time.Minute).Format(time.RFC3339),
		}},
		{"marcar asistencia", "/turnos/" + turnoID + "/asistencia", map[string]any{"asistencia": "asistio"}},
	}
	for _, c := range casos {
		rec := doJSONAuth(t, router, http.MethodPatch, c.ruta, titular.Token, c.cuerpo)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s el turno del colega: status=%d, esperaba %d. body=%s",
				c.nombre, rec.Code, http.StatusNotFound, rec.Body.String())
		}
	}

	// Y el dueño sí puede cancelarlo: sin esto, el test pasaría con el
	// endpoint roto para todos.
	rec := doJSONAuth(t, router, http.MethodPatch, "/turnos/"+turnoID+"/cancelar", tokenColega, map[string]any{})
	if rec.Code != http.StatusOK {
		t.Errorf("el dueño no puede cancelar su propio turno: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

// TestColega_LosPendientesDeAsistenciaSonLosPropios — el listado que
// invita a marcar asistencia. Con los del colega adentro, la primera
// acción del día podía ser cerrarle un turno ajeno.
func TestColega_LosPendientesDeAsistenciaSonLosPropios(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "pend-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Pendientes",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "pend-colega@example.com", db.RoleProfesional)

	turnoID := turnoDePrueba(t, router, gdb, clinicID, tokenColega, "pend-colega@example.com", "43111222")
	// Se lo empuja al pasado para que quede pendiente de marcar.
	if err := gdb.Model(&db.Turno{}).Where("id = ?", turnoID).
		Updates(map[string]any{
			"hora_inicio": time.Now().Add(-2 * time.Hour),
			"hora_fin":    time.Now().Add(-90 * time.Minute),
		}).Error; err != nil {
		t.Fatalf("no se pudo envejecer el turno: %v", err)
	}

	if n := len(pendientesDePrueba(t, router, tokenColega)); n != 1 {
		t.Errorf("el colega ve %d pendientes propios, esperaba 1", n)
	}
	if n := len(pendientesDePrueba(t, router, titular.Token)); n != 0 {
		t.Errorf("el titular ve %d pendientes del colega, esperaba 0", n)
	}
}

func pendientesDePrueba(t *testing.T, router http.Handler, token string) []map[string]any {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/turnos/pendientes-asistencia", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /turnos/pendientes-asistencia: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out struct {
		Vencidos []map[string]any `json:"vencidos"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return out.Vencidos
}

// TestColega_NoSePuedeEditarElTipoDeConsultaDeOtro — el listado ya
// mostraba solo los propios, pero con el id a mano la escritura seguía
// abierta: cambiarle la duración a un tipo ajeno le mueve los huecos del
// día a su dueño.
func TestColega_NoSePuedeEditarElTipoDeConsultaDeOtro(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "tipo-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Tipos Ajenos",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "tipo-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "tipo-colega@example.com")
	delColega := tipoDe(t, gdb, clinicID, colegaID, "Conducto del colega", 60)

	rec := doJSONAuth(t, router, http.MethodPatch, "/tipos-consulta/"+delColega.ID.String(), titular.Token,
		tipoConsultaRequest{Nombre: "Robado", Color: "#E7D9BE", DuracionMinutos: 15})
	if rec.Code != http.StatusNotFound {
		t.Errorf("editar el tipo del colega: status=%d, esperaba %d", rec.Code, http.StatusNotFound)
	}
	rec = doJSONAuth(t, router, http.MethodDelete, "/tipos-consulta/"+delColega.ID.String(), titular.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("borrar el tipo del colega: status=%d, esperaba %d", rec.Code, http.StatusNotFound)
	}

	// Y sigue intacto.
	var despues db.TipoConsulta
	if err := gdb.First(&despues, "id = ?", delColega.ID).Error; err != nil {
		t.Fatalf("el tipo del colega desapareció: %v", err)
	}
	if despues.DuracionMinutos != 60 || despues.Nombre != "Conducto del colega" {
		t.Errorf("le cambiaron el tipo al colega: %+v", despues)
	}
}

// TestColega_ElEnlaceCompartidoLlenaLaAgendaDeQuienLoGenero — el link es
// la tercera pestaña de "+ Agregar turno" de un profesional: existe para
// llenar SU agenda. Mandando el turno al owner, compartirlo le cargaría
// turnos a otro.
func TestColega_ElEnlaceCompartidoLlenaLaAgendaDeQuienLoGenero(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "enl-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Enlaces",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "enl-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "enl-colega@example.com")

	rec := doJSONAuth(t, router, http.MethodPost, "/enlaces-turno", tokenColega, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("generar enlace: status=%d body=%s", rec.Code, rec.Body.String())
	}

	var enlace db.EnlaceTurno
	if err := gdb.Where("clinic_id = ?", clinicID).First(&enlace).Error; err != nil {
		t.Fatalf("no se encontró el enlace: %v", err)
	}
	if enlace.UserID == nil || *enlace.UserID != colegaID {
		t.Fatalf("el enlace quedó a nombre de %v, esperaba el colega %v que lo generó", enlace.UserID, colegaID)
	}
}

// TestColega_ElResumenDeGeneralEsElPropio — "General" es la PRIMERA
// pantalla del panel, y hasta el 2026-09-14 cada una de sus siete
// consultas contaba lo de toda la clínica: un profesional entraba y veía
// como suyo el día de su colega.
func TestColega_ElResumenDeGeneralEsElPropio(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "res-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Resumen",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "res-colega@example.com", db.RoleProfesional)

	// Un turno del colega, a futuro: cuenta como confirmado.
	turnoDePrueba(t, router, gdb, clinicID, tokenColega, "res-colega@example.com", "44111222")

	if n := resumenConfirmadosDePrueba(t, router, tokenColega); n != 1 {
		t.Errorf("el colega ve %d turnos confirmados propios, esperaba 1", n)
	}
	if n := resumenConfirmadosDePrueba(t, router, titular.Token); n != 0 {
		t.Errorf("el titular ve %d turnos confirmados del colega, esperaba 0", n)
	}
}

func resumenConfirmadosDePrueba(t *testing.T, router http.Handler, token string) int {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/panel/resumen", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /turnos/resumen: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp struct {
		TotalConfirmados int `json:"totalConfirmados"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return resp.TotalConfirmados
}

// TestColega_NoSePuedeAutoreservarNiCancelarEnMasaLoAjeno — las dos
// escrituras EN LOTE, que son las peores: nadie revisa uno por uno lo que
// mandó. Autoreservar MUEVE turnos de día; la cancelación masiva limpia
// de un botón todos los turnos vigentes de pacientes sin verificar.
func TestColega_NoSePuedeAutoreservarNiCancelarEnMasaLoAjeno(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "lote-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Lote",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "lote-colega@example.com", db.RoleProfesional)
	turnoID := turnoDePrueba(t, router, gdb, clinicID, tokenColega, "lote-colega@example.com", "45111222")

	// El titular intenta autoreservar el turno del colega.
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos/autoreservar", titular.Token, map[string]any{
		"turnoIds": []string{turnoID},
	})
	if rec.Code == http.StatusOK {
		t.Error("el titular pudo autoreservar un turno del colega")
	}

	// Y la cancelación masiva: el paciente del colega no está verificado,
	// así que sin el scope entraría en la barrida.
	rec = doJSONAuth(t, router, http.MethodPost, "/turnos/cancelar-sin-verificar", titular.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("cancelar sin verificar: status=%d body=%s", rec.Code, rec.Body.String())
	}

	var turno db.Turno
	if err := gdb.First(&turno, "id = ?", turnoID).Error; err != nil {
		t.Fatalf("no se encontró el turno: %v", err)
	}
	if turno.Estado != "agendado" {
		t.Errorf("el titular le canceló en masa un turno al colega: estado=%q", turno.Estado)
	}
}

// --- El historial del paciente: completo, pero etiquetado -----------
//
// El paciente es de la CLÍNICA: un historial partido por profesional no
// sirve como historial — el que atiende hoy necesita saber qué le
// hicieron antes, se lo haya hecho quien se lo haya hecho. Lo que no
// puede es tocarlo.

// TestPaciente_LaFichaMuestraTodoElHistorialConSuDueno — las dos mitades
// de la misma regla: se ven los turnos del colega, y se ve que son de él.
func TestPaciente_LaFichaMuestraTodoElHistorialConSuDueno(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "hist-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Historial",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "hist-colega@example.com", db.RoleProfesional)

	// El MISMO paciente (mismo DNI) con los dos profesionales.
	const dni = "46111222"
	turnoDePrueba(t, router, gdb, clinicID, tokenColega, "hist-colega@example.com", dni)

	var paciente db.Paciente
	if err := gdb.Where("clinic_id = ? AND dni = ?", clinicID, dni).First(&paciente).Error; err != nil {
		t.Fatalf("no se encontró la ficha: %v", err)
	}

	// El titular atiende al mismo paciente: recién ahí la ficha entra en
	// su vista (soloMisPacientes).
	tipoTitular := leerMisTipos(t, router, titular.Token)[0]
	inicio := time.Now().Add(120 * time.Hour).Truncate(time.Hour)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", titular.Token, map[string]any{
		"nombreContacto": "Paciente", "apellidoContacto": "De Prueba", "dniContacto": dni,
		"telefonoContacto": "+5493511234567", "emailContacto": "p" + dni + "@example.com",
		"tipoConsultaId": tipoTitular.ID,
		"horaInicio":     inicio.Format(time.RFC3339),
		"horaFin":        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("turno del titular: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// La ficha, vista por el titular: los DOS turnos.
	rec = doJSONAuth(t, router, http.MethodGet, "/pacientes/"+paciente.ID.String(), titular.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET ficha: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var ficha struct {
		Turnos []struct {
			AtendidoPorNombre  string `json:"atendidoPorNombre"`
			EsMio              bool   `json:"esMio"`
			TipoConsultaNombre string `json:"tipoConsultaNombre"`
		} `json:"turnos"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &ficha); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	if len(ficha.Turnos) != 2 {
		t.Fatalf("la ficha muestra %d turnos, esperaba 2 (el historial es de la clínica)", len(ficha.Turnos))
	}

	var propios, ajenos int
	for _, tu := range ficha.Turnos {
		if tu.AtendidoPorNombre == "" {
			t.Error("un turno del historial no dice quién lo atiende")
		}
		// Y tiene que decir QUÉ se hizo (corrección del 2026-09-15,
		// reportada por el cliente). La ficha resolvía el tipo contra la
		// lista de tipos de quien mira: el turno del colega referencia el
		// id del tipo de ÉL, el lookup fallaba y salía "—". Por eso el
		// nombre viaja resuelto en el turno.
		if tu.TipoConsultaNombre == "" {
			t.Errorf("el turno de %q no dice su tipo de consulta: la ficha lo pintaría como \"—\"", tu.AtendidoPorNombre)
		}
		if tu.EsMio {
			propios++
		} else {
			ajenos++
		}
	}
	// Las dos direcciones: marcar todo como propio, o todo como ajeno,
	// pasaría un test que solo contara filas.
	if propios != 1 || ajenos != 1 {
		t.Errorf("propios=%d ajenos=%d, esperaba 1 y 1", propios, ajenos)
	}
}

// TestConflicto_AvisaCuantosTurnosAjenosAlcanza — resolver un conflicto
// cancela o migra los turnos de la ficha que pierde, y esa ficha puede
// tener turnos con un colega: el paciente es de la clínica. El alcance es
// correcto —dejar vivos los turnos de una ficha que se determinó que no
// existe sería peor— pero hasta el 2026-09-14 era invisible.
//
// No se restringe la acción: se declara su alcance. Restringirla dejaría
// conflictos que nadie puede resolver.
func TestConflicto_AvisaCuantosTurnosAjenosAlcanza(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "confl-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Conflicto",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "confl-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "confl-colega@example.com")

	tipo := leerMisTipos(t, router, titular.Token)[0]
	_, enConflicto, _, _ := crearConflictoPacienteDePrueba(
		t, gdb, titular.Profesional.ID, tipo.ID, "48111222",
		"verificado-confl@example.com", "enconflicto-confl@example.com",
	)

	// La ficha en conflicto suma un turno DEL COLEGA: es lo que el aviso
	// tiene que contar.
	tipoColega := tipoDe(t, gdb, clinicID, colegaID, "Consulta del colega", 30)
	inicio := time.Now().Add(150 * time.Hour).Truncate(time.Hour)
	fin := inicio.Add(30 * time.Minute)
	delColega := db.Turno{
		ClinicID: clinicID, AtendidoPorUserID: &colegaID, PacienteID: &enConflicto.ID,
		Estado: "agendado", Origen: "manual", TipoConsultaID: &tipoColega.ID,
		HoraInicio: &inicio, HoraFin: &fin,
		NombreContacto: "Paciente", ApellidoContacto: "En Conflicto", DNIContacto: "48111222",
		TelefonoContacto: "+5493511234567", EmailContacto: "enconflicto-confl@example.com",
	}
	if err := gdb.Create(&delColega).Error; err != nil {
		t.Fatalf("no se pudo crear el turno del colega: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/conflictos", titular.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /pacientes/conflictos: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var conflictos []struct {
		TurnosDeOtrosProfesionales int `json:"turnosDeOtrosProfesionales"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &conflictos); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	if len(conflictos) != 1 {
		t.Fatalf("conflictos = %d, esperaba 1", len(conflictos))
	}
	if conflictos[0].TurnosDeOtrosProfesionales != 1 {
		t.Errorf("el aviso dice %d turnos de otros profesionales, esperaba 1",
			conflictos[0].TurnosDeOtrosProfesionales)
	}
}

// --- La identidad del paciente es de la clínica ---------------------

// TestPaciente_SeEncuentraLaFichaQueCargoUnColega — sin esto, un
// profesional tipeaba de nuevo a alguien que ya existía: el índice único
// de DNI rechazaba el alta y no había forma de engancharla desde la
// pantalla de cargar turno.
func TestPaciente_SeEncuentraLaFichaQueCargoUnColega(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "conoc-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Conocidos",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "conoc-colega@example.com", db.RoleProfesional)

	// Una ficha cargada por el COLEGA.
	turnoDePrueba(t, router, gdb, clinicID, tokenColega, "conoc-colega@example.com", "49111222")

	// El titular la encuentra al buscar para cargar un turno…
	conocidos := pacientesDeLaClinicaDePrueba(t, router, titular.Token, "49111222")
	if len(conocidos) != 1 {
		t.Fatalf("el titular encontró %d fichas, esperaba 1 (la que cargó el colega)", len(conocidos))
	}
	if conocidos[0].EsMio {
		t.Error("la ficha del colega no puede venir marcada como propia")
	}

	// …pero NO aparece en su lista de trabajo: son dos preguntas distintas.
	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes?q=49111222", titular.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /pacientes: status=%d", rec.Code)
	}
	var mios []map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &mios)
	if len(mios) != 0 {
		t.Errorf("la lista de trabajo del titular trae %d fichas del colega, esperaba 0", len(mios))
	}
}

func pacientesDeLaClinicaDePrueba(t *testing.T, router http.Handler, token, q string) []pacienteConocidoResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/de-la-clinica?q="+q, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /pacientes/de-la-clinica: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out []pacienteConocidoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return out
}

// TestPaciente_NoPuedeEstarEnDosSillonesALaVez — el exclusion constraint
// protege al PROFESIONAL, no al paciente: dos agendas distintas pueden
// ofrecer el mismo horario —correctamente, son dos sillones— y la misma
// persona terminar citada en las dos.
func TestPaciente_NoPuedeEstarEnDosSillonesALaVez(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "dos-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Dos Sillones",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "dos-colega@example.com", db.RoleProfesional)

	// El colega le da turno al paciente a una hora concreta.
	const dni = "50111222"
	colegaID := userIDDelMail(t, gdb, "dos-colega@example.com")
	tipoColega := tipoDe(t, gdb, clinicID, colegaID, "Consulta colega", 30)
	inicio := time.Now().Add(200 * time.Hour).Truncate(time.Hour)
	rec := doJSONAuth(t, router, http.MethodPost, "/turnos", tokenColega, map[string]any{
		"nombreContacto": "Paciente", "apellidoContacto": "Ocupado", "dniContacto": dni,
		"telefonoContacto": "+5493511234567", "emailContacto": "ocupado@example.com",
		"tipoConsultaId": tipoColega.ID.String(),
		"horaInicio":     inicio.Format(time.RFC3339),
		"horaFin":        inicio.Add(30 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("turno del colega: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// El titular intenta darle turno a la MISMA persona, encimado.
	tipoTitular := leerMisTipos(t, router, titular.Token)[0]
	rec = doJSONAuth(t, router, http.MethodPost, "/turnos", titular.Token, map[string]any{
		"nombreContacto": "Paciente", "apellidoContacto": "Ocupado", "dniContacto": dni,
		"telefonoContacto": "+5493511234567", "emailContacto": "ocupado@example.com",
		"tipoConsultaId": tipoTitular.ID,
		"horaInicio":     inicio.Add(15 * time.Minute).Format(time.RFC3339),
		"horaFin":        inicio.Add(45 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}
	// El mensaje es la mitad del valor: sin el nombre hay que salir a
	// buscar con quién a mano.
	cuerpo := rec.Body.String()
	// El colega de prueba no tiene perfil cargado, así que se lo nombra
	// por su mail — que es el fallback real, no un genérico.
	if !strings.Contains(cuerpo, "dos-colega@example.com") {
		t.Errorf("el error no dice con qué profesional: %s", cuerpo)
	}

	// Y la otra dirección: pegado pero SIN encimarse, se agenda. Un
	// bloqueo que rechaza todo no distingue nada.
	rec = doJSONAuth(t, router, http.MethodPost, "/turnos", titular.Token, map[string]any{
		"nombreContacto": "Paciente", "apellidoContacto": "Ocupado", "dniContacto": dni,
		"telefonoContacto": "+5493511234567", "emailContacto": "ocupado@example.com",
		"tipoConsultaId": tipoTitular.ID,
		"horaInicio":     inicio.Add(30 * time.Minute).Format(time.RFC3339),
		"horaFin":        inicio.Add(60 * time.Minute).Format(time.RFC3339),
	})
	if rec.Code != http.StatusCreated {
		t.Errorf("un turno pegado pero sin encimarse tiene que poder agendarse: status=%d body=%s",
			rec.Code, rec.Body.String())
	}
}
