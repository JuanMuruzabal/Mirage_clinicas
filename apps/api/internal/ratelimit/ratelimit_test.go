package ratelimit_test

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/ratelimit"
	"dental-mirage/api/internal/testdb"
)

func TestAccountLimiter_RecordLoginFailure_CuentaFallosConsecutivos(t *testing.T) {
	gdb := testdb.New(t)
	limiter := &ratelimit.AccountLimiter{DB: gdb}
	key := uuid.NewString()

	if count, err := limiter.LoginFailureCount(key); err != nil || count != 0 {
		t.Fatalf("sin fallos previos: count=%d err=%v, esperaba 0/nil", count, err)
	}

	for i := 1; i <= 3; i++ {
		count, err := limiter.RecordLoginFailure(key)
		if err != nil {
			t.Fatalf("RecordLoginFailure error inesperado: %v", err)
		}
		if count != i {
			t.Errorf("intento %d: count = %d, esperaba %d", i, count, i)
		}
	}

	if count, err := limiter.LoginFailureCount(key); err != nil || count != 3 {
		t.Errorf("LoginFailureCount = %d, err=%v, esperaba 3", count, err)
	}
}

func TestAccountLimiter_ResetLoginFailures_LimpiaElContador(t *testing.T) {
	gdb := testdb.New(t)
	limiter := &ratelimit.AccountLimiter{DB: gdb}
	key := uuid.NewString()

	if _, err := limiter.RecordLoginFailure(key); err != nil {
		t.Fatalf("RecordLoginFailure error inesperado: %v", err)
	}
	if err := limiter.ResetLoginFailures(key); err != nil {
		t.Fatalf("ResetLoginFailures error inesperado: %v", err)
	}

	if count, err := limiter.LoginFailureCount(key); err != nil || count != 0 {
		t.Errorf("tras el reset, count = %d, err=%v, esperaba 0", count, err)
	}
}

func TestAccountLimiter_PermiteHastaElMaximoYLuegoBloquea(t *testing.T) {
	gdb := testdb.New(t)
	limiter := &ratelimit.AccountLimiter{DB: gdb}
	key := uuid.NewString()
	limit := ratelimit.Limit{Max: 3, Window: time.Hour}

	for i := 0; i < 3; i++ {
		ok, err := limiter.Allow("test-scope", key, limit)
		if err != nil {
			t.Fatalf("Allow error inesperado: %v", err)
		}
		if !ok {
			t.Fatalf("intento %d debería haberse permitido", i+1)
		}
	}

	ok, err := limiter.Allow("test-scope", key, limit)
	if err != nil {
		t.Fatalf("Allow error inesperado: %v", err)
	}
	if ok {
		t.Error("el cuarto intento debería haberse bloqueado (max=3)")
	}
}

func TestAccountLimiter_ScopesDistintosNoSeMezclan(t *testing.T) {
	gdb := testdb.New(t)
	limiter := &ratelimit.AccountLimiter{DB: gdb}
	key := uuid.NewString()
	limit := ratelimit.Limit{Max: 1, Window: time.Hour}

	if ok, err := limiter.Allow("scope-a", key, limit); err != nil || !ok {
		t.Fatalf("scope-a primer intento: ok=%v err=%v", ok, err)
	}
	if ok, err := limiter.Allow("scope-b", key, limit); err != nil || !ok {
		t.Fatalf("scope-b (distinto) no debería estar afectado por scope-a: ok=%v err=%v", ok, err)
	}
}

func TestAccountLimiter_VentanaVencidaResetea(t *testing.T) {
	gdb := testdb.New(t)
	limiter := &ratelimit.AccountLimiter{DB: gdb}
	key := uuid.NewString()
	limit := ratelimit.Limit{Max: 1, Window: time.Hour}

	if ok, err := limiter.Allow("scope-viejo", key, limit); err != nil || !ok {
		t.Fatalf("primer intento: ok=%v err=%v", ok, err)
	}
	if ok, _ := limiter.Allow("scope-viejo", key, limit); ok {
		t.Fatal("el segundo intento en la misma ventana debería bloquearse")
	}

	// En vez de dormir de verdad una hora, forzamos que la ventana guardada
	// ya haya vencido (mismo criterio que session_test.go para expiración).
	viejaVentana := time.Now().Add(-2 * time.Hour)
	if err := gdb.Model(&db.AuthRateCounter{}).
		Where("scope = ? AND key = ?", "scope-viejo", key).
		Update("window_start", viejaVentana).Error; err != nil {
		t.Fatalf("no se pudo forzar la ventana vencida: %v", err)
	}

	if ok, err := limiter.Allow("scope-viejo", key, limit); err != nil || !ok {
		t.Fatalf("tras vencer la ventana debería permitirse de nuevo: ok=%v err=%v", ok, err)
	}
}

func TestIPLimiter_PermiteHastaElMaximoYLuegoBloquea(t *testing.T) {
	limiter := ratelimit.NewIPLimiter()
	limit := ratelimit.Limit{Max: 2, Window: time.Hour}
	ip := "203.0.113.5"

	if !limiter.Allow("login", ip, limit) {
		t.Fatal("primer intento debería permitirse")
	}
	if !limiter.Allow("login", ip, limit) {
		t.Fatal("segundo intento debería permitirse (max=2)")
	}
	if limiter.Allow("login", ip, limit) {
		t.Fatal("tercer intento debería bloquearse")
	}
}

func TestIPLimiter_IPsDistintasNoSeMezclan(t *testing.T) {
	limiter := ratelimit.NewIPLimiter()
	limit := ratelimit.Limit{Max: 1, Window: time.Hour}

	if !limiter.Allow("login", "203.0.113.1", limit) {
		t.Fatal("primer intento de la primera IP debería permitirse")
	}
	if !limiter.Allow("login", "203.0.113.2", limit) {
		t.Fatal("una IP distinta no debería estar bloqueada por la otra")
	}
}

func TestIPLimiter_Cleanup(t *testing.T) {
	limiter := ratelimit.NewIPLimiter()
	limit := ratelimit.Limit{Max: 1, Window: time.Millisecond}
	limiter.Allow("login", "203.0.113.9", limit)

	time.Sleep(10 * time.Millisecond)
	limiter.Cleanup(time.Millisecond)

	// Tras el cleanup, la IP debería poder volver a intentar como si fuera
	// la primera vez (el contador viejo se eliminó).
	if !limiter.Allow("login", "203.0.113.9", limit) {
		t.Error("tras Cleanup, un contador vencido eliminado debería permitir un intento nuevo")
	}
}

func TestLoginBackoff_CreceProgresivamenteConTecho(t *testing.T) {
	if got := ratelimit.LoginBackoff(0); got != 0 {
		t.Errorf("LoginBackoff(0) = %v, esperaba 0", got)
	}
	prev := time.Duration(0)
	for attempts := 1; attempts <= 5; attempts++ {
		got := ratelimit.LoginBackoff(attempts)
		if got <= prev {
			t.Errorf("LoginBackoff(%d) = %v, esperaba mayor que el anterior (%v)", attempts, got, prev)
		}
		prev = got
	}
	if got := ratelimit.LoginBackoff(100); got > 30*time.Second {
		t.Errorf("LoginBackoff(100) = %v, esperaba un techo de 30s", got)
	}
}
