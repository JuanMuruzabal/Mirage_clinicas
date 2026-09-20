package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// El perfil de un colega — 2026-09-19, ítem 4 de la ronda de ajustes.
//
// Lo que estos tests protegen son dos cosas distintas: que el dato SIRVA
// (el perfil de quien comparte la clínica, con su matrícula) y que el
// endpoint no se convierta en un directorio de todo el sistema — tener
// un uuid no puede alcanzar para leer el perfil de nadie.

func leerPerfilDeColega(t *testing.T, router http.Handler, token string, userID uuid.UUID) perfilDeColegaResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/equipo/miembros/"+userID.String()+"/perfil", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET perfil del colega: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp perfilDeColegaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return resp
}

// perfilCargadoDePrueba le pone perfil profesional a un colaborador que
// entró por `sumarColaboradorDePrueba`, que arma la membresía directo
// contra la base sin pasar por el onboarding.
// El documento lleva prefijo "DOC-" a propósito: el test del DNI busca
// esa cadena en el JSON crudo, y con un documento puramente numérico se
// acusaría a sí mismo contra cualquier otro número de la respuesta.
func perfilCargadoDePrueba(t *testing.T, gdb *gorm.DB, userID uuid.UUID, documento string) {
	t.Helper()
	var especialidad db.Especialidad
	if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
		t.Fatalf("no se encontró la especialidad de prueba: %v", err)
	}
	doc := documento
	perfil := db.ProfessionalProfile{
		UserID: userID, TipoPerfil: db.PerfilTipoProfesional,
		Nombre: "Beto", Apellido: "Colega",
		TelefonoPrefijo: "+54", Telefono: "93517654321",
		Documento:       &doc,
		MatriculaTipo:   db.MatriculaTipoNacional,
		MatriculaNumero: matriculaDePrueba(userID.String()),
		Especialidades:  []db.Especialidad{especialidad},
	}
	if err := gdb.Create(&perfil).Error; err != nil {
		t.Fatalf("no se pudo crear el perfil del colega: %v", err)
	}
}

// TestPerfilDeColega_TraeLoQueHaceFaltaParaTrabajarJuntos — el caso base:
// matrícula y especialidades, que es lo que dice qué puede atender la
// persona con la que se comparte la clínica.
func TestPerfilDeColega_TraeLoQueHaceFaltaParaTrabajarJuntos(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-perfilcolega@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana", NombreClinica: "Clínica Perfil",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-perfil@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "colega-perfil@example.com")
	perfilCargadoDePrueba(t, gdb, colegaID, "DOC-30111222")

	resp := leerPerfilDeColega(t, router, titular.Token, colegaID)

	if resp.Nombre != "Beto Colega" {
		t.Errorf("nombre = %q, esperaba el del perfil", resp.Nombre)
	}
	if resp.Email != "colega-perfil@example.com" {
		t.Errorf("email = %q", resp.Email)
	}
	if resp.EsVos || resp.EsTitular {
		t.Errorf("esVos=%v esTitular=%v: es un colega, no el titular ni quien pregunta", resp.EsVos, resp.EsTitular)
	}
	if resp.Perfil == nil {
		t.Fatal("no vino el perfil profesional")
	}
	if resp.Perfil.MatriculaNumero == "" {
		t.Error("la matrícula es lo que dice qué puede atender; tiene que viajar")
	}
	// Los roles viven en `clinic_member_roles`, no en una columna: sin el
	// Preload del handler esta lista vuelve vacía (pasó de verdad).
	if len(resp.Roles) != 1 || resp.Roles[0] != db.RoleProfesional {
		t.Errorf("roles = %+v, esperaba [profesional]", resp.Roles)
	}
	if len(resp.Perfil.Especialidades) != 1 {
		t.Errorf("especialidades = %+v", resp.Perfil.Especialidades)
	}
	if resp.Perfil.Telefono == "" {
		t.Error("el teléfono es lo que se usa para coordinar un cambio de turno; tiene que viajar")
	}
}

// TestPerfilDeColega_ElDocumentoNoSaleDeSuDueno — el único dato del
// perfil que no tiene ningún uso entre colegas. Que el resto viaje es una
// decisión; que el DNI no, también.
func TestPerfilDeColega_ElDocumentoNoSaleDeSuDueno(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-docucolega@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana", NombreClinica: "Clínica Documento",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-docu@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "colega-docu@example.com")
	perfilCargadoDePrueba(t, gdb, colegaID, "DOC-30999888")

	rec := doJSONAuth(t, router, http.MethodGet, "/equipo/miembros/"+colegaID.String()+"/perfil", titular.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	// Contra el JSON crudo y no contra el struct: el campo es `omitempty`,
	// así que un puntero nil no deja rastro — y si alguna vez vuelve, la
	// cadena aparece acá aunque el struct de la respuesta no cambie.
	if cuerpo := rec.Body.String(); strings.Contains(cuerpo, "DOC-30999888") {
		t.Errorf("el documento del colega viajó en la respuesta: %s", cuerpo)
	}
}

// TestPerfilDeColega_SinPerfilCargadoNoEsUnError — alguien recién
// invitado que todavía no lo completó existe igual en el equipo, y la
// pantalla lo dice en vez de romperse.
func TestPerfilDeColega_SinPerfilCargadoNoEsUnError(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-sinperfil@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana", NombreClinica: "Clínica Sin Perfil",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-sinperfil@example.com", db.RoleRecepcion)
	colegaID := userIDDelMail(t, gdb, "colega-sinperfil@example.com")

	resp := leerPerfilDeColega(t, router, titular.Token, colegaID)

	if resp.Perfil != nil {
		t.Errorf("perfil = %+v, esperaba ausente", resp.Perfil)
	}
	// Sin perfil, el nombre cae al mail: la pantalla tiene que poder
	// titularse con algo.
	if resp.Nombre != "colega-sinperfil@example.com" {
		t.Errorf("nombre = %q, esperaba el mail como respaldo", resp.Nombre)
	}
}

// TestPerfilDeColega_DeOtraClinicaEs404 — el aislamiento, que es lo que
// de verdad hay que proteger: tener el uuid de una persona no puede
// alcanzar para leer su perfil. Mismo criterio que la ficha de un
// paciente ajeno (TR-138): 404, no 403 — que esa persona exista tampoco
// es información que este profesional deba tener.
func TestPerfilDeColega_DeOtraClinicaEs404(t *testing.T) {
	router, gdb := newTestRouter(t)
	mia := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-mia@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana", NombreClinica: "Clínica Mía",
	})
	ajena := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-ajena@example.com", Password: "unaClaveLarga123",
		Nombre: "Ema", NombreClinica: "Clínica Ajena",
	})
	clinicAjena := uuid.MustParse(ajena.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicAjena, "colega-ajeno@example.com", db.RoleProfesional)
	ajenoID := userIDDelMail(t, gdb, "colega-ajeno@example.com")
	perfilCargadoDePrueba(t, gdb, ajenoID, "DOC-30777666")

	rec := doJSONAuth(t, router, http.MethodGet, "/equipo/miembros/"+ajenoID.String()+"/perfil", mia.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s, esperaba 404", rec.Code, rec.Body.String())
	}
}

// TestPerfilDeColega_AQuienLoQuitaronDelEquipoTampoco — la membresía no
// se borra nunca: queda en status "removed", porque la FK compuesta de
// turnos bloquearía la baja de cualquiera con historial. Si el handler
// mirara solo `clinic_id`, un ex colaborador seguiría siendo consultable
// para siempre.
func TestPerfilDeColega_AQuienLoQuitaronDelEquipoTampoco(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-exequipo@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana", NombreClinica: "Clínica Ex Equipo",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-ex@example.com", db.RoleProfesional)
	exID := userIDDelMail(t, gdb, "colega-ex@example.com")
	perfilCargadoDePrueba(t, gdb, exID, "DOC-30555444")

	// Estaba en el equipo: se leía sin problema.
	_ = leerPerfilDeColega(t, router, titular.Token, exID)

	rec := doJSONAuth(t, router, http.MethodDelete, "/equipo/miembros/"+exID.String(), titular.Token, nil)
	if rec.Code != http.StatusOK && rec.Code != http.StatusNoContent {
		t.Fatalf("quitar del equipo: status=%d body=%s", rec.Code, rec.Body.String())
	}

	rec = doJSONAuth(t, router, http.MethodGet, "/equipo/miembros/"+exID.String()+"/perfil", titular.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("después de quitarlo, status=%d body=%s, esperaba 404", rec.Code, rec.Body.String())
	}
}

// TestPerfilDeColega_ElPropioSeReconoce — el frontend usa `esVos` para
// mandar a /perfil (que además de mostrar, edita) en vez de a la ficha en
// solo lectura.
func TestPerfilDeColega_ElPropioSeReconoce(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-yomismo@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana", NombreClinica: "Clínica Yo Misma",
	})
	yo := userIDDelMail(t, gdb, "titular-yomismo@example.com")

	resp := leerPerfilDeColega(t, router, titular.Token, yo)

	if !resp.EsVos {
		t.Error("esVos = false para quien pregunta por sí mismo")
	}
	if !resp.EsTitular {
		t.Error("esTitular = false para el dueño de la clínica")
	}
}
