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
	if cfg.JWTSecret != "un-secret-con-espacios" {
		t.Errorf("JWTSecret = %q, esperaba recortado sin espacios", cfg.JWTSecret)
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
