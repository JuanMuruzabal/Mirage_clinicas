package documentos

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// Anchos realistas de las zonas de las plantillas. En producción salen de
// la plantilla, no del usuario: se fuzzea solo el texto.
var anchosDeFuzz = []struct{ ancho, tamano, primera float64 }{
	{500, 10, 500},
	{200, 9, 120},
	{80, 11, 40},
	{30, 10, 15},
}

func sinBlancos(s string) string {
	return strings.NewReplacer(" ", "", "\t", "", "\n", "").Replace(s)
}

func FuzzEnvolver(f *testing.F) {
	for _, s := range []string{
		"",
		"Tratamiento de conducto en la pieza 3.6",
		"una\n\nlinea en blanco\n",
		"Pseudohipoparatiroidismoextraordinariamentelargo",
		"   espacios   y\ttabs\t ",
		"ñandú áéíóú ¿qué? €",
		"W",
		"WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
		"a\r\nb",
		"日本語のテキスト",
	} {
		for sel := range anchosDeFuzz {
			f.Add(s, uint8(sel))
		}
	}
	f.Fuzz(func(t *testing.T, texto string, sel uint8) {
		// Los textos llegan por JSON: siempre UTF-8 válido. Con bytes
		// inválidos, el corte por caracteres los pasa a U+FFFD.
		if !utf8.ValidString(texto) {
			t.Skip("texto con UTF-8 inválido: no llega por JSON")
		}
		a := anchosDeFuzz[int(sel)%len(anchosDeFuzz)]
		lineas := Envolver(texto, a.ancho, a.tamano, a.primera)

		if got, want := sinBlancos(strings.Join(lineas, "")), sinBlancos(texto); got != want {
			t.Fatalf("se perdió o se inventó texto: %q → %q", want, got)
		}
		if parrafos := strings.Count(texto, "\n") + 1; len(lineas) < parrafos {
			t.Fatalf("%d renglones para %d párrafos", len(lineas), parrafos)
		}
		for i, l := range lineas {
			ancho := a.ancho
			if i == 0 {
				ancho = a.primera
			}
			if !cabe(l, a.tamano, ancho) && utf8.RuneCountInString(l) != 1 {
				t.Fatalf("el renglón %d (%q) no entra en %v a tamaño %v", i, l, ancho, a.tamano)
			}
		}
	})
}

func esFechaISO(s string) bool {
	if len(s) != 10 || s[4] != '-' || s[7] != '-' {
		return false
	}
	for i := 0; i < 10; i++ {
		if i == 4 || i == 7 {
			continue
		}
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

func FuzzParteDeFecha(f *testing.F) {
	for _, iso := range []string{"2026-09-07", "2026-13-01", "2026-00-15", "26-09-07", "2026-09-07\n", "", "abcd-ef-gh", "２０２６-09-07"} {
		for _, parte := range []string{"dia", "mes", "mes_nombre", "anio", "anio2", "otra", ""} {
			f.Add(iso, parte)
		}
	}
	f.Fuzz(func(t *testing.T, iso, parte string) {
		got := ParteDeFecha(iso, parte)
		if !esFechaISO(iso) {
			if got != "" {
				t.Fatalf("ParteDeFecha(%q, %q) = %q para una fecha inválida", iso, parte, got)
			}
			return
		}
		var want string
		switch parte {
		case "dia":
			want = iso[8:10]
		case "mes":
			want = iso[5:7]
		case "anio":
			want = iso[0:4]
		case "anio2":
			want = iso[2:4]
		case "mes_nombre":
			if n := int(iso[5]-'0')*10 + int(iso[6]-'0'); n >= 1 && n <= 12 {
				want = meses[n-1]
			}
		}
		if got != want {
			t.Fatalf("ParteDeFecha(%q, %q) = %q, se esperaba %q", iso, parte, got, want)
		}
	})
}
