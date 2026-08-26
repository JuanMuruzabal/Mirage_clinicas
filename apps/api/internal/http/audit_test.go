package http

import (
	"encoding/json"
	"net/http"
	"testing"

	"dental-mirage/api/internal/db"
)

func TestAuditoria_RegistroYLoginExitosoQuedanRegistrados(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)

	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "auditoria1@example.com", Password: "password123456", AceptaTerminos: true,
	})
	if regRec.Code != http.StatusCreated {
		t.Fatalf("registro: status = %d, esperaba %d", regRec.Code, http.StatusCreated)
	}
	marcarMailVerificadoDePrueba(t, gdb, "auditoria1@example.com")

	loginRec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{
		Email: "auditoria1@example.com", Password: "password123456",
	})
	if loginRec.Code != http.StatusOK {
		t.Fatalf("login: status = %d, esperaba %d", loginRec.Code, http.StatusOK)
	}

	var user db.User
	if err := gdb.Where("email = ?", "auditoria1@example.com").First(&user).Error; err != nil {
		t.Fatalf("no se encontró el usuario: %v", err)
	}

	var countRegister, countLogin int64
	gdb.Model(&db.AuditEvent{}).Where("user_id = ? AND event_type = ?", user.ID, db.AuditEventRegister).Count(&countRegister)
	gdb.Model(&db.AuditEvent{}).Where("user_id = ? AND event_type = ?", user.ID, db.AuditEventLogin).Count(&countLogin)

	if countRegister != 1 {
		t.Errorf("eventos %q = %d, esperaba 1", db.AuditEventRegister, countRegister)
	}
	if countLogin != 1 {
		t.Errorf("eventos %q = %d, esperaba 1", db.AuditEventLogin, countLogin)
	}
}

func TestAuditoria_LoginFallidoConCredencialesIncorrectasQuedaRegistrado(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "auditoria2@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "auditoria2@example.com")

	rec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{
		Email: "auditoria2@example.com", Password: "password-incorrecta",
	})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}

	var user db.User
	_ = gdb.Where("email = ?", "auditoria2@example.com").First(&user).Error

	var count int64
	gdb.Model(&db.AuditEvent{}).Where("user_id = ? AND event_type = ?", user.ID, db.AuditEventLoginFailed).Count(&count)
	if count != 1 {
		t.Errorf("eventos %q = %d, esperaba 1", db.AuditEventLoginFailed, count)
	}
}

func TestAuditoria_LoginFallidoContraCuentaInexistenteQuedaRegistradoSinUserID(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{
		Email: "no-existe-auditoria@example.com", Password: "cualquier-password",
	})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}

	var count int64
	gdb.Model(&db.AuditEvent{}).Where("user_id IS NULL AND event_type = ?", db.AuditEventLoginFailed).Count(&count)
	if count != 1 {
		t.Errorf("eventos %q sin userID = %d, esperaba 1", db.AuditEventLoginFailed, count)
	}
}

func TestAuditoria_LogoutQuedaRegistrado(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "auditoria3@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "auditoria3@example.com")
	var reg registerResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	rec := doJSONAuth(t, router, http.MethodPost, "/auth/logout", *reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d", rec.Code, http.StatusOK)
	}

	var user db.User
	_ = gdb.Where("email = ?", "auditoria3@example.com").First(&user).Error

	var count int64
	gdb.Model(&db.AuditEvent{}).Where("user_id = ? AND event_type = ?", user.ID, db.AuditEventLogout).Count(&count)
	if count != 1 {
		t.Errorf("eventos %q = %d, esperaba 1", db.AuditEventLogout, count)
	}
}

func TestAuditoria_ResetPasswordQuedaRegistradoComoPasswordChanged(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Email: "auditoria4@example.com", Password: "password123456", AceptaTerminos: true,
	})
	marcarMailVerificadoDePrueba(t, gdb, "auditoria4@example.com")
	doJSON(t, router, http.MethodPost, "/auth/recuperar-password", recuperarPasswordRequest{Email: "auditoria4@example.com"})
	token := sender.tokenFromLastResetURL("auditoria4@example.com")

	rec := doJSON(t, router, http.MethodPost, "/auth/reset-password", resetPasswordRequest{Token: token, NewPassword: "otra-password-larga"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var user db.User
	_ = gdb.Where("email = ?", "auditoria4@example.com").First(&user).Error

	var count int64
	gdb.Model(&db.AuditEvent{}).Where("user_id = ? AND event_type = ?", user.ID, db.AuditEventPasswordChanged).Count(&count)
	if count != 1 {
		t.Errorf("eventos %q = %d, esperaba 1", db.AuditEventPasswordChanged, count)
	}
}

func TestAuditoria_CrearClinicaQuedaRegistrado(t *testing.T) {
	router, gdb := newTestRouter(t)
	registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Auditoria Cinco", Email: "auditoria5@example.com", Password: "password123456", NombreClinica: "Clínica Auditoria",
	})

	var user db.User
	_ = gdb.Where("email = ?", "auditoria5@example.com").First(&user).Error

	var count int64
	gdb.Model(&db.AuditEvent{}).Where("user_id = ? AND event_type = ?", user.ID, db.AuditEventClinicCreated).Count(&count)
	if count != 1 {
		t.Errorf("eventos %q = %d, esperaba 1", db.AuditEventClinicCreated, count)
	}
}
