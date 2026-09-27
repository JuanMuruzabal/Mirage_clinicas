package main

import (
	"testing"

	"dental-mirage/api/internal/config"
	"dental-mirage/api/internal/push"
)

// TestRequireConfiguracionSegura — corrección de seguridad (auditoría
// 2026-09-08, docs/Seguridad y optimizacion/radiografia-tecnica_1.md): en
// la máquina de quien desarrolla, JWT_SECRET puede faltar (cae al valor de
// ejemplo del repo, pensado para no trabar el desarrollo local); con una
// URL pública, arrancar con ese valor tiene que ser imposible.
//
// Desde la radiografía técnica 2 (2026-09-26) la señal es la URL y no
// APP_ENV: en Render APP_ENV vale "development" a propósito, así que el
// guard viejo no corría nunca donde importaba. La fila "Render" de abajo
// es la que lo prueba.
func TestRequireConfiguracionSegura(t *testing.T) {
	const publica = "https://miragesoftware.online"
	casos := []struct {
		nombre     string
		cfg        config.Config
		debeFallar bool
	}{
		{"localhost, con el secreto de ejemplo y sin Resend", config.Config{
			Env: "development", AppBaseURL: "http://localhost:3000", OAuthStateSecret: config.OAuthStateSecretDeDesarrollo,
		}, false},
		{"Render (APP_ENV=development, URL pública) con el secreto de ejemplo", config.Config{
			Env: "development", AppBaseURL: publica, OAuthStateSecret: config.OAuthStateSecretDeDesarrollo, ResendAPIKey: "re_x",
		}, true},
		{"URL pública sin Resend", config.Config{
			Env: "development", AppBaseURL: publica, OAuthStateSecret: "un-secreto-real", ResendAPIKey: "",
		}, true},
		{"URL pública con secreto propio y Resend", config.Config{
			Env: "development", AppBaseURL: publica, OAuthStateSecret: "un-secreto-real", ResendAPIKey: "re_x",
		}, false},
		{"APP_ENV=production no alcanza para eximir: manda la URL", config.Config{
			Env: "production", AppBaseURL: publica, OAuthStateSecret: config.OAuthStateSecretDeDesarrollo, ResendAPIKey: "re_x",
		}, true},
	}
	for _, caso := range casos {
		t.Run(caso.nombre, func(t *testing.T) {
			err := requireConfiguracionSeguraFueraDeLocalhost(caso.cfg)
			if caso.debeFallar && err == nil {
				t.Error("el guard dejó arrancar")
			}
			if !caso.debeFallar && err != nil {
				t.Errorf("el guard frenó un arranque legítimo: %v", err)
			}
		})
	}
}

// TestRequireConfiguracionSegura_ContraConfigLoadReal — el test que
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
//
// Desde la radiografía técnica 2, con la configuración de Render de verdad
// (APP_ENV=development y una URL pública), que el guard anterior no veía.
func TestRequireConfiguracionSegura_ContraConfigLoadReal(t *testing.T) {
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
			t.Setenv("APP_ENV", "development")
			t.Setenv("APP_BASE_URL", "https://miragesoftware.online")
			t.Setenv("RESEND_API_KEY", "re_de_prueba")
			t.Setenv("JWT_SECRET", caso.valor)

			cfg := config.Load()
			err := requireConfiguracionSeguraFueraDeLocalhost(cfg)
			if caso.debeFallar && err == nil {
				t.Errorf("el guard dejó arrancar con OAuthStateSecret resuelto = %q", cfg.OAuthStateSecret)
			}
			if !caso.debeFallar && err != nil {
				t.Errorf("el guard frenó un arranque legítimo: %v", err)
			}
		})
	}
}

// TestBuildPush — TR-179: sin claves, los avisos al celular simplemente no
// salen; con una configuración a medias, el proceso no arranca.
func TestBuildPush(t *testing.T) {
	publica, privada, err := push.GenerarClaves()
	if err != nil {
		t.Fatal(err)
	}
	otraPublica, _, _ := push.GenerarClaves()

	sinClaves, err := buildPush(config.Config{})
	if err != nil || sinClaves.ClavePublica() != "" {
		t.Errorf("sin claves: %v, clave %q — esperaba el enviador de desarrollo", err, sinClaves.ClavePublica())
	}
	if _, err := buildPush(config.Config{VAPIDPublicKey: publica}); err == nil {
		t.Error("con una sola de las dos claves tendría que fallar")
	}
	if _, err := buildPush(config.Config{VAPIDPublicKey: otraPublica, VAPIDPrivateKey: privada, VAPIDSubject: "mailto:a@b.com"}); err == nil {
		t.Error("con un par que no se corresponde tendría que fallar")
	}
	// Sin VAPID_SUBJECT, el contacto es la URL pública.
	conURL, err := buildPush(config.Config{VAPIDPublicKey: publica, VAPIDPrivateKey: privada, AppBaseURL: "https://miragesoftware.online"})
	if err != nil || conURL.ClavePublica() != publica {
		t.Errorf("con claves y URL https: %v", err)
	}
	// Sin sujeto y con una URL local no hay contacto válido.
	if _, err := buildPush(config.Config{VAPIDPublicKey: publica, VAPIDPrivateKey: privada, AppBaseURL: "http://localhost:3000"}); err == nil {
		t.Error("sin sujeto y con URL http tendría que fallar")
	}
}
