package http

import (
	"encoding/json"
	"net/http"
	"testing"

	"dental-mirage/api/internal/db"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// sumarColaboradorDePrueba mete a un usuario nuevo en una clínica que ya
// existe, con los roles indicados. Es lo que la Fase 3.2.4 va a hacer desde
// el panel de colaboradores; acá se arma a mano para poder probar los
// permisos antes de que esa pantalla exista.
func sumarColaboradorDePrueba(t *testing.T, gdb *gorm.DB, router http.Handler, clinicID uuid.UUID, email string, roles ...string) string {
	t.Helper()

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: email, Password: "unaClaveLarga123", AceptaTerminos: true,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("no se pudo registrar al colaborador: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var reg registerResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &reg); err != nil || reg.Token == nil {
		t.Fatalf("respuesta de registro inválida: %v", err)
	}
	marcarMailVerificadoDePrueba(t, gdb, email)

	var user db.User
	if err := gdb.Where("email = ?", email).First(&user).Error; err != nil {
		t.Fatalf("no se encontró al colaborador recién creado: %v", err)
	}
	member := db.ClinicMember{ClinicID: clinicID, UserID: user.ID, Status: db.ClinicMemberStatusActive}
	if err := gdb.Create(&member).Error; err != nil {
		t.Fatalf("no se pudo crear la membresía del colaborador: %v", err)
	}
	for _, rol := range roles {
		if err := db.AsignarRol(gdb, member.ID, rol); err != nil {
			t.Fatalf("no se pudo asignar el rol %q: %v", rol, err)
		}
	}
	return *reg.Token
}

// TestPermisos_UnColaboradorNoOwnerEntraAlPanel — el bug que la Fase 3.2.2
// vino a arreglar, y que nadie había notado porque hasta ahora no existían
// los colaboradores.
//
// requireClinic buscaba la membresía con rol OWNER. Un profesional invitado
// a una clínica ajena tiene membresía activa pero nunca va a ser su dueño,
// así que el panel entero le respondía 403: no podía ver ni su propia
// agenda. Con el multi-tenant eso pasa de detalle a bloqueo total.
func TestPermisos_UnColaboradorNoOwnerEntraAlPanel(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-permisos@example.com", Password: "unaClaveLarga123", Nombre: "Ana Titular", NombreClinica: "Clínica Permisos",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)

	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-permisos@example.com", db.RoleProfesional)

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos", tokenColega, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("un profesional de la clínica tiene que poder entrar al panel: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

// TestPermisos_SinMembresiaSigueSiendo403 — la otra mitad: alguien que
// completó el registro pero todavía no tiene clínica no entra. Es el guard
// del onboarding, y no puede haberse aflojado al abrir la puerta a los
// colaboradores.
func TestPermisos_SinMembresiaSigueSiendo403(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "sinclinica@example.com", Password: "unaClaveLarga123", AceptaTerminos: true,
	})
	var reg registerResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &reg)
	marcarMailVerificadoDePrueba(t, gdb, "sinclinica@example.com")

	got := doJSONAuth(t, router, http.MethodGet, "/turnos", *reg.Token, nil)
	if got.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba 403 para quien no tiene ninguna clínica", got.Code)
	}
}

// TestPermisos_MembresiaSinRolesNoEntra — una membresía activa sin ningún
// rol dejaría a la persona adentro del panel sin que ninguna regla de
// autorización pueda decidir nada sobre ella. Se trata como onboarding
// incompleto.
func TestPermisos_MembresiaSinRolesNoEntra(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-sinrol@example.com", Password: "unaClaveLarga123", Nombre: "Ana Titular", NombreClinica: "Clínica Sin Rol",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)

	// Sin roles a propósito.
	token := sumarColaboradorDePrueba(t, gdb, router, clinicID, "sinrol@example.com")

	rec := doJSONAuth(t, router, http.MethodGet, "/turnos", token, nil)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba 403 para una membresía sin roles", rec.Code)
	}
}

// TestPermisos_UnProfesionalNoTocaLaPaginaDeLaClinica — el brief: "la
// tarjeta administrador de pagina solo la puede ver los que tienen rol de
// administrador de página". Un profesional invitado ve su agenda; la web de
// la clínica no es suya.
func TestPermisos_UnProfesionalNoTocaLaPaginaDeLaClinica(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-pagina@example.com", Password: "unaClaveLarga123", Nombre: "Ana Titular", NombreClinica: "Clínica Página",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-pagina@example.com", db.RoleProfesional)

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/pagina", tokenColega, nil)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba 403: un profesional no administra la página", rec.Code)
	}

	// El titular sí, que tiene el rol admin desde el alta.
	rec = doJSONAuth(t, router, http.MethodGet, "/panel/pagina", titular.Token, nil)
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, esperaba 200: el titular tiene rol admin desde el alta. body=%s", rec.Code, rec.Body.String())
	}
}

// TestPermisos_UnAdministradorDePaginaSiPuede — la otra mitad: el rol
// alcanza por sí solo, sin ser dueño de la clínica.
func TestPermisos_UnAdministradorDePaginaSiPuede(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-admin@example.com", Password: "unaClaveLarga123", Nombre: "Ana Titular", NombreClinica: "Clínica Admin",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	token := sumarColaboradorDePrueba(t, gdb, router, clinicID, "admin-pagina@example.com", db.RoleProfesional, db.RoleAdmin)

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/pagina", token, nil)
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, esperaba 200: con rol admin se administra la página. body=%s", rec.Code, rec.Body.String())
	}
}
