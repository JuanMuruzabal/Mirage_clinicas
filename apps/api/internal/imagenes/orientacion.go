package imagenes

import (
	"encoding/binary"
	"image"
)

// orientacionJPEG lee la etiqueta Orientation (0x0112) del bloque EXIF de un
// JPEG, sin librería: es lo único que hace falta del EXIF, y el resto (GPS
// incluido) se descarta a propósito al re-codificar. Devuelve 1 (sin
// cambios) ante cualquier cosa que no entienda: un EXIF raro nunca puede
// hacer fallar una subida, a lo sumo la foto queda como vino.
func orientacionJPEG(datos []byte) int {
	if len(datos) < 4 || datos[0] != 0xFF || datos[1] != 0xD8 {
		return 1
	}
	i := 2
	for i+4 <= len(datos) {
		if datos[i] != 0xFF {
			return 1
		}
		marcador := datos[i+1]
		// SOS (empiezan los datos de la imagen) o EOI: el EXIF va antes.
		if marcador == 0xDA || marcador == 0xD9 {
			return 1
		}
		largo := int(binary.BigEndian.Uint16(datos[i+2:]))
		if largo < 2 || i+2+largo > len(datos) {
			return 1
		}
		if marcador == 0xE1 {
			if o := orientacionDeExif(datos[i+4 : i+2+largo]); o != 0 {
				return o
			}
		}
		i += 2 + largo
	}
	return 1
}

// orientacionDeExif — 0 si el segmento APP1 no es EXIF o no trae la etiqueta.
func orientacionDeExif(seg []byte) int {
	if len(seg) < 14 || string(seg[:6]) != "Exif\x00\x00" {
		return 0
	}
	tiff := seg[6:]
	var orden binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		orden = binary.LittleEndian
	case "MM":
		orden = binary.BigEndian
	default:
		return 0
	}
	ifd := int(orden.Uint32(tiff[4:8]))
	if ifd < 8 || ifd+2 > len(tiff) {
		return 0
	}
	entradas := int(orden.Uint16(tiff[ifd:]))
	for k := range entradas {
		e := ifd + 2 + k*12
		if e+12 > len(tiff) {
			return 0
		}
		if orden.Uint16(tiff[e:]) == 0x0112 {
			o := int(orden.Uint16(tiff[e+8:]))
			if o >= 1 && o <= 8 {
				return o
			}
			return 0
		}
	}
	return 0
}

// orientar aplica una orientación EXIF (1-8) a los píxeles: el resultado se
// ve derecho sin que nadie tenga que leer la etiqueta. Las 5 a 8 transponen
// ancho y alto.
func orientar(src *image.NRGBA, orientacion int) *image.NRGBA {
	if orientacion <= 1 || orientacion > 8 {
		return src
	}
	sw, sh := src.Bounds().Dx(), src.Bounds().Dy()
	dw, dh := sw, sh
	if orientacion >= 5 {
		dw, dh = sh, sw
	}
	// origen(dx, dy) → el píxel de src que va en (dx, dy) de la imagen derecha.
	var origen func(dx, dy int) (int, int)
	switch orientacion {
	case 2: // espejo horizontal
		origen = func(dx, dy int) (int, int) { return sw - 1 - dx, dy }
	case 3: // 180°
		origen = func(dx, dy int) (int, int) { return sw - 1 - dx, sh - 1 - dy }
	case 4: // espejo vertical
		origen = func(dx, dy int) (int, int) { return dx, sh - 1 - dy }
	case 5: // transpuesta
		origen = func(dx, dy int) (int, int) { return dy, dx }
	case 6: // 90° en sentido horario
		origen = func(dx, dy int) (int, int) { return dy, sh - 1 - dx }
	case 7: // transversa
		origen = func(dx, dy int) (int, int) { return sw - 1 - dy, sh - 1 - dx }
	case 8: // 90° en sentido antihorario
		origen = func(dx, dy int) (int, int) { return sw - 1 - dy, dx }
	}
	dst := image.NewNRGBA(image.Rect(0, 0, dw, dh))
	for dy := range dh {
		for dx := range dw {
			sx, sy := origen(dx, dy)
			si := src.PixOffset(sx+src.Rect.Min.X, sy+src.Rect.Min.Y)
			di := dst.PixOffset(dx, dy)
			copy(dst.Pix[di:di+4], src.Pix[si:si+4])
		}
	}
	return dst
}
