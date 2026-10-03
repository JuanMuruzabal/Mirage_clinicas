package documentos

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Lo que carga el profesional y cómo se valida — espejo de valores.ts de
// packages/documentos-clinicos, con las MISMAS reglas y los mismos
// mensajes: la pantalla los muestra antes de mandar, y si algo pasa de
// largo, la API los devuelve con el mismo texto.
//
// Los valores llegan como los deja encoding/json: string, float64, []any o
// map[string]any.

type Modo string

const (
	// Tolerante — al guardar un borrador: rechaza lo que está mal, deja
	// vacíos los obligatorios.
	Tolerante Modo = "tolerante"
	// Estricto — al terminar: además exige los obligatorios y el detalle
	// de un SI/NO que lo pide.
	Estricto Modo = "estricto"
)

const (
	largoTexto      = 500
	largoTextoLargo = 5000
	largoDetalle    = 1000
)

// ErrorDeCampo — un error de validación, atado a un campo.
type ErrorDeCampo struct {
	Campo   string `json:"campo"`
	Mensaje string `json:"mensaje"`
}

var (
	formatoFecha = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})$`)
	formatoHora  = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)
)

// EsFechaValida — una fecha real del calendario, entre 1900 y 2100.
func EsFechaValida(v string) bool {
	m := formatoFecha.FindStringSubmatch(v)
	if m == nil {
		return false
	}
	anio, _ := strconv.Atoi(m[1])
	mes, _ := strconv.Atoi(m[2])
	dia, _ := strconv.Atoi(m[3])
	if anio < 1900 || anio > 2100 || mes < 1 || mes > 12 || dia < 1 {
		return false
	}
	diasDelMes := time.Date(anio, time.Month(mes)+1, 0, 0, 0, 0, 0, time.UTC).Day()
	return dia <= diasDelMes
}

// EstaVacio — nada, texto en blanco, lista vacía, SI/NO sin respuesta u
// odontograma sin nada marcado.
func EstaVacio(c *Campo, valor any) bool {
	if valor == nil {
		return true
	}
	// Antes que el texto y la lista: un "" o un [] no es un odontograma vacío.
	if c.Tipo == "odontograma" {
		return odontogramaVacio(c, valor)
	}
	switch v := valor.(type) {
	case string:
		return strings.TrimSpace(v) == ""
	case []any:
		return len(v) == 0
	case map[string]any:
		if c.Tipo != "si_no" {
			return false
		}
		r, existe := v["respuesta"]
		if !existe || r == nil {
			return true
		}
		s, esTexto := r.(string)
		return esTexto && s == ""
	}
	return false
}

func largo(s string) int { return utf8.RuneCountInString(strings.TrimSpace(s)) }

func textos(v any) ([]string, bool) {
	lista, ok := v.([]any)
	if !ok {
		return nil, false
	}
	salida := make([]string, 0, len(lista))
	for _, x := range lista {
		s, ok := x.(string)
		if !ok {
			return nil, false
		}
		salida = append(salida, s)
	}
	return salida, true
}

func hayRepetidos(lista []string) bool {
	vistos := map[string]bool{}
	for _, s := range lista {
		if vistos[s] {
			return true
		}
		vistos[s] = true
	}
	return false
}

func formatoNumeroJS(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}

func errorDeTipo(c *Campo, valor any) string {
	switch c.Tipo {
	case "texto", "texto_largo":
		s, ok := valor.(string)
		if !ok {
			return "Tiene que ser un texto."
		}
		maximo := largoTexto
		if c.Tipo == "texto_largo" {
			maximo = largoTextoLargo
		}
		if largo(s) > maximo {
			return fmt.Sprintf("Puede tener hasta %d caracteres.", maximo)
		}
	case "fecha":
		if s, ok := valor.(string); !ok || !EsFechaValida(s) {
			return "No es una fecha válida."
		}
	case "hora":
		if s, ok := valor.(string); !ok || !formatoHora.MatchString(s) {
			return "No es una hora válida."
		}
	case "numero":
		n, ok := valor.(float64)
		if !ok || math.IsNaN(n) || math.IsInf(n, 0) {
			return "Tiene que ser un número."
		}
		if c.Min != nil && n < *c.Min {
			return fmt.Sprintf("Tiene que ser %s o más.", formatoNumeroJS(*c.Min))
		}
		if c.Max != nil && n > *c.Max {
			return fmt.Sprintf("Tiene que ser %s o menos.", formatoNumeroJS(*c.Max))
		}
		decimales := 0
		if c.Decimales != nil {
			decimales = *c.Decimales
		}
		escala := math.Pow(10, float64(decimales))
		if math.Abs(math.Round(n*escala)-n*escala) > 1e-9 {
			if decimales == 0 {
				return "Tiene que ser un número entero."
			}
			return fmt.Sprintf("Puede tener hasta %d decimales.", decimales)
		}
	case "si_no":
		m, ok := valor.(map[string]any)
		if !ok {
			return "Elegí Sí o No."
		}
		if r, _ := m["respuesta"].(string); r != "si" && r != "no" {
			return "Elegí Sí o No."
		}
		for k := range m {
			if k != "respuesta" && k != "detalle" {
				return "Tiene datos que no corresponden."
			}
		}
		if d, existe := m["detalle"]; existe {
			s, ok := d.(string)
			if !ok {
				return "El detalle tiene que ser un texto."
			}
			if largo(s) > largoDetalle {
				return fmt.Sprintf("El detalle puede tener hasta %d caracteres.", largoDetalle)
			}
		}
	case "opcion_unica":
		s, ok := valor.(string)
		if !ok || !tieneOpcion(c, s) {
			return "Elegí una de las opciones."
		}
	case "opcion_multiple":
		lista, ok := textos(valor)
		if !ok {
			return "Elegí entre las opciones."
		}
		if hayRepetidos(lista) {
			return "Hay una opción repetida."
		}
		for _, s := range lista {
			if !tieneOpcion(c, s) {
				return "Hay una opción que no existe."
			}
		}
	case "piezas":
		lista, ok := textos(valor)
		if !ok {
			return "Elegí las piezas."
		}
		if hayRepetidos(lista) {
			return "Hay una pieza repetida."
		}
		for _, p := range lista {
			if !EsPiezaValida(p, denticionDe(c)) {
				return fmt.Sprintf("%s no es una pieza dentaria válida.", p)
			}
		}
	case "odontograma":
		return errorDeOdontograma(c, valor)
	default:
		return "Este tipo de campo no existe."
	}
	return ""
}

func tieneOpcion(c *Campo, valor string) bool {
	for _, o := range c.Opciones {
		if o.Valor == valor {
			return true
		}
	}
	return false
}

func denticionDe(c *Campo) string {
	if c.Denticion == "" {
		return "ambas"
	}
	return c.Denticion
}

// Validar — los valores de un documento contra su plantilla. Vacío = válido.
func Validar(p *Plantilla, valores map[string]any, modo Modo) []ErrorDeCampo {
	var errores []ErrorDeCampo

	// Los campos desconocidos, en orden estable (un map no lo tiene).
	var desconocidos []string
	for clave := range valores {
		if p.Campo(clave) == nil {
			desconocidos = append(desconocidos, clave)
		}
	}
	sort.Strings(desconocidos)
	for _, clave := range desconocidos {
		errores = append(errores, ErrorDeCampo{Campo: clave, Mensaje: "Este campo no es de este documento."})
	}

	for _, c := range p.Campos() {
		valor := valores[c.ID]
		if EstaVacio(c, valor) {
			if modo == Estricto && c.Requerido {
				errores = append(errores, ErrorDeCampo{Campo: c.ID, Mensaje: "Este dato es obligatorio."})
			}
			continue
		}
		if msg := errorDeTipo(c, valor); msg != "" {
			errores = append(errores, ErrorDeCampo{Campo: c.ID, Mensaje: msg})
			continue
		}
		if modo == Estricto && c.Tipo == "si_no" && c.Detalle != nil {
			m := valor.(map[string]any)
			detalle, _ := m["detalle"].(string)
			if m["respuesta"] == c.Detalle.Cuando && strings.TrimSpace(detalle) == "" {
				errores = append(errores, ErrorDeCampo{Campo: c.ID, Mensaje: "Completá: " + c.Detalle.Etiqueta + "."})
			}
		}
	}
	return errores
}

// FechaComoTexto — AAAA-MM-DD → DD/MM/AAAA.
func FechaComoTexto(iso string) string {
	m := formatoFecha.FindStringSubmatch(iso)
	if m == nil {
		return iso
	}
	return m[3] + "/" + m[2] + "/" + m[1]
}

func numeroComoTexto(v float64, decimales *int) string {
	crudo := formatoNumeroJS(v)
	if decimales != nil {
		crudo = strconv.FormatFloat(v, 'f', *decimales, 64)
	}
	return strings.Replace(crudo, ".", ",", 1)
}

// ValorComoTexto — cómo se lee un valor dentro del documento. Vacío → "".
// Tiene que dar EXACTAMENTE lo mismo que valorComoTexto de valores.ts: lo
// verifica texto_test.go contra los fixtures que genera ese paquete.
func ValorComoTexto(c *Campo, valor any) string {
	if EstaVacio(c, valor) {
		return ""
	}
	switch c.Tipo {
	case "texto", "texto_largo":
		s, _ := valor.(string)
		return strings.TrimSpace(s)
	case "fecha":
		s, _ := valor.(string)
		return FechaComoTexto(s)
	case "hora":
		s, _ := valor.(string)
		return s
	case "numero":
		n, _ := valor.(float64)
		texto := numeroComoTexto(n, c.Decimales)
		if c.Unidad != "" {
			return texto + " " + c.Unidad
		}
		return texto
	case "si_no":
		m, _ := valor.(map[string]any)
		base := "No"
		if m["respuesta"] == "si" {
			base = "Sí"
		}
		detalle, _ := m["detalle"].(string)
		if detalle = strings.TrimSpace(detalle); detalle != "" {
			return base + " (" + detalle + ")"
		}
		return base
	case "opcion_unica":
		s, _ := valor.(string)
		for _, o := range c.Opciones {
			if o.Valor == s {
				return o.Etiqueta
			}
		}
		return ""
	case "opcion_multiple":
		lista, _ := textos(valor)
		elegidos := map[string]bool{}
		for _, s := range lista {
			elegidos[s] = true
		}
		var etiquetas []string
		for _, o := range c.Opciones {
			if elegidos[o.Valor] {
				etiquetas = append(etiquetas, o.Etiqueta)
			}
		}
		return strings.Join(etiquetas, ", ")
	case "piezas":
		lista, _ := textos(valor)
		orden := indicesDe(PiezasDe(denticionDe(c)))
		ordenadas := append([]string(nil), lista...)
		sort.SliceStable(ordenadas, func(i, j int) bool { return orden[ordenadas[i]] < orden[ordenadas[j]] })
		return strings.Join(ordenadas, ", ")
	case "odontograma":
		return odontogramaComoTexto(c, valor)
	}
	return ""
}
