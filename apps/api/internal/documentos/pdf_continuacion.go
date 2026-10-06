package documentos

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/pdf"
)

// El PDF de un anexo de continuación (Fase 5.6d): no tiene página del
// Colegio sobre la cual escribir, así que se arma en hojas A4 como la
// constancia —un encabezado en cada hoja, el título y los datos del paciente,
// y las anotaciones (los asientos) en orden, cada una con su registro digital
// (quién y cuándo; no llevan firma dibujada) y su texto—. Como el resto de los
// PDF (TR-191), no se guarda y es DETERMINISTA: sale del anexo, de su
// contenido congelado (que incluye de qué historia es, ContinuacionCongelada),
// de sus asientos y del folio actual de su historia, el x de su "x.y"
// (FolioDe): el mismo estado da los mismos bytes, para cualquiera que lo baje,
// y el PDF cambia cuando la historia recibe su folio. La fecha del PDF es la
// del último asiento (o la de creación, sin asientos), y el /ID sale de su
// huella (o de la del contenido).

// ErrNoEsContinuacion — el documento no es un anexo de continuación abierto.
var ErrNoEsContinuacion = errors.New("el documento no es un anexo de continuación")

// FuenteDeContinuacion — lo que hace falta para el PDF de un anexo de
// continuación.
type FuenteDeContinuacion struct {
	Documento db.DocumentoClinico
	// Asientos — en orden de número.
	Asientos []db.DocumentoAsiento
	// FolioDeLaHistoria — el folio actual de su historia; nil si todavía no
	// tiene.
	FolioDeLaHistoria *int
}

// Medidas de una hoja de continuación, en puntos.
const (
	anchoUtilA4       = anchoA4 - 2*margenA4
	tamanoEncabezado  = 8.0
	tamanoAsiento     = 10.0
	interlineadoTexto = 14.0
	tamanoCabecera    = 9.0
)

// GenerarPDFDeContinuacion — el PDF de un anexo de continuación abierto.
func GenerarPDFDeContinuacion(f FuenteDeContinuacion) ([]byte, error) {
	d := f.Documento
	if d.Estado != db.DocumentoAbierto || d.AnexoSeccion == nil || d.AnexoNumero == nil || d.AnexoDe == nil {
		return nil, ErrNoEsContinuacion
	}
	if d.ContenidoCanonico == nil || d.HashContenido == nil || d.TerminadoEn == nil {
		return nil, incompleto("al anexo de continuación le falta su contenido congelado")
	}
	var contenido ContenidoCongelado
	if err := json.Unmarshal([]byte(*d.ContenidoCanonico), &contenido); err != nil {
		return nil, &DocumentoIncompletoError{Falta: "el contenido congelado del anexo no se puede leer", Causa: err}
	}
	if contenido.Continuacion == nil {
		return nil, incompleto("el contenido congelado del anexo no dice de qué historia es")
	}

	creado, huella := *d.TerminadoEn, *d.HashContenido
	if n := len(f.Asientos); n > 0 {
		creado, huella = f.Asientos[n-1].CreadoEn, f.Asientos[n-1].Hash
	}
	semilla, err := hex.DecodeString(strings.TrimSpace(huella))
	if err != nil {
		return nil, incompleto("la huella del anexo no es hexadecimal")
	}

	numero, folio := *d.AnexoNumero, FolioDe(d, f.FolioDeLaHistoria)
	tituloDelPDF := fmt.Sprintf("Anexo de continuación Nº %d", numero)
	if !folio.AnexoSinFolio() {
		tituloDelPDF += " · folio " + folio.Valor
	}
	doc := pdf.Nuevo(pdf.Info{
		Titulo:  tituloDelPDF,
		Creado:  clock.In(creado),
		Semilla: semilla,
	})
	encabezado := encabezadoDeContinuacion(*contenido.Continuacion, numero, f.FolioDeLaHistoria)
	hojas := repartirEnHojas(gruposDeLaContinuacion(numero, folio, contenido.Paciente, f.Asientos))
	for i, hoja := range hojas {
		pag := doc.Pagina(anchoA4, altoA4)
		dibujarEncabezado(pag, encabezado)
		dibujarRenglones(pag, hoja)
		dibujarPie(pag, fmt.Sprintf("%s · Hoja %d de %d", folio, i+1, len(hojas)))
	}
	return doc.Bytes()
}

// encabezadoDeContinuacion — "Anexo Nº 2 · Continuación de plan de
// tratamiento · Historia clínica general · Folio 3": de qué historia es la
// hoja, aunque se separe de las demás. El nombre de la historia sale de lo
// congelado; su folio, del actual: mientras no tiene (está en borrador o
// esperando firmas), no se dice.
func encabezadoDeContinuacion(c ContinuacionCongelada, numero int, folioDeLaHistoria *int) string {
	texto := fmt.Sprintf("Anexo Nº %d · Continuación de %s · %s", numero, strings.ToLower(EtiquetaDeSeccion(c.Seccion)), c.Historia)
	if folioDeLaHistoria != nil {
		texto += fmt.Sprintf(" · Folio %d", *folioDeLaHistoria)
	}
	return texto
}

// dibujarEncabezado — el encabezado arriba de cada hoja, sobre una regla, en
// el margen de arriba; si no entra en un renglón, en dos hacia arriba.
func dibujarEncabezado(pag *pdf.Pagina, texto string) {
	lineas := Envolver(texto, anchoUtilA4, tamanoEncabezado, anchoUtilA4)
	y := 34 - 10*float64(len(lineas)-1)
	for i, l := range lineas {
		pag.Texto(pdf.Helvetica, tamanoEncabezado, margenA4, y+10*float64(i), l, colorSecundario)
	}
	pag.Linea(margenA4, 42, anchoA4-margenA4, 42, 0.5, colorRegla)
}

// gruposDeLaContinuacion — el título con los datos del paciente y, después,
// un grupo por asiento (que se intenta mantener en una hoja).
func gruposDeLaContinuacion(numero int, folio Folio, paciente PacienteCongelado, asientos []db.DocumentoAsiento) [][]bloque {
	grupos := [][]bloque{{
		titulo(fmt.Sprintf("Anexo de continuación Nº %d", numero)),
		filaDeDatos([]celda{
			{"Paciente", strings.TrimSpace(paciente.Nombre + " " + paciente.Apellido), 280},
			{"DNI", paciente.DNI, 100},
			{folio.Rotulo, folio.Valor, anchoUtilA4 - 380},
		}),
	}}
	if len(asientos) == 0 {
		return append(grupos, []bloque{parrafo("Sin anotaciones todavía.", tamanoAsiento, colorSecundario)})
	}
	for i := range asientos {
		grupos = append(grupos, bloquesDelAsiento(&asientos[i]))
	}
	return grupos
}

// celda — una columna de la fila de datos: su etiqueta, su valor y su ancho.
type celda struct {
	etiqueta, valor string
	ancho           float64
}

// filaDeDatos — las celdas lado a lado, la etiqueta arriba y el valor debajo,
// partido en renglones dentro de su columna.
func filaDeDatos(celdas []celda) bloque {
	const tamanoEtiqueta, tamanoValor = 8.5, 10.5
	b := bloque{antes: 12}
	x, renglones := float64(margenA4), 1
	for _, c := range celdas {
		b.renglones = append(b.renglones, renglon{fuente: pdf.Helvetica, tamano: tamanoEtiqueta, x: x, y: tamanoEtiqueta, texto: c.etiqueta, color: colorSecundario})
		lineas := Envolver(c.valor, c.ancho-8, tamanoValor, c.ancho-8)
		for i, l := range lineas {
			b.renglones = append(b.renglones, renglon{fuente: pdf.Helvetica, tamano: tamanoValor, x: x, y: 24 + float64(i)*interlineadoTexto, texto: l, color: colorTinta})
		}
		renglones = max(renglones, len(lineas))
		x += c.ancho
	}
	b.alto = 24 + float64(renglones-1)*interlineadoTexto + 4
	return b
}

// bloquesDelAsiento — una anotación: su cabecera, que es su registro digital
// en el lugar de la firma ("Anotación 1 · Registrado digitalmente por {nombre}
// · {fecha y hora de Córdoba}"), un bloque por renglón del texto (así una hoja
// nueva corta entre renglones, nunca a mitad de uno) y una regla que la cierra.
func bloquesDelAsiento(a *db.DocumentoAsiento) []bloque {
	registro := fmt.Sprintf("Anotación %d · Registrado digitalmente por %s · %s", a.Numero, a.AutorNombre, fechaHoraDeCordoba(a.CreadoEn))
	lineas := Envolver(registro, anchoUtilA4, tamanoCabecera, anchoUtilA4)
	cabecera := bloque{antes: 18, alto: tamanoCabecera + float64(len(lineas)-1)*12 + 4}
	for i, l := range lineas {
		cabecera.renglones = append(cabecera.renglones, renglon{fuente: pdf.Helvetica, tamano: tamanoCabecera, x: margenA4, y: tamanoCabecera + float64(i)*12, texto: l, color: colorTinta})
	}

	bloques := []bloque{cabecera}
	for i, l := range Envolver(a.Texto, anchoUtilA4, tamanoAsiento, anchoUtilA4) {
		antes := 0.0
		if i == 0 {
			antes = 6
		}
		bloques = append(bloques, bloque{antes: antes, alto: interlineadoTexto, renglones: []renglon{
			{fuente: pdf.Helvetica, tamano: tamanoAsiento, x: margenA4, y: tamanoAsiento, texto: l, color: colorTinta},
		}})
	}
	cierre := bloque{antes: 10, alto: 1, renglones: []renglon{{regla: true, x: margenA4, largo: anchoUtilA4}}}
	return append(bloques, cierre)
}
