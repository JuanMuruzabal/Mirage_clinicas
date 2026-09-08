// Command api arranca el backend HTTP de Dental Mirage.
package main

import (
	"errors"
	"log"
	"net/http"
	"os"
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
// en docs/Arquitectura y base/tradeoffs.md). Una vez por hora alcanza de sobra: la TTL más
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

	// Corrección de seguridad (auditoría 2026-09-08, docs/Seguridad y
	// optimizacion/radiografia-tecnica_1.md): JWT_SECRET cae a un valor
	// hardcodeado y público en el repo si la env var no está seteada
	// (config.go) — pensado para que `development` nunca se rompa por
	// falta de configuración local. Fuera de `development`, ese mismo
	// comportamiento es peligroso: un typo en el nombre de la variable en
	// el dashboard de deploy haría arrancar el proceso en silencio
	// firmando el `state` de OAuth con un secreto que cualquiera puede
	// leer en GitHub. Un secreto crítico tiene que frenar el arranque si
	// falta, nunca degradar solo.
	if err := requireExplicitSecretsOutsideDev(cfg); err != nil {
		log.Fatalf("configuración insegura: %v", err)
	}

	gormDB, err := db.Connect(cfg.DBUrl)
	if err != nil {
		log.Fatalf("error conectando a la base de datos: %v", err)
	}

	deps := buildAuthDeps(cfg, gormDB)
	router := apihttp.NewRouterWithDeps(gormDB, deps, cfg.CORSAllowedOrigins)

	go runPurgeLoop(gormDB)

	// http.Server explícito, no http.ListenAndServe directo — corrección
	// de seguridad (misma auditoría de arriba): sin ReadHeaderTimeout, una
	// conexión que manda los headers de la request muy lentamente (patrón
	// Slowloris) queda abierta indefinidamente, agotando goroutines/
	// conexiones de a poco. middleware.Timeout (router.go) ya corta el
	// PROCESAMIENTO a los 30s, pero corre recién después de que el
	// handler arrancó — no cubre esta fase anterior, de lectura de la
	// conexión en sí.
	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("dental-mirage api escuchando en :%s (env=%s)", cfg.Port, cfg.Env)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("error arrancando el servidor: %v", err)
	}
}

// requireExplicitSecretsOutsideDev — ver el comentario grande en main()
// sobre por qué. Extraída como función pura (recibe el resultado de
// os.LookupEnv en vez de leerlo ella misma) para poder testearla sin
// mutar variables de entorno globales del proceso de test.
func requireExplicitSecretsOutsideDev(cfg config.Config) error {
	if cfg.Env == "development" {
		return nil
	}
	if _, ok := os.LookupEnv("JWT_SECRET"); !ok {
		return errors.New("JWT_SECRET es obligatorio fuera de development — no se puede arrancar con el secreto de ejemplo del repo")
	}
	return nil
}

// runPurgeLoop — TR-063 en docs/Arquitectura y base/tradeoffs.md: corre db.PurgeAuthGarbage de
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
		// configurado Resend en Render; ver TR-051 en docs/Arquitectura y base/tradeoffs.md).
		// Se apaga solo apenas se cargue la env var.
		AutoVerifyEmail: cfg.ResendAPIKey == "",
		// Mismo criterio/señal que AutoVerifyEmail — pedido del cliente
		// para ver el código de "Confirmanos que sos vos" sin mirar los
		// logs mientras prueba el wizard público en local.
		ExponerCodigoVerificacion: cfg.ResendAPIKey == "",
		// Mismo criterio/señal que las dos de arriba — pedido textual del
		// cliente: probar en local los detectores de abuso del formulario
		// público sin comerse un bloqueo real (3 días de mail, turnos
		// borrados) que hay que limpiar a mano para seguir iterando.
		SimularBloqueosSeguridad: cfg.ResendAPIKey == "",
	}
}
