// Package imagenes arma las variantes responsivas de una foto subida a la
// página pública (PE-9, plan Prisma Engine): 2 o 3 anchos en WebP,
// generados UNA vez al subir, para que la plantilla las ofrezca con
// `srcset` y un celular no baje la foto de 5 MB que subió el admin.
//
// Se hace al subir y no al servir (next/image) a propósito: el servicio web
// corre en el plan free de Render, que se duerme y tiene poca CPU, y con R2
// (Fase 4.6) las fotos se sirven directo desde el bucket, sin pasar por
// ningún proceso nuestro que pueda redimensionarlas.
//
// Re-codificar tiene un efecto de privacidad que vale la pena nombrar: el
// archivo que queda publicado ya no lleva los metadatos EXIF del original
// (la foto de un celular trae, entre otros, las coordenadas GPS de dónde se
// sacó). La orientación EXIF se aplica a los píxeles antes de descartarla,
// o la foto de un celular vertical quedaría acostada.
package imagenes

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/draw"
	_ "image/jpeg" // registra el decoder de JPEG para image.Decode
	_ "image/png"  // registra el decoder de PNG para image.Decode

	xdraw "golang.org/x/image/draw"
)

// Anchos — los anchos (px) de las variantes. El frontend arma el `srcset`
// sabiendo esta misma lista (ANCHOS_DE_FOTO en
// packages/prisma-engine/src/imagenes.ts) y la convención de nombres de
// NombreDeVariante: si cambia una, cambia la otra en el mismo commit.
var Anchos = []int{480, 960, 1600}

const (
	// maxPixeles acota la memoria de decodificar: el límite de 5 MB del
	// archivo no alcanza, un PNG liso de pocos KB puede declarar 20.000 × 20.000
	// píxeles (una "bomba de descompresión") y tumbar el proceso.
	maxPixeles  = 30_000_000
	calidadWebP = 80
)

// procesando — cuántas fotos se procesan a la vez. Decodificar una foto de
// celular ocupa decenas de MB y el servicio corre con 512 MB: sin este
// tope, varias subidas simultáneas podían sumar lo suficiente para que el
// contenedor muriera por memoria. La que espera, espera; no falla.
var procesando = make(chan struct{}, 2)

var (
	ErrImagenInvalida        = errors.New("no se pudo leer la imagen")
	ErrImagenDemasiadoGrande = errors.New("la imagen tiene demasiados píxeles")
	// ErrSinCodificadorWebP — la plataforma no puede generar variantes (ver
	// codificador_webp_386.go). La imagen es válida: quien llama guarda el
	// original tal cual.
	ErrSinCodificadorWebP = errors.New("esta plataforma no tiene codificador WebP")
)

// Variante — una de las versiones ya codificadas en WebP.
type Variante struct {
	// Ancho es el NOMINAL (uno de Anchos), el que va en el nombre del
	// archivo. Una foto más angosta que 480 px genera una sola variante, sin
	// agrandarla, con el nombre de 480: el `srcset` la describe como más
	// ancha de lo que es y el navegador simplemente la estira un poco, que
	// es lo mismo que haría con el original.
	Ancho int
	Datos []byte
}

// NombreDeVariante — "<base>.w<ancho>.webp". El frontend reconoce una foto
// con variantes por este patrón (y arma las demás cambiando el ancho), así
// que es un contrato, no un detalle.
func NombreDeVariante(base string, ancho int) string {
	return fmt.Sprintf("%s.w%d.webp", base, ancho)
}

// GenerarVariantes decodifica la foto (JPEG, PNG o WebP), la endereza según
// su orientación EXIF y devuelve una variante por cada ancho de Anchos que
// no la agrande, de la más chica a la más grande. Siempre al menos una.
func GenerarVariantes(datos []byte) ([]Variante, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(datos))
	if err != nil {
		return nil, ErrImagenInvalida
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return nil, ErrImagenInvalida
	}
	if int64(cfg.Width)*int64(cfg.Height) > maxPixeles {
		return nil, ErrImagenDemasiadoGrande
	}
	if !HayCodificadorWebP {
		return nil, ErrSinCodificadorWebP
	}

	procesando <- struct{}{}
	defer func() { <-procesando }()

	original, _, err := image.Decode(bytes.NewReader(datos))
	if err != nil {
		return nil, ErrImagenInvalida
	}
	orientacion := orientacionJPEG(datos)
	// El ancho que se ve (y al que apuntan las variantes) es el de la foto
	// YA enderezada: las orientaciones 5 a 8 la giran 90°.
	anchoVisible, altoVisible := cfg.Width, cfg.Height
	if orientacion >= 5 {
		anchoVisible, altoVisible = altoVisible, anchoVisible
	}

	anchos := anchosPara(anchoVisible)
	variantes := make([]Variante, 0, len(anchos))
	// De la más grande a la más chica: cada una sale de la anterior, no del
	// original — escalar 12 MP a 480 px de una sola vez es mucho más lento y
	// no se ve mejor.
	fuente := original
	for i := len(anchos) - 1; i >= 0; i-- {
		nominal := anchos[i]
		destinoAncho := min(nominal, anchoVisible)
		destinoAlto := max(1, altoVisible*destinoAncho/anchoVisible)
		escalada := escalar(fuente, orientacion, destinoAncho, destinoAlto)
		var buf bytes.Buffer
		if err := codificarWebP(&buf, escalada); err != nil {
			return nil, fmt.Errorf("no se pudo codificar la variante de %d px: %w", nominal, err)
		}
		variantes = append(variantes, Variante{Ancho: nominal, Datos: buf.Bytes()})
		// Ya enderezada: la próxima vuelta no tiene que volver a rotarla.
		fuente, orientacion = escalada, 1
	}
	// Se armaron de mayor a menor; se devuelven de menor a mayor.
	for i, j := 0, len(variantes)-1; i < j; i, j = i+1, j-1 {
		variantes[i], variantes[j] = variantes[j], variantes[i]
	}
	return variantes, nil
}

// anchosPara — los anchos de Anchos que no agrandan la foto, más el más
// chico siempre (una foto de 300 px igual tiene que tener su variante).
func anchosPara(anchoVisible int) []int {
	out := []int{Anchos[0]}
	for _, a := range Anchos[1:] {
		if a <= anchoVisible {
			out = append(out, a)
		}
	}
	return out
}

// escalar lleva `src` a ancho × alto (medidas YA enderezadas) y aplica la
// orientación EXIF. Primero se escala en la orientación original y después
// se gira: girar una imagen chica es barato, girar los 12 MP del original no.
func escalar(src image.Image, orientacion, ancho, alto int) *image.NRGBA {
	sw, sh := ancho, alto
	if orientacion >= 5 {
		sw, sh = alto, ancho
	}
	escalada := image.NewNRGBA(image.Rect(0, 0, sw, sh))
	if src.Bounds().Dx() == sw && src.Bounds().Dy() == sh {
		draw.Draw(escalada, escalada.Bounds(), src, src.Bounds().Min, draw.Src)
	} else {
		xdraw.CatmullRom.Scale(escalada, escalada.Bounds(), src, src.Bounds(), xdraw.Src, nil)
	}
	return orientar(escalada, orientacion)
}
