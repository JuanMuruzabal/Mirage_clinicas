// Package http arma el router HTTP del backend (chi) y expone los handlers.
package http

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"gorm.io/gorm"

	"dental-mirage/api/internal/mail"
	"dental-mirage/api/internal/ratelimit"
)

// NewRouter arma el router raíz de la API con dependencias por default
// aptas para desarrollo/tests: mail.LogSender (no manda mails de verdad),
// sin Google OAuth ni Turnstile configurados (nil-disabled), sin chequeo
// de HaveIBeenPwned. authSecret firma el `state` de OAuth (ver
// oauthstate.go) — el nombre se mantuvo desde antes de
// docs/Login/feature-sumarte-login.md (cuando firmaba JWT de sesión) a propósito,
// para no tocar los ~50 call sites de test que ya lo usan así.
//
// Producción (cmd/api/main.go) usa NewRouterWithDeps con AuthDeps
// completo (Resend, Google, Turnstile, HaveIBeenPwned reales).
func NewRouter(db *gorm.DB, authSecret string, corsOrigins []string) http.Handler {
	deps := AuthDeps{
		Mail:           mail.LogSender{},
		AccountLimiter: &ratelimit.AccountLimiter{DB: db},
		IPLimiter:      ratelimit.NewIPLimiter(),
		AppBaseURL:     "http://localhost:3000",
		StateSecret:    authSecret,
	}
	return NewRouterWithDeps(db, deps, corsOrigins)
}

// NewRouterWithDeps es la variante completa, usada por cmd/api/main.go con
// las dependencias externas reales inyectadas (patrón dev/prod de
// CLAUDE.md).
func NewRouterWithDeps(db *gorm.DB, deps AuthDeps, corsOrigins []string) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	// Antes del logger a propósito: este middleware es el que deja la IP
	// REAL del visitante en X-Forwarded-For (ver ip_del_visitante.go), y
	// todo lo que venga después —el log de la request incluido— tiene que
	// ver esa y no la del proceso web.
	r.Use(confiarEnIPDelBFF(deps.BFFSharedSecret))
	// Logging estructurado (Fase B de la auditoría) — reemplaza a
	// middleware.Logger de chi, que emitía texto plano sin request-id
	// correlacionable ni la clínica involucrada. Ver logging.go, en
	// particular la regla de NO loguear datos personales.
	r.Use(loggerMiddleware(slog.Default()))
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
		registerAuthRoutes(r, db, deps)
	})

	registerEspecialidadRoutes(r, db)
	registerClinicaRoutes(r, db)
	registerTurnoPublicoRoutes(r, db, deps)

	// Grupo con sesión requerida pero SIN clínica todavía — /me y
	// /onboarding/* (paso 2/3 del wizard) tienen que poder operar antes de
	// que exista una Clinic (spec §4).
	r.Group(func(r chi.Router) {
		r.Use(requireSession(db))
		r.Get("/me", meHandler(db, deps.AutoVerifyEmail))
		r.Patch("/me", updateMeHandler(db))
		registerOnboardingRoutes(r, db, deps.Mail)
		registerProtectedAuthRoutes(r, db)

		// Subgrupo: además de sesión, exige una Clinic ya creada (spec §4,
		// onboarding completo) — turnos/pacientes/tipos de consulta/página
		// pública operan sobre la clínica del caller.
		r.Group(func(r chi.Router) {
			r.Use(requireClinic(db))
			registerTipoConsultaRoutes(r, db)
			registerTurnoRoutes(r, db)
			registerPacienteRoutes(r, db)
			registerSeguridadTurnoPublicoRoutes(r, db)
			registerPaginaPublicaRoutes(r, db)
			// F2.3 ("ajustes de calendario", Fase 2) — ver TR-078/TR-084.
			registerHorarioAtencionRoutes(r, db)
			registerBloqueoHorarioRoutes(r, db)
			registerDisponibilidadRoutes(r, db)
			// Fase 2, ítem 5 ("compartir calendario").
			registerEnlaceTurnoRoutes(r, db, deps)
		})
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

// maxJSONBodyBytes — corrección de seguridad (auditoría 2026-09-08,
// docs/Seguridad y optimizacion/radiografia-tecnica_1.md): ningún payload
// legítimo de este backend (formularios de texto, nunca subida de
// archivos — eso pasa por internal/storage, no por acá) se acerca a este
// tamaño. Sin este límite, decodeJSON aceptaba un body de cualquier
// tamaño y lo cargaba entero en memoria ANTES de validar nada — un DoS
// trivial contra cualquier endpoint POST/PATCH, incluidos los públicos
// sin sesión (turno_publico.go).
const maxJSONBodyBytes = 1 << 20 // 1 MiB

// decodeJSON decodifica el body JSON de un request en v — acotado a
// maxJSONBodyBytes vía http.MaxBytesReader, que además de cortar la
// lectura cierra la conexión si el cliente sigue mandando de más (no
// alcanza con truncar el Decode solo).
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) error {
	defer func() { _ = r.Body.Close() }()
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	return json.NewDecoder(r.Body).Decode(v)
}
