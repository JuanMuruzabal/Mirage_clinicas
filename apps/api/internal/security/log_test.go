package security_test

import (
	"strings"
	"testing"

	"dental-mirage/api/internal/security"
)

func TestSinSaltosDeLinea(t *testing.T) {
	casos := []struct{ nombre, entrada, esperado string }{
		{"sin saltos", "ana@prisma.com", "ana@prisma.com"},
		{"vacio", "", ""},
		{"lf suelto", "a\nb", "ab"},
		{"crlf", "a\r\nb", "ab"},
		{"cr suelto", "a\rb", "ab"},
		{"varios seguidos", "a\n\r\n\n\rb", "ab"},
		{"renglon falso", "a@b.com\ntime=2026 level=ERROR msg=falso", "a@b.comtime=2026 level=ERROR msg=falso"},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			got := security.SinSaltosDeLinea(c.entrada)
			if got != c.esperado {
				t.Fatalf("SinSaltosDeLinea(%q) = %q, esperado %q", c.entrada, got, c.esperado)
			}
			if strings.ContainsAny(got, "\r\n") {
				t.Fatalf("quedó un salto de línea en %q", got)
			}
		})
	}
}
