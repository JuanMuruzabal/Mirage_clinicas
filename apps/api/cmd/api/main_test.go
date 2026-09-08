package main

import (
	"testing"

	"dental-mirage/api/internal/config"
)

// TestRequireExplicitSecretsOutsideDev — corrección de seguridad (auditoría
// 2026-09-08, docs/Seguridad y optimizacion/radiografia-tecnica_1.md): en
// development, JWT_SECRET puede faltar (cae al valor de ejemplo del repo,
// pensado para no trabar el desarrollo local); en cualquier otro entorno
// declarado, faltar la env var real tiene que frenar el arranque.
func TestRequireExplicitSecretsOutsideDev(t *testing.T) {
	t.Run("en development, sin JWT_SECRET seteada, no falla", func(t *testing.T) {
		cfg := config.Config{Env: "development"}
		if err := requireExplicitSecretsOutsideDev(cfg); err != nil {
			t.Errorf("error = %v, esperaba nil en development", err)
		}
	})

	t.Run("fuera de development, sin JWT_SECRET seteada, falla", func(t *testing.T) {
		cfg := config.Config{Env: "production"}
		if err := requireExplicitSecretsOutsideDev(cfg); err == nil {
			t.Error("esperaba un error por JWT_SECRET faltante fuera de development")
		}
	})

	t.Run("fuera de development, con JWT_SECRET seteada, no falla", func(t *testing.T) {
		t.Setenv("JWT_SECRET", "un-secreto-real-de-verdad")
		cfg := config.Config{Env: "production"}
		if err := requireExplicitSecretsOutsideDev(cfg); err != nil {
			t.Errorf("error = %v, esperaba nil con JWT_SECRET seteada", err)
		}
	})
}
