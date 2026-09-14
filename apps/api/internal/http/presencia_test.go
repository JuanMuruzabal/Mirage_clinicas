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

// Fase 3.2.5 — presencia de colaboradores.
//
// Lo que estos tests protegen: que "está trabajando acá ahora" signifique
// exactamente eso. Una sesión cerrada, vencida, o parada en OTRA clínica
// no es presencia en esta, y confundirlas mostraría gente trabajando
// donde no está.

func leerPresencia(t *testing.T, router http.Handler, token string) presenciaResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/equipo/presencia", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /equipo/presencia: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp presenciaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return resp
}

func presenciaDe(t *testing.T, resp presenciaResponse, userID uuid.UUID) presenciaMiembroResponse {
	t.Helper()
	for _, m := range resp.Miembros {
		if m.UserID == userID.String() {
			return m
		}
	}
	t.Fatalf("%s no aparece en la presencia: %+v", userID, resp.Miembros)
	return presenciaMiembroResponse{}
}

// clinicaDePrueba convierte el id que devuelve el alta (string) al tipo
// que usa el esquema.
func clinicaDePrueba(t *testing.T, id string) uuid.UUID {
	t.Helper()
	parsed, err := uuid.Parse(id)
	if err != nil {
		t.Fatalf("id de clínica inválido %q: %v", id, err)
	}
	return parsed
}

func userIDDelMail(t *testing.T, gdb *gorm.DB, email string) uuid.UUID {
	t.Helper()
	var user db.User
	if err := gdb.First(&user, "email = ?", email).Error; err != nil {
		t.Fatalf("no se encontró %s: %v", email, err)
	}
	return user.ID
}

// colegaEnLaClinica suma un colaborador y le deja la sesión PARADA en esa
// clínica, que es lo que hace "entrar" desde /clinicas. Sin ese paso su
// sesión tiene `clinic_id` nulo y no es presencia en ningún lado — que es
// correcto, pero no es el caso que estos tests quieren montar.
func colegaEnLaClinica(t *testing.T, gdb *gorm.DB, router http.Handler, clinicID uuid.UUID, email string) uuid.UUID {
	t.Helper()
	sumarColaboradorDePrueba(t, gdb, router, clinicID, email, db.RoleRecepcion)
	userID := userIDDelMail(t, gdb, email)
	if err := gdb.Model(&db.Session{}).Where("user_id = ?", userID).
		Update("clinic_id", clinicID).Error; err != nil {
		t.Fatalf("no se pudo parar la sesión en la clínica: %v", err)
	}
	return userID
}

// envejecerSesiones empuja hacia atrás el último latido de un usuario,
// para simular que dejó de usar la app sin esperar el umbral real.
func envejecerSesiones(t *testing.T, gdb *gorm.DB, userID uuid.UUID, antiguedad time.Duration) {
	t.Helper()
	if err := gdb.Model(&db.Session{}).Where("user_id = ?", userID).
		Update("last_seen_at", time.Now().Add(-antiguedad)).Error; err != nil {
		t.Fatalf("no se pudo envejecer la sesión: %v", err)
	}
}

// TestPresencia_QuienPreguntaQuedaEnLinea — el caso base, y la razón por
// la que el latido va ANTES de leer: si no, el panel se vería a sí mismo
// ausente hasta el ciclo siguiente.
func TestPresencia_QuienPreguntaQuedaEnLinea(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "presencia-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Presencia",
	})
	yo := userIDDelMail(t, gdb, "presencia-titular@example.com")

	// Aunque su última actividad sea vieja, preguntar ES el latido.
	envejecerSesiones(t, gdb, yo, 2*time.Hour)

	fila := presenciaDe(t, leerPresencia(t, router, titular.Token), yo)
	if !fila.EnLinea {
		t.Errorf("quien pregunta tiene que quedar en línea; ultimaActividad=%v", fila.UltimaActividad)
	}
}

// TestPresencia_SinActividadRecienteNoEstaEnLinea — la otra dirección. Un
// umbral que nunca apaga a nadie no es un umbral: mostraría "en línea" a
// todo el que alguna vez entró.
func TestPresencia_SinActividadRecienteNoEstaEnLinea(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "presencia-viejo-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Vieja",
	})
	colega := colegaEnLaClinica(t, gdb, router, clinicaDePrueba(t, titular.Profesional.ID), "presencia-viejo-colega@example.com")

	envejecerSesiones(t, gdb, colega, PresenciaEnLinea+time.Minute)

	fila := presenciaDe(t, leerPresencia(t, router, titular.Token), colega)
	if fila.EnLinea {
		t.Error("con la actividad pasada del umbral no puede estar en línea")
	}
	// Pero sigue informando CUÁNDO: es lo que deja mostrar "hace 20 min"
	// en vez de un vacío.
	if fila.UltimaActividad == nil {
		t.Error("se perdió la última actividad; sin ella no se puede decir hace cuánto")
	}
}

// TestPresencia_UnaSesionEnOtraClinicaNoCuentaAca — el corte que hace que
// esto signifique algo. Desde la 3.2.3 una sesión sabe en qué clínica
// está parada; sin filtrar por eso, alguien atendiendo en su otra clínica
// aparecería trabajando acá.
func TestPresencia_UnaSesionEnOtraClinicaNoCuentaAca(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "presencia-dos-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Una",
	})
	otra := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "presencia-dos-otra@example.com", Password: "unaClaveLarga123",
		Nombre: "Bea Ruiz", NombreClinica: "Clínica Dos",
	})
	colega := colegaEnLaClinica(t, gdb, router, clinicaDePrueba(t, titular.Profesional.ID), "presencia-dos-colega@example.com")

	// El colega está activo, pero se mudó a la otra clínica.
	if err := gdb.Model(&db.Session{}).Where("user_id = ?", colega).
		Update("clinic_id", clinicaDePrueba(t, otra.Profesional.ID)).Error; err != nil {
		t.Fatalf("no se pudo mover la sesión de clínica: %v", err)
	}

	fila := presenciaDe(t, leerPresencia(t, router, titular.Token), colega)
	if fila.EnLinea {
		t.Error("una sesión parada en otra clínica no es presencia en esta")
	}
}

// TestPresencia_UnaSesionCerradaNoCuenta — cerrar sesión tiene que apagar
// la presencia en el acto, no cuando venza el umbral.
func TestPresencia_UnaSesionCerradaNoCuenta(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "presencia-logout-titular@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Logout",
	})
	colega := colegaEnLaClinica(t, gdb, router, clinicaDePrueba(t, titular.Profesional.ID), "presencia-logout-colega@example.com")

	if err := gdb.Model(&db.Session{}).Where("user_id = ?", colega).
		Update("revoked_at", time.Now()).Error; err != nil {
		t.Fatalf("no se pudo revocar la sesión: %v", err)
	}

	fila := presenciaDe(t, leerPresencia(t, router, titular.Token), colega)
	if fila.EnLinea {
		t.Error("una sesión revocada no es presencia")
	}
}

// TestPresencia_ElEquipoTraeLaPresenciaDeEntrada — /equipo la incluye
// además de /equipo/presencia, para que la primera pintura del popover no
// muestre a todo el mundo ausente hasta el primer latido.
func TestPresencia_ElEquipoTraeLaPresenciaDeEntrada(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "presencia-equipo@example.com", Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica Equipo Presencia",
	})

	equipo := leerEquipo(t, router, titular.Token)
	if len(equipo.Miembros) != 1 {
		t.Fatalf("miembros = %d", len(equipo.Miembros))
	}
	if !equipo.Miembros[0].EnLinea {
		t.Error("el titular acaba de pedir el equipo: tiene que venir en línea")
	}
}
