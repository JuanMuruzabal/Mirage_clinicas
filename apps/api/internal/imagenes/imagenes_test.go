package imagenes

import (
	"bytes"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"

	"golang.org/x/image/webp"
)

func pngDePrueba(t *testing.T, ancho, alto int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, ancho, alto))
	for y := range alto {
		for x := range ancho {
			img.Set(x, y, color.NRGBA{R: uint8(x), G: uint8(y), B: 120, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// sinCodificador — en Go windows/386 no se generan variantes (ver
// codificador_webp_386.go); CI y producción son linux/amd64.
func sinCodificador(t *testing.T) {
	t.Helper()
	if !HayCodificadorWebP {
		t.Skip("esta plataforma no tiene codificador WebP")
	}
}

func TestGenerarVariantes_TresAnchosSinAgrandar(t *testing.T) {
	sinCodificador(t)
	variantes, err := GenerarVariantes(pngDePrueba(t, 2000, 1000))
	if err != nil {
		t.Fatalf("GenerarVariantes: %v", err)
	}
	if len(variantes) != 3 {
		t.Fatalf("variantes = %d, esperaba 3", len(variantes))
	}
	for i, esperado := range []int{480, 960, 1600} {
		v := variantes[i]
		if v.Ancho != esperado {
			t.Errorf("variante %d: ancho nominal %d, esperaba %d", i, v.Ancho, esperado)
		}
		cfg, err := webp.DecodeConfig(bytes.NewReader(v.Datos))
		if err != nil {
			t.Fatalf("la variante de %d no es un WebP válido: %v", esperado, err)
		}
		if cfg.Width != esperado || cfg.Height != esperado/2 {
			t.Errorf("variante de %d mide %dx%d, esperaba %dx%d", esperado, cfg.Width, cfg.Height, esperado, esperado/2)
		}
	}
}

func TestGenerarVariantes_FotoChicaUnaSolaVarianteSinAgrandar(t *testing.T) {
	sinCodificador(t)
	variantes, err := GenerarVariantes(pngDePrueba(t, 300, 200))
	if err != nil {
		t.Fatalf("GenerarVariantes: %v", err)
	}
	if len(variantes) != 1 || variantes[0].Ancho != 480 {
		t.Fatalf("variantes = %+v, esperaba una sola, nominal 480", variantes)
	}
	cfg, err := webp.DecodeConfig(bytes.NewReader(variantes[0].Datos))
	if err != nil || cfg.Width != 300 || cfg.Height != 200 {
		t.Errorf("la variante mide %dx%d (err %v), esperaba 300x200 sin agrandar", cfg.Width, cfg.Height, err)
	}
}

func TestGenerarVariantes_RechazaLoQueNoEsImagen(t *testing.T) {
	if _, err := GenerarVariantes([]byte("no soy una imagen")); !errors.Is(err, ErrImagenInvalida) {
		t.Errorf("err = %v, esperaba ErrImagenInvalida", err)
	}
}

// Un PNG que DECLARA 6.000 × 6.000 píxeles (36 MP) no se decodifica: se rechaza
// mirando solo la cabecera, antes de reservar la memoria.
func TestGenerarVariantes_RechazaBombaDeDescompresion(t *testing.T) {
	datos := pngDePrueba(t, 1, 1)
	// IHDR arranca en el byte 8 (después de la firma): largo(4) + "IHDR"(4) + ancho(4) + alto(4)...
	binary.BigEndian.PutUint32(datos[16:], 6000)
	binary.BigEndian.PutUint32(datos[20:], 6000)
	binary.BigEndian.PutUint32(datos[29:], crc32.ChecksumIEEE(datos[12:29]))
	if _, err := GenerarVariantes(datos); !errors.Is(err, ErrImagenDemasiadoGrande) {
		t.Errorf("err = %v, esperaba ErrImagenDemasiadoGrande", err)
	}
}

// jpegConOrientacion — mitad izquierda roja, mitad derecha azul, con un APP1
// EXIF que dice "girar 90° en sentido horario" (orientación 6), como lo
// guarda un celular sostenido vertical.
func jpegConOrientacion(t *testing.T, orientacion uint16) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 40, 20))
	for y := range 20 {
		for x := range 40 {
			c := color.RGBA{R: 220, A: 255}
			if x >= 20 {
				c = color.RGBA{B: 220, A: 255}
			}
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	// TIFF little-endian con un solo IFD de una entrada: Orientation (SHORT).
	tiff := []byte{'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0}
	entrada := make([]byte, 12)
	binary.LittleEndian.PutUint16(entrada[0:], 0x0112)
	binary.LittleEndian.PutUint16(entrada[2:], 3)
	binary.LittleEndian.PutUint32(entrada[4:], 1)
	binary.LittleEndian.PutUint16(entrada[8:], orientacion)
	tiff = append(tiff, entrada...)
	tiff = append(tiff, 0, 0, 0, 0)
	app1 := append([]byte("Exif\x00\x00"), tiff...)
	segmento := []byte{0xFF, 0xE1, 0, 0}
	binary.BigEndian.PutUint16(segmento[2:], uint16(len(app1)+2))
	segmento = append(segmento, app1...)

	original := buf.Bytes()
	out := append([]byte{}, original[:2]...)
	out = append(out, segmento...)
	return append(out, original[2:]...)
}

func TestGenerarVariantes_EnderezaSegunEXIF(t *testing.T) {
	sinCodificador(t)
	datos := jpegConOrientacion(t, 6)
	variantes, err := GenerarVariantes(datos)
	if err != nil {
		t.Fatalf("GenerarVariantes: %v", err)
	}
	img, err := webp.Decode(bytes.NewReader(variantes[0].Datos))
	if err != nil {
		t.Fatal(err)
	}
	if img.Bounds().Dx() != 20 || img.Bounds().Dy() != 40 {
		t.Fatalf("mide %v, esperaba 20x40 (girada)", img.Bounds().Size())
	}
	// Girada 90° en sentido horario, la mitad izquierda (roja) queda arriba.
	arriba := color.NRGBAModel.Convert(img.At(10, 5)).(color.NRGBA)
	abajo := color.NRGBAModel.Convert(img.At(10, 35)).(color.NRGBA)
	if arriba.R < 150 || arriba.B > 100 {
		t.Errorf("arriba = %+v, esperaba rojo", arriba)
	}
	if abajo.B < 150 || abajo.R > 100 {
		t.Errorf("abajo = %+v, esperaba azul", abajo)
	}
}

func TestOrientacionJPEG_LeeLaEtiqueta(t *testing.T) {
	if o := orientacionJPEG(jpegConOrientacion(t, 6)); o != 6 {
		t.Errorf("orientacionJPEG = %d, esperaba 6", o)
	}
}

func TestGenerarVariantes_SinCodificadorLoDice(t *testing.T) {
	if HayCodificadorWebP {
		t.Skip("solo aplica a windows/386")
	}
	if _, err := GenerarVariantes(pngDePrueba(t, 10, 10)); !errors.Is(err, ErrSinCodificadorWebP) {
		t.Errorf("err = %v, esperaba ErrSinCodificadorWebP", err)
	}
}

func TestOrientacionJPEG_SinExifOBasura(t *testing.T) {
	for nombre, datos := range map[string][]byte{
		"vacío":      nil,
		"no es jpeg": []byte("hola"),
		"jpeg sin exif": func() []byte {
			var buf bytes.Buffer
			_ = jpeg.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil)
			return buf.Bytes()
		}(),
		"segmento cortado": {0xFF, 0xD8, 0xFF, 0xE1, 0xFF, 0xFF},
	} {
		if o := orientacionJPEG(datos); o != 1 {
			t.Errorf("%s: orientacion = %d, esperaba 1", nombre, o)
		}
	}
}

// Dónde termina el píxel de arriba a la izquierda (el único marcado) en cada
// orientación EXIF, sobre una imagen de 3 × 2.
func TestOrientar_CadaCaso(t *testing.T) {
	esperado := map[int]image.Point{
		1: {0, 0}, 2: {2, 0}, 3: {2, 1}, 4: {0, 1},
		5: {0, 0}, 6: {1, 0}, 7: {1, 2}, 8: {0, 2},
	}
	for orientacion, punto := range esperado {
		src := image.NewNRGBA(image.Rect(0, 0, 3, 2))
		src.Set(0, 0, color.NRGBA{R: 255, A: 255})
		dst := orientar(src, orientacion)
		if orientacion >= 5 && dst.Bounds().Size() != (image.Point{X: 2, Y: 3}) {
			t.Errorf("orientación %d: mide %v, esperaba 2x3", orientacion, dst.Bounds().Size())
		}
		if got := dst.NRGBAAt(punto.X, punto.Y); got.R != 255 {
			t.Errorf("orientación %d: el píxel marcado no está en %v", orientacion, punto)
		}
	}
}

func TestNombreDeVariante(t *testing.T) {
	if got := NombreDeVariante("abc_-1", 960); got != "abc_-1.w960.webp" {
		t.Errorf("NombreDeVariante = %q", got)
	}
}
