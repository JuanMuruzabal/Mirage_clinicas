package documentos

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// La LÁMINA — espejo de lamina.ts (TR-187, addendum del 2026-09-28). El
// documento que se completa es la página original del Colegio con lo
// cargado escrito sobre sus renglones; cada plantilla declara dónde va cada
// dato, en puntos del PDF, y esto COMPONE el texto de cada zona: elige el
// tamaño de letra y corta los renglones para que entre.
//
// Tiene que componer EXACTAMENTE lo mismo que la pantalla —misma tabla de
// anchos, misma aritmética, mismo orden de operaciones—: la API congela
// esta composición al terminar el documento, y la vista sellada y el PDF la
// dibujan tal cual. El test de fixtures lo verifica caso por caso.

//go:embed metricas-helvetica.json
var metricasCrudas []byte

var (
	anchosHelvetica     map[rune]int
	anchoHelveticaFalta int
)

func init() {
	var m struct {
		PorDefecto int            `json:"porDefecto"`
		Anchos     map[string]int `json:"anchos"`
	}
	if err := json.Unmarshal(metricasCrudas, &m); err != nil {
		panic(fmt.Sprintf("documentos: métricas de Helvetica rotas: %v", err))
	}
	anchosHelvetica = make(map[rune]int, len(m.Anchos))
	for clave, ancho := range m.Anchos {
		codigo, err := strconv.Atoi(clave)
		if err != nil {
			panic(fmt.Sprintf("documentos: métricas de Helvetica: clave %q", clave))
		}
		anchosHelvetica[rune(codigo)] = ancho
	}
	anchoHelveticaFalta = m.PorDefecto
}

// AnchoEnUnidades — el ancho de un texto en milésimas de em.
func AnchoEnUnidades(texto string) int {
	total := 0
	for _, r := range texto {
		if ancho, ok := anchosHelvetica[r]; ok {
			total += ancho
		} else {
			total += anchoHelveticaFalta
		}
	}
	return total
}

// PaginaDeLamina — el tamaño de una página del original, en puntos.
type PaginaDeLamina struct {
	Ancho float64 `json:"ancho"`
	Alto  float64 `json:"alto"`
}

// Zona — dónde va un dato sobre la página (ver `zonaSchema`).
type Zona struct {
	ID           string  `json:"id"`
	Pagina       int     `json:"pagina"`
	X            float64 `json:"x"`
	Y            float64 `json:"y"`
	Ancho        float64 `json:"ancho"`
	Lineas       int     `json:"lineas,omitempty"`
	Interlineado float64 `json:"interlineado,omitempty"`
	Tamano       float64 `json:"tamano,omitempty"`
	Minimo       float64 `json:"minimo,omitempty"`
	Alinear      string  `json:"alinear,omitempty"`
	Texto        string  `json:"texto"`
	Vacio        string  `json:"vacio,omitempty"`
}

// LugarDeFirma — dónde firma cada rol.
type LugarDeFirma struct {
	Rol    string  `json:"rol"`
	Pagina int     `json:"pagina"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Ancho  float64 `json:"ancho"`
	Alto   float64 `json:"alto"`
}

// Lamina — las páginas, las zonas y los lugares de firma de una plantilla.
type Lamina struct {
	Paginas []PaginaDeLamina `json:"paginas"`
	Zonas   []Zona           `json:"zonas"`
	Firmas  []LugarDeFirma   `json:"firmas"`
}

// LineaCompuesta — un renglón ya ubicado: su línea de base empieza en X, Y.
type LineaCompuesta struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Texto string  `json:"texto"`
}

// ZonaCompuesta — una zona con su texto ya compuesto. Mismo JSON que
// `ZonaCompuesta` de lamina.ts.
type ZonaCompuesta struct {
	Zona     string           `json:"zona"`
	Pagina   int              `json:"pagina"`
	Tamano   float64          `json:"tamano"`
	Lineas   []LineaCompuesta `json:"lineas"`
	Desborda bool             `json:"desborda"`
	Vacia    bool             `json:"vacia"`
}

const (
	tamanoBase = 10.0
	pasoTamano = 0.5
)

var marcaDeZona = regexp.MustCompile(`\{\{([a-z][a-z0-9_.]*)(?::(dia|mes|anio|anio2))?\}\}`)

func redondear2(n float64) float64 { return math.Round(n*100) / 100 }

var fechaISO = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})$`)

// ParteDeFecha — "2026-09-07" → "07" / "09" / "2026" / "26".
func ParteDeFecha(iso, parte string) string {
	m := fechaISO.FindStringSubmatch(iso)
	if m == nil {
		return ""
	}
	switch parte {
	case "dia":
		return m[3]
	case "mes":
		return m[2]
	case "anio":
		return m[1]
	case "anio2":
		return m[1][2:]
	}
	return ""
}

// TextoDeZona — el texto de una zona con los valores adentro, y si está
// vacía (ningún campo cargado; la fecha del sistema no cuenta).
func TextoDeZona(z Zona, p *Plantilla, valores map[string]any, ctx Contexto, modo ModoTexto) (string, bool) {
	campos, cargados := 0, 0
	texto := marcaDeZona.ReplaceAllStringFunc(z.Texto, func(m string) string {
		partes := marcaDeZona.FindStringSubmatch(m)
		nombre, parte := partes[1], partes[2]
		if nombre == "sistema.fecha" {
			return FechaComoTexto(ctx.Fecha)
		}
		c := p.Campo(nombre)
		if c == nil {
			return ""
		}
		campos++
		valor := valores[nombre]
		if EstaVacio(c, valor) {
			if modo == TextoSellado {
				return NoConsigna
			}
			return ""
		}
		cargados++
		if parte != "" {
			s, _ := valor.(string)
			return ParteDeFecha(s, parte)
		}
		return ValorComoTexto(c, valor)
	})
	texto = strings.ReplaceAll(strings.ReplaceAll(texto, "\r\n", "\n"), "\r", "\n")
	return texto, campos > 0 && cargados == 0
}

func cabe(texto string, tamano, ancho float64) bool {
	return float64(AnchoEnUnidades(texto))*tamano <= ancho*1000+1e-6
}

// Envolver — corta un texto en renglones que entran en `ancho` a ese
// tamaño: por párrafo, por palabra y, si una palabra no entra sola, por
// caracteres.
func Envolver(texto string, ancho, tamano float64) []string {
	var lineas []string
	for _, parrafo := range strings.Split(texto, "\n") {
		palabras := strings.FieldsFunc(parrafo, func(r rune) bool { return r == ' ' || r == '\t' })
		if len(palabras) == 0 {
			lineas = append(lineas, "")
			continue
		}
		linea := ""
		for _, palabra := range palabras {
			candidata := palabra
			if linea != "" {
				candidata = linea + " " + palabra
			}
			if cabe(candidata, tamano, ancho) {
				linea = candidata
				continue
			}
			if linea != "" {
				lineas = append(lineas, linea)
			}
			// Un carácter solo queda en su renglón aunque no entre: si no,
			// la palabra se vaciaría y dejaría un renglón en blanco.
			for !cabe(palabra, tamano, ancho) && utf8.RuneCountInString(palabra) > 1 {
				caracteres := []rune(palabra)
				corte := 1
				for corte < len(caracteres) && cabe(string(caracteres[:corte+1]), tamano, ancho) {
					corte++
				}
				lineas = append(lineas, string(caracteres[:corte]))
				palabra = string(caracteres[corte:])
			}
			linea = palabra
		}
		lineas = append(lineas, linea)
	}
	return lineas
}

// ComponerZona — el tamaño más grande (de 0,5 en 0,5 pt, hasta el mínimo)
// con el que el texto entra en los renglones de la zona.
func ComponerZona(z Zona, texto string) ZonaCompuesta {
	maximo := z.Lineas
	if maximo == 0 {
		maximo = 1
	}
	base := z.Tamano
	if base == 0 {
		base = tamanoBase
	}
	minimo := z.Minimo
	if minimo == 0 {
		minimo = redondear2(base * 0.6)
	}
	interlineado := z.Interlineado
	if interlineado == 0 {
		interlineado = redondear2(base * 1.2)
	}
	armar := func(tamano float64, lineas []string, desborda bool) ZonaCompuesta {
		out := make([]LineaCompuesta, len(lineas))
		for i, t := range lineas {
			x := z.X
			if z.Alinear == "centro" {
				x = redondear2(z.X + (z.Ancho-float64(AnchoEnUnidades(t))*tamano/1000)/2)
			}
			out[i] = LineaCompuesta{X: x, Y: redondear2(z.Y + float64(i)*interlineado), Texto: t}
		}
		return ZonaCompuesta{Zona: z.ID, Pagina: z.Pagina, Tamano: tamano, Lineas: out, Desborda: desborda}
	}
	for tamano := base; tamano >= minimo-1e-9; tamano = redondear2(tamano - pasoTamano) {
		lineas := Envolver(texto, z.Ancho, tamano)
		if len(lineas) <= maximo {
			return armar(tamano, lineas, false)
		}
	}
	lineas := Envolver(texto, z.Ancho, minimo)
	if len(lineas) > maximo {
		lineas = lineas[:maximo]
	}
	return armar(minimo, lineas, true)
}

// ArmarLamina — la lámina entera compuesta. Terminada, una zona vacía dice
// "No consigna" (o lo que la zona declare): en la historia clínica no
// quedan huecos (Decreto 1089/2012, art. 15).
func ArmarLamina(p *Plantilla, valores map[string]any, ctx Contexto, modo ModoTexto) []ZonaCompuesta {
	if p.Lamina == nil {
		return nil
	}
	out := make([]ZonaCompuesta, 0, len(p.Lamina.Zonas))
	for _, z := range p.Lamina.Zonas {
		texto, vacia := TextoDeZona(z, p, valores, ctx, modo)
		if vacia && modo == TextoBorrador {
			tamano := z.Tamano
			if tamano == 0 {
				tamano = tamanoBase
			}
			out = append(out, ZonaCompuesta{Zona: z.ID, Pagina: z.Pagina, Tamano: tamano, Lineas: []LineaCompuesta{}, Vacia: true})
			continue
		}
		if vacia {
			texto = NoConsigna
			if z.Vacio != "" {
				texto = z.Vacio
			}
		}
		compuesta := ComponerZona(z, texto)
		compuesta.Vacia = vacia
		out = append(out, compuesta)
	}
	return out
}

// camposDeZona — los campos de una zona, en orden.
func camposDeZona(z Zona) []string {
	var campos []string
	for _, m := range marcaDeZona.FindAllStringSubmatch(z.Texto, -1) {
		if m[1] != "sistema.fecha" {
			campos = append(campos, m[1])
		}
	}
	return campos
}

// ValidarLamina — lo que no entra en el documento: un error en el primer
// campo de cada zona que desborda, con el mensaje de la pantalla.
func ValidarLamina(p *Plantilla, valores map[string]any, ctx Contexto) []ErrorDeCampo {
	if p.Lamina == nil {
		return nil
	}
	var errores []ErrorDeCampo
	compuestas := ArmarLamina(p, valores, ctx, TextoSellado)
	for i, z := range p.Lamina.Zonas {
		if !compuestas[i].Desborda {
			continue
		}
		campo := z.ID
		if campos := camposDeZona(z); len(campos) > 0 {
			campo = campos[0]
		}
		repetido := false
		for _, e := range errores {
			if e.Campo == campo {
				repetido = true
			}
		}
		if !repetido {
			errores = append(errores, ErrorDeCampo{Campo: campo, Mensaje: "No entra en el espacio del documento: acortalo."})
		}
	}
	return errores
}
