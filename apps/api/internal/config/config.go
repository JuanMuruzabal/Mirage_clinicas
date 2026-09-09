// Package config centraliza la lectura de variables de entorno del backend.
package config

import (
	"os"
	"strings"
)

// OAuthStateSecretDeDesarrollo — el valor al que cae la env var cuando no
// está, está vacía o es solo espacios (ver getEnv más abajo). Existe para
// que `development` nunca se trabe por falta de configuración local, y es
// PÚBLICO: está acá, en el repo, a la vista de cualquiera.
//
// Es una constante con nombre, y no un literal suelto en Load(), porque el
// guard de arranque (requireExplicitSecretsOutsideDev en cmd/api/main.go)
// necesita poder comparar contra ella: fuera de development, arrancar con
// este valor tiene que ser imposible.
const OAuthStateSecretDeDesarrollo = "dev-secret-cambiar-en-produccion"

// Config agrupa todo lo que el backend necesita para arrancar.
type Config struct {
	Port  string
	DBUrl string
	Env   string

	// OAuthStateSecret firma con HMAC-SHA256 el parámetro `state` del
	// login con Google (internal/http/oauthstate.go). Es su ÚNICO uso: en
	// este backend no hay ningún JWT, ni una librería para manejarlos —
	// la sesión es un token opaco validado contra la tabla `sessions`
	// (TR-037 en docs/Arquitectura y base/tradeoffs.md).
	//
	// Se lee de la env var JWT_SECRET, y ese nombre es una HERENCIA de
	// antes de TR-037, cuando la sesión sí era un JWT stateless. La
	// variable NO se renombró a propósito: cambiarle el nombre rompería
	// los deploys que ya la tienen configurada así. El identificador de
	// Go sí dice lo que la cosa es — la disonancia entre los dos nombres
	// vive documentada acá y en apps/api/.env.example, no en la cabeza de
	// quien lea el código.
	OAuthStateSecret string
	// CORSAllowedOrigins — orígenes desde los que el navegador puede
	// llamar directo a la API. No afecta las llamadas server-to-server de
	// Next.js vía Server Actions/Route Handlers (spec §9.3, BFF sin
	// excepciones) — eso nunca pasa por CORS.
	CORSAllowedOrigins []string

	// --- docs/Login/feature-sumarte-login.md: auth/onboarding nuevo ---

	// AppBaseURL arma los links absolutos de los mails (verificación,
	// reset de password) — apps/web, no la URL de esta API.
	AppBaseURL string

	// Resend (módulo de mails, spec §6). Sin API key: LogSender (dev),
	// nunca falla el registro/reset por no tener mails configurados.
	ResendAPIKey    string
	ResendFromEmail string

	// Google OAuth (spec §2, decisión #1 del plan: popup + Authorization
	// Code). Sin credenciales: /auth/google responde 501, el botón de
	// Google se puede ocultar en el frontend.
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURI  string

	// Cloudflare Turnstile (CAPTCHA en registro y reset, spec §7). Sin
	// secret key: CAPTCHA deshabilitado (dev).
	TurnstileSecretKey string

	// HaveIBeenPwnedEnabled — spec §7. Deshabilitado por default en dev
	// para no depender de red saliente en cada test/registro local.
	HaveIBeenPwnedEnabled bool

	// Storage de foto de perfil (dev: disco local; prod: R2/S3 — mismo
	// patrón dev/prod del resto de dependencias externas).
	StorageDir        string
	StorageR2Bucket   string
	StorageR2Region   string
	StorageR2Key      string
	StorageR2Secret   string
	StorageR2Endpoint string
	StoragePublicURL  string
}

// Load lee la configuración desde variables de entorno, con valores por
// defecto razonables para desarrollo local (mismos defaults que
// docker-compose.yml).
func Load() Config {
	port := getEnv("PORT", "8080")
	return Config{
		Port:             port,
		DBUrl:            getEnv("DATABASE_URL", "postgres://dental_mirage:dental_mirage@localhost:5432/dental_mirage?sslmode=disable"),
		OAuthStateSecret: getEnv("JWT_SECRET", OAuthStateSecretDeDesarrollo),
		Env:              getEnv("APP_ENV", "development"),

		CORSAllowedOrigins: getEnvList("CORS_ALLOWED_ORIGINS", []string{"http://localhost:3000"}),

		AppBaseURL: getEnv("APP_BASE_URL", "http://localhost:3000"),

		ResendAPIKey: getEnv("RESEND_API_KEY", ""),
		// Dominio real del cliente (miragesoftware.online) — con nombre de
		// marca, Resend acepta "Nombre <mail>" en el campo `from` tal cual.
		ResendFromEmail: getEnv("RESEND_FROM_EMAIL", "Dental Mirage <no-reply@miragesoftware.online>"),

		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURI:  getEnv("GOOGLE_REDIRECT_URI", "postmessage"),

		TurnstileSecretKey: getEnv("TURNSTILE_SECRET_KEY", ""),

		HaveIBeenPwnedEnabled: getEnv("HIBP_ENABLED", "false") == "true",

		StorageDir:        getEnv("STORAGE_DIR", "./tmp/storage"),
		StorageR2Bucket:   getEnv("STORAGE_R2_BUCKET", ""),
		StorageR2Region:   getEnv("STORAGE_R2_REGION", ""),
		StorageR2Key:      getEnv("STORAGE_R2_ACCESS_KEY", ""),
		StorageR2Secret:   getEnv("STORAGE_R2_SECRET_KEY", ""),
		StorageR2Endpoint: getEnv("STORAGE_R2_ENDPOINT", ""),
		StoragePublicURL:  getEnv("STORAGE_PUBLIC_URL", ""),
	}
}

// getEnv recorta espacio en blanco alrededor del valor — un secret pegado
// desde un dashboard de deploy con un salto de línea de más al final es un
// error humano fácil de cometer (bug real documentado en Marcuzzi_Madryn,
// mismo patrón replicado acá desde el día 1).
func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		if trimmed := strings.TrimSpace(v); trimmed != "" {
			return trimmed
		}
	}
	return fallback
}

// getEnvList lee una lista separada por comas (p. ej.
// "https://a.com,https://b.com").
func getEnvList(key string, fallback []string) []string {
	raw, ok := os.LookupEnv(key)
	if !ok || raw == "" {
		return fallback
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	if len(out) == 0 {
		return fallback
	}
	return out
}
