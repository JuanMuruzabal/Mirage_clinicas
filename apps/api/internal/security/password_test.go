package security_test

import (
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"dental-mirage/api/internal/security"
)

func TestHashAndVerify_Argon2id_RoundTrip(t *testing.T) {
	hash, err := security.Hash("una-contraseña-larga-de-verdad")
	if err != nil {
		t.Fatalf("Hash error inesperado: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatalf("el hash no tiene el prefijo esperado: %q", hash)
	}

	ok, err := security.Verify("una-contraseña-larga-de-verdad", hash)
	if err != nil {
		t.Fatalf("Verify error inesperado: %v", err)
	}
	if !ok {
		t.Error("Verify debería aceptar la contraseña correcta")
	}

	ok, err = security.Verify("otra-contraseña", hash)
	if err != nil {
		t.Fatalf("Verify error inesperado: %v", err)
	}
	if ok {
		t.Error("Verify no debería aceptar una contraseña incorrecta")
	}
}

func TestVerify_ReconoceBcryptLegacy(t *testing.T) {
	legacyHash, err := bcrypt.GenerateFromPassword([]byte("password-legacy"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("no se pudo generar el hash bcrypt de prueba: %v", err)
	}

	ok, err := security.Verify("password-legacy", string(legacyHash))
	if err != nil {
		t.Fatalf("Verify error inesperado sobre hash bcrypt: %v", err)
	}
	if !ok {
		t.Error("Verify debería seguir validando hashes bcrypt legacy (usuarios migrados)")
	}

	ok, err = security.Verify("password-incorrecta", string(legacyHash))
	if err != nil {
		t.Fatalf("Verify error inesperado: %v", err)
	}
	if ok {
		t.Error("Verify no debería aceptar una contraseña incorrecta contra un hash bcrypt")
	}
}

func TestNeedsRehash(t *testing.T) {
	argon2Hash, err := security.Hash("x")
	if err != nil {
		t.Fatalf("Hash error inesperado: %v", err)
	}
	if security.NeedsRehash(argon2Hash) {
		t.Error("un hash argon2id recién generado no debería necesitar rehash")
	}

	bcryptHash, err := bcrypt.GenerateFromPassword([]byte("x"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("no se pudo generar el hash bcrypt de prueba: %v", err)
	}
	if !security.NeedsRehash(string(bcryptHash)) {
		t.Error("un hash bcrypt legacy debería marcarse para rehash")
	}
}

func TestVerify_HashConFormatoDesconocidoFalla(t *testing.T) {
	_, err := security.Verify("x", "no-es-un-hash-valido")
	if err == nil {
		t.Error("Verify debería devolver error ante un formato de hash desconocido")
	}
}

func TestNewTokenAndHashToken(t *testing.T) {
	raw1, hash1, err := security.NewToken()
	if err != nil {
		t.Fatalf("NewToken error inesperado: %v", err)
	}
	raw2, hash2, err := security.NewToken()
	if err != nil {
		t.Fatalf("NewToken error inesperado: %v", err)
	}

	if raw1 == raw2 {
		t.Error("dos tokens generados no deberían coincidir")
	}
	if hash1 == hash2 {
		t.Error("dos hashes de tokens distintos no deberían coincidir")
	}
	if security.HashToken(raw1) != hash1 {
		t.Error("HashToken debería ser determinístico y coincidir con el hash devuelto por NewToken")
	}
	if !security.ConstantTimeEquals(hash1, security.HashToken(raw1)) {
		t.Error("ConstantTimeEquals debería confirmar la igualdad de dos hashes iguales")
	}
	if security.ConstantTimeEquals(hash1, hash2) {
		t.Error("ConstantTimeEquals no debería confirmar la igualdad de dos hashes distintos")
	}
}
