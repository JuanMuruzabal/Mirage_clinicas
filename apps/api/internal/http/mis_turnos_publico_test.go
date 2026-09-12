package http

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
	"time"

	"dental-mirage/api/internal/db"
)

// TestMisTurnosPublico_ConDNIYMailCorrectosMuestraLaTarjeta — camino
// feliz: turno recién creado por el formulario público, la misma persona
// lo consulta con su DNI y mail.
func TestMisTurnosPublico_ConDNIYMailCorrectosMuestraLaTarjeta(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "mistrunos1@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token))

	qs := url.Values{"dni": {"30111222"}, "email": {"bruno@example.com"}}.Encode()
	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/mis-turnos?"+qs, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	// Fase 3.1: el endpoint devuelve una LISTA desde que un DNI
	// puede tener un turno activo por cada tipo de consulta.
	var lista []misTurnoPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &lista); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(lista) != 1 {
		t.Fatalf("devolvió %d turnos, esperaba 1", len(lista))
	}
	got := lista[0]
	if got.NombreContacto != "Bruno" || got.ApellidoContacto != "Iglesias" {
		t.Errorf("got = %+v, esperaba los datos de Bruno Iglesias", got)
	}
	if got.HoraInicio != "08:00" {
		t.Errorf("HoraInicio = %q, esperaba \"08:00\"", got.HoraInicio)
	}
	if got.TipoConsultaNombre == "" {
		t.Error("TipoConsultaNombre vacío, esperaba el nombre del tipo de consulta")
	}
}

// TestMisTurnosPublico_MailQueNoCoincideNoRevelaElTurno — el DNI existe y
// tiene un turno activo, pero con OTRO mail: la respuesta es la misma
// que "no existe" — nunca hay que revelarle a quien no conoce el mail
// correcto que el DNI tiene un turno.
func TestMisTurnosPublico_MailQueNoCoincideNoRevelaElTurno(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "mistrunos2@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token))

	qs := url.Values{"dni": {"30111222"}, "email": {"otro@example.com"}}.Encode()
	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/mis-turnos?"+qs, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

// TestMisTurnosPublico_DNIInexistenteDaNotFound — DNI sin ningún turno.
func TestMisTurnosPublico_DNIInexistenteDaNotFound(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "mistrunos3@example.com")

	qs := url.Values{"dni": {"30999999"}, "email": {"nadie@example.com"}}.Encode()
	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/mis-turnos?"+qs, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

// TestMisTurnosPublico_TurnoYaResueltoDaNotFound — solo mira turnos
// VIGENTES, mismo criterio que turnoActivoPorDNI.
func TestMisTurnosPublico_TurnoYaResueltoDaNotFound(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "mistrunos4@example.com")
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, "bruno@example.com")
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", token))
	if err := gdb.Model(&db.Turno{}).Where("profesional_id = ? AND dni_contacto = ?", reg.Profesional.ID, "30111222").
		Updates(map[string]interface{}{"hora_inicio": time.Now().Add(-2 * time.Hour), "hora_fin": time.Now().Add(-90 * time.Minute)}).Error; err != nil {
		t.Fatalf("no se pudo llevar el turno al pasado: %v", err)
	}

	qs := url.Values{"dni": {"30111222"}, "email": {"bruno@example.com"}}.Encode()
	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/mis-turnos?"+qs, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

// TestMisTurnosPublico_DNIInvalidoRechaza — mismo formato que el resto
// del formulario público (7 u 8 dígitos, sin puntos).
func TestMisTurnosPublico_DNIInvalidoRechaza(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "mistrunos5@example.com")

	qs := url.Values{"dni": {"abc"}, "email": {"nadie@example.com"}}.Encode()
	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/mis-turnos?"+qs, nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

// TestMisTurnosPublico_EmailInvalidoRechaza
func TestMisTurnosPublico_EmailInvalidoRechaza(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "mistrunos6@example.com")

	qs := url.Values{"dni": {"30111222"}, "email": {"no-es-un-mail"}}.Encode()
	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/mis-turnos?"+qs, nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

// TestMisTurnosPublico_ClinicaInexistenteDaNotFound
func TestMisTurnosPublico_ClinicaInexistenteDaNotFound(t *testing.T) {
	router, _, _ := newTestRouterWithMail(t)
	qs := url.Values{"dni": {"30111222"}, "email": {"nadie@example.com"}}.Encode()
	rec := doJSON(t, router, http.MethodGet, "/clinicas/no-existe/mis-turnos?"+qs, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

// TestMisTurnosPublico_ParaOtroElTutorEncuentraElTurno — bug real
// encontrado en la segunda pasada de la auditoría (2026-09-08, ver
// docs/Seguridad y optimizacion/): "Mis turnos" comparaba SIEMPRE contra
// `turno.EmailContacto`, que en el camino "para otro" (Fase 2.4.2) es el
// mail PROPIO del paciente — casi siempre vacío, porque el que se
// verifica y el que identifica el pedido es `TutorEmail`. Resultado: un
// tutor que sacó turno para su hijo NUNCA podía encontrarlo con "Mis
// turnos" — la feature quedaba rota entera para ese camino. El helper que
// resuelve esta misma pregunta (identidadDeContactoDelTurno,
// turno_publico.go) ya existía desde Fase 2.4.2, pero este handler nunca
// se actualizó para usarlo.
func TestMisTurnosPublico_ParaOtroElTutorEncuentraElTurno(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "mistrunos-paraotro@example.com")

	tutorEmail := "mama-mistrunos@example.com"
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, tutorEmail)
	crear := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudParaOtroDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", tutorEmail, token))
	if crear.Code != http.StatusCreated {
		t.Fatalf("no se pudo crear el turno para otro: status=%d body=%s", crear.Code, crear.Body.String())
	}

	// El tutor consulta con el DNI del PACIENTE (su hijo) y SU PROPIO mail
	// — el único que conoce y el único que se verificó.
	qs := url.Values{"dni": {"40111222"}, "email": {tutorEmail}}.Encode()
	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/mis-turnos?"+qs, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d — el tutor no puede encontrar el turno que él mismo sacó. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	// Fase 3.1: el endpoint devuelve una LISTA desde que un DNI
	// puede tener un turno activo por cada tipo de consulta.
	var lista []misTurnoPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &lista); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(lista) != 1 {
		t.Fatalf("devolvió %d turnos, esperaba 1", len(lista))
	}
	got := lista[0]
	// La tarjeta muestra al PACIENTE (de quién es el turno), no al tutor.
	if got.NombreContacto != "Juanito" || got.ApellidoContacto != "Pérez" {
		t.Errorf("got = %+v, esperaba los datos del paciente (Juanito Pérez)", got)
	}
}

// TestMisTurnosPublico_ParaOtroConMailAjenoNoRevelaNada — contracara del
// test de arriba: ampliar la comparación al mail del tutor no puede abrir
// un agujero nuevo — un mail cualquiera sigue sin revelar nada.
func TestMisTurnosPublico_ParaOtroConMailAjenoNoRevelaNada(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "mistrunos-paraotro2@example.com")

	tutorEmail := "mama-mistrunos2@example.com"
	token := verificarEmailDePrueba(t, router, sender, reg.Profesional.Slug, tutorEmail)
	doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos",
		solicitudParaOtroDePrueba(tipoID, fechaDePruebaDisponibilidad, "08:00", tutorEmail, token))

	qs := url.Values{"dni": {"40111222"}, "email": {"curioso@example.com"}}.Encode()
	rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/mis-turnos?"+qs, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d — un mail ajeno nunca debe revelar el turno", rec.Code, http.StatusNotFound)
	}
}

// TestMisTurnosPublico_RateLimitPorIP — más de LimitMisTurnosConsultaPerIP
// consultas desde la misma IP+clínica se rechazan con 429.
func TestMisTurnosPublico_RateLimitPorIP(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "mistrunos7@example.com")

	qs := url.Values{"dni": {"30111222"}, "email": {"nadie@example.com"}}.Encode()
	var code int
	for i := 0; i < 21; i++ {
		rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/mis-turnos?"+qs, nil)
		code = rec.Code
	}
	if code != http.StatusTooManyRequests {
		t.Errorf("status del pedido 21 = %d, esperaba %d", code, http.StatusTooManyRequests)
	}
}
