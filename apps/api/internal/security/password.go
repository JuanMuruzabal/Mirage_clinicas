// Package security centraliza hashing de contraseñas, chequeo contra
// contraseñas filtradas (HaveIBeenPwned) y comparaciones en tiempo
// constante — spec §7 de docs/feature-sumarte-login.md ("módulo central",
// "no librerías de auth/cripto artesanales").
package security

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

// Parámetros de argon2id. Default conservador (OWASP "segunda opción":
// m=19MiB, t=2, p=1) — pensado para no ser pesado en un dyno/instancia
// chica; ajustar según el tier de hosting real (ver docs/tradeoffs.md,
// punto abierto marcado en el plan). Configurables para poder subirlos sin
// tocar el algoritmo de encode/decode.
type Argon2Params struct {
	Memory      uint32 // KiB
	Iterations  uint32
	Parallelism uint8
	SaltLength  uint32
	KeyLength   uint32
}

// DefaultArgon2Params son los parámetros usados por Hash() si no se pasan
// otros explícitos.
var DefaultArgon2Params = Argon2Params{
	Memory:      19 * 1024, // 19 MiB
	Iterations:  2,
	Parallelism: 1,
	SaltLength:  16,
	KeyLength:   32,
}

const argon2idPrefix = "$argon2id$"

// Hash calcula el hash argon2id de una contraseña, codificado en el
// formato PHC estándar (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`) —
// wrapping documentado de la primitiva de golang.org/x/crypto/argon2, no
// una implementación propia del algoritmo.
func Hash(password string) (string, error) {
	return HashWithParams(password, DefaultArgon2Params)
}

// HashWithParams permite pasar parámetros explícitos (tests, o si se
// termina de confirmar un tier de hosting con más memoria disponible).
func HashWithParams(password string, params Argon2Params) (string, error) {
	salt := make([]byte, params.SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("no se pudo generar el salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, params.Iterations, params.Memory, params.Parallelism, params.KeyLength)

	encoded := fmt.Sprintf(
		"%sv=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2idPrefix,
		argon2.Version,
		params.Memory,
		params.Iterations,
		params.Parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	)
	return encoded, nil
}

// Verify compara una contraseña contra un hash existente, reconociendo
// tanto el formato argon2id nuevo como el bcrypt legacy de usuarios
// migrados (internal/db.MigrateProfesionalesToUsers copia el hash bcrypt
// tal cual, sin rehashear) — así ambos siguen autenticando sin fricción.
func Verify(password, encodedHash string) (bool, error) {
	if strings.HasPrefix(encodedHash, argon2idPrefix) {
		return verifyArgon2(password, encodedHash)
	}
	// bcrypt legacy: prefijos $2a$/$2b$/$2y$.
	if strings.HasPrefix(encodedHash, "$2a$") || strings.HasPrefix(encodedHash, "$2b$") || strings.HasPrefix(encodedHash, "$2y$") {
		err := bcrypt.CompareHashAndPassword([]byte(encodedHash), []byte(password))
		if err != nil {
			if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
				return false, nil
			}
			return false, err
		}
		return true, nil
	}
	return false, errors.New("formato de hash de contraseña desconocido")
}

// NeedsRehash indica si un hash válido debería regenerarse a argon2id — es
// el caso de todo hash bcrypt legacy. El caller (login exitoso) es quien
// decide cuándo llamar a Hash() de nuevo y persistir el resultado
// (rehash perezoso, nunca bloquea el login).
func NeedsRehash(encodedHash string) bool {
	return !strings.HasPrefix(encodedHash, argon2idPrefix)
}

func verifyArgon2(password, encodedHash string) (bool, error) {
	parts := strings.Split(encodedHash, "$")
	// ["", "argon2id", "v=19", "m=...,t=...,p=...", "salt", "hash"]
	if len(parts) != 6 {
		return false, errors.New("hash argon2id con formato inválido")
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, fmt.Errorf("no se pudo leer la versión del hash: %w", err)
	}
	if version != argon2.Version {
		return false, errors.New("versión de argon2 no soportada")
	}

	params, err := parseArgon2Params(parts[3])
	if err != nil {
		return false, err
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("no se pudo decodificar el salt: %w", err)
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("no se pudo decodificar el hash: %w", err)
	}

	got := argon2.IDKey([]byte(password), salt, params.Iterations, params.Memory, params.Parallelism, uint32(len(want)))

	// Comparación en tiempo constante (spec §7).
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

func parseArgon2Params(raw string) (Argon2Params, error) {
	var params Argon2Params
	for _, field := range strings.Split(raw, ",") {
		kv := strings.SplitN(field, "=", 2)
		if len(kv) != 2 {
			return params, fmt.Errorf("parámetro de hash inválido: %q", field)
		}
		n, err := strconv.ParseUint(kv[1], 10, 32)
		if err != nil {
			return params, fmt.Errorf("parámetro de hash inválido: %q", field)
		}
		switch kv[0] {
		case "m":
			params.Memory = uint32(n)
		case "t":
			params.Iterations = uint32(n)
		case "p":
			params.Parallelism = uint8(n)
		}
	}
	if params.Memory == 0 || params.Iterations == 0 || params.Parallelism == 0 {
		return params, errors.New("faltan parámetros en el hash")
	}
	return params, nil
}

// ConstantTimeEquals compara dos strings en tiempo constante — para
// comparar tokens en texto plano contra un valor esperado sin exponer
// timing (spec §7: "comparaciones en tiempo constante"). Los tokens que
// esta app guarda en base siempre están hasheados (ver internal/db.Session/
// VerificationToken), así que en la práctica esto compara el hash
// recién calculado contra el hash guardado — igual de válido y evita
// tener que decidir caso por caso.
func ConstantTimeEquals(a, b string) bool {
	// subtle.ConstantTimeCompare ya devuelve 0 sin filtrar timing cuando
	// las longitudes difieren — no hace falta un early-return propio.
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
