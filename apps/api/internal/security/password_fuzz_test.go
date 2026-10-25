package security

import (
	"fmt"
	"testing"
)

// FuzzParseArgon2Params fuzzea el parser de los parámetros de un hash
// guardado ("m=19456,t=2,p=1"). Se fuzzea el parser y no Verify: con una
// "m" enorme, derivarClave reservaría memoria sin límite.
func FuzzParseArgon2Params(f *testing.F) {
	for _, semilla := range []string{
		"m=19456,t=2,p=1",
		"m=19456,t=2,p=257",
		"m=19456,t=2,p=1,clave=3",
		"",
		"m=,t=2,p=1",
		"m=1,t=1,p=1,x=9",
		"m=19456;t=2;p=1",
		"m==1,t=2,p=1",
		",,,",
		"m=4294967296,t=2,p=1",
		"m=-1,t=2,p=1",
		"m=+5,t=2,p=1",
		"m=0,t=2,p=1",
		"p=1,t=2,m=19456,m=3",
	} {
		f.Add(semilla)
	}
	f.Fuzz(func(t *testing.T, raw string) {
		params, err := parseArgon2Params(raw)
		if err != nil {
			return
		}
		if params.Memory == 0 || params.Iterations == 0 || params.Parallelism == 0 {
			t.Fatalf("parámetros aceptados con un cero: %q → %+v", raw, params)
		}
		otra := fmt.Sprintf("m=%d,t=%d,p=%d", params.Memory, params.Iterations, params.Parallelism)
		vuelta, err := parseArgon2Params(otra)
		if err != nil {
			t.Fatalf("el formato de %q (%q) no se vuelve a parsear: %v", raw, otra, err)
		}
		if vuelta != params {
			t.Fatalf("ida y vuelta distinta para %q: %+v → %+v", raw, params, vuelta)
		}
	})
}
