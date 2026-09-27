package push

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
)

// Cifrado del mensaje de un aviso (RFC 8291, "Message Encryption for Web
// Push", sobre el formato aes128gcm de RFC 8188).
//
// El servicio de push del navegador (el de Google, el de Apple, el de
// Mozilla) NO puede leer el aviso: el contenido va cifrado con claves que
// generó el navegador del usuario (`p256dh` + `auth`, las que guarda
// push_suscripciones). Por eso no es opcional ni un detalle — sin esto los
// servicios de push rechazan el mensaje.
//
// Implementado con la biblioteca estándar en vez de una dependencia de Web
// Push: la que hay para Go trae una librería de JWT, que el proyecto sacó a
// propósito (TR-125), y lo que hace falta es chico y está especificado paso
// a paso. `cifrado_test.go` lo verifica contra el vector de prueba del
// Apéndice A del RFC, byte por byte.

const tamanioDeRegistro = 4096

// cifrarMensaje arma el cuerpo completo del pedido al servicio de push:
// encabezado (salt, tamaño de registro, clave pública del servidor) +
// el registro cifrado. `asPrivada` y `salt` son parámetros para que el test
// pueda usar los del RFC; en uso normal salen de nuevosParametros.
func cifrarMensaje(mensaje, uaPublica, secretoAuth, salt []byte, asPrivada *ecdh.PrivateKey) ([]byte, error) {
	if len(salt) != 16 {
		return nil, errors.New("push: el salt tiene que tener 16 bytes")
	}
	if len(secretoAuth) != 16 {
		return nil, errors.New("push: el secreto de autenticación tiene que tener 16 bytes")
	}
	clavePublicaUA, err := ecdh.P256().NewPublicKey(uaPublica)
	if err != nil {
		return nil, fmt.Errorf("push: clave pública del navegador inválida: %w", err)
	}
	secretoCompartido, err := asPrivada.ECDH(clavePublicaUA)
	if err != nil {
		return nil, fmt.Errorf("push: ECDH: %w", err)
	}
	asPublica := asPrivada.PublicKey().Bytes()

	// RFC 8291 §3.3 y §3.4.
	prkKey := hmacSHA256(secretoAuth, secretoCompartido)
	keyInfo := append(append([]byte("WebPush: info\x00"), uaPublica...), asPublica...)
	ikm := hmacSHA256(prkKey, append(keyInfo, 0x01))
	prk := hmacSHA256(salt, ikm)
	cek := hmacSHA256(prk, []byte("Content-Encoding: aes128gcm\x00\x01"))[:16]
	nonce := hmacSHA256(prk, []byte("Content-Encoding: nonce\x00\x01"))[:12]

	// Un solo registro: el mensaje + el delimitador de último registro
	// (0x02, RFC 8188 §2). Un aviso nunca se acerca a los 4096 bytes.
	registro := append(append([]byte{}, mensaje...), 0x02)
	if len(registro)+16 > tamanioDeRegistro {
		return nil, errors.New("push: el mensaje es demasiado largo para un aviso")
	}
	bloque, err := aes.NewCipher(cek)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(bloque)
	if err != nil {
		return nil, err
	}
	cifrado := gcm.Seal(nil, nonce, registro, nil)

	encabezado := make([]byte, 0, 16+4+1+len(asPublica))
	encabezado = append(encabezado, salt...)
	encabezado = binary.BigEndian.AppendUint32(encabezado, tamanioDeRegistro)
	encabezado = append(encabezado, byte(len(asPublica)))
	encabezado = append(encabezado, asPublica...)
	return append(encabezado, cifrado...), nil
}

// nuevosParametros — una clave efímera y un salt NUEVOS por mensaje, como
// pide el RFC: reutilizarlos dejaría relacionar dos avisos entre sí.
func nuevosParametros() (*ecdh.PrivateKey, []byte, error) {
	clave, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, nil, err
	}
	return clave, salt, nil
}

func hmacSHA256(clave, datos []byte) []byte {
	m := hmac.New(sha256.New, clave)
	m.Write(datos)
	return m.Sum(nil)
}
