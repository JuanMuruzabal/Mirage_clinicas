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
// Lo que estos tests protegen: que incluir el tipo de un colega COPIE la
// fila y no la comparta. Con una fila común, que alguien acortara
// "Conducto" de 60 a 45 minutos le movería los huecos del día a todos los
// demás — y eso no se nota mirando la pantalla, se nota cuando se
// superpone un turno.

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

// TestTiposDeColegas_IncluirCopiaLaFila — la regla central. Después de
// incluir, tocar el mío no puede tocar el del colega.
func TestTiposDeColegas_IncluirCopiaLaFila(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "tipos-copia-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Copia",
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "tipos-copia-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "tipos-copia-colega@example.com")
	original := tipoDe(t, gdb, clinicID, colegaID, "Conducto", 60)

	rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta/de-colegas/"+original.ID.String()+"/incluir", titular.Token, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("incluir: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var copia tipoConsultaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &copia); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	if copia.ID == original.ID.String() {
		t.Fatal("devolvió el MISMO tipo: se compartió la fila en vez de copiarla")
	}
	if copia.Nombre != "Conducto" || copia.DuracionMinutos != 60 {
		t.Errorf("la copia no arrancó igual que el original: %+v", copia)
	}

	// Y el punto de todo: acortar el mío no le toca el suyo.
	rec = doJSONAuth(t, router, http.MethodPatch, "/tipos-consulta/"+copia.ID, titular.Token, tipoConsultaRequest{
		Nombre: "Conducto", Color: "#E7D9BE", DuracionMinutos: 45,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("editar la copia: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var delColega db.TipoConsulta
	if err := gdb.First(&delColega, "id = ?", original.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el original: %v", err)
	}
	if delColega.DuracionMinutos != 60 {
		t.Errorf("editar la copia le cambió la duración al colega: %d, esperaba 60", delColega.DuracionMinutos)
	}
}

// TestTiposDeColegas_NoSePuedeIncluirElPropio — incluir el propio
// duplicaría un tipo contra sí mismo sin que nadie lo pidiera.
func TestTiposDeColegas_NoSePuedeIncluirElPropio(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "tipos-propio@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Propio",
	})
	mios := leerMisTipos(t, router, titular.Token)
	if len(mios) == 0 {
		t.Fatal("el alta no dejó ningún tipo de consulta")
	}

	rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta/de-colegas/"+mios[0].ID+"/incluir", titular.Token, nil)
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusConflict)
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

	// No aparece en la lista…
	for _, tipo := range leerTiposDeColegas(t, router, titular.Token) {
		if tipo.ID == ajeno.ID {
			t.Error("se ve un tipo de otra clínica")
		}
	}
	// …y tampoco se puede incluir a mano.
	rec := doJSONAuth(t, router, http.MethodPost, "/tipos-consulta/de-colegas/"+ajeno.ID+"/incluir", titular.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}
