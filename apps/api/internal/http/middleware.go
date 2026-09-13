package http

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/auth"
	"dental-mirage/api/internal/db"
)

type contextKey string

const (
	sessionContextKey  contextKey = "session"
	clinicIDContextKey contextKey = "clinicID"
	rolesContextKey    contextKey = "rolesEnLaClinica"
)

// requireSession exige un token de sesión válido en el header
// Authorization: Bearer <token> — mismo contrato server-to-server que el
// JWT anterior (apps/web sigue reenviando el valor de su cookie tal
// cual), pero ahora el token es opaco y se valida contra
// internal/auth.Session (lookup en Postgres), no una firma. Deja la sesión
// completa en el contexto — /me, /onboarding/* y logout la necesitan
// entera (UserID, ID de sesión); los handlers de dominio (turnos,
// pacientes, etc.) siguen leyendo solo un ID a través de
// profesionalIDFromRequest (turnos.go), sin enterarse de este cambio.
func requireSession(gdb *gorm.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			token, ok := strings.CutPrefix(header, "Bearer ")
			if !ok || token == "" {
				writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
				return
			}

			session, err := auth.ValidateSessionToken(gdb, token)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "token inválido o expirado")
				return
			}

			// Completa el holder de logging (logging.go) para que la línea
			// de esta request lleve user_id — el middleware de logging corre
			// por FUERA de este, así que no puede resolverlo por su cuenta.
			if campos := camposLogDe(r.Context()); campos != nil {
				campos.UserID = session.UserID.String()
			}

			ctx := context.WithValue(r.Context(), sessionContextKey, session)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// requireClinic se encadena DESPUÉS de requireSession: resuelve en qué
// clínica está trabajando el usuario y con qué roles, y deja las dos cosas
// en el contexto. Onboarding incompleto (sin ninguna membresía todavía) es
// un 403, no un 500 — distinto del guard de UX del wizard en el frontend,
// esta es la garantía real del lado del servidor.
//
// Hasta la Fase 3.2.2 buscaba la membresía con rol OWNER, porque cada
// usuario tenía exactamente una clínica y era su dueño. Eso tenía una
// consecuencia que nadie había notado: **un colaborador invitado no podía
// entrar al panel en absoluto**, porque su membresía nunca iba a decir
// `owner`. Con el multi-tenant eso pasa de detalle a bloqueo total, así
// que ahora vale cualquier membresía ACTIVA.
//
// Qué clínica, cuando hay varias: por ahora la más antigua, de forma
// determinista. La elección explícita llega en la Fase 3.2.3 ("¿dónde
// trabajás hoy?"), que la va a guardar en la sesión; hasta entonces esto
// no cambia nada para quien tiene una sola, que es el caso de todos.
func requireClinic(gdb *gorm.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session, ok := sessionFromContext(r)
			if !ok {
				writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
				return
			}

			member, ok := membresiaDeLaSesion(gdb, session)
			if !ok {
				writeError(w, http.StatusForbidden, "completá el alta de tu clínica antes de acceder a esta sección")
				return
			}

			// Una membresía activa sin ningún rol no debería existir, pero
			// si existiera dejaría a la persona adentro del panel sin que
			// ninguna regla de autorización pueda decidir nada sobre ella.
			// Se trata como onboarding incompleto.
			roles := rolesDe(member)
			if len(roles) == 0 {
				writeError(w, http.StatusForbidden, "tu cuenta todavía no tiene un rol asignado en esta clínica")
				return
			}

			// Ídem requireSession, para clinic_id — es el atributo que
			// permite filtrar "qué le pasa a ESTA clínica" cuando hay N
			// clínicas compartiendo la misma instancia.
			if campos := camposLogDe(r.Context()); campos != nil {
				campos.ClinicID = member.ClinicID.String()
			}

			ctx := context.WithValue(r.Context(), clinicIDContextKey, member.ClinicID)
			ctx = context.WithValue(ctx, rolesContextKey, roles)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// rolesDe — los roles de una membresía, como slice de strings.
func rolesDe(member db.ClinicMember) []string {
	roles := make([]string, 0, len(member.Roles))
	for _, r := range member.Roles {
		roles = append(roles, r.Rol)
	}
	return roles
}

// rolesFromContext — los roles del usuario en la clínica activa. Solo
// existen después de requireClinic.
func rolesFromContext(r *http.Request) []string {
	roles, _ := r.Context().Value(rolesContextKey).([]string)
	return roles
}

// tieneAlgunRol — ¿el usuario tiene al menos uno de estos roles en la
// clínica activa?
func tieneAlgunRol(r *http.Request, buscados ...string) bool {
	for _, tiene := range rolesFromContext(r) {
		for _, buscado := range buscados {
			if tiene == buscado {
				return true
			}
		}
	}
	return false
}

// requireRol corta el paso si el usuario no tiene ninguno de los roles
// pedidos en la clínica activa. Se encadena DESPUÉS de requireClinic, que
// es quien pone los roles en el contexto.
//
// El 403 dice qué hace falta, no qué tiene la persona: informar los roles
// propios en un error no aporta nada a quien ya los conoce y le confirma a
// quien no debería estar ahí cómo está armado el modelo de permisos.
func requireRol(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !tieneAlgunRol(r, roles...) {
				writeError(w, http.StatusForbidden, "no tenés permisos para esta sección de la clínica")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// membresiaDeLaSesion resuelve en qué clínica está trabajando esta
// sesión — Fase 3.2.3.
//
// Primero, la elegida en "¿Dónde trabajás hoy?" (`sessions.clinic_id`).
// La elección NO se cree por sí sola: se busca junto con la membresía
// activa, así que si a la persona la sacaron del equipo desde que eligió,
// la consulta no encuentra nada y se cae al criterio de abajo. Una
// elección guardada no puede sobrevivir a la membresía que la habilitaba.
//
// Si no eligió ninguna —sesión vieja, primer ingreso, o un cliente que le
// pega a la API sin pasar por la pantalla— vale la membresía activa más
// antigua, que es lo que hacía la 3.2.2 y sigue siendo correcto para
// quien tiene una sola clínica, o sea todos hasta que existan las
// invitaciones (3.2.4).
func membresiaDeLaSesion(gdb *gorm.DB, session *db.Session) (db.ClinicMember, bool) {
	activas := func() *gorm.DB {
		return gdb.Preload("Roles").
			Where("user_id = ? AND status = ?", session.UserID, db.ClinicMemberStatusActive)
	}

	if session.ClinicID != nil {
		var elegida db.ClinicMember
		if err := activas().Where("clinic_id = ?", *session.ClinicID).First(&elegida).Error; err == nil {
			return elegida, true
		}
	}

	var masAntigua db.ClinicMember
	if err := activas().Order("created_at").First(&masAntigua).Error; err != nil {
		return db.ClinicMember{}, false
	}
	return masAntigua, true
}

func sessionFromContext(r *http.Request) (*db.Session, bool) {
	session, ok := r.Context().Value(sessionContextKey).(*db.Session)
	return session, ok
}

// userIDFromRequest resuelve el usuario autenticado — usado por /me y
// /onboarding/*, que operan sobre el usuario sin necesitar todavía una
// Clinic (el onboarding, por diseño, corre antes de que exista una).
func userIDFromRequest(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	session, ok := sessionFromContext(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
		return uuid.Nil, false
	}
	return session.UserID, true
}
