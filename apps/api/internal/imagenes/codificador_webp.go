//go:build !(windows && 386)

package imagenes

import (
	"image"
	"io"

	// Registra además el decoder de WebP para image.Decode.
	"github.com/gen2brain/webp"
)

// HayCodificadorWebP — ver codificador_webp_386.go para la única plataforma
// donde es false.
const HayCodificadorWebP = true

func codificarWebP(w io.Writer, m image.Image) error {
	return webp.Encode(w, m, webp.Options{Quality: calidadWebP})
}
