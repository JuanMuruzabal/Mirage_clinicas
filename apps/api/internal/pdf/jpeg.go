package pdf

import (
	"errors"
	"fmt"
)

// medidasDelJPEG — el ancho, el alto y el espacio de color de un JPEG,
// leídos de su marcador SOF, sin decodificar la imagen: el PDF lleva los
// bytes tal cual (DCTDecode) y solo necesita saber esto.
func medidasDelJPEG(datos []byte) (ancho, alto int, espacio string, err error) {
	if len(datos) < 4 || datos[0] != 0xFF || datos[1] != 0xD8 {
		return 0, 0, "", errors.New("pdf: la imagen no es un JPEG")
	}
	i := 2
	for i+4 <= len(datos) {
		if datos[i] != 0xFF {
			return 0, 0, "", errors.New("pdf: JPEG mal formado")
		}
		marcador := datos[i+1]
		// Relleno entre marcadores y marcadores sin segmento.
		if marcador == 0xFF {
			i++
			continue
		}
		if marcador == 0x01 || (marcador >= 0xD0 && marcador <= 0xD7) {
			i += 2
			continue
		}
		if marcador == 0xD9 || marcador == 0xDA {
			break
		}
		largo := int(datos[i+2])<<8 | int(datos[i+3])
		if largo < 2 || i+2+largo > len(datos) {
			return 0, 0, "", errors.New("pdf: JPEG mal formado")
		}
		// SOF0 a SOF15, menos DHT (C4), JPG (C8) y DAC (CC).
		if marcador >= 0xC0 && marcador <= 0xCF && marcador != 0xC4 && marcador != 0xC8 && marcador != 0xCC {
			if largo < 8 {
				return 0, 0, "", errors.New("pdf: JPEG mal formado")
			}
			segmento := datos[i+4:]
			if segmento[0] != 8 {
				return 0, 0, "", fmt.Errorf("pdf: JPEG de %d bits por componente: solo se admiten 8", segmento[0])
			}
			alto = int(segmento[1])<<8 | int(segmento[2])
			ancho = int(segmento[3])<<8 | int(segmento[4])
			switch segmento[5] {
			case 1:
				espacio = "DeviceGray"
			case 3:
				espacio = "DeviceRGB"
			default:
				return 0, 0, "", fmt.Errorf("pdf: JPEG de %d componentes: solo se admiten gris y RGB", segmento[5])
			}
			if ancho == 0 || alto == 0 {
				return 0, 0, "", errors.New("pdf: JPEG sin medidas")
			}
			return ancho, alto, espacio, nil
		}
		i += 2 + largo
	}
	return 0, 0, "", errors.New("pdf: el JPEG no tiene marcador SOF")
}
