package db_test

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

const ttlDePrueba = 24 * time.Hour

func usuarioDePrueba(t *testing.T, gdb *gorm.DB, email string, verificado bool, creadoHace time.Duration) db.User {
	t.Helper()
	u := db.User{Email: email, OnboardingStep: db.OnboardingStepCuenta, CreatedAt: time.Now().Add(-creadoHace)}
	if verificado {
		now := time.Now()
		u.EmailVerifiedAt = &now
	}
	if err := gdb.Create(&u).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario de prueba: %v", err)
	}
	return u
}

func existeUsuario(gdb *gorm.DB, id uuid.UUID) bool {
	var u db.User
	err := gdb.First(&u, "id = ?", id).Error
	return !errors.Is(err, gorm.ErrRecordNotFound)
}

// TestPurgeAuthGarbage_BorraCuentaAbandonadaYSusFilasDependientes —
// TR-063 en docs/Arquitectura y base/tradeoffs.md: una cuenta nativa sin verificar, más vieja
// que la TTL, se borra de verdad (Unscoped) junto con sus propias
// verification_tokens/sessions/auth_rate_counters — sin esto quedan
// huérfanos.
func TestPurgeAuthGarbage_BorraCuentaAbandonadaYSusFilasDependientes(t *testing.T) {
	gdb := testdb.New(t)
	u := usuarioDePrueba(t, gdb, "abandonada@example.com", false, ttlDePrueba+time.Hour)

	token := db.VerificationToken{
		UserID: u.ID, TokenHash: "hash-abandonada", Type: db.VerificationTokenEmailVerify,
		ExpiresAt: time.Now().Add(10 * time.Minute), // todavía vigente — igual se borra porque el USUARIO se borra
	}
	if err := gdb.Create(&token).Error; err != nil {
		t.Fatalf("no se pudo crear el token de prueba: %v", err)
	}
	sesion := db.Session{
		UserID: u.ID, TokenHash: "sesion-abandonada", LastSeenAt: time.Now(),
		ExpiresAt: time.Now().Add(29 * 24 * time.Hour), // todavía vigente
	}
	if err := gdb.Create(&sesion).Error; err != nil {
		t.Fatalf("no se pudo crear la sesión de prueba: %v", err)
	}
	contador := db.AuthRateCounter{Scope: "confirm_code", Key: u.Email, WindowStart: time.Now(), Count: 3}
	if err := gdb.Create(&contador).Error; err != nil {
		t.Fatalf("no se pudo crear el contador de prueba: %v", err)
	}

	stats, err := db.PurgeAuthGarbage(gdb, ttlDePrueba)
	if err != nil {
		t.Fatalf("PurgeAuthGarbage: %v", err)
	}
	if stats.UsuariosAbandonados != 1 {
		t.Errorf("UsuariosAbandonados = %d, esperaba 1", stats.UsuariosAbandonados)
	}
	if existeUsuario(gdb, u.ID) {
		t.Error("el usuario abandonado debería haberse borrado")
	}
	var tokenCount, sesionCount, contadorCount int64
	gdb.Unscoped().Model(&db.VerificationToken{}).Where("user_id = ?", u.ID).Count(&tokenCount)
	gdb.Unscoped().Model(&db.Session{}).Where("user_id = ?", u.ID).Count(&sesionCount)
	gdb.Unscoped().Model(&db.AuthRateCounter{}).Where("key = ?", u.Email).Count(&contadorCount)
	if tokenCount != 0 {
		t.Error("el verification_token del usuario abandonado debería haberse borrado")
	}
	if sesionCount != 0 {
		t.Error("la sesión del usuario abandonado debería haberse borrado")
	}
	if contadorCount != 0 {
		t.Error("el auth_rate_counter del usuario abandonado debería haberse borrado")
	}
}

func TestPurgeAuthGarbage_NoTocaCuentaSinVerificarPeroReciente(t *testing.T) {
	gdb := testdb.New(t)
	u := usuarioDePrueba(t, gdb, "reciente@example.com", false, 1*time.Hour)

	stats, err := db.PurgeAuthGarbage(gdb, ttlDePrueba)
	if err != nil {
		t.Fatalf("PurgeAuthGarbage: %v", err)
	}
	if stats.UsuariosAbandonados != 0 {
		t.Errorf("UsuariosAbandonados = %d, esperaba 0 — todavía está dentro de la TTL", stats.UsuariosAbandonados)
	}
	if !existeUsuario(gdb, u.ID) {
		t.Error("una cuenta sin verificar pero reciente no debería borrarse")
	}
}

func TestPurgeAuthGarbage_NoTocaCuentaVerificadaAunqueSeaVieja(t *testing.T) {
	gdb := testdb.New(t)
	u := usuarioDePrueba(t, gdb, "verificadavieja@example.com", true, ttlDePrueba*10)

	stats, err := db.PurgeAuthGarbage(gdb, ttlDePrueba)
	if err != nil {
		t.Fatalf("PurgeAuthGarbage: %v", err)
	}
	if stats.UsuariosAbandonados != 0 {
		t.Errorf("UsuariosAbandonados = %d, esperaba 0 — la cuenta está verificada", stats.UsuariosAbandonados)
	}
	if !existeUsuario(gdb, u.ID) {
		t.Error("una cuenta verificada nunca debería borrarse, sin importar su antigüedad")
	}
}

func TestPurgeAuthGarbage_BorraSesionVencidaDeCualquierCuenta(t *testing.T) {
	gdb := testdb.New(t)
	u := usuarioDePrueba(t, gdb, "conSesionVencida@example.com", true, time.Hour)

	// Mismo motivo que en el test de tokens de más abajo: PurgeAuthGarbage
	// borra globalmente y stats cuenta TODO lo purgable de la base, no solo
	// lo de este test. Se afirma el delta sobre el piso preexistente.
	var sesionesPurgablesPrevias int64
	if err := gdb.Model(&db.Session{}).Where("expires_at < ?", time.Now()).
		Count(&sesionesPurgablesPrevias).Error; err != nil {
		t.Fatalf("no se pudo medir el piso de sesiones purgables: %v", err)
	}

	vencida := db.Session{UserID: u.ID, TokenHash: "vencida", LastSeenAt: time.Now(), ExpiresAt: time.Now().Add(-time.Minute)}
	vigente := db.Session{UserID: u.ID, TokenHash: "vigente", LastSeenAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour)}
	if err := gdb.Create(&vencida).Error; err != nil {
		t.Fatal(err)
	}
	if err := gdb.Create(&vigente).Error; err != nil {
		t.Fatal(err)
	}

	stats, err := db.PurgeAuthGarbage(gdb, ttlDePrueba)
	if err != nil {
		t.Fatalf("PurgeAuthGarbage: %v", err)
	}
	if esperadas := sesionesPurgablesPrevias + 1; stats.SesionesVencidas != esperadas {
		t.Errorf("SesionesVencidas = %d, esperaba %d (%d preexistentes + la vencida de este test)",
			stats.SesionesVencidas, esperadas, sesionesPurgablesPrevias)
	}
	var count int64
	gdb.Model(&db.Session{}).Where("id = ?", vencida.ID).Count(&count)
	if count != 0 {
		t.Error("la sesión vencida debería haberse borrado")
	}
	gdb.Model(&db.Session{}).Where("id = ?", vigente.ID).Count(&count)
	if count != 1 {
		t.Error("la sesión vigente NO debería haberse borrado")
	}
	if !existeUsuario(gdb, u.ID) {
		t.Error("una sesión vencida no debería arrastrar el borrado de una cuenta verificada")
	}
}

func TestPurgeAuthGarbage_BorraTokenUsadoOVencidoPeroNoUnoVigente(t *testing.T) {
	gdb := testdb.New(t)
	u := usuarioDePrueba(t, gdb, "contokens@example.com", true, time.Hour)
	ahora := time.Now()

	// PurgeAuthGarbage borra GLOBALMENTE, sin scope por usuario — así que
	// stats.TokensVencidos cuenta TODO lo purgable de la base, no solo lo
	// que crea este test. Y testdb.New aísla las ESCRITURAS de este test
	// (transacción revertida) pero no le oculta las filas ya commiteadas
	// por otros: cualquier residuo de una corrida anterior se suma al
	// conteo. Afirmar "== 2" a secas hacía fallar el test según qué
	// hubiera quedado en la base — falla real, difícil de diagnosticar
	// porque no tiene nada que ver con lo que el test prueba. Se mide el
	// piso preexistente y se afirma el DELTA, que es lo que de verdad
	// importa: que estos 2 tokens se hayan contado.
	var tokensPurgablesPrevios int64
	if err := gdb.Model(&db.VerificationToken{}).
		Where("used_at IS NOT NULL OR expires_at < ?", ahora).
		Count(&tokensPurgablesPrevios).Error; err != nil {
		t.Fatalf("no se pudo medir el piso de tokens purgables: %v", err)
	}

	usado := db.VerificationToken{UserID: u.ID, TokenHash: "usado", Type: db.VerificationTokenEmailVerify, ExpiresAt: ahora.Add(time.Hour), UsedAt: &ahora}
	vencido := db.VerificationToken{UserID: u.ID, TokenHash: "vencido", Type: db.VerificationTokenPasswordReset, ExpiresAt: ahora.Add(-time.Minute)}
	vigente := db.VerificationToken{UserID: u.ID, TokenHash: "vigente", Type: db.VerificationTokenEmailVerify, ExpiresAt: ahora.Add(time.Hour)}
	for _, tok := range []*db.VerificationToken{&usado, &vencido, &vigente} {
		if err := gdb.Create(tok).Error; err != nil {
			t.Fatal(err)
		}
	}

	stats, err := db.PurgeAuthGarbage(gdb, ttlDePrueba)
	if err != nil {
		t.Fatalf("PurgeAuthGarbage: %v", err)
	}
	if esperados := tokensPurgablesPrevios + 2; stats.TokensVencidos != esperados {
		t.Errorf("TokensVencidos = %d, esperaba %d (%d preexistentes + usado + vencido)",
			stats.TokensVencidos, esperados, tokensPurgablesPrevios)
	}
	var count int64
	gdb.Model(&db.VerificationToken{}).Where("id = ?", vigente.ID).Count(&count)
	if count != 1 {
		t.Error("el token vigente y sin usar NO debería haberse borrado")
	}
}
