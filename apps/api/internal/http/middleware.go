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

			ctx := context.WithValue(r.Context(), sessionContextKey, session)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// requireClinic se encadena DESPUÉS de requireSession — resuelve la Clinic
// del usuario autenticado (su única fila ClinicMember{Role:"owner"} en
// este alcance: una clínica por usuario, invitaciones/multi-clínica fuera
// de alcance, spec §9) y la deja en el contexto. Onboarding incompleto (
// sin ClinicMember todavía) es un 403, no un 500 — distinto del guard de
// UX del wizard en el frontend, esta es la garantía real del lado del
// servidor.
func requireClinic(gdb *gorm.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session, ok := sessionFromContext(r)
			if !ok {
				writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
				return
			}

			var member db.ClinicMember
			err := gdb.Where("user_id = ? AND role = ?", session.UserID, db.RoleOwner).First(&member).Error
			if err != nil {
				writeError(w, http.StatusForbidden, "completá el alta de tu clínica antes de acceder a esta sección")
				return
			}

			ctx := context.WithValue(r.Context(), clinicIDContextKey, member.ClinicID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
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
