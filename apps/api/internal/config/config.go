// Package config centraliza la lectura de variables de entorno del backend.
package config

import (
	"os"
	"strings"
)

// Config agrupa todo lo que el backend necesita para arrancar.
type Config struct {
	Port      string
	DBUrl     string
	JWTSecret string
	Env       string
	// CORSAllowedOrigins — orígenes desde los que el navegador puede
	// llamar directo a la API. No afecta las llamadas server-to-server de
	// Next.js vía Server Actions/Route Handlers (spec §9.3, BFF sin
	// excepciones) — eso nunca pasa por CORS.
	CORSAllowedOrigins []string
}

// Load lee la configuración desde variables de entorno, con valores por
// defecto razonables para desarrollo local (mismos defaults que
// docker-compose.yml).
func Load() Config {
	port := getEnv("PORT", "8080")
	return Config{
		Port:      port,
		DBUrl:     getEnv("DATABASE_URL", "postgres://dental_mirage:dental_mirage@localhost:5432/dental_mirage?sslmode=disable"),
		JWTSecret: getEnv("JWT_SECRET", "dev-secret-cambiar-en-produccion"),
		Env:       getEnv("APP_ENV", "development"),

		CORSAllowedOrigins: getEnvList("CORS_ALLOWED_ORIGINS", []string{"http://localhost:3000"}),
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
