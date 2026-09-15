package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

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
