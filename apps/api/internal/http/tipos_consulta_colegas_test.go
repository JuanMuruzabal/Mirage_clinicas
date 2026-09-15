package http

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Fase 3.2.5 — tipos de consulta compartidos entre colegas.
//
// Lo que estos tests protegen: que cada profesional vea SUS tipos, que
// los de los colegas se ofrezcan como sugerencia con su dueño a la vista,
// y que el "ya tenés uno parecido" distinga de verdad.
//
// La copia en sí no tiene endpoint desde el 2026-09-14: elegir un tipo ya
// creado rellena el formulario de alta y el tipo se crea por el camino de
// siempre, así que nace propio sin que nadie tenga que garantizarlo.

func TestSeParecen_MismoTipoEscritoDistinto(t *testing.T) {
	iguales := [][2]string{
		{"Conducto", "conducto"},
		{"Conducto", "Conductos"},
		{"Endodoncia", "endodoncía"},
		{"Consulta general", "  Consulta  General  "},
		{"Limpieza", "limpiezá"},
	}
	for _, par := range iguales {
		if !seParecen(par[0], par[1]) {
			t.Errorf("%q y %q deberían ser el mismo tipo escrito distinto", par[0], par[1])
		}
	}
}

// La otra dirección, que es la que hace que el aviso sirva de algo: un
// umbral que junta todo avisaría siempre, y avisar siempre es no avisar.
func TestSeParecen_TiposDistintosNoSeJuntan(t *testing.T) {
	distintos := [][2]string{
		{"Control", "Consulta"},
		{"Limpieza", "Implante"},
		{"Urgencia", "Ortodoncia"},
		{"Conducto", ""},
	}
	for _, par := range distintos {
		if seParecen(par[0], par[1]) {
			t.Errorf("%q y %q son tipos distintos y no deberían juntarse", par[0], par[1])
		}
	}
}

func leerTiposDeColegas(t *testing.T, router http.Handler, token string) []tipoDeColegaResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/tipos-consulta/de-colegas", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /tipos-consulta/de-colegas: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out []tipoDeColegaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return out
}

func leerMisTipos(t *testing.T, router http.Handler, token string) []tipoConsultaResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/tipos-consulta", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /tipos-consulta: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out []tipoConsultaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return out
}

// tipoDe crea un tipo de consulta a nombre de un profesional concreto.
func tipoDe(t *testing.T, gdb *gorm.DB, clinicID, userID uuid.UUID, nombre string, duracion int) db.TipoConsulta {
	t.Helper()
	tipo := db.TipoConsulta{
		ClinicID: clinicID, UserID: &userID, Nombre: nombre,
		Color: "#E7D9BE", DuracionMinutos: duracion,
	}
	if err := gdb.Create(&tipo).Error; err != nil {
		t.Fatalf("no se pudo crear el tipo %q: %v", nombre, err)
	}
	return tipo
}

// TestTiposDeColegas_CadaUnoVeLosSuyos — el hueco que esto cerró. La
// columna `user_id` existe desde la 3.2.1, pero el listado filtraba solo
// por clínica: con dos odontólogos, cada uno veía en su configuración de
// agenda los tipos del otro.
func TestTiposDeColegas_CadaUnoVeLosSuyos(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "tipos-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Tipos",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "tipos-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "tipos-colega@example.com")
	tipoDe(t, gdb, clinicID, colegaID, "Ortodoncia", 45)

	// El titular ve los dos del seed, no la Ortodoncia del colega.
	for _, tipo := range leerMisTipos(t, router, titular.Token) {
		if tipo.Nombre == "Ortodoncia" {
			t.Error("el titular ve en SU configuración un tipo de su colega")
		}
	}
	// Y el colega ve solo el suyo.
	mios := leerMisTipos(t, router, tokenColega)
	if len(mios) != 1 || mios[0].Nombre != "Ortodoncia" {
		t.Errorf("los tipos del colega = %+v, esperaba solo Ortodoncia", mios)
	}
}

// TestTiposDeColegas_AvisaCuandoYaTenesUnoParecido — el fuzzy matching en
// su lugar real: no bloquea, avisa.
func TestTiposDeColegas_AvisaCuandoYaTenesUnoParecido(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "tipos-avisa-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Avisa",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "tipos-avisa-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "tipos-avisa-colega@example.com")

	// Uno que se parece a "Consulta general" del seed, y otro que no.
	tipoDe(t, gdb, clinicID, colegaID, "Consulta General", 30)
	tipoDe(t, gdb, clinicID, colegaID, "Ortodoncia", 45)

	porNombre := map[string]bool{}
	for _, tipo := range leerTiposDeColegas(t, router, titular.Token) {
		porNombre[tipo.Nombre] = tipo.YaTenesUnoParecido
		if tipo.DeNombre == "" {
			t.Errorf("%q no dice de quién es", tipo.Nombre)
		}
	}
	if !porNombre["Consulta General"] {
		t.Error("no avisó que ya tenés uno parecido a 'Consulta General'")
	}
	if porNombre["Ortodoncia"] {
		t.Error("avisó de un parecido que no existe para 'Ortodoncia'")
	}
}

// TestTiposDeColegas_NoSeVeElDeOtraClinica — el id de un tipo no es
// secreto: viaja en la pantalla de quien lo tenga. Sin filtrar por
// clínica, alcanzaría para copiarle la configuración de agenda a
// cualquiera.
func TestTiposDeColegas_NoSeVeElDeOtraClinica(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "tipos-ajena-a@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica A",
	})
	otra := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "tipos-ajena-b@example.com", Password: "unaClaveLarga123",
		Nombre: "Bea Ruiz", NombreClinica: "Clínica B",
	})
	ajeno := leerMisTipos(t, router, otra.Token)[0]

	for _, tipo := range leerTiposDeColegas(t, router, titular.Token) {
		if tipo.ID == ajeno.ID {
			t.Error("se ve un tipo de otra clínica")
		}
	}
}
