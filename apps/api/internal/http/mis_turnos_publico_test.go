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
	var got misTurnoPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
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
