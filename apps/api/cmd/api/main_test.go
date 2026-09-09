package main

import (
	"testing"

	"dental-mirage/api/internal/config"
)

// TestRequireExplicitSecretsOutsideDev — corrección de seguridad (auditoría
// 2026-09-08, docs/Seguridad y optimizacion/radiografia-tecnica_1.md): en
// development, JWT_SECRET puede faltar (cae al valor de ejemplo del repo,
// pensado para no trabar el desarrollo local); en cualquier otro entorno
// declarado, arrancar con ese valor tiene que ser imposible.
func TestRequireExplicitSecretsOutsideDev(t *testing.T) {
	t.Run("en development, con el secreto de ejemplo, no falla", func(t *testing.T) {
		cfg := config.Config{Env: "development", OAuthStateSecret: config.OAuthStateSecretDeDesarrollo}
		if err := requireExplicitSecretsOutsideDev(cfg); err != nil {
			t.Errorf("error = %v, esperaba nil en development", err)
		}
	})

	t.Run("fuera de development, con el secreto de ejemplo, falla", func(t *testing.T) {
		cfg := config.Config{Env: "production", OAuthStateSecret: config.OAuthStateSecretDeDesarrollo}
		if err := requireExplicitSecretsOutsideDev(cfg); err == nil {
			t.Error("esperaba un error: arrancar en producción con el secreto público del repo")
		}
	})

	t.Run("fuera de development, con un secreto real, no falla", func(t *testing.T) {
		cfg := config.Config{Env: "production", OAuthStateSecret: "un-secreto-real-de-verdad"}
		if err := requireExplicitSecretsOutsideDev(cfg); err != nil {
			t.Errorf("error = %v, esperaba nil con un secreto propio", err)
		}
	})
}

// TestRequireExplicitSecretsOutsideDev_ContraConfigLoadReal — el test que
// cierra el agujero encontrado al revisar la Fase A (2026-09-09), y la
// razón por la que va contra config.Load() de verdad en vez de armar una
// Config a mano: el bug vivía justamente en la juntura entre las dos
// piezas, y ningún test que construya la Config a mano lo puede ver.
//
// El guard chequeaba `os.LookupEnv("JWT_SECRET")` —si la variable EXISTE—
// mientras config.getEnv cae al valor de desarrollo cuando la variable
// existe pero está VACÍA o es solo espacios. Un JWT_SECRET puesto en
// blanco en el dashboard de deploy (borrar el contenido del campo en vez
// de borrar la fila entera) pasaba el guard, y el proceso arrancaba en
// producción firmando el `state` de OAuth con el secreto que está
// publicado en este mismo repo.
//
// Reproducido antes de arreglarlo:
//
//	cfg.OAuthStateSecret resuelto = "dev-secret-cambiar-en-produccion"
//	AGUJERO CONFIRMADO: el guard dejó arrancar
func TestRequireExplicitSecretsOutsideDev_ContraConfigLoadReal(t *testing.T) {
	casos := []struct {
		nombre     string
		valor      string
		debeFallar bool
	}{
		// Ausente y vacía se prueban igual a propósito: para getEnv las dos
		// caen al mismo valor, así que para el guard también tienen que
		// terminar igual — que es justamente lo que antes no pasaba.
		{nombre: "variable vacía", valor: "", debeFallar: true},
		{nombre: "variable con solo espacios", valor: "   ", debeFallar: true},
		{nombre: "variable con un salto de línea pegado de más", valor: "\n", debeFallar: true},
		{nombre: "variable con el valor de ejemplo escrito a mano", valor: config.OAuthStateSecretDeDesarrollo, debeFallar: true},
		{nombre: "variable con un secreto real", valor: "0a1b2c3d-secreto-propio", debeFallar: false},
	}

	for _, caso := range casos {
		t.Run(caso.nombre, func(t *testing.T) {
			// t.Setenv restaura el valor previo al terminar el subtest.
			t.Setenv("APP_ENV", "production")
			t.Setenv("JWT_SECRET", caso.valor)

			cfg := config.Load()
			err := requireExplicitSecretsOutsideDev(cfg)
			if caso.debeFallar && err == nil {
				t.Errorf("el guard dejó arrancar con OAuthStateSecret resuelto = %q", cfg.OAuthStateSecret)
			}
			if !caso.debeFallar && err != nil {
				t.Errorf("el guard frenó un arranque legítimo: %v", err)
			}
		})
	}
}
