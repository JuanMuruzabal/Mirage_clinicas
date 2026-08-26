// Command api arranca el backend HTTP de Dental Mirage.
package main

import (
	"log"
	"net/http"
	"time"

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

// purgeInterval — cada cuánto corre el barrido de basura de auth (TR-063
// en docs/tradeoffs.md). Una vez por hora alcanza de sobra: la TTL más
// corta involucrada (verificationCodeTTL, 15min) es barata de dejar
// vencida un rato más; lo que importa es que la de 24h (cuentas
// abandonadas) no crezca sin límite entre corridas.
const purgeInterval = 1 * time.Hour

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

	go runPurgeLoop(gormDB)

	log.Printf("dental-mirage api escuchando en :%s (env=%s)", cfg.Port, cfg.Env)
	if err := http.ListenAndServe(":"+cfg.Port, router); err != nil {
		log.Fatalf("error arrancando el servidor: %v", err)
	}
}

// runPurgeLoop — TR-063 en docs/tradeoffs.md: corre db.PurgeAuthGarbage de
// entrada (para que un restart no espere una hora entera antes de la
// primera limpieza) y después cada purgeInterval, hasta que el proceso
// termine. Nunca hace panic ni tira abajo el servidor por un error acá
// (best-effort, se loguea y se sigue) — no vale la pena arriesgar el
// servicio completo por una tarea de mantenimiento.
func runPurgeLoop(gormDB *gorm.DB) {
	purgeOnce(gormDB)
	ticker := time.NewTicker(purgeInterval)
	defer ticker.Stop()
	for range ticker.C {
		purgeOnce(gormDB)
	}
}

func purgeOnce(gormDB *gorm.DB) {
	stats, err := db.PurgeAuthGarbage(gormDB, apihttp.CuentaAbandonadaTTL)
	if err != nil {
		log.Printf("purga de basura de auth: error: %v", err)
		return
	}
	if stats.UsuariosAbandonados > 0 || stats.SesionesVencidas > 0 || stats.TokensVencidos > 0 {
		log.Printf(
			"purga de basura de auth: %d cuentas abandonadas, %d sesiones vencidas, %d tokens vencidos",
			stats.UsuariosAbandonados, stats.SesionesVencidas, stats.TokensVencidos,
		)
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
