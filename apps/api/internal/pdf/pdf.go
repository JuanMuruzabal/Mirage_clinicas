// Package pdf — un escritor de PDF chico y DETERMINISTA, para el PDF de un
// documento clínico sellado (Fase 5.3, TR-185).
//
// Por qué uno propio y no una librería: lo que hace falta es un subconjunto
// muy chico del formato —páginas de tamaño propio, texto en las fuentes
// base del PDF (Helvetica y Courier, que no se embeben), imágenes JPEG
// pasadas tal cual y trazos—, y lo que sí hace falta sin discusión es que
// los bytes dependan SOLO de lo que se le pasa: generar dos veces el mismo
// documento tiene que dar el mismo archivo, con la misma huella. Una
// librería general suele meter la hora actual, un id aleatorio o un orden
// de mapa en algún rincón, y auditar eso cuesta más que escribir esto.
//
// Lo que este paquete garantiza:
//
//   - Objetos numerados en un orden fijo (catálogo, árbol de páginas, info,
//     fuentes, imágenes, y cada página con su contenido), `xref` con los
//     offsets reales, y un trailer con `/Info` y `/ID` que salen de lo que
//     pasa quien llama (`Info.Creado`, `Info.Semilla`): nunca del reloj.
//   - Los streams de contenido van comprimidos con FlateDecode
//     (compress/zlib), que con la misma entrada y la misma versión de Go
//     da los mismos bytes.
//   - Los números se escriben con a lo sumo tres decimales y sin ceros de
//     más, así que un 0.1 + 0.2 no deja un 0.30000000000000004 distinto
//     según el orden de las cuentas.
//
// Las coordenadas de la API son las de la lámina (internal/documentos): en
// puntos, con el origen ARRIBA a la izquierda y la y creciendo hacia
// abajo. La conversión al sistema del PDF (origen abajo) vive acá adentro y
// en ningún otro lado.
package pdf

import (
	"bytes"
	"compress/zlib"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"golang.org/x/text/encoding/charmap"
)

// Fuente — una de las fuentes base del PDF. No se embeben: todo lector de
// PDF las trae (o una equivalente con las mismas métricas).
type Fuente int

const (
	Helvetica Fuente = iota
	HelveticaNegrita
	Courier
)

// fuentes — en el orden en que se escriben como objetos. El orden es parte
// del formato del archivo: no lo cambies sin pensar que cambia los bytes de
// todo PDF nuevo (los ya generados conservan los suyos).
var fuentes = []struct {
	recurso string
	base    string
}{
	Helvetica:        {"F1", "Helvetica"},
	HelveticaNegrita: {"F2", "Helvetica-Bold"},
	Courier:          {"F3", "Courier"},
}

// Color — un color RGB, cada canal de 0 a 255.
type Color struct{ R, G, B uint8 }

// ColorHex — "#16181d" → Color. Un texto que no es un color da negro.
func ColorHex(s string) Color {
	s = strings.TrimPrefix(s, "#")
	if len(s) != 6 {
		return Color{}
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		return Color{}
	}
	return Color{b[0], b[1], b[2]}
}

// Info — los metadatos del documento. Creado y Semilla los decide quien
// llama: son lo que hace que el archivo sea el mismo cada vez.
type Info struct {
	Titulo string
	// Creado — el instante que va en /CreationDate, con su huso horario.
	Creado time.Time
	// Semilla — de acá sale el /ID del trailer (los primeros 16 bytes; si
	// tiene menos, se completa con ceros).
	Semilla []byte
}

// Documento — un PDF en construcción.
type Documento struct {
	info     Info
	paginas  []*Pagina
	imagenes []imagen
}

type imagen struct {
	datos       []byte
	ancho, alto int
	espacio     string
}

// Nuevo — un documento vacío.
func Nuevo(info Info) *Documento {
	return &Documento{info: info}
}

// Pagina — una página, con su tamaño en puntos.
type Pagina struct {
	doc         *Documento
	ancho, alto float64
	contenido   bytes.Buffer
	// imagenes — los índices (en doc.imagenes) que usa esta página, en el
	// orden en que se dibujaron, sin repetir.
	imagenes []int
	err      error
}

// Pagina — agrega una página de ese tamaño, en puntos.
func (d *Documento) Pagina(ancho, alto float64) *Pagina {
	p := &Pagina{doc: d, ancho: ancho, alto: alto}
	d.paginas = append(d.paginas, p)
	return p
}

// Ancho y Alto — el tamaño de la página, en puntos.
func (p *Pagina) Ancho() float64 { return p.ancho }
func (p *Pagina) Alto() float64  { return p.alto }

// num — un número para el stream: a lo sumo tres decimales, sin ceros de
// más ni "-0".
func num(v float64) string {
	v = math.Round(v*1000) / 1000
	if v == 0 {
		return "0"
	}
	s := strconv.FormatFloat(v, 'f', 3, 64)
	s = strings.TrimRight(s, "0")
	return strings.TrimSuffix(s, ".")
}

func canal(c uint8) string { return num(float64(c) / 255) }

func (c Color) relleno() string { return canal(c.R) + " " + canal(c.G) + " " + canal(c.B) + " rg" }
func (c Color) trazo() string   { return canal(c.R) + " " + canal(c.G) + " " + canal(c.B) + " RG" }

// yPDF — de la y de la lámina (desde arriba) a la del PDF (desde abajo).
func (p *Pagina) yPDF(y float64) float64 { return p.alto - y }

func (p *Pagina) escribir(partes ...string) {
	p.contenido.WriteString(strings.Join(partes, " "))
	p.contenido.WriteByte('\n')
}

// Texto — un renglón con su línea de base empezando en (x, y). Va en
// WinAnsiEncoding: lo que no tenga lugar en Windows-1252 sale como "?".
func (p *Pagina) Texto(f Fuente, tamano, x, y float64, texto string, color Color) {
	if int(f) < 0 || int(f) >= len(fuentes) {
		p.fallar(fmt.Errorf("pdf: fuente %d desconocida", f))
		return
	}
	p.escribir("BT", "/"+fuentes[f].recurso, num(tamano), "Tf", color.relleno(),
		"1 0 0 1", num(x), num(p.yPDF(y)), "Tm", cadena(texto), "Tj", "ET")
}

// Linea — un segmento recto, de extremos redondos.
func (p *Pagina) Linea(x1, y1, x2, y2, grosor float64, color Color) {
	c := &Camino{}
	c.MoverA(x1, y1)
	c.LineaA(x2, y2)
	p.Camino(c, Estilo{Grosor: grosor, Trazo: &color, Redondo: true})
}

// Imagen — un JPEG, pasado tal cual (DCTDecode, sin decodificar), en el
// rectángulo de esquina superior izquierda (x, y) y ese ancho y alto.
func (p *Pagina) Imagen(jpeg []byte, x, y, ancho, alto float64) {
	w, h, espacio, err := medidasDelJPEG(jpeg)
	if err != nil {
		p.fallar(err)
		return
	}
	indice := -1
	for i, im := range p.doc.imagenes {
		if bytes.Equal(im.datos, jpeg) {
			indice = i
			break
		}
	}
	if indice < 0 {
		p.doc.imagenes = append(p.doc.imagenes, imagen{datos: jpeg, ancho: w, alto: h, espacio: espacio})
		indice = len(p.doc.imagenes) - 1
	}
	usada := false
	for _, i := range p.imagenes {
		if i == indice {
			usada = true
		}
	}
	if !usada {
		p.imagenes = append(p.imagenes, indice)
	}
	p.escribir("q", num(ancho), "0 0", num(alto), num(x), num(p.yPDF(y+alto)), "cm",
		"/Im"+strconv.Itoa(indice+1), "Do", "Q")
}

// Camino — una figura hecha de segmentos y curvas de Bézier cúbicas, en
// coordenadas de la lámina.
type Camino struct {
	ops []func(p *Pagina) string
}

func (c *Camino) MoverA(x, y float64) {
	c.ops = append(c.ops, func(p *Pagina) string { return num(x) + " " + num(p.yPDF(y)) + " m" })
}

func (c *Camino) LineaA(x, y float64) {
	c.ops = append(c.ops, func(p *Pagina) string { return num(x) + " " + num(p.yPDF(y)) + " l" })
}

// CurvaA — una Bézier cúbica con puntos de control (x1, y1) y (x2, y2).
func (c *Camino) CurvaA(x1, y1, x2, y2, x, y float64) {
	c.ops = append(c.ops, func(p *Pagina) string {
		return num(x1) + " " + num(p.yPDF(y1)) + " " + num(x2) + " " + num(p.yPDF(y2)) + " " +
			num(x) + " " + num(p.yPDF(y)) + " c"
	})
}

func (c *Camino) Cerrar() {
	c.ops = append(c.ops, func(*Pagina) string { return "h" })
}

// kappa — la distancia a los puntos de control de un cuarto de círculo
// hecho con una Bézier cúbica, en radios: 4/3·(√2 − 1).
const kappa = 0.5522847498307936

// Circulo — un círculo de centro (cx, cy), hecho con cuatro Bézier
// cúbicas: la aproximación de siempre, con un error menor al 0,03 % del
// radio.
func Circulo(cx, cy, radio float64) *Camino {
	k := kappa * radio
	c := &Camino{}
	c.MoverA(cx+radio, cy)
	c.CurvaA(cx+radio, cy+k, cx+k, cy+radio, cx, cy+radio)
	c.CurvaA(cx-k, cy+radio, cx-radio, cy+k, cx-radio, cy)
	c.CurvaA(cx-radio, cy-k, cx-k, cy-radio, cx, cy-radio)
	c.CurvaA(cx+k, cy-radio, cx+radio, cy-k, cx+radio, cy)
	c.Cerrar()
	return c
}

// Estilo — cómo se pinta un camino. Sin Trazo ni Relleno, no se ve.
type Estilo struct {
	Grosor  float64
	Trazo   *Color
	Relleno *Color
	// Redondo — extremos y uniones redondas (los de una birome).
	Redondo bool
	// Discontinua — el trazo en guiones: largo del guion, del hueco, y así
	// (en puntos). Vacío, el trazo es continuo.
	Discontinua []float64
}

// Camino — pinta un camino.
func (p *Pagina) Camino(c *Camino, e Estilo) {
	if c == nil || len(c.ops) == 0 || (e.Trazo == nil && e.Relleno == nil) {
		return
	}
	p.escribir("q")
	if e.Trazo != nil {
		p.escribir(num(e.Grosor), "w", e.Trazo.trazo())
		if len(e.Discontinua) > 0 {
			p.escribir(patronDeGuiones(e.Discontinua), "0 d")
		}
	}
	if e.Relleno != nil {
		p.escribir(e.Relleno.relleno())
	}
	if e.Redondo {
		p.escribir("1 J 1 j")
	}
	for _, op := range c.ops {
		p.escribir(op(p))
	}
	switch {
	case e.Trazo != nil && e.Relleno != nil:
		p.escribir("B")
	case e.Trazo != nil:
		p.escribir("S")
	default:
		p.escribir("f")
	}
	p.escribir("Q")
}

// Recortado — dibuja lo de `dibujar` recortado al rectángulo de esquina
// superior izquierda (x, y): lo mismo que hace un <svg> anidado, que no deja
// ver nada fuera de su caja.
func (p *Pagina) Recortado(x, y, ancho, alto float64, dibujar func()) {
	p.escribir("q", num(x), num(p.yPDF(y+alto)), num(ancho), num(alto), "re W n")
	dibujar()
	p.escribir("Q")
}

// patronDeGuiones — "[3 2]": el arreglo del operador d de PDF.
func patronDeGuiones(largos []float64) string {
	partes := make([]string, len(largos))
	for i, l := range largos {
		partes[i] = num(l)
	}
	return "[" + strings.Join(partes, " ") + "]"
}

func (p *Pagina) fallar(err error) {
	if p.err == nil {
		p.err = err
	}
}

// cadena — un texto como string literal de PDF, en Windows-1252, con `\`,
// `(` y `)` escapados y los caracteres de control en octal.
func cadena(texto string) string {
	var b strings.Builder
	b.WriteByte('(')
	for _, r := range texto {
		c, ok := charmap.Windows1252.EncodeRune(r)
		if !ok {
			c = '?'
		}
		switch {
		case c == '\\' || c == '(' || c == ')':
			b.WriteByte('\\')
			b.WriteByte(c)
		case c < 0x20 || c == 0x7f:
			fmt.Fprintf(&b, "\\%03o", c)
		default:
			b.WriteByte(c)
		}
	}
	b.WriteByte(')')
	return b.String()
}

// textoDeInfo — un texto del diccionario /Info: en UTF-16BE con su marca
// de orden, la forma que acepta cualquier carácter.
func textoDeInfo(texto string) string {
	unidades := utf16.Encode([]rune(texto))
	var b strings.Builder
	b.WriteString("<FEFF")
	for _, u := range unidades {
		fmt.Fprintf(&b, "%04X", u)
	}
	b.WriteByte('>')
	return b.String()
}

// fechaPDF — "D:20261001140500-03'00'".
func fechaPDF(t time.Time) string {
	s := "D:" + t.Format("20060102150405")
	_, offset := t.Zone()
	if offset == 0 {
		return s + "Z"
	}
	signo := "+"
	if offset < 0 {
		signo = "-"
		offset = -offset
	}
	return fmt.Sprintf("%s%s%02d'%02d'", s, signo, offset/3600, (offset%3600)/60)
}

// ErrSinPaginas — un PDF necesita al menos una página.
var ErrSinPaginas = errors.New("pdf: el documento no tiene páginas")

// Bytes — el archivo terminado.
func (d *Documento) Bytes() ([]byte, error) {
	if len(d.paginas) == 0 {
		return nil, ErrSinPaginas
	}
	for _, p := range d.paginas {
		if p.err != nil {
			return nil, p.err
		}
	}

	// La numeración, fija: 1 catálogo, 2 páginas, 3 info, después las
	// fuentes, las imágenes y cada página seguida de su contenido.
	const (
		objCatalogo = 1
		objPaginas  = 2
		objInfo     = 3
	)
	primeraFuente := 4
	primeraImagen := primeraFuente + len(fuentes)
	primeraPagina := primeraImagen + len(d.imagenes)
	total := primeraPagina + 2*len(d.paginas) // objetos 1..total-1

	var out bytes.Buffer
	offsets := make([]int, total)
	out.WriteString("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")

	objeto := func(n int, cuerpo string) {
		offsets[n] = out.Len()
		fmt.Fprintf(&out, "%d 0 obj\n%s\nendobj\n", n, cuerpo)
	}
	stream := func(n int, diccionario string, datos []byte) {
		offsets[n] = out.Len()
		fmt.Fprintf(&out, "%d 0 obj\n<< %s /Length %d >>\nstream\n", n, diccionario, len(datos))
		out.Write(datos)
		out.WriteString("\nendstream\nendobj\n")
	}

	objeto(objCatalogo, fmt.Sprintf("<< /Type /Catalog /Pages %d 0 R >>", objPaginas))

	kids := make([]string, len(d.paginas))
	for i := range d.paginas {
		kids[i] = fmt.Sprintf("%d 0 R", primeraPagina+2*i)
	}
	objeto(objPaginas, fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), len(d.paginas)))

	objeto(objInfo, fmt.Sprintf("<< /Title %s /Producer %s /CreationDate %s >>",
		textoDeInfo(d.info.Titulo), textoDeInfo("PRISMA"), cadena(fechaPDF(d.info.Creado))))

	recursosDeFuentes := make([]string, len(fuentes))
	for i, f := range fuentes {
		objeto(primeraFuente+i, fmt.Sprintf("<< /Type /Font /Subtype /Type1 /BaseFont /%s /Encoding /WinAnsiEncoding >>", f.base))
		recursosDeFuentes[i] = fmt.Sprintf("/%s %d 0 R", f.recurso, primeraFuente+i)
	}

	for i, im := range d.imagenes {
		stream(primeraImagen+i, fmt.Sprintf("/Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /%s /BitsPerComponent 8 /Filter /DCTDecode",
			im.ancho, im.alto, im.espacio), im.datos)
	}

	for i, p := range d.paginas {
		n := primeraPagina + 2*i
		xobjects := ""
		if len(p.imagenes) > 0 {
			refs := make([]string, len(p.imagenes))
			for j, indice := range p.imagenes {
				refs[j] = fmt.Sprintf("/Im%d %d 0 R", indice+1, primeraImagen+indice)
			}
			xobjects = " /XObject << " + strings.Join(refs, " ") + " >>"
		}
		objeto(n, fmt.Sprintf("<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %s %s] /Resources << /Font << %s >>%s >> /Contents %d 0 R >>",
			objPaginas, num(p.ancho), num(p.alto), strings.Join(recursosDeFuentes, " "), xobjects, n+1))

		var comprimido bytes.Buffer
		z, err := zlib.NewWriterLevel(&comprimido, zlib.BestCompression)
		if err != nil {
			return nil, err
		}
		if _, err := z.Write(p.contenido.Bytes()); err != nil {
			return nil, err
		}
		if err := z.Close(); err != nil {
			return nil, err
		}
		stream(n+1, "/Filter /FlateDecode", comprimido.Bytes())
	}

	inicioXref := out.Len()
	fmt.Fprintf(&out, "xref\n0 %d\n0000000000 65535 f \n", total)
	for n := 1; n < total; n++ {
		fmt.Fprintf(&out, "%010d 00000 n \n", offsets[n])
	}
	semilla := make([]byte, 16)
	copy(semilla, d.info.Semilla)
	id := strings.ToUpper(hex.EncodeToString(semilla))
	fmt.Fprintf(&out, "trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R /ID [<%s> <%s>] >>\nstartxref\n%d\n%%%%EOF\n",
		total, objCatalogo, objInfo, id, id, inicioXref)
	return out.Bytes(), nil
}
