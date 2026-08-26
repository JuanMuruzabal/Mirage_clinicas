package http

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSlugify_NormalizaTildesYEnie(t *testing.T) {
	got := slugify("Clínica Peña Ñoño áéíóú")
	want := "clinica-pena-nono-aeiou"
	if got != want {
		t.Errorf("slugify(...) = %q, esperaba %q", got, want)
	}
}

func TestSlugify_CadenaVacíaOSoloSimbolos(t *testing.T) {
	if got := slugify(""); got != "" {
		t.Errorf("slugify(\"\") = %q, esperaba \"\"", got)
	}
	if got := slugify("!!!"); got != "" {
		t.Errorf("slugify(\"!!!\") = %q, esperaba \"\"", got)
	}
}

func TestUniqueSlug_NombresRepetidosGeneranSufijo(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	uno := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Uno", Email: "slug1@example.com", Password: "password123456", NombreClinica: "Sonrisas",
	})
	dos := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Dos", Email: "slug2@example.com", Password: "password123456", NombreClinica: "Sonrisas",
	})

	if uno.Profesional.Slug != "sonrisas" {
		t.Errorf("primer slug = %q, esperaba %q", uno.Profesional.Slug, "sonrisas")
	}
	if dos.Profesional.Slug != "sonrisas-2" {
		t.Errorf("segundo slug = %q, esperaba %q", dos.Profesional.Slug, "sonrisas-2")
	}
}

func TestItoa_UnDigitoYVariosDigitos(t *testing.T) {
	casos := map[int]string{0: "0", 5: "5", 10: "10", 23: "23", 100: "100"}
	for n, want := range casos {
		if got := itoa(n); got != want {
			t.Errorf("itoa(%d) = %q, esperaba %q", n, got, want)
		}
	}
}

func TestIsUniqueViolation(t *testing.T) {
	casos := []struct {
		err  error
		want bool
	}{
		{errors.New("ERROR: duplicate key value violates unique constraint (SQLSTATE 23505)"), true},
		{errors.New("duplicate key value violates unique constraint"), true},
		{errors.New("connection refused"), false},
		{errors.New("record not found"), false},
	}
	for _, c := range casos {
		if got := isUniqueViolation(c.err); got != c.want {
			t.Errorf("isUniqueViolation(%q) = %v, esperaba %v", c.err, got, c.want)
		}
	}
}

func TestClientIP_UsaXForwardedForCuandoEstaPresente(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.9, 10.0.0.1")
	req.RemoteAddr = "192.0.2.1:1234"

	if got := clientIP(req); got != "203.0.113.9" {
		t.Errorf("clientIP = %q, esperaba %q (primer valor de X-Forwarded-For)", got, "203.0.113.9")
	}
}

func TestClientIP_UsaRemoteAddrSinXForwardedFor(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "192.0.2.1:1234"

	if got := clientIP(req); got != "192.0.2.1" {
		t.Errorf("clientIP = %q, esperaba %q", got, "192.0.2.1")
	}
}

func TestClientIP_RemoteAddrSinPuerto(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "sin-puerto-valido"

	if got := clientIP(req); got != "sin-puerto-valido" {
		t.Errorf("clientIP = %q, esperaba el RemoteAddr tal cual si no se puede parsear", got)
	}
}
