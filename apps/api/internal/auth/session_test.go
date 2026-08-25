package auth_test

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"dental-mirage/api/internal/auth"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

func TestNewSessionAndValidateSessionToken(t *testing.T) {
	gdb := testdb.New(t)
	user := db.User{Email: uuid.NewString() + "@example.com"}
	if err := gdb.Create(&user).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario de prueba: %v", err)
	}

	rawToken, session, err := auth.NewSession(gdb, user.ID, "test-agent", "127.0.0.1")
	if err != nil {
		t.Fatalf("NewSession error inesperado: %v", err)
	}
	if rawToken == "" {
		t.Fatal("rawToken no debería estar vacío")
	}
	if session.UserID != user.ID {
		t.Errorf("session.UserID = %v, esperaba %v", session.UserID, user.ID)
	}

	got, err := auth.ValidateSessionToken(gdb, rawToken)
	if err != nil {
		t.Fatalf("ValidateSessionToken error inesperado: %v", err)
	}
	if got.ID != session.ID {
		t.Errorf("session validada = %v, esperaba %v", got.ID, session.ID)
	}
}

func TestValidateSessionToken_TokenInexistente(t *testing.T) {
	gdb := testdb.New(t)
	if _, err := auth.ValidateSessionToken(gdb, "token-que-no-existe"); err != auth.ErrSessionInvalid {
		t.Errorf("error = %v, esperaba ErrSessionInvalid", err)
	}
}

func TestValidateSessionToken_TokenVacio(t *testing.T) {
	gdb := testdb.New(t)
	if _, err := auth.ValidateSessionToken(gdb, ""); err != auth.ErrSessionInvalid {
		t.Errorf("error = %v, esperaba ErrSessionInvalid", err)
	}
}

func TestValidateSessionToken_ExpiracionAbsoluta(t *testing.T) {
	gdb := testdb.New(t)
	user := db.User{Email: uuid.NewString() + "@example.com"}
	if err := gdb.Create(&user).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario de prueba: %v", err)
	}

	rawToken, session, err := auth.NewSession(gdb, user.ID, "", "")
	if err != nil {
		t.Fatalf("NewSession error inesperado: %v", err)
	}
	// Forzamos que ya haya vencido, sin esperar 30 días de verdad.
	vencida := time.Now().Add(-time.Hour)
	if err := gdb.Model(&db.Session{}).Where("id = ?", session.ID).Update("expires_at", vencida).Error; err != nil {
		t.Fatalf("no se pudo forzar el vencimiento: %v", err)
	}

	if _, err := auth.ValidateSessionToken(gdb, rawToken); err != auth.ErrSessionInvalid {
		t.Errorf("error = %v, esperaba ErrSessionInvalid tras expiración absoluta", err)
	}
}

func TestValidateSessionToken_ExpiracionPorInactividad(t *testing.T) {
	gdb := testdb.New(t)
	user := db.User{Email: uuid.NewString() + "@example.com"}
	if err := gdb.Create(&user).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario de prueba: %v", err)
	}

	rawToken, session, err := auth.NewSession(gdb, user.ID, "", "")
	if err != nil {
		t.Fatalf("NewSession error inesperado: %v", err)
	}
	// Más de 7 días sin actividad, aunque la expiración absoluta (30 días)
	// todavía no llegó.
	vieja := time.Now().Add(-8 * 24 * time.Hour)
	if err := gdb.Model(&db.Session{}).Where("id = ?", session.ID).Update("last_seen_at", vieja).Error; err != nil {
		t.Fatalf("no se pudo forzar la inactividad: %v", err)
	}

	if _, err := auth.ValidateSessionToken(gdb, rawToken); err != auth.ErrSessionInvalid {
		t.Errorf("error = %v, esperaba ErrSessionInvalid tras expiración por inactividad", err)
	}
}

func TestRevokeSession_InvalidaLaSesion(t *testing.T) {
	gdb := testdb.New(t)
	user := db.User{Email: uuid.NewString() + "@example.com"}
	if err := gdb.Create(&user).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario de prueba: %v", err)
	}

	rawToken, session, err := auth.NewSession(gdb, user.ID, "", "")
	if err != nil {
		t.Fatalf("NewSession error inesperado: %v", err)
	}

	if err := auth.RevokeSession(gdb, session.ID); err != nil {
		t.Fatalf("RevokeSession error inesperado: %v", err)
	}

	if _, err := auth.ValidateSessionToken(gdb, rawToken); err != auth.ErrSessionInvalid {
		t.Errorf("una sesión revocada no debería seguir siendo válida, error = %v", err)
	}
}

func TestRevokeAllUserSessions_ExceptuaLaSesionIndicada(t *testing.T) {
	gdb := testdb.New(t)
	user := db.User{Email: uuid.NewString() + "@example.com"}
	if err := gdb.Create(&user).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario de prueba: %v", err)
	}

	raw1, _, err := auth.NewSession(gdb, user.ID, "", "")
	if err != nil {
		t.Fatalf("NewSession error inesperado: %v", err)
	}
	raw2, s2, err := auth.NewSession(gdb, user.ID, "", "")
	if err != nil {
		t.Fatalf("NewSession error inesperado: %v", err)
	}

	if err := auth.RevokeAllUserSessions(gdb, user.ID, &s2.ID); err != nil {
		t.Fatalf("RevokeAllUserSessions error inesperado: %v", err)
	}

	if _, err := auth.ValidateSessionToken(gdb, raw1); err != auth.ErrSessionInvalid {
		t.Errorf("la sesión 1 debería haber sido revocada, error = %v", err)
	}
	if _, err := auth.ValidateSessionToken(gdb, raw2); err != nil {
		t.Errorf("la sesión exceptuada (2) no debería haberse revocado: %v", err)
	}
}

func TestRotateSession_RevocaLaViejaYCreaUnaNueva(t *testing.T) {
	gdb := testdb.New(t)
	user := db.User{Email: uuid.NewString() + "@example.com"}
	if err := gdb.Create(&user).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario de prueba: %v", err)
	}

	rawOld, oldSession, err := auth.NewSession(gdb, user.ID, "", "")
	if err != nil {
		t.Fatalf("NewSession error inesperado: %v", err)
	}

	rawNew, newSession, err := auth.RotateSession(gdb, &oldSession.ID, user.ID, "test-agent", "127.0.0.1")
	if err != nil {
		t.Fatalf("RotateSession error inesperado: %v", err)
	}
	if newSession.ID == oldSession.ID {
		t.Error("RotateSession debería crear una sesión con un ID distinto")
	}

	if _, err := auth.ValidateSessionToken(gdb, rawOld); err != auth.ErrSessionInvalid {
		t.Errorf("la sesión vieja debería quedar revocada tras rotar, error = %v", err)
	}
	if _, err := auth.ValidateSessionToken(gdb, rawNew); err != nil {
		t.Errorf("la sesión nueva debería ser válida: %v", err)
	}
}

func TestRotateSession_SinSesionViejaSoloCreaUnaNueva(t *testing.T) {
	gdb := testdb.New(t)
	user := db.User{Email: uuid.NewString() + "@example.com"}
	if err := gdb.Create(&user).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario de prueba: %v", err)
	}

	rawNew, _, err := auth.RotateSession(gdb, nil, user.ID, "", "")
	if err != nil {
		t.Fatalf("RotateSession error inesperado: %v", err)
	}
	if _, err := auth.ValidateSessionToken(gdb, rawNew); err != nil {
		t.Errorf("la sesión nueva debería ser válida: %v", err)
	}
}
