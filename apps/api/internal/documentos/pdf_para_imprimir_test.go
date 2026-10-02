package documentos

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	_ "image/jpeg"
	"math"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"dental-mirage/api/internal/db"
)

// El PDF de un consentimiento PARA IMPRIMIR (Fase 5.3, TR-188): la lámina
// con lo cargado, sin firmas, sin constancia y sin código de verificación.

// paraImprimirDePrueba — el mismo documento de selladoDePrueba, pero
// terminado como consentimiento: sin sello. Las firmas se dejan en la
// fuente a propósito: el generador no las tiene que dibujar igual.
func paraImprimirDePrueba(t *testing.T, p *Plantilla) FuenteDelPDF {
	t.Helper()
	f := selladoDePrueba(t, p, pacienteDePrueba)
	f.Documento.Estado = db.DocumentoParaImprimir
	f.Documento.HashSello = nil
	f.Documento.SelladoEn = nil
	f.Documento.CadenaN = nil
	return f
}

func TestGenerarPDF_ParaImprimir_SoloLaLaminaSinFirmasNiCodigo(t *testing.T) {
	p := conducto(t)
	f := paraImprimirDePrueba(t, p)
	datos := generarPDF(t, f)
	paginas := paginasDelPDF(t, datos)
	laminas := len(p.Lamina.Paginas)
	if len(paginas) != laminas {
		t.Fatalf("%d hojas: uno para imprimir tiene solo las %d de la lámina (sin constancia)", len(paginas), laminas)
	}
	if bytes.Contains(datos, []byte("/MediaBox [0 0 595.28 841.89]")) {
		t.Error("uno para imprimir no tiene hoja de constancia A4")
	}
	for i, pag := range paginas {
		textos := textosDe(pag)
		pie := fmt.Sprintf("Folio 7 · Hoja %d de %d", i+1, laminas)
		if !strings.Contains(textos, pie) {
			t.Errorf("hoja %d sin el pie %q:\n%s", i+1, pie, textos)
		}
		for _, prohibido := range []string{"Código de verificación", "Constancia de firmas", "Firmante 1", "Firmante 2", "200.1.2.3"} {
			if strings.Contains(textos, prohibido) {
				t.Errorf("hoja %d dice %q: uno para imprimir no lleva firmas ni constancia ni código", i+1, prohibido)
			}
		}
		// Las firmas se dibujan recortadas a su lugar y con 0,9 pt: nada de
		// eso puede estar (se firma a mano sobre la hoja impresa).
		if strings.Contains(pag, "re W n") || strings.Contains(pag, "0.9 w") {
			t.Errorf("hoja %d tiene una firma dibujada", i+1)
		}
	}
	if !strings.Contains(textosDe(paginas[0]), "Ejemplo de lugar") {
		t.Error("la lámina no tiene lo cargado")
	}
	// Ningún código de verificación, ni siquiera el que daría su huella.
	if strings.Contains(strings.Join(paginas, ""), CodigoDeVerificacion(*f.Documento.HashContenido)) {
		t.Error("uno para imprimir no tiene código de verificación")
	}
	// El original va de fondo igual.
	jpeg, _ := PaginaOriginal(p.ID, p.Version, 1)
	if !bytes.Contains(datos, jpeg) {
		t.Error("uno para imprimir va sobre la página original del Colegio")
	}
}

func TestGenerarPDF_ParaImprimir_EsDeterministaEIgnoraLasFirmas(t *testing.T) {
	p := conducto(t)
	a := generarPDF(t, paraImprimirDePrueba(t, p))
	if !bytes.Equal(a, generarPDF(t, paraImprimirDePrueba(t, p))) {
		t.Fatal("dos generaciones del mismo consentimiento dieron bytes distintos")
	}
	sinFirmas := paraImprimirDePrueba(t, p)
	sinFirmas.Firmas = nil
	if !bytes.Equal(a, generarPDF(t, sinFirmas)) {
		t.Fatal("las firmas no pueden cambiar el PDF de uno para imprimir")
	}
	// Lo congelado sí lo cambia: otro folio, otra hoja.
	otroFolio := paraImprimirDePrueba(t, p)
	n := 8
	otroFolio.Documento.Folio = &n
	if bytes.Equal(a, generarPDF(t, otroFolio)) {
		t.Fatal("cambiar el folio no cambió el PDF")
	}
}

var (
	reFechaDeCreacion = regexp.MustCompile(`/CreationDate \((D:[^)]*)\)`)
	reIDDelTrailer    = regexp.MustCompile(`/ID \[<([0-9A-F]{32})> <([0-9A-F]{32})>\]`)
)

func metadatos(t *testing.T, datos []byte) (creado, id string) {
	t.Helper()
	m := reFechaDeCreacion.FindSubmatch(datos)
	if m == nil {
		t.Fatal("el PDF no tiene /CreationDate")
	}
	i := reIDDelTrailer.FindSubmatch(datos)
	if i == nil || !bytes.Equal(i[1], i[2]) {
		t.Fatal("el PDF no tiene un /ID con sus dos mitades iguales")
	}
	return string(m[1]), string(i[1])
}

// La fecha de creación y el /ID salen de lo congelado, nunca del reloj: el
// de uno para imprimir, de terminado_en y de su huella de contenido; el de
// un sellado, de sellado_en y de su sello. La fecha va en hora de Córdoba.
func TestGenerarPDF_FechaEIDSalenDeLoCongelado(t *testing.T) {
	p := conducto(t)

	papel := paraImprimirDePrueba(t, p)
	creado, id := metadatos(t, generarPDF(t, papel))
	// terminado = 2026-09-27 15:04:05 UTC = 12:04:05 en Córdoba.
	if creado != "D:20260927120405-03'00'" {
		t.Errorf("para imprimir: /CreationDate = %q", creado)
	}
	if id != strings.ToUpper((*papel.Documento.HashContenido)[:32]) {
		t.Errorf("para imprimir: /ID = %s, esperaba los primeros 16 bytes de hash_contenido", id)
	}

	sellado := selladoDePrueba(t, p, pacienteDePrueba)
	creado, id = metadatos(t, generarPDF(t, sellado))
	// sellado = terminado + 10 min.
	if creado != "D:20260927121405-03'00'" {
		t.Errorf("sellado: /CreationDate = %q", creado)
	}
	if id != strings.ToUpper((*sellado.Documento.HashSello)[:32]) {
		t.Errorf("sellado: /ID = %s, esperaba los primeros 16 bytes del sello", id)
	}

	// Mover terminado_en mueve la fecha de uno para imprimir (y la de un
	// sellado no, que sale del sello).
	otra := paraImprimirDePrueba(t, p)
	tt := otra.Documento.TerminadoEn.Add(24 * time.Hour)
	otra.Documento.TerminadoEn = &tt
	if c, _ := metadatos(t, generarPDF(t, otra)); c != "D:20260928120405-03'00'" {
		t.Errorf("para imprimir con otra fecha de terminado: %q", c)
	}
	sellado.Documento.TerminadoEn = &tt
	if c, _ := metadatos(t, generarPDF(t, sellado)); c != "D:20260927121405-03'00'" {
		t.Errorf("un sellado toma la fecha del sello, no la de terminado: %q", c)
	}
}

func TestGenerarPDF_ParaImprimir_Errores(t *testing.T) {
	p := conducto(t)
	for nombre, romper := range map[string]func(d *db.DocumentoClinico){
		"sin fecha de terminado": func(d *db.DocumentoClinico) { d.TerminadoEn = nil },
		"huella que no es hex":   func(d *db.DocumentoClinico) { s := "zz-no-es-hex"; d.HashContenido = &s },
		"sin huella":             func(d *db.DocumentoClinico) { d.HashContenido = nil },
		"anulado":                func(d *db.DocumentoClinico) { d.Estado = db.DocumentoAnulado },
	} {
		f := paraImprimirDePrueba(t, p)
		romper(&f.Documento)
		if _, err := GenerarPDF(f); err == nil {
			t.Errorf("%s: se esperaba un error", nombre)
		}
	}
	// Un sellado sin su eslabón de la cadena tampoco.
	f := selladoDePrueba(t, p, pacienteDePrueba)
	f.Documento.CadenaN = nil
	if _, err := GenerarPDF(f); err == nil {
		t.Error("sellado sin cadena: se esperaba un error")
	}
}

// El pie lleva detrás un recuadro blanco del tamaño del texto (para leerse
// sobre la franja de color de algunos modelos), dibujado DESPUÉS de la
// imagen de fondo y justo antes del texto del pie, que va en gris oscuro.
var rePieConRecuadro = regexp.MustCompile(
	`q\n1 1 1 rg\n(\S+) (\S+) m\n(\S+) \S+ l\n\S+ (\S+) l\n\S+ \S+ l\nh\nf\nQ\n` +
		`BT /\S+ 7 Tf (\S+ \S+ \S+) rg 1 0 0 1 (\S+) (\S+) Tm \(((?:\\.|[^\\)])*)\) Tj ET\n`)

func TestGenerarPDF_ElPieLlevaUnRecuadroBlancoDetras(t *testing.T) {
	p := conducto(t)
	for nombre, f := range map[string]FuenteDelPDF{
		"para imprimir": paraImprimirDePrueba(t, p),
		"sellado":       selladoDePrueba(t, p, pacienteDePrueba),
	} {
		paginas := paginasDelPDF(t, generarPDF(t, f))
		for i, pag := range paginas {
			m := rePieConRecuadro.FindStringSubmatch(pag)
			if m == nil {
				t.Errorf("%s, hoja %d: el pie no tiene el recuadro blanco justo antes del texto", nombre, i+1)
				continue
			}
			numero := func(s string) float64 {
				v, err := strconv.ParseFloat(s, 64)
				if err != nil {
					t.Fatal(err)
				}
				return v
			}
			x0, arriba, x1, abajo := numero(m[1]), numero(m[2]), numero(m[3]), numero(m[4])
			color, tx, ty, texto := m[5], numero(m[6]), numero(m[7]), m[8]
			if !strings.HasPrefix(texto, "Folio 7") {
				t.Errorf("%s, hoja %d: el texto después del recuadro no es el pie: %q", nombre, i+1, texto)
			}
			ancho := float64(AnchoEnUnidades(texto)) * 7 / 1000
			if math.Abs(x0-(tx-3)) > 0.01 || math.Abs(x1-(tx+ancho+3)) > 0.01 {
				t.Errorf("%s, hoja %d: el recuadro va de %v a %v y el texto de %v a %v (+3 de margen)", nombre, i+1, x0, x1, tx, tx+ancho)
			}
			// En coordenadas del PDF (y hacia arriba): el recuadro abraza la
			// línea de base del texto.
			if !(arriba > ty && abajo < ty) {
				t.Errorf("%s, hoja %d: el recuadro (%v a %v) no cubre la línea de base %v", nombre, i+1, abajo, arriba, ty)
			}
			if color != "0.227 0.239 0.267" {
				t.Errorf("%s, hoja %d: el pie va en gris oscuro (#3a3d44), no %q", nombre, i+1, color)
			}
			if fondo := strings.Index(pag, " Do Q"); fondo >= 0 && fondo > strings.Index(pag, m[0]) {
				t.Errorf("%s, hoja %d: el recuadro quedó debajo de la imagen de fondo", nombre, i+1)
			}
		}
	}
}

// --- Los originales ----------------------------------------------------

// Una versión de mismasPaginas no se embebe: usa las páginas de la otra.
func TestOriginales_MismasPaginas(t *testing.T) {
	if len(mismasPaginas) == 0 {
		t.Fatal("la tabla mismasPaginas está vacía: el conducto v2 tendría que usar las páginas del v1")
	}
	for desde, hacia := range mismasPaginas {
		if _, err := originales.ReadDir(fmt.Sprintf("originales/%s/v%d", desde.id, desde.version)); err == nil {
			t.Errorf("%s v%d está en mismasPaginas y además embebida: serían los mismos bytes dos veces", desde.id, desde.version)
		}
		pd, ok1 := PorID(desde.id, desde.version)
		ph, ok2 := PorID(hacia.id, hacia.version)
		if !ok1 || !ok2 {
			t.Fatalf("mismasPaginas nombra una plantilla que no existe: %v → %v", desde, hacia)
		}
		if pd.Lamina == nil || ph.Lamina == nil || len(pd.Lamina.Paginas) != len(ph.Lamina.Paginas) {
			t.Fatalf("%v y %v no tienen la misma cantidad de páginas", desde, hacia)
		}
		for n := 1; n <= len(pd.Lamina.Paginas); n++ {
			if pd.Lamina.Paginas[n-1] != ph.Lamina.Paginas[n-1] {
				t.Errorf("%v pág. %d mide distinto que %v: no puede compartir el papel", desde, n, hacia)
			}
			a, okA := PaginaOriginal(desde.id, desde.version, n)
			b, okB := PaginaOriginal(hacia.id, hacia.version, n)
			if !okA || !okB || !bytes.Equal(a, b) {
				t.Errorf("%v pág. %d no devuelve la página de %v", desde, n, hacia)
			}
		}
	}
	// El caso concreto que motivó la tabla.
	v1, _ := PaginaOriginal("consentimiento-tratamiento-conducto", 1, 1)
	v2, ok := PaginaOriginal("consentimiento-tratamiento-conducto", 2, 1)
	if !ok || !bytes.Equal(v1, v2) {
		t.Fatal("el conducto v2 no dibuja sobre la página del v1")
	}
	// Una versión que no está en la tabla no hereda nada.
	if _, ok := PaginaOriginal("consentimiento-tratamiento-conducto", 3, 1); ok {
		t.Fatal("una versión que no existe no tiene original")
	}
}

// Las imágenes embebidas: JPEG a 200 dpi del tamaño de su página, en gris
// salvo las que tienen color en el original del Colegio (TR del 2026-10-02:
// Sedoanalgesia, Toma de imágenes, Ortodoncia, Odontopediatría y Ortopedia).
func TestOriginales_ResolucionYColor(t *testing.T) {
	conColor := map[string]bool{}
	revisadas := 0
	for _, p := range Todas() {
		if p.Lamina == nil {
			continue
		}
		for n, medidas := range p.Lamina.Paginas {
			datos, ok := PaginaOriginal(p.ID, p.Version, n+1)
			if !ok {
				continue
			}
			revisadas++
			cfg, formato, err := image.DecodeConfig(bytes.NewReader(datos))
			if err != nil || formato != "jpeg" {
				t.Fatalf("%s v%d pág. %d: no es un JPEG (%v)", p.ID, p.Version, n+1, err)
			}
			esperado := math.Round(medidas.Ancho / 72 * 200)
			if math.Abs(float64(cfg.Width)-esperado) > 1 {
				t.Errorf("%s v%d pág. %d: %d px de ancho, esperaba %v (200 dpi)", p.ID, p.Version, n+1, cfg.Width, esperado)
			}
			if cfg.ColorModel != color.GrayModel {
				conColor[p.ID] = true
			}
		}
	}
	if revisadas == 0 {
		t.Fatal("no se revisó ninguna página")
	}
	for _, id := range []string{"consentimiento-sedoanalgesia", "consentimiento-toma-de-imagenes",
		"consentimiento-ortodoncia", "consentimiento-odontopediatria", "consentimiento-ortopedia"} {
		if !conColor[id] {
			t.Errorf("%s tiene color en el original y quedó toda en gris", id)
		}
	}
	for _, id := range []string{"consentimiento-extraccion", "consentimiento-tratamiento-conducto", "consentimiento-biopsia"} {
		if conColor[id] {
			t.Errorf("%s es en blanco y negro y quedó en color", id)
		}
	}
	if len(conColor) != 5 {
		t.Errorf("hay %d plantillas con alguna página en color (%v), se esperaban 5", len(conColor), conColor)
	}
}
