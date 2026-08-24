package http

import (
	"context"
	"net/http"
	"strings"

	"dental-mirage/api/internal/auth"
)

type contextKey string

const claimsContextKey contextKey = "claims"

// requireAuth exige un JWT válido en el header Authorization: Bearer <token>
// y deja sus claims en el contexto del request para los handlers de abajo.
func requireAuth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			token, ok := strings.CutPrefix(header, "Bearer ")
			if !ok || token == "" {
				writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
				return
			}

			claims, err := auth.ParseToken(jwtSecret, token)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "token inválido o expirado")
				return
			}

			ctx := context.WithValue(r.Context(), claimsContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func claimsFromContext(r *http.Request) (*auth.Claims, bool) {
	claims, ok := r.Context().Value(claimsContextKey).(*auth.Claims)
	return claims, ok
}
