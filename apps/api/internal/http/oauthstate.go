package http

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"time"
)

// El flujo de Google es popup + Authorization Code (decisión #1 del plan
// aprobado, mismo patrón ya validado en Marcuzzi_Madryn) — no hay una
// Route Handler de callback que necesite un redirect_uri en allowlist,
// así que PKCE no aplica (client confidencial, el secret nunca sale del
// backend). Lo que sí se implementa, tal como pide spec §7, es un `state`
// firmado y verificado: signState emite un valor que el frontend pasa a
// Google como `state` en initCodeClient, y verifyState confirma que lo
// que volvió no fue alterado ni es viejo (ventana de 10 minutos, suficiente
// para completar el popup sin abrir una ventana de replay grande).
const stateTTL = 10 * time.Minute

// signState genera 16 bytes CSPRNG + un timestamp, firmados con HMAC-SHA256
// sobre stateSecret — todo codificado en un único string base64url.
func signState(stateSecret string) (string, error) {
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ts := make([]byte, 8)
	binary.BigEndian.PutUint64(ts, uint64(time.Now().Unix()))

	payload := append(nonce, ts...)
	mac := hmac.New(sha256.New, []byte(stateSecret))
	mac.Write(payload)
	sig := mac.Sum(nil)

	return base64.RawURLEncoding.EncodeToString(append(payload, sig...)), nil
}

// verifyState recalcula la firma y rechaza states viejos (más de 10
// minutos) — mitiga replay sin necesitar guardar estado en el servidor
// (el propio timestamp firmado hace de expiración autocontenida).
func verifyState(stateSecret, state string) error {
	raw, err := base64.RawURLEncoding.DecodeString(state)
	if err != nil {
		return errors.New("state con formato inválido")
	}
	// 16 bytes nonce + 8 bytes timestamp + 32 bytes de firma HMAC-SHA256.
	if len(raw) != 16+8+32 {
		return errors.New("state con longitud inválida")
	}
	payload, sig := raw[:24], raw[24:]

	mac := hmac.New(sha256.New, []byte(stateSecret))
	mac.Write(payload)
	expected := mac.Sum(nil)
	if subtle.ConstantTimeCompare(sig, expected) != 1 {
		return errors.New("firma de state inválida")
	}

	ts := int64(binary.BigEndian.Uint64(payload[16:24]))
	issuedAt := time.Unix(ts, 0)
	if time.Since(issuedAt) > stateTTL {
		return errors.New("state vencido")
	}
	return nil
}
