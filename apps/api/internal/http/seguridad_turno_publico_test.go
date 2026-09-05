package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// TestListBloqueosSeguridad_Exitoso — corrección de seguridad (Fase
// 2.4.1), pedido textual del cliente: "el apartado de auditoría de
// turnos de bloqueos, donde muestre los mails bloqueados etc, por las
// dudas de algún malentendido". Un bloqueo ya VENCIDO no aparece en las
// listas de "bloqueados" (ya no le impide nada a nadie), pero sí queda
// en la auditoría (es historial, no estado activo).
func TestListBloqueosSeguridad_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "seguridad1@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	pid, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}

	mailVigente := db.EmailBloqueadoTurnoPublico{ProfesionalID: pid, Email: "vigente@example.com", BloqueadoHasta: time.Now().Add(2 * 24 * time.Hour)}
	if err := gdb.Create(&mailVigente).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo de mail vigente: %v", err)
	}
	mailVencido := db.EmailBloqueadoTurnoPublico{ProfesionalID: pid, Email: "vencido@example.com", BloqueadoHasta: time.Now().Add(-2 * time.Hour)}
	if err := gdb.Create(&mailVencido).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo de mail vencido: %v", err)
	}
	ipVigente := db.IPBloqueadaTurnoPublico{ProfesionalID: pid, IP: "203.0.113.5", BloqueadoHasta: time.Now().Add(12 * time.Hour)}
	if err := gdb.Create(&ipVigente).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo de IP: %v", err)
	}
	email := "atacante@example.com"
	ip := "203.0.113.5"
	auditoria := db.AuditoriaBloqueoTurnoPublico{
		ProfesionalID: pid, Motivo: "mail_muchos_dnis", Email: &email, IP: &ip,
		DNIs: "30000001, 30000002", TurnosBorrados: 2,
	}
	if err := gdb.Create(&auditoria).Error; err != nil {
		t.Fatalf("no se pudo crear la fila de auditoría: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/seguridad/bloqueos", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got bloqueosSeguridadResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}

	if len(got.MailsBloqueados) != 1 || got.MailsBloqueados[0].Email != "vigente@example.com" {
		t.Errorf("MailsBloqueados = %+v, esperaba solo el vigente", got.MailsBloqueados)
	}
	if len(got.IPsBloqueadas) != 1 || got.IPsBloqueadas[0].IP != "203.0.113.5" {
		t.Errorf("IPsBloqueadas = %+v, esperaba la IP vigente", got.IPsBloqueadas)
	}
	if len(got.Auditoria) != 1 {
		t.Fatalf("Auditoria = %+v, esperaba 1 fila", got.Auditoria)
	}
	if got.Auditoria[0].Motivo != "mail_muchos_dnis" || got.Auditoria[0].TurnosBorrados != 2 {
		t.Errorf("Auditoria[0] = %+v, no coincide con lo sembrado", got.Auditoria[0])
	}
}

func TestListBloqueosSeguridad_SinTokenFalla(t *testing.T) {
	router, gdb := newTestRouter(t)
	_ = gdb
	rec := doJSONAuth(t, router, http.MethodGet, "/pacientes/seguridad/bloqueos", "token-invalido", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

// TestDesbloquearMail_Exitoso — corrección de seguridad (Fase 2.4.1):
// recuperar un falso positivo del bloqueo automático — solo levanta el
// bloqueo, no revive ningún turno borrado (eso ya no es posible).
func TestDesbloquearMail_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "seguridad2@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	pid, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	bloqueo := db.EmailBloqueadoTurnoPublico{ProfesionalID: pid, Email: "familia@example.com", BloqueadoHasta: time.Now().Add(2 * 24 * time.Hour)}
	if err := gdb.Create(&bloqueo).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodDelete, "/pacientes/seguridad/bloqueos-mail/"+bloqueo.ID.String(), reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	err = gdb.First(&db.EmailBloqueadoTurnoPublico{}, "id = ?", bloqueo.ID).Error
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("esperaba que el bloqueo se borrara, err=%v", err)
	}
}

func TestDesbloquearMail_DeOtroProfesionalFalla(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	dueño := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "seguridad3a@example.com", Password: "password123456", NombreClinica: "Clínica A",
	})
	otro := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "seguridad3b@example.com", Password: "password123456", NombreClinica: "Clínica B",
	})
	pid, err := uuid.Parse(dueño.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	bloqueo := db.EmailBloqueadoTurnoPublico{ProfesionalID: pid, Email: "familia@example.com", BloqueadoHasta: time.Now().Add(2 * 24 * time.Hour)}
	if err := gdb.Create(&bloqueo).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodDelete, "/pacientes/seguridad/bloqueos-mail/"+bloqueo.ID.String(), otro.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

// TestDesbloquearIP_Exitoso — mismo criterio que TestDesbloquearMail_Exitoso, para IP.
func TestDesbloquearIP_Exitoso(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "seguridad4@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	pid, err := uuid.Parse(reg.Profesional.ID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	bloqueo := db.IPBloqueadaTurnoPublico{ProfesionalID: pid, IP: "203.0.113.9", BloqueadoHasta: time.Now().Add(12 * time.Hour)}
	if err := gdb.Create(&bloqueo).Error; err != nil {
		t.Fatalf("no se pudo crear el bloqueo: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodDelete, "/pacientes/seguridad/bloqueos-ip/"+bloqueo.ID.String(), reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	err = gdb.First(&db.IPBloqueadaTurnoPublico{}, "id = ?", bloqueo.ID).Error
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("esperaba que el bloqueo se borrara, err=%v", err)
	}
}

func TestDesbloquearMail_InexistenteDaNotFound(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "María Games", Email: "seguridad5@example.com", Password: "password123456", NombreClinica: "Clínica",
	})
	rec := doJSONAuth(t, router, http.MethodDelete, "/pacientes/seguridad/bloqueos-mail/"+"00000000-0000-0000-0000-000000000000", reg.Token, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}
