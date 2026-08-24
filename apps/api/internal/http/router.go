// Package http arma el router HTTP del backend (chi) y expone los handlers.
package http

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"gorm.io/gorm"
)

// NewRouter arma el router raíz de la API. db puede ser nil solo en tests
// que no lo ejercitan a propósito; jwtSecret firma los tokens emitidos en
// /auth; corsOrigins son los orígenes permitidos para llamadas directas del
// navegador (config.Config.CORSAllowedOrigins) — no afecta el tráfico
// server-to-server de Next.js (spec §9.3, BFF sin excepciones).
//
// Sprint 0 solo monta /health y /auth — las rutas de profesionales, turnos,
// pacientes, páginas y búsqueda se suman en los sprints que las
// implementan (docs/implementation-plan.md §5), no antes.
func NewRouter(db *gorm.DB, jwtSecret string, corsOrigins []string) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   corsOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/health", healthHandler(db))

	r.Route("/auth", func(r chi.Router) {
		registerAuthRoutes(r, db, jwtSecret)
	})

	registerEspecialidadRoutes(r, db)
	registerClinicaRoutes(r, db)
	registerTurnoPublicoRoutes(r, db)

	r.Group(func(r chi.Router) {
		r.Use(requireAuth(jwtSecret))
		r.Get("/me", meHandler(db))
		r.Patch("/me", updateMeHandler(db))
		registerTipoConsultaRoutes(r, db)
		registerTurnoRoutes(r, db)
		registerPacienteRoutes(r, db)
		registerPaginaPublicaRoutes(r, db)
	})

	return r
}

func healthHandler(db *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := map[string]string{"status": "ok"}

		if db != nil {
			sqlDB, err := db.DB()
			if err != nil || sqlDB.PingContext(r.Context()) != nil {
				status["db"] = "unreachable"
				writeJSON(w, http.StatusServiceUnavailable, status)
				return
			}
			status["db"] = "ok"
		} else {
			status["db"] = "not_configured"
		}

		writeJSON(w, http.StatusOK, status)
	}
}

// writeJSON fija el Content-Type, escribe el status code y serializa v, en
// ese orden — WriteHeader debe llamarse después de setear headers.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// decodeJSON decodifica el body JSON de un request en v.
func decodeJSON(r *http.Request, v any) error {
	defer func() { _ = r.Body.Close() }()
	return json.NewDecoder(r.Body).Decode(v)
}
