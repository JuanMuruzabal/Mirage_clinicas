package pdf

import (
	"bytes"
	"compress/zlib"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"
)

// --- Ayudas para leer lo que se escribió ---------------------------------

// jpegDePrueba — un JPEG real de ancho × alto, RGB.
func jpegDePrueba(t *testing.T, ancho, alto int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, ancho, alto))
	for x := 0; x < ancho; x++ {
		for y := 0; y < alto; y++ {
			img.Set(x, y, color.RGBA{uint8(x), uint8(y), 120, 255})
		}
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, &jpeg.Options{Quality: 80}); err != nil {
		t.Fatalf("jpeg: %v", err)
	}
	return b.Bytes()
}

func jpegGrisDePrueba(t *testing.T, ancho, alto int) []byte {
	t.Helper()
	img := image.NewGray(image.Rect(0, 0, ancho, alto))
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, nil); err != nil {
		t.Fatalf("jpeg: %v", err)
	}
	return b.Bytes()
}

func infoDePrueba() Info {
	return Info{
		Titulo:  "Historia clínica · folio 7",
		Creado:  time.Date(2026, 10, 1, 14, 5, 7, 0, time.FixedZone("ART", -3*3600)),
		Semilla: []byte{0xde, 0xad, 0xbe, 0xef, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14},
	}
}

func generar(t *testing.T, armar func(d *Documento)) []byte {
	t.Helper()
	d := Nuevo(infoDePrueba())
	armar(d)
	out, err := d.Bytes()
	if err != nil {
		t.Fatalf("Bytes: %v", err)
	}
	return out
}

// verificarEstructura — %PDF-, cada offset del xref apunta a "N 0 obj",
// startxref apunta a "xref" y el archivo termina en %%EOF. Devuelve la
// cantidad de objetos que declara el xref.
func verificarEstructura(t *testing.T, datos []byte) int {
	t.Helper()
	if !bytes.HasPrefix(datos, []byte("%PDF-")) {
		t.Fatalf("no empieza con %%PDF-: %q", datos[:10])
	}
	if !bytes.HasSuffix(datos, []byte("%%EOF\n")) {
		t.Fatalf("no termina en %%%%EOF: %q", datos[len(datos)-20:])
	}
	m := regexp.MustCompile(`startxref\n(\d+)\n%%EOF\n$`).FindSubmatch(datos)
	if m == nil {
		t.Fatalf("sin startxref al final")
	}
	inicio, _ := strconv.Atoi(string(m[1]))
	if !bytes.HasPrefix(datos[inicio:], []byte("xref\n")) {
		t.Fatalf("startxref %d no apunta a la tabla xref: %q", inicio, datos[inicio:inicio+10])
	}
	cab := regexp.MustCompile(`^xref\n0 (\d+)\n`).FindSubmatch(datos[inicio:])
	if cab == nil {
		t.Fatalf("cabecera de xref mal formada")
	}
	total, _ := strconv.Atoi(string(cab[1]))
	entradas := datos[inicio+len(cab[0]):]
	for n := 0; n < total; n++ {
		linea := string(entradas[n*20 : (n+1)*20])
		if len(linea) != 20 || !strings.HasSuffix(linea, " \n") {
			t.Fatalf("entrada %d del xref no mide 20 bytes: %q", n, linea)
		}
		if n == 0 {
			if linea != "0000000000 65535 f \n" {
				t.Fatalf("entrada 0 = %q", linea)
			}
			continue
		}
		offset, err := strconv.Atoi(linea[:10])
		if err != nil {
			t.Fatalf("offset %d: %v", n, err)
		}
		esperado := strconv.Itoa(n) + " 0 obj\n"
		if !bytes.HasPrefix(datos[offset:], []byte(esperado)) {
			t.Fatalf("el offset del objeto %d (%d) no apunta a %q sino a %q", n, offset, esperado, datos[offset:offset+12])
		}
	}
	if !bytes.Contains(datos, []byte("/Size "+strconv.Itoa(total)+" ")) {
		t.Fatalf("el trailer no declara /Size %d", total)
	}
	return total
}

// contenidos — los streams FlateDecode, descomprimidos, en orden.
func contenidos(t *testing.T, datos []byte) [][]byte {
	t.Helper()
	re := regexp.MustCompile(`<< /Filter /FlateDecode /Length (\d+) >>\nstream\n`)
	var out [][]byte
	for _, idx := range re.FindAllSubmatchIndex(datos, -1) {
		largo, _ := strconv.Atoi(string(datos[idx[2]:idx[3]]))
		z, err := zlib.NewReader(bytes.NewReader(datos[idx[1] : idx[1]+largo]))
		if err != nil {
			t.Fatalf("zlib: %v", err)
		}
		plano, err := io.ReadAll(z)
		if err != nil {
			t.Fatalf("zlib: %v", err)
		}
		out = append(out, plano)
	}
	return out
}

// --- Estructura ----------------------------------------------------------

func TestBytes_EsUnPDFValidoConLasPaginasPedidas(t *testing.T) {
	for _, n := range []int{1, 2, 5} {
		datos := generar(t, func(d *Documento) {
			for i := 0; i < n; i++ {
				p := d.Pagina(595.28, 841.89)
				p.Texto(Helvetica, 10, 50, 50, "Hoja "+strconv.Itoa(i+1), Color{})
			}
		})
		total := verificarEstructura(t, datos)
		// 3 fijos + 3 fuentes + 2 por página + la entrada 0.
		if want := 1 + 3 + 3 + 2*n; total != want {
			t.Errorf("%d páginas: xref con %d entradas, esperaba %d", n, total, want)
		}
		if got := bytes.Count(datos, []byte("/Type /Page /Parent")); got != n {
			t.Errorf("%d páginas: hay %d objetos de página", n, got)
		}
		if !bytes.Contains(datos, []byte("/Count "+strconv.Itoa(n)+" >>")) {
			t.Errorf("%d páginas: el árbol no dice /Count %d", n, n)
		}
		if got := len(contenidos(t, datos)); got != n {
			t.Errorf("%d páginas: %d streams de contenido", n, got)
		}
	}
}

func TestBytes_SinPaginasEsUnError(t *testing.T) {
	if _, err := Nuevo(infoDePrueba()).Bytes(); err != ErrSinPaginas {
		t.Fatalf("err = %v, esperaba ErrSinPaginas", err)
	}
}

func TestBytes_MedidasDeLaPaginaYMetadatos(t *testing.T) {
	datos := generar(t, func(d *Documento) { d.Pagina(612, 935.5) })
	verificarEstructura(t, datos)
	if !bytes.Contains(datos, []byte("/MediaBox [0 0 612 935.5]")) {
		t.Errorf("MediaBox no es el pedido")
	}
	if !bytes.Contains(datos, []byte("/CreationDate (D:20261001140507-03'00')")) {
		t.Errorf("CreationDate no sale de Info.Creado con su huso")
	}
	if !bytes.Contains(datos, []byte("/ID [<DEADBEEF0102030405060708090A0B0C> <DEADBEEF0102030405060708090A0B0C>]")) {
		t.Errorf("el /ID no sale de los primeros 16 bytes de la semilla")
	}
	if !bytes.Contains(datos, []byte("/BaseFont /Helvetica /Encoding /WinAnsiEncoding")) {
		t.Errorf("Helvetica no va en WinAnsiEncoding")
	}
	// El título en UTF-16BE con BOM: "Hi" → FEFF 0048 0069.
	if textoDeInfo("Hí") != "<FEFF004800ED>" {
		t.Errorf("textoDeInfo = %s", textoDeInfo("Hí"))
	}
}

func TestBytes_SemillaCortaSeCompletaConCeros(t *testing.T) {
	d := Nuevo(Info{Creado: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC), Semilla: []byte{0xab}})
	d.Pagina(100, 100)
	datos, err := d.Bytes()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(datos, []byte("/ID [<AB000000000000000000000000000000>")) {
		t.Errorf("semilla corta mal completada")
	}
	if !bytes.Contains(datos, []byte("(D:20260102030405Z)")) {
		t.Errorf("una fecha UTC tiene que terminar en Z")
	}
}

func TestBytes_EsDeterminista(t *testing.T) {
	img := jpegDePrueba(t, 16, 8)
	armar := func(d *Documento) {
		p := d.Pagina(595.28, 841.89)
		p.Imagen(img, 0, 0, 595.28, 841.89)
		p.Texto(Helvetica, 9.5, 56.1, 70.3333, "Paciente: Ñandú Pérez", ColorHex("#16181d"))
		p.Linea(10, 10, 100.123456, 10, 0.5, ColorHex("#c9c2b3"))
		c := &Camino{}
		c.MoverA(1, 1)
		c.CurvaA(2, 2, 3, 3, 4, 4)
		c.Cerrar()
		tinta := Color{1, 2, 3}
		p.Camino(c, Estilo{Grosor: 0.9, Trazo: &tinta, Relleno: &tinta, Redondo: true})
		q := d.Pagina(595.28, 841.89)
		q.Texto(Courier, 8, 56, 56, "a3f1c0de", Color{})
	}
	a := generar(t, armar)
	b := generar(t, armar)
	if !bytes.Equal(a, b) {
		t.Fatalf("dos generaciones del mismo documento dieron bytes distintos")
	}
	verificarEstructura(t, a)
}

// --- Texto ---------------------------------------------------------------

func TestTexto_VaEnWinAnsiYEscapaLoQueHaceFalta(t *testing.T) {
	datos := generar(t, func(d *Documento) {
		p := d.Pagina(200, 200)
		p.Texto(Helvetica, 10, 10, 20, "Ñandú, acción", Color{})
		p.Texto(HelveticaNegrita, 10, 10, 40, `(a) \ b`, Color{})
		p.Texto(Courier, 10, 10, 60, "日本 €", Color{})
		p.Texto(Helvetica, 10, 10, 80, "tab\tfin", Color{})
	})
	contenido := contenidos(t, datos)[0]
	// Windows-1252: Ñ = D1, ú = FA, ó = F3.
	if !bytes.Contains(contenido, []byte("(\xD1and\xFA, acci\xF3n) Tj")) {
		t.Errorf("las tildes y la ñ no salen en WinAnsi: %q", contenido)
	}
	if !bytes.Contains(contenido, []byte(`(\(a\) \\ b) Tj`)) {
		t.Errorf("paréntesis y barra sin escapar: %q", contenido)
	}
	// Fuera de Windows-1252 → "?"; el euro sí está (0x80).
	if !bytes.Contains(contenido, []byte("(?? \x80) Tj")) {
		t.Errorf("un carácter fuera de Windows-1252 no sale como ?: %q", contenido)
	}
	if !bytes.Contains(contenido, []byte(`(tab\011fin) Tj`)) {
		t.Errorf("un carácter de control no sale en octal: %q", contenido)
	}
	if !bytes.Contains(contenido, []byte("/F1 10 Tf")) || !bytes.Contains(contenido, []byte("/F2 10 Tf")) || !bytes.Contains(contenido, []byte("/F3 10 Tf")) {
		t.Errorf("cada fuente tiene que usar su recurso: %q", contenido)
	}
	// La y se convierte desde arriba: alto 200, y 20 → 180.
	if !bytes.Contains(contenido, []byte("1 0 0 1 10 180 Tm")) {
		t.Errorf("la y no se convirtió al sistema del PDF: %q", contenido)
	}
}

func TestTexto_UnaFuenteDesconocidaEsUnError(t *testing.T) {
	d := Nuevo(infoDePrueba())
	d.Pagina(100, 100).Texto(Fuente(9), 10, 0, 0, "x", Color{})
	if _, err := d.Bytes(); err == nil {
		t.Fatal("una fuente desconocida tendría que fallar al armar el PDF")
	}
}

func TestNum_SinDecimalesDeMas(t *testing.T) {
	for v, want := range map[float64]string{
		0: "0", -0.0001: "0", 1: "1", 0.1 + 0.2: "0.3", 12.5: "12.5", -3.14159: "-3.142", 841.89: "841.89",
	} {
		if got := num(v); got != want {
			t.Errorf("num(%v) = %q, esperaba %q", v, got, want)
		}
	}
}

func TestColorHex(t *testing.T) {
	if c := ColorHex("#16181d"); c != (Color{0x16, 0x18, 0x1d}) {
		t.Errorf("ColorHex = %+v", c)
	}
	for _, malo := range []string{"", "#123", "#zzzzzz"} {
		if c := ColorHex(malo); c != (Color{}) {
			t.Errorf("ColorHex(%q) = %+v, esperaba negro", malo, c)
		}
	}
}

// --- Imágenes ------------------------------------------------------------

func TestImagen_SeEmbebeTalCualConSusMedidas(t *testing.T) {
	img := jpegDePrueba(t, 37, 21)
	datos := generar(t, func(d *Documento) {
		p := d.Pagina(300, 200)
		p.Imagen(img, 10, 20, 100, 50)
		p.Imagen(img, 0, 0, 300, 200) // la misma imagen dos veces: un solo objeto
		q := d.Pagina(300, 200)
		q.Imagen(img, 0, 0, 300, 200)
	})
	total := verificarEstructura(t, datos)
	if want := 1 + 3 + 3 + 1 + 2*2; total != want {
		t.Errorf("xref con %d entradas, esperaba %d (una sola imagen)", total, want)
	}
	if got := bytes.Count(datos, []byte("/Subtype /Image")); got != 1 {
		t.Errorf("la misma imagen se embebió %d veces", got)
	}
	if !bytes.Contains(datos, []byte("/Width 37 /Height 21 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+strconv.Itoa(len(img)))) {
		t.Errorf("el diccionario de la imagen no tiene sus medidas, RGB y DCTDecode")
	}
	if !bytes.Contains(datos, img) {
		t.Errorf("los bytes del JPEG no van tal cual")
	}
	pag := contenidos(t, datos)[0]
	// (x, y) = (10, 20) de arriba con alto 50 → la esquina de abajo en 200-70 = 130.
	if !bytes.Contains(pag, []byte("q 100 0 0 50 10 130 cm /Im1 Do Q")) {
		t.Errorf("la imagen no se ubicó donde se pidió: %q", pag)
	}
	if bytes.Count(datos, []byte("/XObject << /Im1 ")) != 2 {
		t.Errorf("cada página que usa la imagen tiene que declararla una vez")
	}
}

func TestImagen_GrisYErrores(t *testing.T) {
	ancho, alto, espacio, err := medidasDelJPEG(jpegGrisDePrueba(t, 5, 9))
	if err != nil || ancho != 5 || alto != 9 || espacio != "DeviceGray" {
		t.Errorf("gris: %d×%d %s %v", ancho, alto, espacio, err)
	}
	for nombre, malo := range map[string][]byte{
		"vacío":        nil,
		"no es JPEG":   []byte("\x89PNG\r\n\x1a\n"),
		"sin SOF":      {0xFF, 0xD8, 0xFF, 0xD9},
		"mal formado":  {0xFF, 0xD8, 0x00, 0x00, 0x00, 0x00},
		"largo de más": {0xFF, 0xD8, 0xFF, 0xE0, 0xFF, 0xFF},
	} {
		if _, _, _, err := medidasDelJPEG(malo); err == nil {
			t.Errorf("%s: se esperaba un error", nombre)
		}
	}
	d := Nuevo(infoDePrueba())
	d.Pagina(10, 10).Imagen([]byte("no"), 0, 0, 1, 1)
	if _, err := d.Bytes(); err == nil {
		t.Errorf("una imagen inválida tiene que hacer fallar el PDF")
	}
}

// --- Trazos --------------------------------------------------------------

func TestCamino_EstilosYRecorte(t *testing.T) {
	tinta := Color{255, 0, 0}
	datos := generar(t, func(d *Documento) {
		p := d.Pagina(100, 100)
		p.Linea(0, 0, 10, 10, 0.5, tinta)
		c := &Camino{}
		c.MoverA(1, 2)
		c.LineaA(3, 4)
		p.Recortado(5, 10, 20, 30, func() {
			p.Camino(c, Estilo{Relleno: &tinta})
		})
		p.Camino(c, Estilo{}) // sin trazo ni relleno: no se dibuja
		p.Camino(nil, Estilo{Trazo: &tinta})
	})
	pag := string(contenidos(t, datos)[0])
	for _, esperado := range []string{
		"0.5 w 1 0 0 RG", "1 J 1 j", "0 100 m", "10 90 l", "S",
		"q 5 60 20 30 re W n", "1 0 0 rg", "1 98 m", "3 96 l", "f",
	} {
		if !strings.Contains(pag, esperado) {
			t.Errorf("falta %q en %q", esperado, pag)
		}
	}
	soloQ := 0
	for _, l := range strings.Split(pag, "\n") {
		if l == "q" {
			soloQ++
		}
	}
	if soloQ != 2 { // la línea y el camino relleno
		t.Errorf("un camino sin estilo o nil no debería dibujar nada: %q", pag)
	}
}
