//go:build windows && 386

package imagenes

import (
	"image"
	"io"

	// Solo el decoder (Go puro): una foto WebP igual se valida al subir.
	_ "golang.org/x/image/webp"
)

// HayCodificadorWebP es false SOLO en Go windows/386. El codificador
// (github.com/gen2brain/webp) intenta cargar libwebp del sistema con purego
// en un init, y purego entra en pánico en esa plataforma ("compileCallback:
// argument size is larger than uintptr") — el proceso ni arranca. Es un
// toolchain de desarrollo (una máquina de 64 bits con el Go de 32 instalado),
// no un entorno real: Render, Docker y CI son linux/amd64. Ahí la subida
// vuelve al comportamiento de antes de PE-9 (guarda el original, sin
// variantes) en vez de tumbar la API.
const HayCodificadorWebP = false

func codificarWebP(io.Writer, image.Image) error { return ErrSinCodificadorWebP }
