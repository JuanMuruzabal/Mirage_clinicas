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
	"dental-mirage/api/internal/security"
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

	telefono := "+5493511234567"
	paciente := db.Paciente{
		ProfesionalID: pid,
		Nombre:        "Bruno",
		Apellido:      "Iglesias",
		DNI:           dni,
		Telefono:      &telefono,
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
		TelefonoContacto: telefono,
		EmailContacto:    email,
		Origen:           "manual",
		Asistencia:       &asistio,
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno resuelto/asistido de prueba: %v", err)
	}
	return paciente
}

// crearPacienteVerificadoConTutorDePrueba — Fase 2.4.2: misma idea que
// crearPacienteVerificadoDePrueba, pero la ficha nace "para otro" (sin
// mail/teléfono propio, con TutorEmail) — la identidad que responde por
// esta ficha es la del tutor, no la del paciente. `separacion` corre el
// turno resuelto en el tiempo (además de los -72h base) para que dos
// hijos del mismo tutor, creados en el mismo test, no choquen contra el
// exclusion constraint de horario (mismo profesional, mismo tipo de
// consulta, tiempos casi idénticos si `time.Now()` no alcanza a variar).
func crearPacienteVerificadoConTutorDePrueba(t *testing.T, gdb *gorm.DB, profesionalID, tipoConsultaID, dni, nombre, tutorEmail string, separacion time.Duration) db.Paciente {
	t.Helper()
	pid, err := uuid.Parse(profesionalID)
	if err != nil {
		t.Fatalf("profesionalID inválido: %v", err)
	}
	tid, err := uuid.Parse(tipoConsultaID)
	if err != nil {
		t.Fatalf("tipoConsultaID inválido: %v", err)
	}

	tutorRelacion := "familiar"
	tutorNombre := "Tutor de " + nombre
	tutorTelefono := "+5493511111111"
	paciente := db.Paciente{
		ProfesionalID: pid,
		Nombre:        nombre,
		Apellido:      "Iglesias",
		DNI:           dni,
	}
	if err := gdb.Create(&paciente).Error; err != nil {
		t.Fatalf("no se pudo crear el paciente de prueba: %v", err)
	}
	// PacienteTutor — Fase 2.4.2, ronda de correcciones (2026-09-06): ya
	// no son campos directos de Paciente, ver models.go.
	tutor := db.PacienteTutor{
		PacienteID: paciente.ID,
		Relacion:   tutorRelacion,
		Nombre:     tutorNombre,
		Telefono:   tutorTelefono,
		Email:      tutorEmail,
	}
	if err := gdb.Create(&tutor).Error; err != nil {
		t.Fatalf("no se pudo crear el tutor de prueba: %v", err)
	}

	inicio := time.Now().Add(-72*time.Hour + separacion).Truncate(time.Second)
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
		Origen:           "manual",
		Asistencia:       &asistio,
		EsParaOtro:       true,
		TutorRelacion:    &tutorRelacion,
		TutorNombre:      &tutorNombre,
		TutorTelefono:    &tutorTelefono,
		TutorEmail:       &tutorEmail,
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno resuelto/asistido de prueba: %v", err)
	}
	return paciente
}

func pacienteVerificadoTutorURL(slug, tutorEmail, token string) string {
	q := url.Values{}
	q.Set("tutorEmail", tutorEmail)
	q.Set("verificacionToken", token)
	return "/clinicas/" + slug + "/pacientes/verificado?" + q.Encode()
}

func pacienteVerificadoURL(slug, dni, email, token string) string {
	q := url.Values{}
	q.Set("dni", dni)
	q.Set("email", email)
	q.Set("verificacionToken", token)
	return "/clinicas/" + slug + "/pacientes/verificado?" + q.Encode()
}

// pacienteVerificadoConEnlaceURL/pacienteVerificadoTutorConEnlaceURL —
// Fase 2, ítem 5: mismas 2 URLs de arriba, pero con `enlaceToken` en vez
// de `verificacionToken` — la alternativa de identidad que no depende de
// ningún código de mail (ver validarIdentidadPublicaOEnlace).
func pacienteVerificadoConEnlaceURL(slug, dni, email, enlaceToken string) string {
	q := url.Values{}
	q.Set("dni", dni)
	q.Set("email", email)
	q.Set("enlaceToken", enlaceToken)
	return "/clinicas/" + slug + "/pacientes/verificado?" + q.Encode()
}

func pacienteVerificadoTutorConEnlaceURL(slug, tutorEmail, enlaceToken string) string {
	q := url.Values{}
	q.Set("tutorEmail", tutorEmail)
	q.Set("enlaceToken", enlaceToken)
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

func TestPacienteVerificadoPublico_EmailInvalidoFalla(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pacverif9@example.com")

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoURL(reg.Profesional.Slug, "30111222", "no-es-un-mail", "token"), nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

// TestPacienteVerificadoPublico_TutorEmailListaHijosVerificados — Fase
// 2.4.2, segundo modo del endpoint (`?tutorEmail=`): un tutor con más de
// un hijo verificado recibe una tarjeta por cada uno.
func TestPacienteVerificadoPublico_TutorEmailListaHijosVerificados(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pacverif-tutor1@example.com")
	tutorEmail := "mama-dos-hijos@example.com"
	hijo1 := crearPacienteVerificadoConTutorDePrueba(t, gdb, reg.Profesional.ID, tipoID, "41000001", "Mila", tutorEmail, 0)
	hijo2 := crearPacienteVerificadoConTutorDePrueba(t, gdb, reg.Profesional.ID, tipoID, "41000002", "Nico", tutorEmail, time.Hour)
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, tutorEmail)

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoTutorURL(reg.Profesional.Slug, tutorEmail, token), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got []pacienteVerificadoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, esperaba 2", len(got))
	}
	ids := map[string]bool{got[0].ID: true, got[1].ID: true}
	if !ids[hijo1.ID.String()] || !ids[hijo2.ID.String()] {
		t.Errorf("ids = %v, esperaba los dos hijos (%s, %s)", ids, hijo1.ID, hijo2.ID)
	}
}

// TestPacienteVerificadoPublico_TutorEmailSinCoincidenciasFalla — ningún
// paciente responde a ese TutorEmail (o ninguno está verificado todavía):
// mismo 404 "primera vez" que el modo por DNI.
func TestPacienteVerificadoPublico_TutorEmailSinCoincidenciasFalla(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pacverif-tutor2@example.com")
	tutorEmail := "tutor-sin-hijos@example.com"
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, tutorEmail)

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoTutorURL(reg.Profesional.Slug, tutorEmail, token), nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

// TestPacienteVerificadoPublico_TutorEmailSinTokenFalla — mismo criterio
// que el modo por DNI: sin verificar el mail del tutor, no hay tarjeta.
func TestPacienteVerificadoPublico_TutorEmailSinTokenFalla(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pacverif-tutor3@example.com")

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoTutorURL(reg.Profesional.Slug, "mama@example.com", ""), nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

// TestPacienteVerificadoPublico_TutorEmailFormatoInvalidoFalla — mismo
// criterio que el modo por DNI: un mail mal formado nunca llega a buscar
// nada en la base.
func TestPacienteVerificadoPublico_TutorEmailFormatoInvalidoFalla(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pacverif-tutor4@example.com")

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoTutorURL(reg.Profesional.Slug, "no-es-un-mail", "token"), nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

// Fase 2, ítem 5 ("compartir calendario") — mismo endpoint, ahora con
// `enlaceToken` en vez de `verificacionToken`: el pedido textual del
// cliente ("el usuario por el link tendria que tambien tener la opcion si
// ya vino antes, mostrando su tarjeta") depende de que este camino
// funcione igual que con código.

func TestPacienteVerificadoPublico_ConEnlaceTokenExitoso(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pacverif-enlace1@example.com")
	email := "bruno@example.com"
	paciente := crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", email)
	enlaceToken := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoConEnlaceURL(reg.Profesional.Slug, "30111222", email, enlaceToken), nil)
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
}

func TestPacienteVerificadoPublico_ConEnlaceTokenInvalidoFalla(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pacverif-enlace2@example.com")
	crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com")

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoConEnlaceURL(reg.Profesional.Slug, "30111222", "bruno@example.com", "un-token-inexistente"), nil)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

func TestPacienteVerificadoPublico_ConEnlaceTokenVencidoFalla(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pacverif-enlace3@example.com")
	crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com")
	enlaceToken := crearEnlaceTurnoDePrueba(t, router, reg.Token)
	if err := gdb.Model(&db.EnlaceTurno{}).
		Where("token_hash = ?", security.HashToken(enlaceToken)).
		Update("expira_en", time.Now().Add(-1*time.Minute)).Error; err != nil {
		t.Fatalf("no se pudo vencer el enlace de prueba: %v", err)
	}

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoConEnlaceURL(reg.Profesional.Slug, "30111222", "bruno@example.com", enlaceToken), nil)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

// TestPacienteVerificadoPublico_ConEnlaceTokenSinMatchFalla — mismo 404
// "primera vez" que con código: el enlace es válido, pero el DNI+mail no
// pertenecen a ninguna ficha verificada.
func TestPacienteVerificadoPublico_ConEnlaceTokenSinMatchFalla(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pacverif-enlace4@example.com")
	enlaceToken := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoConEnlaceURL(reg.Profesional.Slug, "30999888", "nadie@example.com", enlaceToken), nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

func TestPacienteVerificadoPublico_TutorEmailConEnlaceTokenListaHijosVerificados(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "pacverif-tutor-enlace1@example.com")
	tutorEmail := "mama-enlace@example.com"
	hijo1 := crearPacienteVerificadoConTutorDePrueba(t, gdb, reg.Profesional.ID, tipoID, "41000011", "Mila", tutorEmail, 0)
	hijo2 := crearPacienteVerificadoConTutorDePrueba(t, gdb, reg.Profesional.ID, tipoID, "41000012", "Nico", tutorEmail, time.Hour)
	enlaceToken := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoTutorConEnlaceURL(reg.Profesional.Slug, tutorEmail, enlaceToken), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got []pacienteVerificadoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, esperaba 2", len(got))
	}
	ids := map[string]bool{got[0].ID: true, got[1].ID: true}
	if !ids[hijo1.ID.String()] || !ids[hijo2.ID.String()] {
		t.Errorf("ids = %v, esperaba los dos hijos (%s, %s)", ids, hijo1.ID, hijo2.ID)
	}
}

func TestPacienteVerificadoPublico_TutorEmailConEnlaceTokenInvalidoFalla(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "pacverif-tutor-enlace2@example.com")

	rec := doJSON(t, router, http.MethodGet, pacienteVerificadoTutorConEnlaceURL(reg.Profesional.Slug, "mama@example.com", "un-token-inexistente"), nil)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}
