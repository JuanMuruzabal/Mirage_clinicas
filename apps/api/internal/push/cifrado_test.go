package push

import (
	"bytes"
	"crypto/ecdh"
	"encoding/base64"
	"testing"
)

// El vector de prueba del Apéndice A de RFC 8291, copiado del RFC. Si el
// cifrado se aparta un solo byte de la especificación, los servicios de
// push rechazan el aviso sin decir por qué: este test es la única forma de
// saberlo antes de un deploy.
func TestCifrarMensaje_VectorDelRFC8291(t *testing.T) {
	b64 := func(s string) []byte {
		t.Helper()
		v, err := base64.RawURLEncoding.DecodeString(s)
		if err != nil {
			t.Fatalf("base64 inválido %q: %v", s, err)
		}
		return v
	}

	mensaje := b64("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24")
	asPrivadaBytes := b64("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw")
	asPublica := b64("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8")
	uaPublica := b64("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4")
	salt := b64("DGv6ra1nlYgDCS1FRnbzlw")
	auth := b64("BTBZMqHH6r4Tts7J_aSIgg")
	// El cuerpo completo, tal como figura en la sección 5 del RFC (tres
	// líneas unidas): es el mensaje que un servicio de push recibe.
	cuerpoEsperado := b64("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
		"mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
		"pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN")

	asPrivada, err := ecdh.P256().NewPrivateKey(asPrivadaBytes)
	if err != nil {
		t.Fatalf("clave privada del RFC: %v", err)
	}
	if !bytes.Equal(asPrivada.PublicKey().Bytes(), asPublica) {
		t.Fatal("la clave pública derivada no coincide con la del RFC")
	}

	cuerpo, err := cifrarMensaje(mensaje, uaPublica, auth, salt, asPrivada)
	if err != nil {
		t.Fatalf("cifrarMensaje: %v", err)
	}
	if !bytes.Equal(cuerpo, cuerpoEsperado) {
		t.Errorf("el cuerpo cifrado no coincide con el del RFC\n obtenido: %s\n esperado: %s",
			base64.RawURLEncoding.EncodeToString(cuerpo), base64.RawURLEncoding.EncodeToString(cuerpoEsperado))
	}
}

func TestCifrarMensaje_RechazaParametrosInvalidos(t *testing.T) {
	clave, salt, err := nuevosParametros()
	if err != nil {
		t.Fatal(err)
	}
	ua, _, _ := nuevosParametros()
	uaPublica := ua.PublicKey().Bytes()
	auth := make([]byte, 16)

	if _, err := cifrarMensaje([]byte("hola"), uaPublica, auth, salt[:8], clave); err == nil {
		t.Error("un salt corto tendría que fallar")
	}
	if _, err := cifrarMensaje([]byte("hola"), uaPublica, auth[:4], salt, clave); err == nil {
		t.Error("un secreto de autenticación corto tendría que fallar")
	}
	if _, err := cifrarMensaje([]byte("hola"), []byte("no es una clave"), auth, salt, clave); err == nil {
		t.Error("una clave pública inválida tendría que fallar")
	}
	if _, err := cifrarMensaje(bytes.Repeat([]byte("x"), 5000), uaPublica, auth, salt, clave); err == nil {
		t.Error("un mensaje de más de un registro tendría que fallar")
	}
}
