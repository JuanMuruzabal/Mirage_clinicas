// Command api arranca el backend HTTP de Dental Mirage.
package main

import (
	"log"
	"net/http"

	"github.com/joho/godotenv"
	"gorm.io/gorm"

	"dental-mirage/api/internal/config"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/googleauth"
	apihttp "dental-mirage/api/internal/http"
	dmmail "dental-mirage/api/internal/mail"
	"dental-mirage/api/internal/ratelimit"
	"dental-mirage/api/internal/security"
	"dental-mirage/api/internal/turnstile"
)

func main() {
	// .env es opcional (útil en desarrollo local); en producción las
	// variables de entorno las provee la plataforma de deploy.
	if err := godotenv.Load(); err != nil {
		log.Println("no se encontró .env, usando variables de entorno del sistema")
	}

	cfg := config.Load()

	gormDB, err := db.Connect(cfg.DBUrl)
	if err != nil {
		log.Fatalf("error conectando a la base de datos: %v", err)
	}

	deps := buildAuthDeps(cfg, gormDB)
	router := apihttp.NewRouterWithDeps(gormDB, deps, cfg.CORSAllowedOrigins)

	log.Printf("dental-mirage api escuchando en :%s (env=%s)", cfg.Port, cfg.Env)
	if err := http.ListenAndServe(":"+cfg.Port, router); err != nil {
		log.Fatalf("error arrancando el servidor: %v", err)
	}
}

// buildAuthDeps inyecta las implementaciones dev/prod de cada dependencia
// externa del módulo de auth (CLAUDE.md — patrón dev/prod: interfaz +
// no-op en dev + real activada por env var). Sin la env var
// correspondiente, cada dependencia queda nil-disabled — nunca un 500;
// mail siempre tiene una implementación (LogSender en dev).
func buildAuthDeps(cfg config.Config, gormDB *gorm.DB) apihttp.AuthDeps {
	var mailSender dmmail.Sender = dmmail.LogSender{}
	if cfg.ResendAPIKey != "" {
		mailSender = dmmail.NewResendSender(cfg.ResendAPIKey, cfg.ResendFromEmail)
	}

	var googleExchanger googleauth.Exchanger
	if cfg.GoogleClientID != "" && cfg.GoogleClientSecret != "" {
		googleExchanger = googleauth.NewHTTPExchanger(cfg.GoogleClientID, cfg.GoogleClientSecret)
	}

	var turnstileVerifier turnstile.Verifier
	if cfg.TurnstileSecretKey != "" {
		turnstileVerifier = turnstile.NewHTTPVerifier(cfg.TurnstileSecretKey)
	}

	var pwnedChecker security.PwnedChecker
	if cfg.HaveIBeenPwnedEnabled {
		pwnedChecker = security.NewHTTPPwnedChecker()
	}

	return apihttp.AuthDeps{
		Mail:              mailSender,
		Google:            googleExchanger,
		Turnstile:         turnstileVerifier,
		Pwned:             pwnedChecker,
		AccountLimiter:    &ratelimit.AccountLimiter{DB: gormDB},
		IPLimiter:         ratelimit.NewIPLimiter(),
		AppBaseURL:        cfg.AppBaseURL,
		StateSecret:       cfg.JWTSecret,
		GoogleRedirectURI: cfg.GoogleRedirectURI,
		// Sin RESEND_API_KEY no hay forma de que un usuario reciba el link
		// de verificación — auto-verificar en vez de dejarlo bloqueado
		// (pedido explícito del cliente, 2026-08-26, mientras no esté
		// configurado Resend en Render; ver TR-051 en docs/tradeoffs.md).
		// Se apaga solo apenas se cargue la env var.
		AutoVerifyEmail: cfg.ResendAPIKey == "",
	}
}
