package config

import "testing"

func TestLoad_Defaults(t *testing.T) {
	cfg := Load()

	if cfg.Port != "8080" {
		t.Errorf("Port = %q, esperaba %q", cfg.Port, "8080")
	}
	if cfg.Env != "development" {
		t.Errorf("Env = %q, esperaba %q", cfg.Env, "development")
	}
	if len(cfg.CORSAllowedOrigins) != 1 || cfg.CORSAllowedOrigins[0] != "http://localhost:3000" {
		t.Errorf("CORSAllowedOrigins = %v, esperaba [http://localhost:3000]", cfg.CORSAllowedOrigins)
	}
}

func TestLoad_EnvOverride(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("JWT_SECRET", "  un-secret-con-espacios  ")
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://a.com, https://b.com")

	cfg := Load()

	if cfg.Port != "9090" {
		t.Errorf("Port = %q, esperaba %q", cfg.Port, "9090")
	}
	if cfg.OAuthStateSecret != "un-secret-con-espacios" {
		t.Errorf("OAuthStateSecret = %q, esperaba recortado sin espacios", cfg.OAuthStateSecret)
	}
	if len(cfg.CORSAllowedOrigins) != 2 || cfg.CORSAllowedOrigins[0] != "https://a.com" || cfg.CORSAllowedOrigins[1] != "https://b.com" {
		t.Errorf("CORSAllowedOrigins = %v, esperaba [https://a.com https://b.com]", cfg.CORSAllowedOrigins)
	}
}

func TestLoad_EnvVacioCaeAlDefault(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("CORS_ALLOWED_ORIGINS", "")

	cfg := Load()

	if cfg.Env != "development" {
		t.Errorf("Env = %q, esperaba el default %q ante env var vacía", cfg.Env, "development")
	}
	if len(cfg.CORSAllowedOrigins) != 1 || cfg.CORSAllowedOrigins[0] != "http://localhost:3000" {
		t.Errorf("CORSAllowedOrigins = %v, esperaba el default ante env var vacía", cfg.CORSAllowedOrigins)
	}
}

// TestLoad_BFFSharedSecretDeEjemploSeDescartaFueraDeDevelopment — el valor
// de ejemplo está en el repo (docker-compose.yml, los .env.example), así
// que fuera de development no puede valer como prueba de que un pedido
// viene del BFF: con él, cualquiera declararía la IP que quisiera y
// evadiría el rate-limiting y los detectores de abuso del wizard.
//
// Degradar a "sin configurar" deja a la API viendo la IP del proceso web,
// que es exactamente como funcionaba antes de la Fase 3.1.1 — molesto,
// pero seguro.
func TestLoad_BFFSharedSecretDeEjemploSeDescartaFueraDeDevelopment(t *testing.T) {
	t.Setenv("BFF_SHARED_SECRET", BFFSharedSecretDeDesarrollo)

	t.Setenv("APP_ENV", "development")
	if got := Load().BFFSharedSecret; got != BFFSharedSecretDeDesarrollo {
		t.Errorf("en development = %q, esperaba que el valor de ejemplo sirva", got)
	}

	for _, env := range []string{"staging", "production"} {
		t.Setenv("APP_ENV", env)
		if got := Load().BFFSharedSecret; got != "" {
			t.Errorf("en %s = %q, esperaba vacío — el secreto de ejemplo es público", env, got)
		}
	}
}

// TestLoad_BFFSharedSecretPropioSeRespeta — la otra mitad: un valor real
// configurado no se toca en ningún entorno.
func TestLoad_BFFSharedSecretPropioSeRespeta(t *testing.T) {
	t.Setenv("BFF_SHARED_SECRET", "un-secreto-de-verdad")
	for _, env := range []string{"development", "staging", "production"} {
		t.Setenv("APP_ENV", env)
		if got := Load().BFFSharedSecret; got != "un-secreto-de-verdad" {
			t.Errorf("en %s = %q, esperaba el valor configurado", env, got)
		}
	}
}
