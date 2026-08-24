package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func TestGenerateAndParseToken_RoundTrip(t *testing.T) {
	id := uuid.New()
	token, err := GenerateToken("un-secret", id)
	if err != nil {
		t.Fatalf("GenerateToken error inesperado: %v", err)
	}

	claims, err := ParseToken("un-secret", token)
	if err != nil {
		t.Fatalf("ParseToken error inesperado: %v", err)
	}
	if claims.Subject != id.String() {
		t.Errorf("Subject = %q, esperaba %q", claims.Subject, id.String())
	}
}

func TestParseToken_FirmaInvalida(t *testing.T) {
	token, err := GenerateToken("secret-correcto", uuid.New())
	if err != nil {
		t.Fatalf("GenerateToken error inesperado: %v", err)
	}
	if _, err := ParseToken("otro-secret", token); err == nil {
		t.Error("ParseToken con secret distinto debería fallar")
	}
}

func TestParseToken_Expirado(t *testing.T) {
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   uuid.New().String(),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * tokenTTL)),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte("un-secret"))
	if err != nil {
		t.Fatalf("no se pudo firmar el token de prueba: %v", err)
	}

	if _, err := ParseToken("un-secret", signed); err == nil {
		t.Error("ParseToken con un token expirado debería fallar")
	}
}

func TestParseToken_TokenMalformado(t *testing.T) {
	if _, err := ParseToken("un-secret", "esto-no-es-un-jwt"); err == nil {
		t.Error("ParseToken con un string que no es un JWT debería fallar")
	}
}
