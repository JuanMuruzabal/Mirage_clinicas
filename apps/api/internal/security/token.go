package security

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"math/big"
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

// NewNumericCode genera un código numérico de `digits` cifras (con ceros a
// la izquierda si hace falta) usando crypto/rand — pedido explícito del
// cliente (2026-08-26, TR-055 en docs/tradeoffs.md): un código corto que
// se escribe a mano en vez de un link que se clickea. Un código de 6
// cifras tiene mucha menos entropía que NewToken (10^6 vs. 2^256) — nunca
// usar esto para sesiones ni nada que no tenga, además, un límite de
// intentos por cuenta acotado (ver ratelimit.LimitConfirmCodePerAccount).
// Mismo criterio que NewToken: solo se persiste el hash, nunca el código
// en claro.
func NewNumericCode(digits int) (code, codeHash string, err error) {
	max := int64(1)
	for range digits {
		max *= 10
	}
	n, err := rand.Int(rand.Reader, big.NewInt(max))
	if err != nil {
		return "", "", fmt.Errorf("no se pudo generar el código: %w", err)
	}
	code = fmt.Sprintf("%0*d", digits, n.Int64())
	return code, HashToken(code), nil
}

// HashToken calcula el hash SHA-256 (hex) de un token en claro — usado
// tanto al emitir un token nuevo como al validar uno recibido del cliente
// (se rehashea el valor recibido y se compara contra el hash guardado, en
// vez de comparar el token en claro).
func HashToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(sum[:])
}
