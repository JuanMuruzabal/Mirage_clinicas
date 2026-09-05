package http

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// crearPacienteVerificadoDePrueba — Fase 2.4.1: crea un `Paciente` con un
// turno ya resuelto y marcado "asistio" — la definición exacta de
// "paciente VERIFICADO" del documento del cliente (ver
// pacienteEstaVerificado en paciente_verificado_publico.go). Inserta
// directo en la base (no por HTTP) por el mismo motivo que
// crearTurnoAgendadoDePrueba: el turno tiene que quedar en el PASADO, y
// los endpoints reales rechazan crear uno ya vencido.
func crearPacienteVerificadoDePrueba(t *testing.T, gdb *gorm.DB, profesionalID, tipoConsultaID, dni, email string) db.Paciente {
	t.Helper()
	pid, err := uuid.Parse(profesionalID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	tid, err := uuid.Parse(tipoConsultaID)
	if err != nil {
		t.Fatalf("tipoConsultaID inválido: %v", err)
	}

	paciente := db.Paciente{
		ProfesionalID: pid,
		Nombre:        "Bruno",
		Apellido:      "Iglesias",
		DNI:           dni,
		Telefono:      "+5493511234567",
		Email:         &email,
	}
	if err := gdb.Create(&paciente).Error; err != nil {
		t.Fatalf("no se pudo crear el paciente de prueba: %v", err)
	}

	inicio := time.Now().Add(-72 * time.Hour).Truncate(time.Second)
	fin := inicio.Add(30 * time.Minute)
	asistio := "asistio"
	turno := db.Turno{
		ProfesionalID:    pid,
		PacienteID:       &paciente.ID,
		Estado:           "agendado",
		TipoConsultaID:   &tid,
		HoraInicio:       &inicio,
		HoraFin:          &fin,
		NombreContacto:   paciente.Nombre,
		ApellidoContacto: paciente.Apellido,
		DNIContacto:      paciente.DNI,
		TelefonoContacto: paciente.Telefono,
		EmailContacto:    email,
		Origen:           "manual",
		Asistencia:       &asistio,
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno resuelto/asistido de prueba: %v", err)
	}
	return paciente
}

func pacienteVerificadoURL(slug, dni, email, token string) string {
	q := url.Values{}
	q.Set("dni", dni)
	q.Set("email", email)
	q.Set("verificacionToken", token)
	return "/clinicas/" + slug + "/pacientes/verificado?" + q.Encode()
}

func TestPacienteVerificadoPublico_Exitoso(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pacverif1@example.com")
	email := "bruno@example.com"
	paciente := crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", email)
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoURL(reg.Profesional.Slug, "30111222", email, token), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got pacienteVerificadoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.ID != paciente.ID.String() {
		t.Errorf("ID = %q, esperaba %q", got.ID, paciente.ID.String())
	}
	if got.Nombre != "Bruno I." {
		t.Errorf("Nombre = %q, esperaba %q (censurado con inicial de apellido)", got.Nombre, "Bruno I.")
	}
	if got.DNI != "30***222" {
		t.Errorf("DNI = %q, esperaba %q (censurado)", got.DNI, "30***222")
	}
}

func TestPacienteVerificadoPublico_SinTokenFalla(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pacverif2@example.com")
	crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com")

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoURL(reg.Profesional.Slug, "30111222", "bruno@example.com", ""), nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestPacienteVerificadoPublico_TokenInvalidoFalla(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pacverif3@example.com")
	crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com")

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoURL(reg.Profesional.Slug, "30111222", "bruno@example.com", "un-token-cualquiera"), nil)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

func TestPacienteVerificadoPublico_DNIInexistenteFalla(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pacverif4@example.com")
	email := "nadie@example.com"
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoURL(reg.Profesional.Slug, "30999888", email, token), nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

// TestPacienteVerificadoPublico_NoVerificadoFalla — un paciente con turnos
// agendados pero SIN ninguno resuelto+asistido todavía no es "verificado"
// según la definición del documento — no puede saltarse el paso de
// "primera vez" solo por tener una ficha cargada.
func TestPacienteVerificadoPublico_NoVerificadoFalla(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pacverif5@example.com")
	email := "bruno@example.com"
	crearTurnoAgendadoConContactoDePrueba(t, gdb, reg.Profesional.ID, tipoID, time.Now().Add(72*time.Hour))
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, email)

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoURL(reg.Profesional.Slug, "30111222", email, token), nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

// TestPacienteVerificadoPublico_MailDistintoFalla — el paciente está
// verificado, pero quien pide la tarjeta verificó un mail que no es el
// suyo (ni el principal ni ninguno alternativo) — no debe devolver nada.
func TestPacienteVerificadoPublico_MailDistintoFalla(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pacverif6@example.com")
	crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com")
	otroMail := "otro@example.com"
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, otroMail)

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoURL(reg.Profesional.Slug, "30111222", otroMail, token), nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

// TestPacienteVerificadoPublico_MailAlternativoResponde — un mail migrado
// por una resolución de conflicto anterior (PacienteEmailAlternativo)
// también tiene que poder verificar la ficha — pedido textual del
// cliente: "podrá usar cualquiera de los 2 mails... para volver a sacar
// turnos".
func TestPacienteVerificadoPublico_MailAlternativoResponde(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pacverif7@example.com")
	paciente := crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com")
	mailAlternativo := "bruno.alt@example.com"
	if err := gdb.Create(&db.PacienteEmailAlternativo{PacienteID: paciente.ID, Email: mailAlternativo}).Error; err != nil {
		t.Fatalf("no se pudo crear el mail alternativo de prueba: %v", err)
	}
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, mailAlternativo)

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoURL(reg.Profesional.Slug, "30111222", mailAlternativo, token), nil)
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestPacienteVerificadoPublico_ClinicaInexistente(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoURL("no-existe", "30111222", "bruno@example.com", "token"), nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestPacienteVerificadoPublico_DNIInvalidoFalla(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pacverif8@example.com")

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoURL(reg.Profesional.Slug, "no-es-un-dni", "bruno@example.com", "token"), nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}
