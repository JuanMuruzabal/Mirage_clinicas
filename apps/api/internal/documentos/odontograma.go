package documentos

import (
	"fmt"
	"maps"
	"math"
	"slices"
	"sort"
	"strings"
)

// El ODONTOGRAMA (Fase 5.5) — espejo de odontograma.ts de
// packages/documentos-clinicos. Se marca sobre el dibujo de las piezas del
// modelo del Colegio: caras pintadas de rojo o de azul, marcas sobre la
// pieza y prótesis que unen piezas de una misma fila. El valor se valida,
// se lee como texto (lo que se congela en el cuerpo) y se compone como
// FIGURAS sobre la página, que también se congelan: la pantalla y el PDF
// dibujan esas figuras, nunca las recomponen.
//
// Tiene que dar EXACTAMENTE lo mismo que el paquete de TypeScript —los
// mismos mensajes, el mismo texto, las mismas coordenadas—: lo verifican los
// fixtures de `pnpm documentos:generar`. Por eso cada cuenta sigue el orden
// de operaciones del contrato y toda iteración sobre claves es ordenada.

// Los colores de las figuras. Los mismos que la pantalla; la tinta es la de
// la lámina.
const (
	HexRojo  = "#d0202e"
	HexAzul  = "#1f4fbf"
	HexTinta = "#16181d"
)

// RecuadroDePieza — dónde está una pieza en el dibujo: su esquina superior
// izquierda y su lado, en puntos del PDF.
type RecuadroDePieza struct {
	Pieza string  `json:"pieza"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Lado  float64 `json:"lado"`
}

// CajaDeExistentes — la caja de "Cantidad de dientes existentes": x, línea
// de base y ancho.
type CajaDeExistentes struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Ancho  float64 `json:"ancho"`
	Tamano float64 `json:"tamano,omitempty"`
}

// OdontogramaDeLamina — el dibujo de un campo odontograma sobre su página.
type OdontogramaDeLamina struct {
	Campo      string            `json:"campo"`
	Pagina     int               `json:"pagina"`
	Piezas     []RecuadroDePieza `json:"piezas"`
	Existentes *CajaDeExistentes `json:"existentes,omitempty"`
}

// Figura — algo ya ubicado sobre la página: un polígono pintado, un
// contorno, una línea, un círculo, un texto o el trazo de un dibujo (una
// línea abierta por sus Puntos, dibujo.go). Mismo JSON que `Figura` de
// odontograma.ts: cada tipo lleva solo sus campos.
type Figura struct {
	Tipo        string       `json:"tipo"`
	Pagina      int          `json:"pagina,omitempty"`
	Puntos      [][2]float64 `json:"puntos,omitempty"`
	Relleno     string       `json:"relleno,omitempty"`
	Desde       *[2]float64  `json:"desde,omitempty"`
	Hasta       *[2]float64  `json:"hasta,omitempty"`
	Centro      *[2]float64  `json:"centro,omitempty"`
	Radio       float64      `json:"radio,omitempty"`
	X           float64      `json:"x,omitempty"`
	Y           float64      `json:"y,omitempty"`
	Tamano      float64      `json:"tamano,omitempty"`
	Texto       string       `json:"texto,omitempty"`
	Color       string       `json:"color,omitempty"`
	Grosor      float64      `json:"grosor,omitempty"`
	Discontinua bool         `json:"discontinua,omitempty"`
}

const (
	formaInesperada  = "El odontograma no tiene la forma esperada."
	colorInvalido    = "Hay un color que no es rojo ni azul."
	maximoDeProtesis = 16

	grosorDeLinea    = 1.4
	grosorDeContorno = 1.1
	tamanoDeLaCaja   = 10.0
)

var (
	clavesDelValor = []string{"existentes", "piezas", "protesis"}
	ordenDeCaras   = []string{"V", "L", "M", "D", "O"}
	// En el texto la ausencia va primero; en el dibujo, la corona va debajo
	// de todo lo demás.
	marcasEnElTexto    = []string{"x", "corona", "sellador", "traumatizado"}
	marcasEnLasFiguras = []string{"corona", "x", "sellador", "traumatizado"}
	marcasPediatricas  = marcasEnElTexto
	marcasGenerales    = []string{"x", "corona"}

	rotulosDeColor = map[string]map[string]string{
		"general":    {"rojo": "Rojo, prestaciones existentes", "azul": "Azul, prestaciones requeridas"},
		"pediatrica": {"rojo": "Rojo, trabajos realizados", "azul": "Azul, trabajos a realizar"},
	}
)

// --- Las piezas -----------------------------------------------------------

// filaDe — la fila del dibujo de una pieza: "sup-perm", "inf-perm",
// "sup-temp" o "inf-temp".
func filaDe(pieza string) string {
	if pieza == "" {
		return ""
	}
	switch pieza[0] {
	case '1', '2':
		return "sup-perm"
	case '3', '4':
		return "inf-perm"
	case '5', '6':
		return "sup-temp"
	case '7', '8':
		return "inf-temp"
	}
	return ""
}

func esSuperior(pieza string) bool { return strings.HasPrefix(filaDe(pieza), "sup") }

// esDeLaDerecha — de la derecha del PACIENTE: en el papel, a la izquierda.
func esDeLaDerecha(pieza string) bool {
	return pieza != "" && strings.ContainsRune("1458", rune(pieza[0]))
}

func esPosterior(pieza string) bool { return len(pieza) == 2 && pieza[1] >= '4' }

func nombreDeCara(pieza, cara string) string {
	switch cara {
	case "V":
		return "vestibular"
	case "L":
		if esSuperior(pieza) {
			return "palatina"
		}
		return "lingual"
	case "M":
		return "mesial"
	case "D":
		return "distal"
	}
	if esPosterior(pieza) {
		return "oclusal"
	}
	return "incisal"
}

func esPediatrico(c *Campo) bool { return c.Leyenda == "pediatrica" }

func leyendaDe(c *Campo) string {
	if esPediatrico(c) {
		return "pediatrica"
	}
	return "general"
}

func nombreDeMarca(c *Campo, marca string) string {
	switch marca {
	case "x":
		if esPediatrico(c) {
			return "a extraer, extraída o ausente"
		}
		return "ausente o a extraer"
	case "traumatizado":
		return "traumatizada"
	}
	return marca
}

func esColorDeOdontograma(v any) bool { return v == "rojo" || v == "azul" }

// --- La lectura del valor --------------------------------------------------

func objetoDe(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

// piezaMarcada — las caras y las marcas de una pieza, con su color.
type piezaMarcada struct {
	caras, marcas map[string]string
}

// colores — las claves pintadas de rojo o de azul; lo demás no se lee ni se
// dibuja.
func colores(v any) map[string]string {
	out := map[string]string{}
	for clave, color := range objetoDe(v) {
		if esColorDeOdontograma(color) {
			out[clave] = color.(string)
		}
	}
	return out
}

func leerPieza(v any) piezaMarcada {
	p := objetoDe(v)
	return piezaMarcada{caras: colores(p["caras"]), marcas: colores(p["marcas"])}
}

// tramoDeProtesis — una prótesis con sus extremos en el orden del
// odontograma: primero el que aparece antes.
type tramoDeProtesis struct {
	tipo, color        string
	primera, segunda   string
	iPrimera, iSegunda int
}

func (a tramoDeProtesis) antesQue(b tramoDeProtesis) bool {
	if a.tipo != b.tipo {
		return a.tipo == "fija"
	}
	if a.color != b.color {
		return a.color == "rojo"
	}
	if a.iPrimera != b.iPrimera {
		return a.iPrimera < b.iPrimera
	}
	return a.iSegunda < b.iSegunda
}

func indicesDe(piezas []string) map[string]int {
	indices := make(map[string]int, len(piezas))
	for i, p := range piezas {
		indices[p] = i
	}
	return indices
}

func leerTramo(v any, indices map[string]int) (tramoDeProtesis, bool) {
	t := objetoDe(v)
	desde, _ := t["desde"].(string)
	hasta, _ := t["hasta"].(string)
	i, okDesde := indices[desde]
	j, okHasta := indices[hasta]
	if !okDesde || !okHasta {
		return tramoDeProtesis{}, false
	}
	if j < i {
		desde, hasta, i, j = hasta, desde, j, i
	}
	tipo, _ := t["tipo"].(string)
	color, _ := t["color"].(string)
	return tramoDeProtesis{tipo: tipo, color: color, primera: desde, segunda: hasta, iPrimera: i, iSegunda: j}, true
}

// tramosOrdenados — las prótesis en el orden del texto y del dibujo: por
// tipo (fija antes), por color (rojo antes) y por sus extremos.
func tramosOrdenados(c *Campo, v map[string]any) []tramoDeProtesis {
	indices := indicesDe(PiezasDe(denticionDe(c)))
	lista, _ := v["protesis"].([]any)
	var tramos []tramoDeProtesis
	for _, crudo := range lista {
		if t, ok := leerTramo(crudo, indices); ok {
			tramos = append(tramos, t)
		}
	}
	sort.SliceStable(tramos, func(i, j int) bool { return tramos[i].antesQue(tramos[j]) })
	return tramos
}

// ausenteOSinClaves — la clave no está, o es un objeto vacío. Que esté con
// null no cuenta como ausente.
func ausenteOSinClaves(m map[string]any, clave string) bool {
	v, esta := m[clave]
	if !esta {
		return true
	}
	o, ok := v.(map[string]any)
	return ok && len(o) == 0
}

func piezaVacia(v any) bool {
	p, ok := v.(map[string]any)
	return ok && soloClaves(p, "caras", "marcas") && ausenteOSinClaves(p, "caras") && ausenteOSinClaves(p, "marcas")
}

// odontogramaVacio — vacío es SOLO un valor bien formado sin nada cargado:
// claves de entre piezas, protesis y existentes; piezas ausente o con
// piezas de la dentición cuyas caras y marcas estén ausentes o sin claves;
// protesis ausente o vacía; existentes ausente. Cualquier otra cosa no está
// vacía y la rechaza la validación: si no, un valor roto se guardaría sin
// validar. Idéntica a `odontogramaVacio` de odontograma.ts.
func odontogramaVacio(c *Campo, valor any) bool {
	v, ok := valor.(map[string]any)
	if !ok || !soloClaves(v, clavesDelValor...) {
		return false
	}
	if _, esta := v["existentes"]; esta {
		return false
	}
	if crudo, esta := v["protesis"]; esta {
		if tramos, ok := crudo.([]any); !ok || len(tramos) > 0 {
			return false
		}
	}
	crudo, esta := v["piezas"]
	if !esta {
		return true
	}
	piezas, ok := crudo.(map[string]any)
	if !ok {
		return false
	}
	for pieza, contenido := range piezas {
		if !EsPiezaValida(pieza, denticionDe(c)) || !piezaVacia(contenido) {
			return false
		}
	}
	return true
}

// --- La validación ----------------------------------------------------------

func soloClaves(m map[string]any, permitidas ...string) bool {
	for clave := range m {
		if !slices.Contains(permitidas, clave) {
			return false
		}
	}
	return true
}

// opcional — el valor de una clave que, si está, tiene que ser de tipo T.
func opcional[T any](m map[string]any, clave string) (T, bool) {
	var cero T
	v, existe := m[clave]
	if !existe {
		return cero, true
	}
	t, ok := v.(T)
	return t, ok
}

// errorDeOdontograma — el primer error del valor, en el orden del
// contrato: la forma, las piezas (cada una, su forma y sus conflictos), las
// prótesis (cada una, la superposición y los pilares) y los dientes
// existentes.
func errorDeOdontograma(c *Campo, valor any) string {
	v, ok := valor.(map[string]any)
	if !ok || !soloClaves(v, clavesDelValor...) {
		return formaInesperada
	}
	piezas, okPiezas := opcional[map[string]any](v, "piezas")
	tramos, okProtesis := opcional[[]any](v, "protesis")
	if !okPiezas || !okProtesis {
		return formaInesperada
	}
	for _, pieza := range slices.Sorted(maps.Keys(piezas)) {
		if msg := errorDePieza(c, pieza, piezas[pieza]); msg != "" {
			return msg
		}
		if msg := conflictoDePieza(pieza, leerPieza(piezas[pieza])); msg != "" {
			return msg
		}
	}
	if msg := errorDeProtesis(c, tramos, piezas); msg != "" {
		return msg
	}
	if n, existe := v["existentes"]; existe {
		return errorDeExistentes(c, n)
	}
	return ""
}

func errorDePieza(c *Campo, pieza string, valor any) string {
	if !EsPiezaValida(pieza, denticionDe(c)) {
		return fmt.Sprintf("%s no es una pieza de este odontograma.", pieza)
	}
	p, ok := valor.(map[string]any)
	if !ok || !soloClaves(p, "caras", "marcas") {
		return formaInesperada
	}
	caras, okCaras := opcional[map[string]any](p, "caras")
	marcas, okMarcas := opcional[map[string]any](p, "marcas")
	if !okCaras || !okMarcas {
		return formaInesperada
	}
	for cara := range caras {
		if !slices.Contains(ordenDeCaras, cara) {
			return "Hay una cara que no existe."
		}
	}
	admitidas := marcasGenerales
	if esPediatrico(c) {
		admitidas = marcasPediatricas
	}
	for _, marca := range slices.Sorted(maps.Keys(marcas)) {
		if !slices.Contains(admitidas, marca) {
			return fmt.Sprintf("La marca %s no va en este odontograma.", marca)
		}
	}
	if !sonColoresDeOdontograma(caras) || !sonColoresDeOdontograma(marcas) {
		return colorInvalido
	}
	return ""
}

func sonColoresDeOdontograma(m map[string]any) bool {
	for _, color := range m {
		if !esColorDeOdontograma(color) {
			return false
		}
	}
	return true
}

// conflictoDePieza — una pieza ausente (X roja) no lleva nada más; una que
// se va a extraer (X azul), nada azul. Igual que `conflictoDePieza` en el
// paquete.
func conflictoDePieza(pieza string, p piezaMarcada) string {
	otras := slices.Collect(maps.Values(p.caras))
	for marca, color := range p.marcas {
		if marca != "x" {
			otras = append(otras, color)
		}
	}
	switch {
	case p.marcas["x"] == "rojo" && len(otras) > 0:
		return fmt.Sprintf("La pieza %s está ausente: no lleva prestaciones.", pieza)
	case p.marcas["x"] == "azul" && slices.Contains(otras, "azul"):
		return fmt.Sprintf("La pieza %s se va a extraer: no lleva prestaciones requeridas.", pieza)
	}
	return ""
}

// conflictoDePilar — una prótesis no se apoya en una pieza ausente, ni una
// por hacer (azul) en una que se va a extraer. Las intermedias sí pueden
// faltar: es lo que la prótesis reemplaza.
func conflictoDePilar(pieza string, p piezaMarcada, color string) string {
	switch {
	case p.marcas["x"] == "rojo":
		return fmt.Sprintf("La pieza %s está ausente: no puede ser pilar.", pieza)
	case p.marcas["x"] == "azul" && color == "azul":
		return fmt.Sprintf("La pieza %s se va a extraer: no puede ser pilar.", pieza)
	}
	return ""
}

func errorDeProtesis(c *Campo, tramos []any, piezas map[string]any) string {
	switch {
	case len(tramos) == 0:
		return ""
	case esPediatrico(c):
		return "Este odontograma no lleva prótesis."
	case len(tramos) > maximoDeProtesis:
		return "Hay demasiadas prótesis."
	}
	for _, t := range tramos {
		if msg := errorDeTramo(c, t); msg != "" {
			return msg
		}
	}
	indices := indicesDe(PiezasDe(denticionDe(c)))
	leidos := make([]tramoDeProtesis, 0, len(tramos))
	for _, crudo := range tramos {
		t, _ := leerTramo(crudo, indices)
		for _, anterior := range leidos {
			if t.seSuperponeCon(anterior) {
				return "Esa prótesis se superpone con otra."
			}
		}
		leidos = append(leidos, t)
	}
	for _, crudo := range tramos {
		t := objetoDe(crudo)
		color, _ := t["color"].(string)
		for _, extremo := range []string{t["desde"].(string), t["hasta"].(string)} {
			if msg := conflictoDePilar(extremo, leerPieza(piezas[extremo]), color); msg != "" {
				return msg
			}
		}
	}
	return ""
}

// seSuperponeCon — si dos prótesis comparten alguna pieza (pilares
// incluidos): en el papel van por el mismo centro de la fila y se
// encimarían. Cada fila es un tramo contiguo del orden de la dentición, así
// que alcanza con que sus rangos se toquen. Igual que `seSuperponen`.
func (a tramoDeProtesis) seSuperponeCon(b tramoDeProtesis) bool {
	return filaDe(a.primera) == filaDe(b.primera) && a.iPrimera <= b.iSegunda && b.iPrimera <= a.iSegunda
}

func errorDeTramo(c *Campo, valor any) string {
	t, ok := valor.(map[string]any)
	if !ok || len(t) != 4 || !soloClaves(t, "tipo", "desde", "hasta", "color") {
		return formaInesperada
	}
	if t["tipo"] != "fija" && t["tipo"] != "removible" {
		return "Hay una prótesis de un tipo que no existe."
	}
	for _, extremo := range []any{t["desde"], t["hasta"]} {
		if p, ok := extremo.(string); !ok || !EsPiezaValida(p, denticionDe(c)) {
			return comoEnJS(extremo) + " no es una pieza de este odontograma."
		}
	}
	desde, hasta := t["desde"].(string), t["hasta"].(string)
	if desde == hasta {
		return "Una prótesis une al menos dos piezas."
	}
	if filaDe(desde) != filaDe(hasta) {
		return "Una prótesis une piezas de la misma arcada."
	}
	if !esColorDeOdontograma(t["color"]) {
		return colorInvalido
	}
	return ""
}

// comoEnJS — `String(v)` de JavaScript, para nombrar en un mensaje un valor
// que no es un texto: el mensaje tiene que ser el mismo que en la pantalla.
func comoEnJS(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case string:
		return x
	case float64:
		return formatoNumeroJS(x)
	case []any:
		partes := make([]string, len(x))
		for i, e := range x {
			if e != nil {
				partes[i] = comoEnJS(e)
			}
		}
		return strings.Join(partes, ",")
	case map[string]any:
		return "[object Object]"
	}
	return fmt.Sprint(v)
}

func errorDeExistentes(c *Campo, valor any) string {
	if !c.Existentes {
		return "Este odontograma no lleva la cantidad de dientes existentes."
	}
	total := len(PiezasDe(denticionDe(c)))
	if n, ok := valor.(float64); !ok || n != math.Trunc(n) || n < 0 || n > float64(total) {
		return fmt.Sprintf("La cantidad de dientes existentes tiene que ser un número entero entre 0 y %d.", total)
	}
	return ""
}

// --- El texto ----------------------------------------------------------------

// enLista — "a", "a y b", "a, b y c".
func enLista(nombres []string) string {
	ultimo := len(nombres) - 1
	if ultimo == 0 {
		return nombres[0]
	}
	return strings.Join(nombres[:ultimo], ", ") + " y " + nombres[ultimo]
}

func partesDePieza(c *Campo, pieza string, p piezaMarcada, color string) []string {
	var caras []string
	for _, cara := range ordenDeCaras {
		if p.caras[cara] == color {
			caras = append(caras, nombreDeCara(pieza, cara))
		}
	}
	var partes []string
	switch len(caras) {
	case 0:
	case 1:
		partes = append(partes, "cara "+caras[0])
	default:
		partes = append(partes, "caras "+enLista(caras))
	}
	for _, marca := range marcasEnElTexto {
		if p.marcas[marca] == color {
			partes = append(partes, nombreDeMarca(c, marca))
		}
	}
	return partes
}

func grupoDeColor(c *Campo, piezas map[string]any, color string) string {
	var descritas []string
	for _, pieza := range PiezasDe(denticionDe(c)) {
		if partes := partesDePieza(c, pieza, leerPieza(piezas[pieza]), color); len(partes) > 0 {
			descritas = append(descritas, pieza+" ("+strings.Join(partes, "; ")+")")
		}
	}
	if len(descritas) == 0 {
		return ""
	}
	return rotulosDeColor[leyendaDe(c)][color] + ": " + strings.Join(descritas, ", ")
}

// odontogramaComoTexto — lo que se congela en el cuerpo: lo rojo, lo azul,
// las prótesis y los dientes existentes.
func odontogramaComoTexto(c *Campo, valor any) string {
	v := objetoDe(valor)
	var grupos []string
	for _, color := range []string{"rojo", "azul"} {
		if g := grupoDeColor(c, objetoDe(v["piezas"]), color); g != "" {
			grupos = append(grupos, g)
		}
	}
	if tramos := tramosOrdenados(c, v); len(tramos) > 0 {
		descritos := make([]string, len(tramos))
		for i, t := range tramos {
			descritos[i] = fmt.Sprintf("%s en %s, de %s a %s", t.tipo, t.color, t.primera, t.segunda)
		}
		grupos = append(grupos, "Prótesis: "+strings.Join(descritos, "; "))
	}
	if n, ok := v["existentes"].(float64); ok {
		grupos = append(grupos, "Dientes existentes: "+formatoNumeroJS(n))
	}
	if len(grupos) == 0 {
		return ""
	}
	return strings.Join(grupos, ". ") + "."
}

// --- Las figuras ---------------------------------------------------------------

func punto(x, y float64) [2]float64 { return [2]float64{redondear2(x), redondear2(y)} }

func linea(pagina int, x1, y1, x2, y2 float64, color string, discontinua bool) Figura {
	desde, hasta := punto(x1, y1), punto(x2, y2)
	return Figura{Tipo: "linea", Pagina: pagina, Desde: &desde, Hasta: &hasta, Color: color, Grosor: grosorDeLinea, Discontinua: discontinua}
}

// textoCentrado — un texto centrado en un ancho, con su línea de base en y.
func textoCentrado(pagina int, texto string, tamano, x, ancho, y float64, color string) Figura {
	medida := float64(AnchoEnUnidades(texto)) * tamano / 1000
	return Figura{Tipo: "texto", Pagina: pagina, X: redondear2(x + (ancho-medida)/2), Y: redondear2(y), Tamano: tamano, Texto: texto, Color: color}
}

// caraEnElDibujo — qué parte del recuadro es cada cara: O el centro, V
// hacia afuera de la boca (arriba en la fila superior) y M hacia la línea
// media (a la derecha en las piezas de la derecha del paciente).
func caraEnElDibujo(pieza, cara string) string {
	switch cara {
	case "V", "L":
		if esSuperior(pieza) == (cara == "V") {
			return "arriba"
		}
		return "abajo"
	case "M", "D":
		if esDeLaDerecha(pieza) == (cara == "M") {
			return "derecha"
		}
		return "izquierda"
	}
	return "centro"
}

// poligonoDe — una de las cinco partes del recuadro: los cuatro trapecios
// del borde y el cuadrado del centro.
func poligonoDe(r RecuadroDePieza, parte string) [][2]float64 {
	x, y, l := r.X, r.Y, r.Lado
	li := 0.42 * l
	xi := x + (l-li)/2
	yi := y + (l-li)/2
	switch parte {
	case "arriba":
		return [][2]float64{{x, y}, {x + l, y}, {xi + li, yi}, {xi, yi}}
	case "abajo":
		return [][2]float64{{x, y + l}, {xi, yi + li}, {xi + li, yi + li}, {x + l, y + l}}
	case "izquierda":
		return [][2]float64{{x, y}, {xi, yi}, {xi, yi + li}, {x, y + l}}
	case "derecha":
		return [][2]float64{{x + l, y}, {x + l, y + l}, {xi + li, yi + li}, {xi + li, yi}}
	}
	return [][2]float64{{xi, yi}, {xi + li, yi}, {xi + li, yi + li}, {xi, yi + li}}
}

// achicado — el polígono achicado hacia su centroide, para que las líneas
// impresas del modelo sigan a la vista entre una cara y otra.
func achicado(puntos [][2]float64) [][2]float64 {
	var cx, cy float64
	for _, p := range puntos {
		cx += p[0]
		cy += p[1]
	}
	cx /= float64(len(puntos))
	cy /= float64(len(puntos))
	out := make([][2]float64, len(puntos))
	for i, p := range puntos {
		out[i] = punto(cx+0.82*(p[0]-cx), cy+0.82*(p[1]-cy))
	}
	return out
}

func figurasDeMarca(pagina int, r RecuadroDePieza, marca, color string) []Figura {
	x, y, l := r.X, r.Y, r.Lado
	switch marca {
	case "corona":
		centro := punto(x+l/2, y+l/2)
		return []Figura{{Tipo: "circulo", Pagina: pagina, Centro: &centro, Radio: redondear2(0.62 * l), Color: color, Grosor: grosorDeContorno}}
	case "x":
		m := 0.08 * l
		return []Figura{
			linea(pagina, x+m, y+m, x+l-m, y+l-m, color, false),
			linea(pagina, x+l-m, y+m, x+m, y+l-m, color, false),
		}
	case "sellador":
		triangulo := [][2]float64{punto(x+l/2, y+0.15*l), punto(x+0.85*l, y+0.82*l), punto(x+0.15*l, y+0.82*l)}
		return []Figura{{Tipo: "contorno", Pagina: pagina, Puntos: triangulo, Color: color, Grosor: grosorDeContorno}}
	case "traumatizado":
		return []Figura{textoCentrado(pagina, "T", redondear2(0.8*l), x, l, y+0.78*l, color)}
	}
	return nil
}

func figurasDePieza(pagina int, r RecuadroDePieza, p piezaMarcada) []Figura {
	var figuras []Figura
	for _, cara := range ordenDeCaras {
		if color := p.caras[cara]; color != "" {
			poligono := achicado(poligonoDe(r, caraEnElDibujo(r.Pieza, cara)))
			figuras = append(figuras, Figura{Tipo: "poligono", Pagina: pagina, Puntos: poligono, Relleno: color})
		}
	}
	for _, marca := range marcasEnLasFiguras {
		if color := p.marcas[marca]; color != "" {
			figuras = append(figuras, figurasDeMarca(pagina, r, marca, color)...)
		}
	}
	return figuras
}

// figurasDeTramo — una línea por el centro de la fila, de pilar a pilar (la
// removible, discontinua), como en el papel. Dos prótesis no comparten
// piezas (lo rechaza la validación), así que no se enciman.
func figurasDeTramo(pagina int, a, b RecuadroDePieza, t tramoDeProtesis) []Figura {
	if b.X < a.X {
		a, b = b, a
	}
	yc := redondear2((a.Y + a.Lado/2 + (b.Y + b.Lado/2)) / 2)
	return []Figura{linea(pagina, a.X+a.Lado/2, yc, b.X+b.Lado/2, yc, t.color, t.tipo == "removible")}
}

func figuraDeExistentes(od OdontogramaDeLamina, v map[string]any, modo ModoTexto) (Figura, bool) {
	caja := od.Existentes
	if caja == nil {
		return Figura{}, false
	}
	texto := SinDato
	if n, ok := v["existentes"].(float64); ok {
		texto = formatoNumeroJS(n)
	} else if modo != TextoSellado {
		return Figura{}, false
	}
	tamano := caja.Tamano
	if tamano == 0 {
		tamano = tamanoDeLaCaja
	}
	return textoCentrado(od.Pagina, texto, tamano, caja.X, caja.Ancho, caja.Y, "tinta"), true
}

// noConsignaEn — "No consigna" en el medio del dibujo: terminado, un
// odontograma vacío no queda en blanco (Decreto 1089/2012, art. 15).
func noConsignaEn(od OdontogramaDeLamina) Figura {
	minX, minY := math.Inf(1), math.Inf(1)
	maxX, maxY := math.Inf(-1), math.Inf(-1)
	for _, r := range od.Piezas {
		minX, minY = math.Min(minX, r.X), math.Min(minY, r.Y)
		maxX, maxY = math.Max(maxX, r.X+r.Lado), math.Max(maxY, r.Y+r.Lado)
	}
	return textoCentrado(od.Pagina, NoConsigna, tamanoDeLaCaja, minX, maxX-minX, minY+(maxY-minY)/2+3.5, "tinta")
}

func figurasDeOdontograma(c *Campo, od OdontogramaDeLamina, valor any, modo ModoTexto) []Figura {
	recuadros := make(map[string]RecuadroDePieza, len(od.Piezas))
	for _, r := range od.Piezas {
		recuadros[r.Pieza] = r
	}
	v := objetoDe(valor)
	piezas := objetoDe(v["piezas"])
	var figuras []Figura
	for _, pieza := range PiezasDe(denticionDe(c)) {
		if r, ok := recuadros[pieza]; ok {
			figuras = append(figuras, figurasDePieza(od.Pagina, r, leerPieza(piezas[pieza]))...)
		}
	}
	for _, t := range tramosOrdenados(c, v) {
		a, okA := recuadros[t.primera]
		b, okB := recuadros[t.segunda]
		if okA && okB {
			figuras = append(figuras, figurasDeTramo(od.Pagina, a, b, t)...)
		}
	}
	if f, ok := figuraDeExistentes(od, v, modo); ok {
		figuras = append(figuras, f)
	}
	if modo == TextoSellado && len(od.Piezas) > 0 && EstaVacio(c, valor) {
		figuras = append(figuras, noConsignaEn(od))
	}
	return figuras
}

// ArmarFiguras — los odontogramas de la lámina y después sus dibujos (Fase
// 5.6b), compuestos como figuras. Al terminar se congelan junto con la
// lámina; nunca nil, para que una lista sin figuras salga como [] igual que
// en el paquete de TypeScript.
func ArmarFiguras(p *Plantilla, valores map[string]any, modo ModoTexto) []Figura {
	figuras := []Figura{}
	if p.Lamina == nil {
		return figuras
	}
	for _, od := range p.Lamina.Odontogramas {
		if c := p.Campo(od.Campo); c != nil && c.Tipo == "odontograma" {
			figuras = append(figuras, figurasDeOdontograma(c, od, valores[od.Campo], modo)...)
		}
	}
	for _, d := range p.Lamina.Dibujos {
		if c := p.Campo(d.Campo); c != nil && c.Tipo == "dibujo" {
			figuras = append(figuras, figurasDeDibujo(c, d, valores[d.Campo], modo)...)
		}
	}
	return figuras
}
