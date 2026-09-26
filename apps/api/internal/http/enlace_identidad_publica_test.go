package http

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"dental-mirage/api/internal/db"
)

// Un enlace compartido prueba la identidad SOLO de la ficha a la que
// apunta (radiografía técnica 2, B2). Hasta el 2026-09-26, con cualquier
// enlace vigente se listaban los pacientes de un tutor ajeno tipeando su
// mail, y se les sacaba turno — el enlace reemplazaba al código de mail
// para CUALQUIER mail. Los dos primeros tests eran las reproducciones de la
// radiografía, con las aserciones invertidas.

func urlVerificadoDeTutorConEnlace(slug, tutorEmail, enlace string) string {
	q := url.Values{}
	q.Set("tutorEmail", tutorEmail)
	q.Set("enlaceToken", enlace)
	return "/clinicas/" + slug + "/pacientes/verificado?" + q.Encode()
}

// crearEnlaceParaFichaDePrueba — el "Compartir link" generado desde la
// ficha de un paciente (Fase 3.2.7b).
func crearEnlaceParaFichaDePrueba(t *testing.T, router http.Handler, token, pacienteID string) string {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodPost, "/enlaces-turno", token, crearEnlaceTurnoRequest{PacienteID: pacienteID})
	if rec.Code != http.StatusCreated {
		t.Fatalf("no se pudo generar el enlace para la ficha: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp crearEnlaceTurnoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	return resp.URL[strings.LastIndex(resp.URL, "?enlace=")+len("?enlace="):]
}

func TestEnlaceGenerico_NoListaLosPacientesDeUnTutorSinCodigo(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace-id1@example.com")
	crearPacienteVerificadoConTutorDePrueba(t, gdb, reg.Profesional.ID, tipoID, "40111222", "Hijo", "mama.ajena@example.com", 0)
	enlace := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	rec := doJSON(t, router, http.MethodGet, urlVerificadoDeTutorConEnlace(reg.Profesional.Slug, "mama.ajena@example.com", enlace), nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, esperaba 403 (el enlace genérico no prueba el mail). body=%s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "Hijo") {
		t.Errorf("la respuesta nombra al paciente: %s", rec.Body.String())
	}
}

func TestEnlaceGenerico_NoBuscaPorDNISinCodigo(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace-id2@example.com")
	crearPacienteVerificadoDePrueba(t, gdb, reg.Profesional.ID, tipoID, "30111222", "bruno@example.com")
	enlace := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	q := url.Values{}
	q.Set("dni", "30111222")
	q.Set("email", "bruno@example.com")
	q.Set("enlaceToken", enlace)
	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/pacientes/verificado?"+q.Encode(), nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, esperaba 403. body=%s", rec.Code, rec.Body.String())
	}
}

func TestEnlaceGenerico_NoReservaParaUnaFichaExistenteSinCodigo(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace-id3@example.com")
	hijo := crearPacienteVerificadoConTutorDePrueba(t, gdb, reg.Profesional.ID, tipoID, "40111223", "Hijo", "mama.ajena2@example.com", 0)
	enlace := crearEnlaceTurnoDePrueba(t, router, reg.Token)
	var antes int64
	gdb.Model(&db.Turno{}).Where("paciente_id = ?", hijo.ID).Count(&antes)

	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		PacienteVerificadoID: hijo.ID.String(),
		Tipo:                 nombreTipoSembrado, Fecha: fechaDePruebaDisponibilidad, Hora: "10:00",
		EnlaceToken: enlace, EmailContacto: "mama.ajena2@example.com",
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperaba 400 (falta el código de mail). body=%s", rec.Code, rec.Body.String())
	}
	var despues int64
	gdb.Model(&db.Turno{}).Where("paciente_id = ?", hijo.ID).Count(&despues)
	if despues != antes {
		t.Errorf("se creó un turno para el paciente ajeno (%d → %d)", antes, despues)
	}
}

// Con el código del tutor, el mismo pedido por enlace sí sale — y se gastan
// las dos cosas: el cupo del enlace y la prueba de mail.
func TestEnlaceGenerico_ConCodigoReservaYGastaLasDosCosas(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace-id4@example.com")
	tutorEmail := "mama.real@example.com"
	hijo := crearPacienteVerificadoConTutorDePrueba(t, gdb, reg.Profesional.ID, tipoID, "40111224", "Hijo", tutorEmail, 0)
	enlace := crearEnlaceTurnoDePrueba(t, router, reg.Token)

	codigo := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, tutorEmail)

	// La tarjeta aparece con el código, aunque el pedido venga con enlace.
	q := url.Values{}
	q.Set("tutorEmail", tutorEmail)
	q.Set("verificacionToken", codigo)
	q.Set("enlaceToken", enlace)
	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/pacientes/verificado?"+q.Encode(), nil)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), hijo.ID.String()) {
		t.Fatalf("con el código, la lista debería traer al paciente: status=%d body=%s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		PacienteVerificadoID: hijo.ID.String(),
		Tipo:                 nombreTipoSembrado, Fecha: fechaDePruebaDisponibilidad, Hora: "10:00",
		EnlaceToken: enlace, VerificacionToken: codigo, EmailContacto: tutorEmail,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba 201. body=%s", rec.Code, rec.Body.String())
	}

	var usada db.VerificacionTurnoPublico
	if err := gdb.Where("email = ? AND used_at IS NOT NULL", tutorEmail).First(&usada).Error; err != nil {
		t.Errorf("la prueba de mail no se consumió: %v", err)
	}
	var e db.EnlaceTurno
	if err := gdb.Where("clinic_id = ?", reg.Profesional.ID).First(&e).Error; err != nil {
		t.Fatalf("no se encontró el enlace: %v", err)
	}
	if !e.UsadoParaMi && e.UsosParaOtro == 0 {
		t.Errorf("el enlace no registró el uso: %+v", e)
	}
}

// Un enlace generado desde una ficha sigue funcionando sin código, pero
// solo para ESA ficha: la lista de su tutor muestra ese paciente y ningún
// hermano, y reservar para otra ficha pide el código.
func TestEnlaceConFicha_SoloAlcanzaASuFicha(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "enlace-id5@example.com")
	tutorEmail := "mama.dos@example.com"
	ana := crearPacienteVerificadoConTutorDePrueba(t, gdb, reg.Profesional.ID, tipoID, "40111225", "Ana", tutorEmail, 0)
	beto := crearPacienteVerificadoConTutorDePrueba(t, gdb, reg.Profesional.ID, tipoID, "40111226", "Beto", tutorEmail, 3*time.Hour)
	enlace := crearEnlaceParaFichaDePrueba(t, router, reg.Token, ana.ID.String())

	rec := doJSON(t, router, http.MethodGet, urlVerificadoDeTutorConEnlace(reg.Profesional.Slug, tutorEmail, enlace), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba 200. body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), ana.ID.String()) || strings.Contains(rec.Body.String(), beto.ID.String()) {
		t.Errorf("la lista tendría que traer solo a la ficha del enlace: %s", rec.Body.String())
	}

	rec = doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
		PacienteVerificadoID: beto.ID.String(),
		Tipo:                 nombreTipoSembrado, Fecha: fechaDePruebaDisponibilidad, Hora: "10:00",
		EnlaceToken: enlace, EmailContacto: tutorEmail,
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("reservar para otra ficha con el enlace de Ana: status = %d, esperaba 400. body=%s", rec.Code, rec.Body.String())
	}
}
