package security

import (
	"encoding/base64"
	"fmt"
	"strings"
	"testing"

	"golang.org/x/crypto/argon2"
)

// TestParseArgon2Params_CadaParametroConElTamanioDeSuCampo — m y t se
// parsean a 32 bits y p a 8: un valor que no entra en su campo es un hash
// inválido, nunca un número truncado en silencio (antes p=256 quedaba en 0
// y p=257 en 1).
func TestParseArgon2Params_CadaParametroConElTamanioDeSuCampo(t *testing.T) {
	validos := map[string]Argon2Params{
		"p=255 (tope de uint8)":      {Memory: 19456, Iterations: 2, Parallelism: 255},
		"m válido":                   {Memory: 65536, Iterations: 3, Parallelism: 1},
		"m=4294967295 (tope uint32)": {Memory: 4294967295, Iterations: 1, Parallelism: 1},
		"t=4294967295 (tope uint32)": {Memory: 19456, Iterations: 4294967295, Parallelism: 1},
		"clave desconocida en rango": {Memory: 19456, Iterations: 2, Parallelism: 1},
	}
	crudos := map[string]string{
		"p=255 (tope de uint8)":      "m=19456,t=2,p=255",
		"m válido":                   "m=65536,t=3,p=1",
		"m=4294967295 (tope uint32)": "m=4294967295,t=1,p=1",
		"t=4294967295 (tope uint32)": "m=19456,t=4294967295,p=1",
		"clave desconocida en rango": "m=19456,t=2,p=1,x=4294967295",
	}
	for nombre, esperado := range validos {
		t.Run(nombre, func(t *testing.T) {
			got, err := parseArgon2Params(crudos[nombre])
			if err != nil {
				t.Fatalf("esperaba válido, dio error: %v", err)
			}
			if got.Memory != esperado.Memory || got.Iterations != esperado.Iterations || got.Parallelism != esperado.Parallelism {
				t.Errorf("parámetros = %+v, esperaba %+v", got, esperado)
			}
		})
	}

	invalidos := map[string]string{
		"p=256 no entra en uint8":            "m=19456,t=2,p=256",
		"p=257 no se trunca a 1":             "m=19456,t=2,p=257",
		"m=4294967296 no entra en uint32":    "m=4294967296,t=2,p=1",
		"t=4294967296 no entra en uint32":    "m=19456,t=4294967296,p=1",
		"clave desconocida fuera de 32 bits": "m=19456,t=2,p=1,x=4294967296",
		"clave desconocida no numérica":      "m=19456,t=2,p=1,x=abc",
		"p negativo":                         "m=19456,t=2,p=-1",
	}
	for nombre, crudo := range invalidos {
		t.Run(nombre, func(t *testing.T) {
			_, err := parseArgon2Params(crudo)
			if err == nil {
				t.Fatalf("esperaba error para %q", crudo)
			}
			if !strings.Contains(err.Error(), "parámetro de hash inválido") {
				t.Errorf("mensaje = %q, esperaba \"parámetro de hash inválido\"", err.Error())
			}
		})
	}
}

// TestVerify_ParalelismoFueraDeUint8SeRechazaYEl255Verifica — por el camino
// público: un hash armado a mano con p=255 verifica, y el mismo con p=256
// se rechaza con error (antes se truncaba a 0 y caía en "parámetros
// incompletos" por casualidad; con p=257 se truncaba a 1 y derivaba otra
// clave).
func TestVerify_ParalelismoFueraDeUint8SeRechazaYEl255Verifica(t *testing.T) {
	salt := []byte("sal-de-prueba-16")
	const memoria, iteraciones = 8 * 255, 1
	clave := argon2.IDKey([]byte("contraseña"), salt, iteraciones, memoria, 255, 32)
	armar := func(p int) string {
		return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, memoria, iteraciones, p,
			base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(clave))
	}

	ok, err := Verify("contraseña", armar(255))
	if err != nil || !ok {
		t.Fatalf("p=255: ok=%v err=%v, esperaba que verifique", ok, err)
	}

	for _, p := range []int{256, 257} {
		ok, err := Verify("contraseña", armar(p))
		if err == nil || ok {
			t.Errorf("p=%d: ok=%v err=%v, esperaba rechazo con error", p, ok, err)
		}
	}
}
