package security

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// tokenBytes: 32 bytes de CSPRNG (spec §7) para cualquier token opaco de un
// solo uso (verificación de mail, reset de password, sesión).
const tokenBytes = 32

// NewToken genera un token opaco de 32 bytes CSPRNG codificado en
// base64url — es lo único que viaja al cliente (link de mail, cookie de
// sesión). Devuelve también su hash SHA-256 en hex, que es lo único que se
// persiste en base de datos (spec §7: "en base de datos se guarda solo el
// hash, nunca el token en claro").
func NewToken() (rawToken, tokenHash string, err error) {
	buf := make([]byte, tokenBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("no se pudo generar el token: %w", err)
	}
	rawToken = base64.RawURLEncoding.EncodeToString(buf)
	return rawToken, HashToken(rawToken), nil
}

// HashToken calcula el hash SHA-256 (hex) de un token en claro — usado
// tanto al emitir un token nuevo como al validar uno recibido del cliente
// (se rehashea el valor recibido y se compara contra el hash guardado, en
// vez de comparar el token en claro).
func HashToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(sum[:])
}
