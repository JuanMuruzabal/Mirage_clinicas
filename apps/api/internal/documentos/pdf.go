package documentos

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/pdf"
)

// El PDF de un documento TERMINADO (Fase 5.3, TR-185), en sus dos formas:
//
//   - SELLADO (una historia clínica): la lámina —la página original del
//     Colegio con la composición congelada encima y las firmas en su
//     renglón— y, al final, la hoja de constancia de las firmas
//     electrónicas. El pie lleva el código de verificación.
//   - PARA IMPRIMIR (un consentimiento, que se firma a mano: TR-188): solo
//     la lámina con lo cargado, sin firmas, sin constancia y sin código —
//     no tiene sello—. Es la hoja que se lleva a firmar en papel.
//
// No se guarda en ningún lado: la API lo genera en cada descarga. El
// documento legal es lo sellado (o lo congelado al terminar), que ya es
// inmutable; el PDF es su representación. Por eso es DETERMINISTA: los
// bytes salen solo de lo congelado —la fila del documento, su contenido
// congelado, sus firmas, la plantilla y la imagen del original—. Nada del
// reloj, nada aleatorio, nada de la ficha actual del paciente (que puede
// haber cambiado desde que se terminó). Dos descargas dan el mismo archivo.

// ErrPlantillaSinLamina — una plantilla sin lámina no tiene una página
// sobre la cual dibujar. Hoy todas las plantillas reales la tienen.
var ErrPlantillaSinLamina = errors.New("esta plantilla no tiene lámina: no se puede generar su PDF")

// ErrDocumentoNoTerminado — solo un documento terminado (sellado o para
// imprimir) tiene PDF. El handler lo descarta antes por el estado; esto es
// la red de GenerarPDF para cualquier otro llamador.
var ErrDocumentoNoTerminado = errors.New("el documento no está terminado: solo uno sellado o para imprimir tiene PDF")

// ErrSinComposicion — el documento se terminó (en la práctica, se selló en
// la 5.1) antes de que la API congelara la composición de la lámina
// (TR-187 decisión 14): su contenido congelado no trae `lamina`. La pantalla
// lo muestra en su versión de texto; el PDF dibujaría la página del Colegio
// en blanco, sin lo cargado encima. Recomponerlo ahora no es una salida:
// lo congelado no se recompone nunca. Así que ese documento no tiene PDF.
var ErrSinComposicion = errors.New("este documento se selló antes de que existiera la lámina: se ve en pantalla, pero no tiene PDF")

// DocumentoIncompletoError — al documento le falta (o tiene ilegible) algo
// que su estado garantiza: el contenido congelado, una huella, una fecha,
// el sello. Con las restricciones de la base (chk_documento_congelado,
// chk_documento_sellado_completo) y su candado no debería pasar con un
// documento real; si pasa, es un dato dañado, no un pedido mal hecho.
// `Falta` dice qué, sin nada del contenido: es apto para el log y para la
// respuesta.
type DocumentoIncompletoError struct {
	Falta string
	Causa error
}

func (e *DocumentoIncompletoError) Error() string {
	if e.Causa != nil {
		return "no se puede generar el PDF: " + e.Falta + ": " + e.Causa.Error()
	}
	return "no se puede generar el PDF: " + e.Falta
}

func (e *DocumentoIncompletoError) Unwrap() error { return e.Causa }

func incompleto(falta string) error { return &DocumentoIncompletoError{Falta: falta} }

// FuenteDelPDF — todo lo que necesita el PDF de un documento.
type FuenteDelPDF struct {
	Documento db.DocumentoClinico
	Firmas    []db.DocumentoFirma
	// Plantilla — la versión que se firmó (documentos.PorID con la versión
	// del documento), no la última.
	Plantilla *Plantilla
}

// Colores del PDF. La tinta es la misma que la de la lámina en pantalla
// (TINTA de apps/web/src/components/documentos/lamina-documento.tsx).
var (
	colorTinta      = pdf.ColorHex("#16181d")
	colorSecundario = pdf.ColorHex("#5c6068")
	colorPie        = pdf.ColorHex("#3a3d44")
	colorFondoPie   = pdf.ColorHex("#ffffff")
	colorRegla      = pdf.ColorHex("#c9c2b3")
)

// grosorDeFirma — el de la línea de una firma en el papel, en puntos: el
// de una birome. El mismo GROSOR_DE_FIRMA de lamina-documento.tsx.
const grosorDeFirma = 0.9

var etiquetaDeTipo = map[string]string{
	"historia_clinica": "Historia clínica",
	"anexo":            "Anexo",
	"consentimiento":   "Consentimiento informado",
}

// NombreConTipo — "Historia clínica: Odontología general": el documento
// con su tipo adelante, como se nombra en las tablas. Espejo de
// `nombreConTipo` de apps/web/src/lib/documentos.ts.
func NombreConTipo(tipo, nombre string) string {
	if etiqueta, ok := etiquetaDeTipo[tipo]; ok {
		return etiqueta + ": " + nombre
	}
	return nombre
}

// matriculaLegible — "M.P. 1234" / "M.N. 1234", como la escribe un sello.
// Mismo criterio que matriculaLegible de internal/http/documentos.go, pero
// sobre los datos CONGELADOS del profesional.
func matriculaLegible(tipo, numero string) string {
	switch {
	case numero == "":
		return ""
	case tipo == "provincial":
		return "M.P. " + numero
	case tipo == "nacional":
		return "M.N. " + numero
	}
	return numero
}

// fechaHoraDeCordoba — "01/10/2026 14:05:07 (hora de Córdoba)".
func fechaHoraDeCordoba(t time.Time) string {
	return clock.In(t).Format("02/01/2006 15:04:05") + " (hora de Córdoba)"
}

var metodoEnPalabras = map[string]string{
	db.MetodoPresencial: "En persona, en el dispositivo del consultorio",
	db.MetodoVinculo:    "A distancia, desde un vínculo de un solo uso enviado a quien firma",
	db.MetodoAlerta:     "En persona, en el celular del profesional (alerta de firma)",
}

// pideComposicion — la plantilla tiene zonas sobre la página: su PDF
// necesita la composición congelada. ArmarLamina devuelve una zona por
// cada zona de la plantilla —también las vacías—, así que un documento
// terminado con la lámina de hoy siempre la trae; si no la trae, se
// terminó antes de que existiera.
func pideComposicion(p *Plantilla) bool {
	return p != nil && p.Lamina != nil && len(p.Lamina.Zonas) > 0
}

// TienePDF — ¿se le puede pedir el PDF a este documento? Lo que la API
// informa en cada resumen (`tienePDF`) para que la web no ofrezca
// "Imprimir" ni "Descargar PDF" donde GenerarPDF no lo daría: tiene que
// estar terminado, su plantilla tener lámina y, si la lámina tiene zonas,
// el contenido congelado traer la composición (ErrSinComposicion).
//
// Barato a propósito, porque corre por cada fila de una lista: lo único que
// mira del contenido congelado es si trae la clave `lamina` en su primer
// nivel, sin armar el resto (encoding/json recorre el texto y descarta los
// demás campos). Y solo en los terminados: un borrador no lo lee.
func TienePDF(d db.DocumentoClinico, p *Plantilla) bool {
	if d.Estado != db.DocumentoSellado && d.Estado != db.DocumentoParaImprimir {
		return false
	}
	if p == nil || p.Lamina == nil || len(p.Lamina.Paginas) == 0 || d.ContenidoCanonico == nil {
		return false
	}
	if !pideComposicion(p) {
		return true
	}
	var soloLaLamina struct {
		Lamina json.RawMessage `json:"lamina"`
	}
	if err := json.Unmarshal([]byte(*d.ContenidoCanonico), &soloLaLamina); err != nil {
		// Ilegible: GenerarPDF tampoco podría armarlo.
		return false
	}
	// `lamina` va con omitempty: presente es no vacía. El null y el [] se
	// miran igual, por si un contenido viejo los trajera.
	crudo := strings.TrimSpace(string(soloLaLamina.Lamina))
	return crudo != "" && crudo != "null" && crudo != "[]"
}

// GenerarPDF — el PDF de un documento terminado: sellado o para imprimir.
func GenerarPDF(f FuenteDelPDF) ([]byte, error) {
	d := f.Documento
	if f.Plantilla == nil {
		return nil, errors.New("falta la plantilla del documento")
	}
	if f.Plantilla.Lamina == nil || len(f.Plantilla.Lamina.Paginas) == 0 {
		return nil, ErrPlantillaSinLamina
	}
	sellado := d.Estado == db.DocumentoSellado
	if !sellado && d.Estado != db.DocumentoParaImprimir {
		return nil, fmt.Errorf("%w (estado %q)", ErrDocumentoNoTerminado, d.Estado)
	}
	// Lo que todo documento terminado tiene (chk_documento_congelado).
	switch {
	case d.ContenidoCanonico == nil:
		return nil, incompleto("al documento terminado le falta su contenido congelado")
	case d.HashContenido == nil:
		return nil, incompleto("al documento terminado le falta la huella de su contenido")
	}
	// El FOLIO: uno sellado siempre lo tiene (chk_documento_sellado_completo).
	// Uno para imprimir, desde TR-188; los terminados antes de esa regla no
	// —la restricción es NOT VALID justamente para no tocarlos— y su PDF sale
	// igual, sin folio en el pie ni en el título.
	conFolio := d.Folio != nil
	folio := 0
	if conFolio {
		folio = *d.Folio
	}
	if sellado {
		switch {
		case d.Folio == nil:
			return nil, incompleto("al documento sellado le falta su folio")
		case d.HashSello == nil:
			return nil, incompleto("al documento sellado le falta la huella de su sello")
		case d.SelladoEn == nil:
			return nil, incompleto("al documento sellado le falta la fecha del sello")
		case d.CadenaN == nil:
			return nil, incompleto("al documento sellado le falta su eslabón de la cadena")
		}
	} else if d.TerminadoEn == nil {
		return nil, incompleto("al documento para imprimir le falta la fecha en que se terminó")
	}
	var contenido ContenidoCongelado
	if err := json.Unmarshal([]byte(*d.ContenidoCanonico), &contenido); err != nil {
		return nil, &DocumentoIncompletoError{Falta: "el contenido congelado del documento no se puede leer", Causa: err}
	}
	if pideComposicion(f.Plantilla) && len(contenido.Lamina) == 0 {
		return nil, ErrSinComposicion
	}

	// Lo que cambia entre las dos formas: de qué huella sale el /ID, qué
	// instante va en /CreationDate, qué dice el pie y si hay firmas y
	// constancia. Uno para imprimir no tiene sello: su identidad es la
	// huella de su contenido congelado.
	nombre := NombreConTipo(contenido.Plantilla.Tipo, contenido.Plantilla.Nombre)
	var (
		huellaDelID string
		creado      time.Time
		codigo      string
		hojas       [][]renglon
	)
	if sellado {
		huellaDelID, creado = *d.HashSello, *d.SelladoEn
		codigo = CodigoDeVerificacion(*d.HashSello)
		if codigo == "" {
			return nil, incompleto("la huella del sello del documento no es un SHA-256 en hexadecimal")
		}
		hojas = hojasDeConstancia(d, contenido, f.Firmas, nombre, codigo)
	} else {
		huellaDelID, creado = *d.HashContenido, *d.TerminadoEn
	}
	semilla, err := hex.DecodeString(strings.TrimSpace(huellaDelID))
	if err != nil {
		if sellado {
			return nil, incompleto("la huella del sello del documento no es hexadecimal")
		}
		return nil, incompleto("la huella del contenido del documento no es hexadecimal")
	}

	lamina := f.Plantilla.Lamina
	total := len(lamina.Paginas) + len(hojas)
	pie := func(pag *pdf.Pagina, hoja int) {
		texto := fmt.Sprintf("Hoja %d de %d", hoja, total)
		if conFolio {
			texto = fmt.Sprintf("Folio %d · %s", folio, texto)
		}
		if sellado {
			texto = fmt.Sprintf("Folio %d · Código de verificación %s · Hoja %d de %d", folio, codigo, hoja, total)
		}
		const tamano = 7.0
		ancho := float64(AnchoEnUnidades(texto)) * tamano / 1000
		x := (pag.Ancho() - ancho) / 2
		y := pag.Alto() - 12
		// Detrás, un recuadro blanco del tamaño justo del texto: varios
		// modelos del Colegio (Sedoanalgesia, Extracción…) tienen abajo una
		// franja de color con sus datos de contacto, y el pie cae encima. Así
		// se lee sobre cualquier fondo sin moverlo de lugar. El alto sale de
		// la altura de las mayúsculas y del descendente de Helvetica (718 y
		// 207 milésimas del tamaño).
		const margenX, margenY = 3.0, 1.5
		arriba := y - 0.718*tamano - margenY
		abajo := y + 0.207*tamano + margenY
		fondo := &pdf.Camino{}
		fondo.MoverA(x-margenX, arriba)
		fondo.LineaA(x+ancho+margenX, arriba)
		fondo.LineaA(x+ancho+margenX, abajo)
		fondo.LineaA(x-margenX, abajo)
		fondo.Cerrar()
		pag.Camino(fondo, pdf.Estilo{Relleno: &colorFondoPie})
		pag.Texto(pdf.Helvetica, tamano, x, y, texto, colorPie)
	}

	tituloDelPDF := nombre
	if conFolio {
		tituloDelPDF = fmt.Sprintf("%s · folio %d", nombre, folio)
	}
	doc := pdf.Nuevo(pdf.Info{
		Titulo:  tituloDelPDF,
		Creado:  clock.In(creado),
		Semilla: semilla,
	})

	for i, medidas := range lamina.Paginas {
		numero := i + 1
		pag := doc.Pagina(medidas.Ancho, medidas.Alto)
		// Sin el original embebido (una plantilla de prueba), la página va en
		// blanco con la composición encima: no es un error.
		if jpeg, ok := PaginaOriginal(f.Plantilla.ID, f.Plantilla.Version, numero); ok {
			pag.Imagen(jpeg, 0, 0, medidas.Ancho, medidas.Alto)
		}
		// La composición CONGELADA, tal cual: nunca se recompone.
		for _, z := range contenido.Lamina {
			if z.Pagina != numero {
				continue
			}
			for _, l := range z.Lineas {
				if l.Texto == "" {
					continue
				}
				pag.Texto(pdf.Helvetica, z.Tamano, l.X, l.Y, l.Texto, colorTinta)
			}
		}
		// Un consentimiento se firma a mano sobre la hoja impresa: sus
		// renglones de firma quedan vacíos.
		if sellado {
			for _, lugar := range lamina.Firmas {
				if lugar.Pagina != numero {
					continue
				}
				for _, firma := range f.Firmas {
					if firma.Rol == lugar.Rol {
						dibujarFirma(pag, lugar, firma.Trazo)
					}
				}
			}
		}
		pie(pag, numero)
	}

	for i, hoja := range hojas {
		pag := doc.Pagina(anchoA4, altoA4)
		for _, r := range hoja {
			if r.regla {
				pag.Linea(r.x, r.y, r.x+r.largo, r.y, 0.5, colorRegla)
				continue
			}
			pag.Texto(r.fuente, r.tamano, r.x, r.y, r.texto, r.color)
		}
		pie(pag, len(lamina.Paginas)+i+1)
	}

	return doc.Bytes()
}

// --- Las firmas sobre la lámina ---------------------------------------

type recuadro struct{ x, y, ancho, alto float64 }

// recuadroDelTrazo — el recuadro de lo dibujado, con un margen. Réplica
// EXACTA de `recuadroDelTrazo` de lamina-documento.tsx: la firma del PDF
// tiene que caer donde cae en la pantalla.
func recuadroDelTrazo(t db.TrazoDeFirma) recuadro {
	primero := true
	var minX, minY, maxX, maxY float64
	for _, trazo := range t.Trazos {
		for _, p := range trazo {
			if primero {
				minX, maxX, minY, maxY = p[0], p[0], p[1], p[1]
				primero = false
				continue
			}
			minX, maxX = math.Min(minX, p[0]), math.Max(maxX, p[0])
			minY, maxY = math.Min(minY, p[1]), math.Max(maxY, p[1])
		}
	}
	if primero {
		return recuadro{0, 0, float64(t.Ancho), float64(t.Alto)}
	}
	ancho := math.Max(maxX-minX, 1)
	alto := math.Max(maxY-minY, 1)
	margen := math.Max(ancho, alto)*0.06 + 2
	return recuadro{minX - margen, minY - margen, ancho + 2*margen, alto + 2*margen}
}

// dibujarFirma — el trazo en su lugar, como lo dibuja el <svg> anidado de
// la pantalla: viewBox = el recuadro del trazo, preserveAspectRatio
// "xMidYMax meet" (centrado a lo ancho, apoyado abajo, en la caja que va de
// `y - alto` a `y`), recortado a esa caja, con la línea de 0,9 pt en el
// papel y extremos y uniones redondas. El camino es el de `caminoDelTrazo`
// (trazo-de-firma.tsx): segmentos rectos entre los puntos, y un toque solo
// como un segmento de 0,1 a la derecha.
func dibujarFirma(pag *pdf.Pagina, lugar LugarDeFirma, trazo db.TrazoDeFirma) {
	r := recuadroDelTrazo(trazo)
	escala := math.Min(lugar.Ancho/r.ancho, lugar.Alto/r.alto)
	tx := lugar.X + (lugar.Ancho-r.ancho*escala)/2 - r.x*escala
	ty := (lugar.Y - lugar.Alto) + (lugar.Alto - r.alto*escala) - r.y*escala
	enPapel := func(x, y float64) (float64, float64) { return x*escala + tx, y*escala + ty }

	pag.Recortado(lugar.X, lugar.Y-lugar.Alto, lugar.Ancho, lugar.Alto, func() {
		for _, puntos := range trazo.Trazos {
			if len(puntos) == 0 {
				continue
			}
			c := &pdf.Camino{}
			x, y := enPapel(puntos[0][0], puntos[0][1])
			c.MoverA(x, y)
			if len(puntos) == 1 {
				x, y = enPapel(puntos[0][0]+0.1, puntos[0][1])
				c.LineaA(x, y)
			}
			for _, p := range puntos[1:] {
				x, y = enPapel(p[0], p[1])
				c.LineaA(x, y)
			}
			pag.Camino(c, pdf.Estilo{Grosor: grosorDeFirma, Trazo: &colorTinta, Redondo: true})
		}
	})
}

// --- La hoja de constancia ---------------------------------------------

// A4, en puntos, con sus márgenes.
const (
	anchoA4       = 595.28
	altoA4        = 841.89
	margenA4      = 56.0
	anchoEtiqueta = 150.0
)

// renglon — algo ya ubicado en una hoja de constancia: un texto con su línea
// de base en (x, y), o una regla horizontal.
type renglon struct {
	fuente pdf.Fuente
	tamano float64
	x, y   float64
	texto  string
	color  pdf.Color
	regla  bool
	largo  float64
}

// bloque — un pedazo de la constancia que no se parte entre hojas: sus
// renglones van con la y relativa al borde de arriba del bloque.
type bloque struct {
	antes     float64
	alto      float64
	renglones []renglon
}

// partirMonoespaciada — Courier ocupa 600 milésimas de em por carácter:
// se corta por cantidad de caracteres, sin buscar palabras (las huellas no
// tienen espacios).
func partirMonoespaciada(texto string, ancho, tamano float64) []string {
	porRenglon := int(ancho / (0.6 * tamano))
	if porRenglon < 1 {
		porRenglon = 1
	}
	caracteres := []rune(texto)
	if len(caracteres) == 0 {
		return []string{""}
	}
	var lineas []string
	for len(caracteres) > porRenglon {
		lineas = append(lineas, string(caracteres[:porRenglon]))
		caracteres = caracteres[porRenglon:]
	}
	return append(lineas, string(caracteres))
}

func lineasDe(texto string, f pdf.Fuente, ancho, tamano float64) []string {
	if f == pdf.Courier {
		return partirMonoespaciada(texto, ancho, tamano)
	}
	return Envolver(texto, ancho, tamano, ancho)
}

func titulo(texto string) bloque {
	const tamano = 16.0
	return bloque{alto: 26, renglones: []renglon{
		{fuente: pdf.HelveticaNegrita, tamano: tamano, x: margenA4, y: tamano, texto: texto, color: colorTinta},
		{regla: true, x: margenA4, y: 24, largo: anchoA4 - 2*margenA4},
	}}
}

func subtitulo(texto string) bloque {
	const tamano = 11.0
	return bloque{antes: 14, alto: 18, renglones: []renglon{
		{fuente: pdf.HelveticaNegrita, tamano: tamano, x: margenA4, y: tamano, texto: texto, color: colorTinta},
	}}
}

// fila — "Etiqueta   valor", con el valor partido en renglones en su
// columna.
func fila(etiqueta, valor string, f pdf.Fuente, tamano float64) bloque {
	const tamanoEtiqueta = 8.5
	interlineado := math.Round(tamano*1.35*100) / 100
	anchoValor := anchoA4 - 2*margenA4 - anchoEtiqueta
	b := bloque{antes: 3, renglones: []renglon{
		{fuente: pdf.Helvetica, tamano: tamanoEtiqueta, x: margenA4, y: tamano, texto: etiqueta, color: colorSecundario},
	}}
	lineas := []string{}
	for _, parrafo := range strings.Split(valor, "\n") {
		lineas = append(lineas, lineasDe(parrafo, f, anchoValor, tamano)...)
	}
	for i, l := range lineas {
		b.renglones = append(b.renglones, renglon{
			fuente: f, tamano: tamano, x: margenA4 + anchoEtiqueta, y: tamano + float64(i)*interlineado, texto: l, color: colorTinta,
		})
	}
	b.alto = tamano + float64(len(lineas)-1)*interlineado + 3
	return b
}

func parrafo(texto string, tamano float64, color pdf.Color) bloque {
	interlineado := math.Round(tamano*1.4*100) / 100
	lineas := Envolver(texto, anchoA4-2*margenA4, tamano, anchoA4-2*margenA4)
	b := bloque{antes: 16}
	for i, l := range lineas {
		b.renglones = append(b.renglones, renglon{
			fuente: pdf.Helvetica, tamano: tamano, x: margenA4, y: tamano + float64(i)*interlineado, texto: l, color: color,
		})
	}
	b.alto = tamano + float64(len(lineas)-1)*interlineado + 3
	return b
}

func textoOr(p *string, siNo string) string {
	if p == nil || strings.TrimSpace(*p) == "" {
		return siNo
	}
	return *p
}

// contenidoDeLaConstancia — la constancia, en grupos de bloques: un grupo
// (una firma con todas sus filas, por ejemplo) se intenta mantener junto
// en una misma hoja.
func contenidoDeLaConstancia(d db.DocumentoClinico, c ContenidoCongelado, firmas []db.DocumentoFirma, nombre, codigo string) [][]bloque {
	helv := func(etiqueta, valor string) bloque { return fila(etiqueta, valor, pdf.Helvetica, 9.5) }
	huella := func(etiqueta, valor string) bloque { return fila(etiqueta, valor, pdf.Courier, 8) }

	profesional := strings.TrimSpace(c.Profesional.Nombre + " " + c.Profesional.Apellido)
	if m := matriculaLegible(c.Profesional.MatriculaTipo, c.Profesional.MatriculaNumero); m != "" {
		profesional += " · " + m
	}
	terminado := c.TerminadoEn
	if d.TerminadoEn != nil {
		terminado = fechaHoraDeCordoba(*d.TerminadoEn)
	}

	grupos := [][]bloque{
		{titulo("Constancia de firmas electrónicas")},
		{
			subtitulo("El documento"),
			helv("Documento", nombre),
			helv("Modelo", fmt.Sprintf("%s · versión %d", c.Plantilla.Fuente.Nombre, c.Plantilla.Version)),
			helv("Folio", strconv.Itoa(*d.Folio)),
			helv("Paciente", strings.TrimSpace(c.Paciente.Nombre+" "+c.Paciente.Apellido)+" · DNI "+c.Paciente.DNI),
			helv("Clínica", c.Clinica.Nombre),
			helv("Profesional", profesional),
			helv("Terminado", terminado),
			helv("Sellado", fechaHoraDeCordoba(*d.SelladoEn)),
			helv("Eslabón de la cadena", fmt.Sprintf("N° %d de la clínica", *d.CadenaN)),
		},
	}

	anterior := huella("Sello anterior", textoOr(d.HashAnterior, ""))
	if d.HashAnterior == nil || *d.HashAnterior == "" {
		anterior = helv("Sello anterior", "— (primer documento sellado de la clínica)")
	}
	grupos = append(grupos, []bloque{
		subtitulo("Huellas (SHA-256)"),
		huella("Contenido", *d.HashContenido),
		huella("Sello", *d.HashSello),
		anterior,
		fila("Código de verificación", codigo, pdf.Courier, 11),
	})

	grupos = append(grupos, []bloque{subtitulo("Firmas")})
	for _, def := range c.Firmas {
		var firma *db.DocumentoFirma
		for i := range firmas {
			if firmas[i].Rol == def.Rol {
				firma = &firmas[i]
			}
		}
		etiqueta := subtitulo(def.Etiqueta)
		etiqueta.antes = 10
		etiqueta.renglones[0].tamano = 10
		etiqueta.renglones[0].y = 10
		etiqueta.alto = 15
		if firma == nil {
			grupos = append(grupos, []bloque{etiqueta, helv("Estado", "Sin firmar (firma opcional)")})
			continue
		}
		grupo := []bloque{etiqueta, helv("Nombre", firma.Nombre)}
		if firma.DNI != nil && *firma.DNI != "" {
			grupo = append(grupo, helv("DNI", *firma.DNI))
		}
		if firma.EnRepresentacion {
			grupo = append(grupo, helv("En representación", "Firmó en nombre del paciente · vínculo: "+textoOr(firma.Vinculo, "no consignado")))
		}
		metodo, ok := metodoEnPalabras[firma.Metodo]
		if !ok {
			metodo = firma.Metodo
		}
		grupo = append(grupo,
			helv("Método", metodo),
			helv("Fecha y hora", fechaHoraDeCordoba(firma.FirmadoEn)),
			helv("IP", textoOr(firma.IP, "No registrada")),
			helv("Dispositivo", textoOr(firma.UserAgent, "No registrado")),
		)
		if firma.MailVerificado != nil && *firma.MailVerificado != "" {
			grupo = append(grupo, helv("Mail verificado", *firma.MailVerificado))
		}
		grupo = append(grupo, huella("Huella de la firma", firma.HashFirma))
		grupos = append(grupos, grupo)
	}

	grupos = append(grupos, []bloque{parrafo(
		"Las firmas de este documento son firmas electrónicas (Ley 25.506): esta constancia registra cómo, cuándo y desde dónde se hizo cada una. "+
			"El sello encadena el documento con el anterior de la clínica: alterar cualquiera de los dos se detecta.",
		8.5, colorSecundario)})
	return grupos
}

// hojasDeConstancia — la constancia repartida en hojas A4. Un bloque nunca
// se parte; un grupo que entra entero en una hoja nueva pero no en lo que
// queda de esta, empieza en la siguiente.
func hojasDeConstancia(d db.DocumentoClinico, c ContenidoCongelado, firmas []db.DocumentoFirma, nombre, codigo string) [][]renglon {
	limite := altoA4 - margenA4
	util := limite - margenA4
	hojas := [][]renglon{{}}
	cursor := margenA4
	nuevaHoja := func() {
		hojas = append(hojas, []renglon{})
		cursor = margenA4
	}
	for _, grupo := range contenidoDeLaConstancia(d, c, firmas, nombre, codigo) {
		altoDelGrupo := 0.0
		for _, b := range grupo {
			altoDelGrupo += b.antes + b.alto
		}
		if cursor > margenA4 && cursor+altoDelGrupo > limite && altoDelGrupo <= util {
			nuevaHoja()
		}
		for _, b := range grupo {
			antes := b.antes
			if cursor == margenA4 {
				antes = 0
			}
			if cursor > margenA4 && cursor+antes+b.alto > limite {
				nuevaHoja()
				antes = 0
			}
			arriba := cursor + antes
			for _, r := range b.renglones {
				r.y += arriba
				hojas[len(hojas)-1] = append(hojas[len(hojas)-1], r)
			}
			cursor = arriba + b.alto
		}
	}
	return hojas
}
