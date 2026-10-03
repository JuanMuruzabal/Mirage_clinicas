package documentos

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

// El odontograma (Fase 5.5, TR-192). La tabla de casos la comparte con el
// test del paquete de TypeScript (odontograma.test.ts): los mismos valores
// tienen que dar los mismos mensajes, el mismo texto y las mismas figuras en
// los dos lados. Las figuras esperadas se calcularon a mano con las
// fórmulas del contrato, sobre una geometría de prueba.

type tablaDeOdontograma struct {
	Validacion []struct {
		Nombre  string          `json:"nombre"`
		Campo   json.RawMessage `json:"campo"`
		Valor   json.RawMessage `json:"valor"`
		Modo    string          `json:"modo"`
		Mensaje *string         `json:"mensaje"`
	} `json:"validacion"`
	Vacio []struct {
		Nombre string          `json:"nombre"`
		Campo  json.RawMessage `json:"campo"`
		Valor  json.RawMessage `json:"valor"`
		Vacio  bool            `json:"vacio"`
	} `json:"vacio"`
	Texto []struct {
		Nombre string          `json:"nombre"`
		Campo  json.RawMessage `json:"campo"`
		Valor  json.RawMessage `json:"valor"`
		Texto  string          `json:"texto"`
	} `json:"texto"`
	Figuras []struct {
		Nombre    string          `json:"nombre"`
		Plantilla json.RawMessage `json:"plantilla"`
		Valores   json.RawMessage `json:"valores"`
		Modo      string          `json:"modo"`
		Figuras   json.RawMessage `json:"figuras"`
	} `json:"figuras"`
}

func leerTablaDeOdontograma(t *testing.T) tablaDeOdontograma {
	t.Helper()
	datos, err := os.ReadFile("testdata/odontograma.json")
	if err != nil {
		t.Fatal(err)
	}
	var tabla tablaDeOdontograma
	if err := json.Unmarshal(datos, &tabla); err != nil {
		t.Fatal(err)
	}
	if len(tabla.Validacion) == 0 || len(tabla.Texto) == 0 || len(tabla.Figuras) == 0 {
		t.Fatal("la tabla del odontograma está vacía")
	}
	return tabla
}

// plantillaConCampo — una plantilla mínima alrededor de un campo, cargada
// por el mismo camino que las del registro (sin depender de los nombres de
// los campos del struct).
func plantillaConCampo(t *testing.T, campo json.RawMessage) *Plantilla {
	t.Helper()
	var id struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(campo, &id)
	crudo := `{"id":"odontograma-suelto","version":1,"nombre":"Odontograma suelto","tipo":"historia_clinica",
		"descripcion":"x","fuente":{"nombre":"Tests","url":"https://example.com/modelo"},
		"secciones":[{"id":"examen","titulo":"Examen","campos":[` + string(campo) + `]}],
		"cuerpo":[{"t":"campo","campo":"` + id.ID + `"},{"t":"firmas"}],
		"firmas":[{"rol":"profesional","etiqueta":"Profesional","requerida":true}]}`
	p, err := cargar([]byte(crudo))
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func valorCrudo(t *testing.T, crudo json.RawMessage) any {
	t.Helper()
	if len(crudo) == 0 {
		return nil
	}
	var v any
	if err := json.Unmarshal(crudo, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestOdontograma_Validacion(t *testing.T) {
	for _, c := range leerTablaDeOdontograma(t).Validacion {
		t.Run(c.Nombre, func(t *testing.T) {
			p := plantillaConCampo(t, c.Campo)
			valores := map[string]any{}
			if v := valorCrudo(t, c.Valor); v != nil {
				valores["odonto"] = v
			}
			modo := Tolerante
			if c.Modo == "estricto" {
				modo = Estricto
			}
			errs := Validar(p, valores, modo)
			if c.Mensaje == nil {
				if len(errs) != 0 {
					t.Fatalf("esperaba válido, dio %+v", errs)
				}
				return
			}
			if len(errs) != 1 || errs[0].Campo != "odonto" || errs[0].Mensaje != *c.Mensaje {
				t.Fatalf("esperaba un solo error %q, dio %+v", *c.Mensaje, errs)
			}
		})
	}
}

// Un map de Go no tiene orden: el mismo valor tiene que dar el mismo
// mensaje siempre (las claves se recorren ordenadas).
func TestOdontograma_ValidacionDeterminista(t *testing.T) {
	tabla := leerTablaDeOdontograma(t)
	p := plantillaConCampo(t, tabla.Validacion[0].Campo)
	valor := valorCrudo(t, json.RawMessage(`{"piezas":{"99":{"marcas":{"x":"verde"}},"16":{"caras":{"Q":"rojo"}},
		"21":{"marcas":{"traumatizado":"rojo","sellador":"rojo"}}},"existentes":-1}`))
	for i := 0; i < 50; i++ {
		errs := Validar(p, map[string]any{"odonto": valor}, Estricto)
		if len(errs) != 1 || errs[0].Mensaje != "Hay una cara que no existe." {
			t.Fatalf("vuelta %d: %+v", i, errs)
		}
	}
	marcas := valorCrudo(t, json.RawMessage(`{"piezas":{"21":{"marcas":{"sellador":"rojo"}},"11":{"marcas":{"traumatizado":"rojo"}}}}`))
	for i := 0; i < 50; i++ {
		errs := Validar(p, map[string]any{"odonto": marcas}, Tolerante)
		if len(errs) != 1 || errs[0].Mensaje != "La marca traumatizado no va en este odontograma." {
			t.Fatalf("vuelta %d: %+v", i, errs)
		}
	}
}

func TestOdontograma_Vacio(t *testing.T) {
	for _, c := range leerTablaDeOdontograma(t).Vacio {
		t.Run(c.Nombre, func(t *testing.T) {
			p := plantillaConCampo(t, c.Campo)
			if got := EstaVacio(p.Campo("odonto"), valorCrudo(t, c.Valor)); got != c.Vacio {
				t.Fatalf("EstaVacio = %v, esperaba %v", got, c.Vacio)
			}
		})
	}
}

func TestOdontograma_Texto(t *testing.T) {
	for _, c := range leerTablaDeOdontograma(t).Texto {
		t.Run(c.Nombre, func(t *testing.T) {
			p := plantillaConCampo(t, c.Campo)
			for i := 0; i < 20; i++ { // un map de Go no tiene orden
				if got := ValorComoTexto(p.Campo("odonto"), valorCrudo(t, c.Valor)); got != c.Texto {
					t.Fatalf("texto:\n got: %q\nwant: %q", got, c.Texto)
				}
			}
		})
	}
}

// comoJSON — un valor pasado a JSON y de vuelta, para comparar por forma y
// no por struct. Una lista vacía y una nula son lo mismo: "sin figuras".
func comoJSON(t *testing.T, v any) any {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var out any
	_ = json.Unmarshal(b, &out)
	if out == nil {
		return []any{}
	}
	return out
}

func TestOdontograma_Figuras(t *testing.T) {
	for _, c := range leerTablaDeOdontograma(t).Figuras {
		t.Run(c.Nombre, func(t *testing.T) {
			p, err := cargar(c.Plantilla)
			if err != nil {
				t.Fatal(err)
			}
			valores, _ := valorCrudo(t, c.Valores).(map[string]any)
			modo := TextoBorrador
			if c.Modo == "sellado" {
				modo = TextoSellado
			}
			for i := 0; i < 10; i++ {
				got := comoJSON(t, ArmarFiguras(p, valores, modo))
				want := comoJSON(t, json.RawMessage(c.Figuras))
				if !reflect.DeepEqual(got, want) {
					gotB, _ := json.Marshal(got)
					t.Fatalf("figuras distintas.\n got: %s\nwant: %s", gotB, c.Figuras)
				}
			}
			// El JSON canónico (el que se hashea) lleva `discontinua` solo
			// cuando es true.
			canonico, err := Canonico(ArmarFiguras(p, valores, modo))
			if err != nil {
				t.Fatal(err)
			}
			if bytes.Contains(canonico, []byte(`"discontinua":false`)) {
				t.Fatalf("una figura dice discontinua:false: %s", canonico)
			}
		})
	}
}

func TestOdontograma_SinOdontogramaNoHayFiguras(t *testing.T) {
	if got := ArmarFiguras(conducto(t), map[string]any{}, TextoSellado); len(got) != 0 {
		t.Fatalf("un consentimiento no tiene figuras: %+v", got)
	}
	tabla := leerTablaDeOdontograma(t)
	sinLamina := plantillaConCampo(t, tabla.Texto[0].Campo)
	if got := ArmarFiguras(sinLamina, map[string]any{"odonto": map[string]any{"existentes": 3.0}}, TextoSellado); len(got) != 0 {
		t.Fatalf("sin lámina no hay figuras: %+v", got)
	}
	// Y la huella de un contenido sin figuras no cambia: `figuras` se omite.
	b, _ := Canonico(ContenidoCongelado{Formato: FormatoContenido})
	if strings.Contains(string(b), "figuras") {
		t.Fatalf("un contenido sin figuras no lleva la clave: %s", b)
	}
}

// El PDF de una historia con figuras es determinista: dos generaciones, los
// mismos bytes; y las figuras están en la página (el relleno rojo de una cara).
func TestGenerarPDF_ConOdontogramaEsDeterminista(t *testing.T) {
	p, ok := Ultima("historia-clinica-general")
	if !ok {
		t.Fatal("falta la plantilla historia-clinica-general")
	}
	var campo string
	for _, c := range p.Campos() {
		if c.Tipo == "odontograma" {
			campo = c.ID
		}
	}
	if campo == "" {
		t.Fatal("la historia clínica general no tiene odontograma")
	}
	armar := func() FuenteDelPDF {
		f := selladoDePrueba(t, p, pacienteDePrueba)
		datos, err := fixtures.ReadFile("fixtures/historia-clinica-general.v1.json")
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
		fx.Valores[campo] = valorCrudo(t, json.RawMessage(`{"piezas":{"16":{"caras":{"O":"rojo","M":"rojo"},"marcas":{"corona":"rojo"}},
			"26":{"marcas":{"x":"azul"}},"36":{"caras":{"D":"azul"}}},"protesis":[{"tipo":"removible","desde":"23","hasta":"13","color":"rojo"}],"existentes":28}`))
		var contenido ContenidoCongelado
		if err := json.Unmarshal([]byte(*f.Documento.ContenidoCanonico), &contenido); err != nil {
			t.Fatal(err)
		}
		contenido.Valores = fx.Valores
		contenido.Cuerpo = ArmarCuerpo(p, fx.Valores, fx.Contexto, TextoSellado)
		contenido.Lamina = ArmarLamina(p, fx.Valores, fx.Contexto, TextoSellado)
		contenido.Figuras = ArmarFiguras(p, fx.Valores, TextoSellado)
		if len(contenido.Figuras) == 0 {
			t.Fatal("el odontograma cargado no compuso figuras")
		}
		canonico, hash, err := Congelar(contenido)
		if err != nil {
			t.Fatal(err)
		}
		f.Documento.ContenidoCanonico, f.Documento.HashContenido = &canonico, &hash
		return f
	}
	uno, otro := generarPDF(t, armar()), generarPDF(t, armar())
	if !bytes.Equal(uno, otro) {
		t.Fatal("dos generaciones del mismo documento con odontograma dieron bytes distintos")
	}
	paginas := strings.Join(paginasDelPDF(t, uno), "\n")
	// #d0202e → 208/255, 32/255, 46/255; #1f4fbf → 31/255, 79/255, 191/255.
	for _, color := range []string{"0.816 0.125 0.18 rg", "0.816 0.125 0.18 RG", "0.122 0.31 0.749 RG"} {
		if !strings.Contains(paginas, color) {
			t.Errorf("el PDF no pinta %q (caras rojas, trazos rojos y azules)", color)
		}
	}
	// Sin figuras es otro archivo: las figuras están en el PDF.
	sinFiguras := armar()
	var contenido ContenidoCongelado
	_ = json.Unmarshal([]byte(*sinFiguras.Documento.ContenidoCanonico), &contenido)
	contenido.Figuras = nil
	canonico, hash, _ := Congelar(contenido)
	sinFiguras.Documento.ContenidoCanonico, sinFiguras.Documento.HashContenido = &canonico, &hash
	if bytes.Equal(uno, generarPDF(t, sinFiguras)) {
		t.Fatal("con y sin figuras dieron el mismo PDF: el PDF no dibuja lo congelado")
	}
}
