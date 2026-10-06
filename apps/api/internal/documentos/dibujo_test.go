package documentos

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

// El dibujo (Fase 5.6b): la validación, cuándo está vacío, cómo se lleva al
// recuadro del papel y el PDF de la Historia clínica de odontopediatría con su genograma.
// La tabla de casos (testdata/dibujo.json) la comparte con dibujo.test.ts
// del paquete: los mismos valores dan el mismo mensaje en los dos lados.

type casoDeDibujo struct {
	Nombre   string          `json:"nombre"`
	Valor    json.RawMessage `json:"valor"`
	Generado *struct {
		Ancho, Alto    float64
		Trazos, Puntos int
	} `json:"generado"`
	Vacio   bool    `json:"vacio"`
	Mensaje *string `json:"mensaje"`
}

func (c casoDeDibujo) valor(t *testing.T) any {
	t.Helper()
	if c.Generado == nil {
		return valorCrudo(t, c.Valor)
	}
	trazos := make([]any, c.Generado.Trazos)
	for i := range trazos {
		puntos := make([]any, c.Generado.Puntos)
		for j := range puntos {
			puntos[j] = []any{1.0, 1.0}
		}
		trazos[i] = puntos
	}
	return map[string]any{"ancho": c.Generado.Ancho, "alto": c.Generado.Alto, "trazos": trazos}
}

func historiaDeOdontopediatria(t *testing.T) *Plantilla {
	t.Helper()
	p, ok := Ultima("historia-clinica-odontopediatria")
	if !ok {
		t.Fatal("falta la plantilla historia-clinica-odontopediatria")
	}
	return p
}

func TestDibujo_TablaCompartidaConTypeScript(t *testing.T) {
	datos, err := os.ReadFile("testdata/dibujo.json")
	if err != nil {
		t.Fatal(err)
	}
	var tabla struct {
		Casos []casoDeDibujo `json:"casos"`
	}
	if err := json.Unmarshal(datos, &tabla); err != nil {
		t.Fatal(err)
	}
	if len(tabla.Casos) < 20 {
		t.Fatalf("la tabla del dibujo tiene %d casos", len(tabla.Casos))
	}
	p := historiaDeOdontopediatria(t)
	campo := p.Campo("genograma")
	if campo == nil || campo.Tipo != "dibujo" {
		t.Fatalf("el genograma de odontopediatría: %+v", campo)
	}
	for _, c := range tabla.Casos {
		t.Run(c.Nombre, func(t *testing.T) {
			valor := c.valor(t)
			if vacio := EstaVacio(campo, valor); vacio != c.Vacio {
				t.Fatalf("vacío: Go %v, TypeScript %v", vacio, c.Vacio)
			}
			esperado := ""
			if c.Mensaje != nil {
				esperado = *c.Mensaje
			}
			mensaje := ""
			for _, e := range Validar(p, map[string]any{"genograma": valor}, Tolerante) {
				if e.Campo == "genograma" {
					mensaje = e.Mensaje
				}
			}
			if mensaje != esperado {
				t.Fatalf("mensaje: Go %q, TypeScript %q", mensaje, esperado)
			}
			if valor != nil {
				if got := errorDeDibujo(valor); got != esperado {
					t.Fatalf("errorDeDibujo: %q, se esperaba %q", got, esperado)
				}
			}
		})
	}
}

// Lo que JSON no puede escribir: NaN, infinitos y números que no son float64.
func TestDibujo_NaNEInfinitosYTiposDeGo(t *testing.T) {
	forma := "El dibujo no tiene la forma esperada."
	casos := map[string]any{
		"ancho NaN":           map[string]any{"ancho": math.NaN(), "alto": 200.0, "trazos": []any{}},
		"alto infinito":       map[string]any{"ancho": 400.0, "alto": math.Inf(1), "trazos": []any{}},
		"ancho -infinito":     map[string]any{"ancho": math.Inf(-1), "alto": 200.0, "trazos": []any{}},
		"punto NaN":           map[string]any{"ancho": 400.0, "alto": 200.0, "trazos": []any{[]any{[]any{math.NaN(), 1.0}}}},
		"punto infinito":      map[string]any{"ancho": 400.0, "alto": 200.0, "trazos": []any{[]any{[]any{1.0, math.Inf(1)}}}},
		"ancho int":           map[string]any{"ancho": 400, "alto": 200.0, "trazos": []any{}},
		"trazos tipados":      map[string]any{"ancho": 400.0, "alto": 200.0, "trazos": [][]float64{}},
		"un map de otro tipo": map[string]string{"ancho": "1", "alto": "1", "trazos": "1"},
		"nil":                 nil,
	}
	for nombre, valor := range casos {
		if got := errorDeDibujo(valor); got != forma {
			t.Errorf("%s: %q", nombre, got)
		}
		if dibujoVacio(valor) {
			t.Errorf("%s: no es un dibujo vacío", nombre)
		}
	}
}

func TestDibujo_Vacio(t *testing.T) {
	si := []any{
		map[string]any{"ancho": 400.0, "alto": 200.0, "trazos": []any{}},
		map[string]any{"ancho": 50.0, "alto": 4000.0, "trazos": []any{}},
	}
	no := []any{
		nil, "", []any{}, map[string]any{},
		map[string]any{"trazos": []any{}},
		map[string]any{"ancho": 10.0, "alto": 200.0, "trazos": []any{}},
		map[string]any{"ancho": 400.0, "alto": 200.0, "trazos": []any{}, "extra": 1.0},
		map[string]any{"ancho": 400.0, "alto": 200.0, "trazos": []any{[]any{[]any{1.0, 1.0}}}},
	}
	for _, v := range si {
		if !dibujoVacio(v) {
			t.Errorf("tendría que estar vacío: %v", v)
		}
	}
	for _, v := range no {
		if dibujoVacio(v) {
			t.Errorf("no tendría que estar vacío: %v", v)
		}
	}
}

// Las mismas cuentas que los casos de dibujo.test.ts: un recuadro de 200 ×
// 100 en (10, 20) de la página 2.
func TestDibujo_Figuras(t *testing.T) {
	campo := &Campo{ID: "dibujo", Tipo: "dibujo", Etiqueta: "Genograma"}
	d := DibujoDeLamina{Campo: "dibujo", Pagina: 2, X: 10, Y: 20, Ancho: 200, Alto: 100}
	dibujo := func(ancho, alto float64, trazos ...[][2]float64) map[string]any {
		lista := make([]any, len(trazos))
		for i, tr := range trazos {
			puntos := make([]any, len(tr))
			for j, p := range tr {
				puntos[j] = []any{p[0], p[1]}
			}
			lista[i] = puntos
		}
		return map[string]any{"ancho": ancho, "alto": alto, "trazos": lista}
	}
	trazo := func(puntos ...[2]float64) Figura {
		return Figura{Tipo: "trazo", Pagina: 2, Puntos: puntos, Color: "tinta", Grosor: 0.8}
	}
	casos := []struct {
		nombre string
		valor  any
		modo   ModoTexto
		quiero []Figura
	}{
		{"más ancho: escala del ancho, centrado de arriba abajo",
			dibujo(400, 100, [][2]float64{{0, 0}, {400, 100}, {100, 40}}), TextoBorrador,
			[]Figura{trazo([2]float64{10, 45}, [2]float64{210, 95}, [2]float64{60, 65})}},
		{"más alto: escala del alto, centrado de costado",
			dibujo(100, 400, [][2]float64{{0, 0}, {100, 400}}), TextoSellado,
			[]Figura{trazo([2]float64{97.5, 20}, [2]float64{122.5, 120})}},
		{"redondeo a dos decimales",
			dibujo(300, 300, [][2]float64{{1, 1}, {2, 2}, {299.99, 0.01}}), TextoBorrador,
			[]Figura{trazo([2]float64{60.33, 20.33}, [2]float64{60.67, 20.67}, [2]float64{160, 20})}},
		{"un trazo de un punto, y cada trazo una figura en orden",
			dibujo(400, 100, [][2]float64{{200, 50}}, [][2]float64{{0, 0}, {10, 10}}), TextoBorrador,
			[]Figura{trazo([2]float64{110, 70}), trazo([2]float64{10, 45}, [2]float64{15, 50})}},
		{"vacío en borrador: nada", dibujo(400, 100), TextoBorrador, nil},
		{"sin valor en borrador: nada", nil, TextoBorrador, nil},
		{"roto: nada, ni en sellado", dibujo(400, 100, [][2]float64{{9999, 1}}), TextoSellado, nil},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			got := figurasDeDibujo(campo, d, c.valor, c.modo)
			if len(got) == 0 && len(c.quiero) == 0 {
				return
			}
			if !reflect.DeepEqual(got, c.quiero) {
				t.Fatalf("\n got: %+v\nwant: %+v", got, c.quiero)
			}
		})
	}
	// Vacío y sellado: No consigna en el medio del recuadro (y = 20 + 50 + 3,5).
	for _, valor := range []any{nil, dibujo(400, 100)} {
		got := figurasDeDibujo(campo, d, valor, TextoSellado)
		if len(got) != 1 || got[0].Tipo != "texto" || got[0].Texto != NoConsigna || got[0].Y != 73.5 || got[0].Tamano != 10 || got[0].Pagina != 2 {
			t.Fatalf("vacío y sellado: %+v", got)
		}
		if quiero := textoCentrado(2, NoConsigna, 10, 10, 200, 73.5, "tinta"); !reflect.DeepEqual(got[0], quiero) {
			t.Fatalf("No consigna centrado: %+v, se esperaba %+v", got[0], quiero)
		}
	}
}

func TestDibujo_ValorComoTexto(t *testing.T) {
	p := historiaDeOdontopediatria(t)
	if got := ValorComoTexto(p.Campo("genograma"), valorCrudo(t, json.RawMessage(`{"ancho":400,"alto":200,"trazos":[[[1,1]]]}`))); got != DibujoConsignado {
		t.Fatalf("el genograma como texto: %q", got)
	}
}

func TestEdadAl(t *testing.T) {
	dia := func(s string) time.Time {
		d, err := time.Parse("2006-01-02", s)
		if err != nil {
			t.Fatal(err)
		}
		return d
	}
	casos := []struct {
		nombre, nacimiento, hoy string
		anios, meses            string
	}{
		{"cumpleaños hoy", "2020-10-04", "2026-10-04", "6", "0"},
		{"un día antes del cumpleaños", "2020-10-04", "2026-10-03", "5", "11"},
		{"un día después", "2020-10-04", "2026-10-05", "6", "0"},
		{"un mes y un día", "2026-08-03", "2026-09-04", "0", "1"},
		{"un día antes del mes", "2026-08-05", "2026-09-04", "0", "0"},
		{"nacido hoy", "2026-10-04", "2026-10-04", "0", "0"},
		{"nacido ayer", "2026-10-03", "2026-10-04", "0", "0"},
		{"once meses", "2025-11-04", "2026-10-04", "0", "11"},
		{"fecha futura", "2026-10-05", "2026-10-04", "", ""},
		{"fecha futura, otro año", "2027-01-01", "2026-10-04", "", ""},
		{"fecha inválida", "2020-02-30", "2026-10-04", "", ""},
		{"un texto", "ayer", "2026-10-04", "", ""},
		{"vacía", "", "2026-10-04", "", ""},
		{"otro formato", "04/10/2020", "2026-10-04", "", ""},
		{"29 de febrero, un año después el 28", "2024-02-29", "2025-02-28", "1", "0"},
		{"29 de febrero, un año después el 1 de marzo", "2024-02-29", "2025-03-01", "1", "0"},
		{"29 de febrero, cuatro años después", "2024-02-29", "2028-02-29", "4", "0"},
		{"29 de febrero, el 28 de un año bisiesto", "2024-02-29", "2028-02-28", "3", "11"},
		{"31 de enero, el 28 de febrero no bisiesto", "2025-01-31", "2025-02-28", "0", "1"},
		{"31 de enero, el 27 de febrero", "2025-01-31", "2025-02-27", "0", "0"},
		{"30 de abril, el 30 de mayo", "2025-04-30", "2025-05-30", "0", "1"},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			a, m := EdadAl(c.nacimiento, dia(c.hoy))
			if a != c.anios || m != c.meses {
				t.Fatalf("EdadAl(%s, %s) = %q años %q meses, se esperaba %q y %q", c.nacimiento, c.hoy, a, m, c.anios, c.meses)
			}
		})
	}
	// `hoy` con hora y zona: solo cuentan su año, mes y día.
	cordoba := time.FixedZone("Córdoba", -3*3600)
	if a, m := EdadAl("2020-10-04", time.Date(2026, 10, 4, 23, 59, 0, 0, cordoba)); a != "6" || m != "0" {
		t.Fatalf("con hora: %s años %s meses", a, m)
	}
}

func TestPrecargar_LaEdadSoloSiElCampoLaAdmite(t *testing.T) {
	p := historiaDeOdontopediatria(t)
	anios, meses := "", ""
	for _, c := range p.Campos() {
		switch c.Precarga {
		case "paciente.edadAnios":
			anios = c.ID
		case "paciente.edadMeses":
			meses = c.ID
		}
	}
	if anios == "" || meses == "" {
		t.Fatal("odontopediatría no precarga la edad")
	}
	casos := []struct {
		nombre           string
		anios, meses     string
		quieroA, quieroM any // nil = no se precarga
	}{
		{"una edad válida", "7", "3", 7.0, 3.0},
		{"cero años y cero meses", "0", "0", 0.0, 0.0},
		{"con espacios", " 4 ", " 11 ", 4.0, 11.0},
		{"en los topes", "120", "11", 120.0, 11.0},
		{"fuera de rango: más años que el máximo, doce meses", "121", "12", nil, nil},
		{"negativa", "-1", "-1", nil, nil},
		{"con decimales", "4.5", "2.5", nil, nil},
		{"no es un número", "siete", "tres", nil, nil},
		{"NaN e infinito", "NaN", "Inf", nil, nil},
		{"vacía (EdadAl sin fecha)", "", "", nil, nil},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			valores := Precargar(p, DatosDePrecarga{"paciente.edadAnios": c.anios, "paciente.edadMeses": c.meses})
			for _, par := range []struct {
				id     string
				quiero any
			}{{anios, c.quieroA}, {meses, c.quieroM}} {
				got, existe := valores[par.id]
				if par.quiero == nil {
					if existe {
						t.Errorf("%s no se tendría que precargar: %v", par.id, got)
					}
					continue
				}
				if !existe || got != par.quiero {
					t.Errorf("%s: %v (%T), se esperaba %v", par.id, got, got, par.quiero)
				}
			}
			// Lo precargado nunca es un error en un documento recién creado.
			for _, e := range Validar(p, valores, Tolerante) {
				if e.Campo == anios || e.Campo == meses {
					t.Errorf("lo precargado no valida: %+v", e)
				}
			}
		})
	}
	// De punta a punta: EdadAl alimenta la precarga.
	a, m := EdadAl("2019-03-15", time.Date(2026, 10, 4, 0, 0, 0, 0, time.UTC))
	valores := Precargar(p, DatosDePrecarga{"paciente.edadAnios": a, "paciente.edadMeses": m})
	if valores[anios] != 7.0 || valores[meses] != 6.0 {
		t.Fatalf("la edad de quien nació el 15/03/2019, al 04/10/2026: %v años %v meses", valores[anios], valores[meses])
	}
}

// numPDF — cómo escribe un número el PDF (pdf.num): hasta tres decimales,
// sin ceros de más.
func numPDF(v float64) string {
	v = math.Round(v*1000) / 1000
	if v == 0 {
		return "0"
	}
	return strings.TrimSuffix(strings.TrimRight(strconv.FormatFloat(v, 'f', 3, 64), "0"), ".")
}

func TestGenerarPDF_OdontopediatriaConElGenograma(t *testing.T) {
	p := historiaDeOdontopediatria(t)
	datos, err := fixtures.ReadFile(fmt.Sprintf("fixtures/%s.v%d.json", p.ID, p.Version))
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Contexto Contexto       `json:"contexto"`
		Valores  map[string]any `json:"valores"`
	}
	if err := json.Unmarshal(datos, &fx); err != nil {
		t.Fatal(err)
	}
	if _, ok := fx.Valores["genograma"]; !ok {
		t.Fatal("el fixture de odontopediatría no trae el genograma")
	}
	// Un trazo más, de un solo punto: en el PDF es un segmento de 0,1.
	genograma := fx.Valores["genograma"].(map[string]any)
	genograma["trazos"] = append(genograma["trazos"].([]any), []any{[]any{100.0, 100.0}})

	armar := func(valores map[string]any) FuenteDelPDF {
		f := selladoDePrueba(t, p, pacienteDePrueba)
		var contenido ContenidoCongelado
		if err := json.Unmarshal([]byte(*f.Documento.ContenidoCanonico), &contenido); err != nil {
			t.Fatal(err)
		}
		contenido.Valores = valores
		contenido.Cuerpo = ArmarCuerpo(p, valores, fx.Contexto, TextoSellado)
		contenido.Lamina = ArmarLamina(p, valores, fx.Contexto, TextoSellado)
		contenido.Figuras = ArmarFiguras(p, valores, TextoSellado)
		canonico, hash, err := Congelar(contenido)
		if err != nil {
			t.Fatal(err)
		}
		f.Documento.ContenidoCanonico, f.Documento.HashContenido = &canonico, &hash
		return f
	}

	figuras := ArmarFiguras(p, fx.Valores, TextoSellado)
	var trazos []Figura
	for _, f := range figuras {
		if f.Tipo == "trazo" {
			trazos = append(trazos, f)
		}
	}
	if len(trazos) != len(genograma["trazos"].([]any)) {
		t.Fatalf("el genograma compuso %d trazos, tiene %d", len(trazos), len(genograma["trazos"].([]any)))
	}

	uno, otro := generarPDF(t, armar(fx.Valores)), generarPDF(t, armar(fx.Valores))
	if !bytes.Equal(uno, otro) {
		t.Fatal("dos generaciones de odontopediatría con el genograma dieron bytes distintos")
	}
	paginas := paginasDelPDF(t, uno)
	recuadro := p.Lamina.Dibujos[0]
	pagina := paginas[recuadro.Pagina-1]
	alto := p.Lamina.Paginas[recuadro.Pagina-1].Alto
	if !strings.Contains(pagina, "0.8 w") || !strings.Contains(pagina, "1 J 1 j") {
		t.Error("la página del genograma no lleva un trazo de 0,8 con puntas redondas")
	}
	for i, tr := range trazos {
		x, y := tr.Puntos[0][0], tr.Puntos[0][1]
		inicio := numPDF(x) + " " + numPDF(alto-y) + " m"
		if !strings.Contains(pagina, inicio) {
			t.Errorf("el trazo %d no empieza en %q", i, inicio)
		}
		if len(tr.Puntos) == 1 {
			punto := numPDF(x+0.1) + " " + numPDF(alto-y) + " l"
			if !strings.Contains(pagina, inicio+"\n"+punto) {
				t.Errorf("el trazo de un punto no es un segmento de 0,1: falta %q", punto)
			}
			continue
		}
		ultimo := tr.Puntos[len(tr.Puntos)-1]
		if fin := numPDF(ultimo[0]) + " " + numPDF(alto-ultimo[1]) + " l"; !strings.Contains(pagina, fin) {
			t.Errorf("el trazo %d no termina en %q", i, fin)
		}
	}

	// Sin el genograma es otro archivo, y su recuadro dice No consigna.
	sinGenograma := map[string]any{}
	for k, v := range fx.Valores {
		if k != "genograma" {
			sinGenograma[k] = v
		}
	}
	vacio := generarPDF(t, armar(sinGenograma))
	if bytes.Equal(uno, vacio) {
		t.Fatal("el PDF con y sin el genograma dio los mismos bytes")
	}
	if !strings.Contains(textosDe(paginasDelPDF(t, vacio)[recuadro.Pagina-1]), NoConsigna) {
		t.Error("un genograma vacío y sellado no dice No consigna en el PDF")
	}
}
