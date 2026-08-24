// Package auth emite y valida los JWT de sesión emitidos por el backend.
package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// TTL de sesión. Suficiente para el MVP — revisar si hace falta refresh
// token más adelante.
const tokenTTL = 7 * 24 * time.Hour

// Claims son los datos propios que viajan en el JWT, además de los
// registrados estándar (exp, iat, sub). No hay campo Rol: a diferencia de
// Marcuzzi_Madryn (cliente/administrador), Dental Mirage tiene un único
// tipo de cuenta en el MVP — el profesional (spec §2, sin organizaciones,
// ver TR-009 en docs/tradeoffs.md) — así que no hace falta todavía.
type Claims struct {
	jwt.RegisteredClaims
}

// GenerateToken firma un JWT para el profesional dado.
func GenerateToken(secret string, profesionalID uuid.UUID) (string, error) {
	now := time.Now()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   profesionalID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(tokenTTL)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ParseToken valida la firma y expiración de un JWT y devuelve sus claims.
func ParseToken(secret, tokenStr string) (*Claims, error) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("método de firma inesperado")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("token inválido")
	}

	return claims, nil
}
