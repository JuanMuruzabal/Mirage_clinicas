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

// TestClientIP_SalteaLosSaltosDeInfraestructura — Fase 3.1.2. Este test
// decía antes lo contrario ("usa el último valor de X-Forwarded-For"), y
// era el que codificaba el bug: daba por sentado que delante había UN solo
// proxy, así que el último valor sería el visitante.
//
// Medido contra el deploy real: un GET desde una IP pública conocida quedó
// logueado como `ip=10.29.215.4`, el router interno de Render. Hay al menos
// dos saltos (Cloudflare, que Render pone delante de todos sus servicios, y
// su router interno), así que el final de la cadena es infraestructura, no
// el visitante. La última IP PÚBLICA sí lo es.
func TestClientIP_SalteaLosSaltosDeInfraestructura(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.9, 10.0.0.1")
	req.RemoteAddr = "192.0.2.1:1234"

	if got := clientIP(req); got != "203.0.113.9" {
		t.Errorf("clientIP = %q, esperaba %q (la última IP pública; 10.0.0.1 es un salto interno)", got, "203.0.113.9")
	}
}

// TestClientIP_CadenaRealDeRender — el límite honesto de leer la cadena, y
// la razón por la que CF-Connecting-IP no es un lujo sino la fuente
// principal.
//
// Con la forma que tiene la cadena en Render (visitante → Cloudflare →
// router interno), la "última IP pública" es la de CLOUDFLARE: 172.71.x es
// un rango público suyo, no una dirección interna, así que ninguna
// heurística sobre X-Forwarded-For puede distinguirla del visitante sin
// conocer los rangos de Cloudflare de memoria.
//
// El test deja escrito el límite: sin CF-Connecting-IP se llega hasta el
// borde del CDN (mejor que la IP interna, pero todavía compartida), y CON
// ella se llega al visitante. Por eso el orden de preferencia es ese y no
// el inverso.
func TestClientIP_CadenaRealDeRender(t *testing.T) {
	cadena := "190.137.139.220, 172.71.98.5, 10.29.215.4"

	sinCF := httptest.NewRequest(http.MethodGet, "/", nil)
	sinCF.Header.Set("X-Forwarded-For", cadena)
	sinCF.RemoteAddr = "10.29.215.4:1234"
	if got := clientIP(sinCF); got != "172.71.98.5" {
		t.Errorf("sin CF-Connecting-IP: clientIP = %q, esperaba el borde del CDN (%q)", got, "172.71.98.5")
	}

	conCF := httptest.NewRequest(http.MethodGet, "/", nil)
	conCF.Header.Set("X-Forwarded-For", cadena)
	conCF.Header.Set("CF-Connecting-IP", "190.137.139.220")
	conCF.RemoteAddr = "10.29.215.4:1234"
	if got := clientIP(conCF); got != "190.137.139.220" {
		t.Errorf("con CF-Connecting-IP: clientIP = %q, esperaba la IP del visitante", got)
	}
}

// TestClientIP_PrefiereCFConnectingIP — Cloudflare la sobrescribe en cada
// request, así que es la fuente más directa cuando está.
func TestClientIP_PrefiereCFConnectingIP(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("CF-Connecting-IP", "190.137.139.220")
	req.Header.Set("X-Forwarded-For", "203.0.113.9, 10.29.215.4")
	req.RemoteAddr = "10.29.215.4:1234"

	if got := clientIP(req); got != "190.137.139.220" {
		t.Errorf("clientIP = %q, esperaba la de CF-Connecting-IP", got)
	}
}

// TestClientIP_CFConnectingIPBasuraNoGana — si esa cabecera trae algo que
// no es una IP pública, se ignora y sigue la cadena normal. No se le da
// autoridad a un valor por el solo nombre del header.
func TestClientIP_CFConnectingIPBasuraNoGana(t *testing.T) {
	for _, basura := range []string{"no-soy-una-ip", "10.0.0.5", "127.0.0.1", ""} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		if basura != "" {
			req.Header.Set("CF-Connecting-IP", basura)
		}
		req.Header.Set("X-Forwarded-For", "203.0.113.9, 10.29.215.4")
		req.RemoteAddr = "10.29.215.4:1234"

		if got := clientIP(req); got != "203.0.113.9" {
			t.Errorf("con CF-Connecting-IP=%q: clientIP = %q, esperaba 203.0.113.9", basura, got)
		}
	}
}

// TestClientIP_SinNingunaPublicaMantieneElComportamientoViejo — desarrollo,
// tests y red interna: si en la cadena no hay ninguna IP pública, se usa el
// último valor tal cual, exactamente como antes de la Fase 3.1.2.
func TestClientIP_SinNingunaPublicaMantieneElComportamientoViejo(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Forwarded-For", "172.22.0.1, 10.0.0.9")
	req.RemoteAddr = "192.0.2.1:1234"

	if got := clientIP(req); got != "10.0.0.9" {
		t.Errorf("clientIP = %q, esperaba %q", got, "10.0.0.9")
	}
}

// TestClientIP_NoSeDejaFalsificarElPrimerValor — reproduce el escenario de
// ataque que motivó el fix: un cliente que manda su propio
// X-Forwarded-For pretendiendo ser otra IP. El proxy de confianza (Render)
// AGREGA la IP real observada al final sin tocar lo que vino antes —
// clientIP tiene que devolver esa IP real, nunca el valor que el cliente
// intentó imponer.
func TestClientIP_NoSeDejaFalsificarElPrimerValor(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	// El cliente manda esto pretendiendo ser la IP de otra persona —
	// "203.0.113.9" es la IP falsa que el atacante quiere que el sistema
	// crea, "198.51.100.7" es la IP real del atacante, agregada por el
	// proxy al reenviar la request.
	req.Header.Set("X-Forwarded-For", "203.0.113.9, 198.51.100.7")
	req.RemoteAddr = "10.0.0.1:1234"

	if got := clientIP(req); got == "203.0.113.9" {
		t.Fatalf("clientIP = %q — devolvió la IP falsificada por el cliente en vez de la real", got)
	}
	if got := clientIP(req); got != "198.51.100.7" {
		t.Errorf("clientIP = %q, esperaba %q (la IP real que agregó el proxy)", got, "198.51.100.7")
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
