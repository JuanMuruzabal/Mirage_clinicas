package security

import (
	"sync"
	"testing"
	"time"
)

// TestHash_TopeDeHashesSimultaneos — radiografía técnica 2: cada argon2id
// reserva 19 MiB, así que la cantidad que corre a la vez es la memoria que
// usan los logins. Veinte pedidos simultáneos no pueden pasar de
// maxHashesSimultaneos en paralelo.
func TestHash_TopeDeHashesSimultaneos(t *testing.T) {
	original := argon2IDKey
	defer func() { argon2IDKey = original }()

	var enCurso, maximo int64
	var mu sync.Mutex
	argon2IDKey = func(password, salt []byte, iteraciones, memory uint32, threads uint8, keyLen uint32) []byte {
		mu.Lock()
		enCurso++
		if enCurso > maximo {
			maximo = enCurso
		}
		mu.Unlock()
		time.Sleep(20 * time.Millisecond)
		mu.Lock()
		enCurso--
		mu.Unlock()
		return make([]byte, keyLen)
	}

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := Hash("unaClaveLarga123"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if maximo > maxHashesSimultaneos {
		t.Errorf("corrieron %d hashes a la vez, el tope es %d", maximo, maxHashesSimultaneos)
	}
	if maximo < 2 {
		t.Errorf("corrieron %d a la vez: el tope no debería serializar todo", maximo)
	}
}
