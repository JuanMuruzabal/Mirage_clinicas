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
	// Y el colega ve los SUYOS: sus dos precargados (desde el 2026-09-15
	// se los siembra al sumarse) más la Ortodoncia, y ninguna fila del
	// titular. Se compara por ID, no por nombre: los dos tienen su propia
	// "Consulta general", que es justo lo que no hay que confundir.
	delTitular := map[string]bool{}
	for _, tipo := range leerMisTipos(t, router, titular.Token) {
		delTitular[tipo.ID] = true
	}
	mios := leerMisTipos(t, router, tokenColega)
	nombres := map[string]bool{}
	for _, tipo := range mios {
		if delTitular[tipo.ID] {
			t.Errorf("el colega ve en SU configuración la fila %q del titular", tipo.Nombre)
		}
		nombres[tipo.Nombre] = true
	}
	if !nombres["Ortodoncia"] || !nombres[db.NombreTipoConsultaGeneral] || !nombres[db.NombreTipoConsultaUrgencia] {
		t.Errorf("los tipos del colega = %+v, esperaba su Ortodoncia y sus dos precargados", mios)
	}
}

// TestTiposDeColegas_NoOfreceLoQueYaTenes — corrección del 2026-09-15.
//
// Antes se listaba igual, con un cartel "ya tenés uno parecido". Estaba
// mal de dos maneras: es ruido —ofrecer como punto de partida algo que ya
// está en tu lista no ahorra nada— y era engañoso, porque dos
// profesionales con "Consulta general" en colores distintos tienen EL
// MISMO tipo. El color es preferencia de cada agenda, no identidad.
func TestTiposDeColegas_NoOfreceLoQueYaTenes(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "tipos-avisa-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Avisa",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "tipos-avisa-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "tipos-avisa-colega@example.com")

	// El colega tiene uno que el titular YA tiene (viene del seed, escrito
	// distinto) y otro que no.
	tipoDe(t, gdb, clinicID, colegaID, "Consulta General", 30)
	tipoDe(t, gdb, clinicID, colegaID, "Ortodoncia del colega", 45)

	ofrecidos := map[string]string{}
	for _, tipo := range leerTiposDeColegas(t, router, titular.Token) {
		ofrecidos[tipo.Nombre] = tipo.Origen
	}

	if _, hay := ofrecidos["Consulta General"]; hay {
		t.Error("ofrece 'Consulta General', que el titular ya tiene: es el mismo tipo, no uno parecido")
	}
	if origen := ofrecidos["Ortodoncia del colega"]; origen != origenTipoColega {
		t.Errorf("el tipo del colega no se ofrece o viene con origen %q", origen)
	}
}

// TestTiposDeColegas_OfreceElRepertorioOdontologico — con una clínica
// nueva, o con un colega que armó dos tipos, la lista quedaba casi vacía
// y no ayudaba a nadie. El repertorio da nombres que un odontólogo
// reconoce en vez de dejarlo inventar la nomenclatura.
func TestTiposDeColegas_OfreceElRepertorioOdontologico(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "tipos-catalogo@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Catálogo",
	})

	porNombre := map[string]string{}
	for _, tipo := range leerTiposDeColegas(t, router, titular.Token) {
		porNombre[tipo.Nombre] = tipo.Origen
	}

	if porNombre["Limpieza dental"] != origenTipoCatalogo {
		t.Errorf("no ofrece 'Limpieza dental' del repertorio: %+v", porNombre)
	}
	// Y no repite lo que el titular ya tiene del seed: las dos
	// direcciones del mismo filtro.
	if _, hay := porNombre["Consulta general"]; hay {
		t.Error("el repertorio ofrece 'Consulta general', que el titular ya tiene del alta")
	}
}

// TestTipoConsulta_NoSePuedeCrearDosVecesElMismo — tener el mismo tipo
// dos veces no es una elección: es un clic de más, y después hay que
// elegir entre dos opciones idénticas cada vez que se carga un turno.
func TestTipoConsulta_NoSePuedeCrearDosVecesElMismo(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "tipos-dup@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Duplicados",
	})

	// Escrito distinto, mismo tipo: la comparación es por nombre
	// normalizado, no exacto.
	rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", titular.Token, tipoConsultaRequest{
		Nombre: "consulta GENERAL", Color: "#6E8F72", DuracionMinutos: 45,
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}

	// La otra dirección: uno que no tiene, se crea. Un bloqueo que
	// rechaza todo no distingue nada.
	rec = doJSONAuth(t, router, http.MethodPost, "/tipos-consulta", titular.Token, tipoConsultaRequest{
		Nombre: "Limpieza dental", Color: "#6E8F72", DuracionMinutos: 45,
	})
	if rec.Code != http.StatusCreated {
		t.Errorf("un tipo que no tenía tiene que poder crearse: status=%d body=%s", rec.Code, rec.Body.String())
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
