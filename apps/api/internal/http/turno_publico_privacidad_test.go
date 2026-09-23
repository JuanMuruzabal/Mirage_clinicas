package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Revisión de aislamiento del 2026-09-23 — lo que el wizard público dice
// sobre el turno de OTRA persona.
//
// Las reglas que protegen al paciente buscan por DNI en todas sus fichas
// (TR-147), y en el wizard un mail que no es el de la ficha no se frena:
// se crea una duplicada y el pedido sigue. Antes de este arreglo, con
// solo conocer un DNI y verificar un mail propio cualquiera, el 409
// contaba con qué profesional se atiende esa persona, qué día y a qué
// hora. Reproducido tal cual antes de escribir el arreglo.

// escenarioDosProfesionales arma la clínica del problema: el titular con
// "Consulta general" y un colega con "Ortodoncia", y la víctima con un
// turno con el titular a las 08:00.
//
// Devuelve además la prueba de mail REEMITIDA de la víctima: es con lo que
// el wizard le deja sacar otro turno sin volver a pedir el código (pedir
// un segundo código al mismo mail en segundos rebota con 429).
func escenarioDosProfesionales(t *testing.T) (http.Handler, *gorm.DB, *capturingMailSender, string, uuid.UUID, string) {
	t.Helper()
	router, gdb, sender := newTestRouterWithMail(t)
	reg, _ := profesionalConTipoConsulta(t, gdb, router, "privacidad@example.com")
	slug := reg.Profesional.Slug
	clinicID := clinicaDePrueba(t, reg.Profesional.ID)

	sumarColaboradorDePrueba(t, gdb, router, clinicID, "privacidad-colega@example.com", db.RoleProfesional)
	colegaID := userIDDelMail(t, gdb, "privacidad-colega@example.com")
	tipoDe(t, gdb, clinicID, colegaID, "Ortodoncia", 30)

	tok := verificarEmailDePrueba(t, router, sender, slug, "bruno@example.com")
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos",
		solicitudDePrueba(nombreTipoSembrado, fechaDePruebaDisponibilidad, "08:00", tok))
	if rec.Code != http.StatusCreated {
		t.Fatalf("turno de la víctima: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var creado solicitarTurnoPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &creado); err != nil || creado.VerificacionToken == "" {
		t.Fatalf("no vino la prueba de mail reemitida: err=%v body=%s", err, rec.Body.String())
	}
	return router, gdb, sender, slug, colegaID, creado.VerificacionToken
}

// pedidoConColegaALas8 — otro tipo, con el colega, a la misma hora que el
// turno de la víctima: el camino que dispara la regla de no-solapamiento
// del PACIENTE (la de "mismo tipo" no, porque el tipo es otro).
//
// `tok` es la prueba de mail de quien pide: vacía, se verifica `mail` de
// cero (el tercero); con valor, se usa esa (el paciente real, con la que
// le reemitió su turno anterior).
func pedidoConColegaALas8(t *testing.T, router http.Handler, sender *capturingMailSender, slug string, colegaID uuid.UUID, mail, tok string) (int, string) {
	t.Helper()
	if tok == "" {
		tok = verificarEmailDePrueba(t, router, sender, slug, mail)
	}
	req := solicitudDePrueba("Ortodoncia", fechaDePruebaDisponibilidad, "08:00", tok)
	req.EmailContacto = mail
	req.ProfesionalID = colegaID.String()
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos", req)
	return rec.Code, rec.Body.String()
}

func TestTurnoPublico_UnTerceroConSoloElDNINoVeElTurnoDeOtro(t *testing.T) {
	router, _, sender, slug, colegaID, _ := escenarioDosProfesionales(t)

	// Mismo DNI, pero SU propio mail: no demostró ser esa persona.
	code, body := pedidoConColegaALas8(t, router, sender, slug, colegaID, "tercero@example.com", "")

	if code != http.StatusConflict {
		t.Fatalf("status=%d, esperaba 409 — la regla que protege al paciente tiene que seguir bloqueando. body=%s", code, body)
	}
	// Nada de lo que solo la persona del DNI tiene derecho a saber.
	for _, prohibido := range []string{"08:00", "08:30", "03/06", "María", "Games", "Consulta general"} {
		if strings.Contains(body, prohibido) {
			t.Errorf("la respuesta a un tercero revela %q: %s", prohibido, body)
		}
	}
}

// El control: sin esto, el test de arriba pasaría también si el arreglo
// hubiera escondido el detalle para TODO el mundo. Quien sí probó ser la
// persona —su mail es el de la ficha— sigue viendo con quién y a qué hora
// tiene el turno que le impide sacar este.
func TestTurnoPublico_ElPacienteRealSigueViendoElDetalleDeSuTurno(t *testing.T) {
	router, _, sender, slug, colegaID, tokVictima := escenarioDosProfesionales(t)

	code, body := pedidoConColegaALas8(t, router, sender, slug, colegaID, "bruno@example.com", tokVictima)

	if code != http.StatusConflict {
		t.Fatalf("status=%d, esperaba 409. body=%s", code, body)
	}
	if !strings.Contains(body, "08:00") || !strings.Contains(body, "08:30") {
		t.Errorf("el paciente real tendría que ver el horario de su turno: %s", body)
	}
}

// Y el nombre del profesional en esos mensajes nunca cae al mail: la
// regla de la página pública (`nombresPublicosDeProfesionales`) que el
// wizard no cumplía porque usaba el helper del panel.
func TestTurnoPublico_ElMensajeNuncaNombraAlProfesionalPorSuMail(t *testing.T) {
	router, gdb, sender, slug, colegaID, tokVictima := escenarioDosProfesionales(t)

	// Un titular sin nombre en el perfil: el caso en que el helper del
	// panel caía al mail.
	if err := gdb.Model(&db.ProfessionalProfile{}).
		Where("user_id = ?", userIDDelMail(t, gdb, "privacidad@example.com")).
		Updates(map[string]any{"nombre": "", "apellido": ""}).Error; err != nil {
		t.Fatalf("no se pudo vaciar el perfil: %v", err)
	}

	code, body := pedidoConColegaALas8(t, router, sender, slug, colegaID, "bruno@example.com", tokVictima)

	if code != http.StatusConflict {
		t.Fatalf("status=%d, esperaba 409. body=%s", code, body)
	}
	if strings.Contains(body, "privacidad@example.com") {
		t.Errorf("el mensaje público nombra al profesional por su mail: %s", body)
	}
	if !strings.Contains(body, "Profesional de la clínica") {
		t.Errorf("esperaba el rótulo genérico en lugar del nombre: %s", body)
	}
}
