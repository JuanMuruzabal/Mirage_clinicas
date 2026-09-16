package http

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// El wizard público con N profesionales (Fase 3.2.7).
//
// Lo que estos tests fijan es la mitad que no se ve mirando la pantalla:
// que el turno entre en la agenda de QUIEN el paciente eligió, y que las
// dos reglas que protegen al paciente —que vivían solo en el panel—
// también valgan acá. Mientras todo caía en la agenda del owner ninguna
// podía fallar; desde que hay con quién elegir, este es el único lugar
// donde alguien puede darse cuenta de una colisión: el paciente no ve
// ninguna agenda, y el profesional que lo va a atender tampoco ve la del
// otro.

// clinicaConDosProfesionales — el escenario de toda esta subfase.
//
// Devuelve el titular (que atiende "Consulta general" y "Urgencia" del
// alta), el id de la clínica, el id del colega y su token.
func clinicaConDosProfesionales(
	t *testing.T, gdb *gorm.DB, router http.Handler, email string,
) (clinicaDePruebaResult, uuid.UUID, uuid.UUID, string) {
	t.Helper()
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: email, Password: "unaClaveLarga123",
		Nombre: "Ana Gómez", NombreClinica: "Clínica " + email,
	})
	clinicID := clinicaDePrueba(t, titular.Profesional.ID)
	colegaEmail := "colega-" + email
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, colegaEmail, db.RoleProfesional)
	return titular, clinicID, userIDDelMail(t, gdb, colegaEmail), tokenColega
}

func leerProfesionalesPublicos(t *testing.T, router http.Handler, slug, tipo string) []profesionalPublicoResponse {
	t.Helper()
	rec := doJSON(t, router, http.MethodGet,
		"/clinicas/"+slug+"/profesionales?tipo="+url.QueryEscape(tipo), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /profesionales: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var got []profesionalPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return got
}

// TestProfesionalesPublico_SoloQuienesAtiendenEseTipo — el corazón del
// pedido: "según el tipo de consulta aparecerán los profesionales a
// elegir". No todos atienden todo.
func TestProfesionalesPublico_SoloQuienesAtiendenEseTipo(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, colegaID, _ := clinicaConDosProfesionales(t, gdb, router, "publicoprof1@example.com")
	tipoDe(t, gdb, clinicID, colegaID, "Limpieza dental", 45)

	// "Consulta general" la atienden LOS DOS: viene precargada en todo
	// profesional que se suma a una clínica (2026-09-15).
	deGeneral := leerProfesionalesPublicos(t, router, titular.Profesional.Slug, nombreTipoSembrado)
	if len(deGeneral) != 2 {
		t.Fatalf("%q lo atienden %d profesionales, esperaba 2: %+v", nombreTipoSembrado, len(deGeneral), deGeneral)
	}

	// "Limpieza dental" la tiene solo el colega.
	deLimpieza := leerProfesionalesPublicos(t, router, titular.Profesional.Slug, "Limpieza dental")
	if len(deLimpieza) != 1 || deLimpieza[0].UserID != colegaID.String() {
		t.Fatalf("'Limpieza dental' devolvió %+v, esperaba solo al colega", deLimpieza)
	}
	// Con la duración DE ÉL: es la que define los huecos que se van a
	// ofrecer, y la del titular para ese nombre no existe.
	if deLimpieza[0].DuracionMinutos != 45 {
		t.Errorf("duración = %d, esperaba la del colega (45)", deLimpieza[0].DuracionMinutos)
	}

	// Un tipo que no atiende nadie no existe para el público: 404, no una
	// lista vacía. Con 200 y lista vacía la pantalla no sabe si el tipo
	// desapareció o si están todos de licencia.
	rec := doJSON(t, router, http.MethodGet,
		"/clinicas/"+titular.Profesional.Slug+"/profesionales?tipo=Implante", nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("un tipo que nadie atiende devolvió %d, esperaba 404. body=%s", rec.Code, rec.Body.String())
	}
}

// TestProfesionalesPublico_NuncaPublicaUnMail — el fallback de
// nombresDeLosMiembros (mostrar el mail de quien no cargó perfil) está
// bien entre colegas dentro del panel y sería publicar la dirección de
// una persona en una página abierta a internet.
func TestProfesionalesPublico_NuncaPublicaUnMail(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, colegaID, _ := clinicaConDosProfesionales(t, gdb, router, "publicoprof2@example.com")
	tipoDe(t, gdb, clinicID, colegaID, "Limpieza dental", 30)

	for _, p := range leerProfesionalesPublicos(t, router, titular.Profesional.Slug, "Limpieza dental") {
		if strings.Contains(p.Nombre, "@") {
			t.Errorf("la página pública muestra un mail como nombre de profesional: %q", p.Nombre)
		}
	}
}

// TestTurnoPublico_EntraEnLaAgendaDelProfesionalElegido — hasta esta
// subfase todo turno público caía en la agenda del owner, atendiera él o
// no.
func TestTurnoPublico_EntraEnLaAgendaDelProfesionalElegido(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	titular, clinicID, colegaID, _ := clinicaConDosProfesionales(t, gdb, router, "publicoprof3@example.com")
	tipoDe(t, gdb, clinicID, colegaID, "Limpieza dental", 30)

	token := verificarEmailDePrueba(t, router, sender, titular.Profesional.Slug, "bruno@example.com")
	req := solicitudDePrueba("Limpieza dental", fechaDePruebaDisponibilidad, "08:00", token)
	req.ProfesionalID = colegaID.String()
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+titular.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var turno db.Turno
	if err := gdb.Where("clinic_id = ?", clinicID).First(&turno).Error; err != nil {
		t.Fatalf("no se encontró el turno: %v", err)
	}
	if turno.AtendidoPorUserID == nil || *turno.AtendidoPorUserID != colegaID {
		t.Errorf("el turno quedó en la agenda de %v, esperaba la del colega elegido", turno.AtendidoPorUserID)
	}
	// Y con la fila de tipo DE ÉL, no la del titular: es la que tiene la
	// duración con la que se calcularon los huecos que vio el paciente.
	var tipo db.TipoConsulta
	if err := gdb.First(&tipo, "id = ?", *turno.TipoConsultaID).Error; err != nil {
		t.Fatalf("no se encontró el tipo del turno: %v", err)
	}
	if tipo.UserID == nil || *tipo.UserID != colegaID {
		t.Errorf("el turno usa el tipo de %v, esperaba el del colega", tipo.UserID)
	}
}

// TestTurnoPublico_ProfesionalQueNoAtiendeEseTipoSeRechaza — la
// combinación se valida entera. Aceptar un profesional que no atiende el
// tipo dejaría entrar un turno con la duración de otro.
func TestTurnoPublico_ProfesionalQueNoAtiendeEseTipoSeRechaza(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	titular, clinicID, colegaID, _ := clinicaConDosProfesionales(t, gdb, router, "publicoprof4@example.com")
	tipoDe(t, gdb, clinicID, colegaID, "Limpieza dental", 30)

	// "Limpieza dental" es solo del colega: pedirla con el titular no
	// existe como combinación.
	token := verificarEmailDePrueba(t, router, sender, titular.Profesional.Slug, "bruno@example.com")
	req := solicitudDePrueba("Limpieza dental", fechaDePruebaDisponibilidad, "08:00", token)
	req.ProfesionalID = ownerDePrueba(t, gdb, clinicID).String()
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+titular.Profesional.Slug+"/turnos", req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba 404. body=%s", rec.Code, rec.Body.String())
	}
}

// TestTurnoPublico_NoSePuedeEncimarConOtroProfesional — pendiente
// declarado en la 3.2.5: la regla vivía solo en el alta del panel.
//
// Es el caso que nadie puede ver desde adentro: el paciente no ve ninguna
// agenda, y el profesional que va a atenderlo tampoco ve la del colega.
func TestTurnoPublico_NoSePuedeEncimarConOtroProfesional(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	titular, clinicID, colegaID, _ := clinicaConDosProfesionales(t, gdb, router, "publicoprof5@example.com")
	tipoDe(t, gdb, clinicID, colegaID, "Limpieza dental", 30)
	slug := titular.Profesional.Slug
	const mail = "bruno@example.com"

	// Primer turno: con el titular, 08:00.
	//
	// Los pedidos siguientes usan el token REEMITIDO que devuelve el
	// turno anterior (el mismo que usa el botón "sacar otro turno"): pedir
	// un código nuevo para el mismo mail choca con el rate-limit, que es
	// justamente lo que ese mecanismo existe para evitar.
	token := verificarEmailDePrueba(t, router, sender, slug, mail)
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos",
		solicitudDePrueba(nombreTipoSembrado, fechaDePruebaDisponibilidad, "08:00", token))
	if rec.Code != http.StatusCreated {
		t.Fatalf("primer turno: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp solicitarTurnoPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}

	// Segundo: con el COLEGA, otro tipo (para que no lo frene la regla de
	// tipo repetido) pero a la misma hora.
	req := solicitudDePrueba("Limpieza dental", fechaDePruebaDisponibilidad, "08:00", resp.VerificacionToken)
	req.ProfesionalID = colegaID.String()
	rec = doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos", req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba 409. body=%s", rec.Code, rec.Body.String())
	}
	if cuerpo := rec.Body.String(); !strings.Contains(cuerpo, "Ana Gómez") {
		t.Errorf("el aviso no dice con quién es el turno que choca: %s", cuerpo)
	}

	// La otra dirección: más tarde, sin encimarse, entra. Un bloqueo que
	// rechaza todo no distingue nada.
	req = solicitudDePrueba("Limpieza dental", fechaDePruebaDisponibilidad, "11:00", resp.VerificacionToken)
	req.ProfesionalID = colegaID.String()
	rec = doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos", req)
	if rec.Code != http.StatusCreated {
		t.Errorf("un turno que no se encima tiene que entrar: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

// TestTurnoPublico_UnSoloTurnoActivoPorTipoEnLaClinica — la otra regla
// que faltaba acá, y la que el paciente no puede evitar solo: elegiría a
// otro profesional sin saber que ya tiene ese mismo turno pedido.
//
// Compara por NOMBRE (TR-145): cada profesional tiene su propia fila para
// "Consulta general", así que por id no se vería nunca el turno del otro.
func TestTurnoPublico_UnSoloTurnoActivoPorTipoEnLaClinica(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	titular, clinicID, colegaID, _ := clinicaConDosProfesionales(t, gdb, router, "publicoprof6@example.com")
	// Un tipo NO precargado, que los dos atienden: "Consulta general" y
	// "Urgencia" son la excepción de la regla (vienen en todos los
	// profesionales, ver esTipoPrecargado).
	titularID := ownerDePrueba(t, gdb, clinicID)
	tipoDe(t, gdb, clinicID, titularID, "Limpieza dental", 30)
	tipoDe(t, gdb, clinicID, colegaID, "Limpieza Dental", 30)
	slug := titular.Profesional.Slug
	const mail = "bruno@example.com"

	token := verificarEmailDePrueba(t, router, sender, slug, mail)
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos",
		solicitudDePrueba("Limpieza dental", fechaDePruebaDisponibilidad, "08:00", token))
	if rec.Code != http.StatusCreated {
		t.Fatalf("primer turno: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp solicitarTurnoPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}

	// Mismo tipo, otro profesional, otro horario: igual se rechaza. Con el
	// token reemitido del turno anterior, que es con lo que el wizard
	// ofrece "sacar otro turno".
	req := solicitudDePrueba("Limpieza dental", fechaDePruebaDisponibilidad, "11:00", resp.VerificacionToken)
	req.ProfesionalID = colegaID.String()
	rec = doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos", req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba 409. body=%s", rec.Code, rec.Body.String())
	}
	if cuerpo := rec.Body.String(); !strings.Contains(strings.ToLower(cuerpo), "limpieza dental") {
		t.Errorf("el aviso no dice de qué tipo es el turno que ya tiene: %s", cuerpo)
	}

	// Y la excepción: "Consulta general" SÍ se puede con otro profesional
	// (viene precargada en todos, es la puerta de entrada genérica).
	req = solicitudDePrueba(nombreTipoSembrado, fechaDePruebaDisponibilidad, "14:00", resp.VerificacionToken)
	req.ProfesionalID = colegaID.String()
	rec = doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos", req)
	if rec.Code != http.StatusCreated {
		t.Errorf("'Consulta general' con otro profesional tiene que poder sacarse: status=%d body=%s",
			rec.Code, rec.Body.String())
	}
}

// TestDisponibilidadPublica_ConEnlaceSonLosHuecosDelDueno — error que
// estaba desde la 3.2.5: los horarios que se ofrecían eran los del OWNER
// aunque el enlace fuera de un colega, y el turno después entraba en la
// agenda del colega. Se mostraban los huecos de uno y se agendaba con
// otro.
func TestDisponibilidadPublica_ConEnlaceSonLosHuecosDelDueno(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, colegaID, tokenColega := clinicaConDosProfesionales(t, gdb, router, "publicoprof7@example.com")
	tipoDe(t, gdb, clinicID, colegaID, "Limpieza dental", 30)
	slug := titular.Profesional.Slug

	enlace := crearEnlaceTurnoDePrueba(t, router, tokenColega)

	// Un tipo que SOLO tiene el titular: es el que no debe aparecer con el
	// enlace del colega. Los dos precargados los tienen ambos.
	tipoDe(t, gdb, clinicID, ownerDePrueba(t, gdb, clinicID), "Ortodoncia", 45)

	// Con el enlace del colega, el wizard solo puede ofrecer SUS tipos.
	rec := doJSON(t, router, http.MethodGet,
		"/clinicas/"+slug+"/tipos-consulta?enlaceToken="+url.QueryEscape(enlace), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET tipos con enlace: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var tipos []tipoConsultaPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &tipos); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	ofrecidos := map[string]bool{}
	for _, tipo := range tipos {
		ofrecidos[tipo.Nombre] = true
	}
	if !ofrecidos["Limpieza dental"] {
		t.Errorf("con enlace del colega no se ofrece su 'Limpieza dental': %+v", tipos)
	}
	if ofrecidos["Ortodoncia"] {
		t.Errorf("con enlace del colega se ofrece 'Ortodoncia', que solo atiende el titular: %+v", tipos)
	}

	// Y los huecos son los de él: pedir un tipo que NO atiende, con su
	// enlace, no es una combinación válida.
	rec = doJSON(t, router, http.MethodGet,
		"/clinicas/"+slug+"/disponibilidad?tipo="+url.QueryEscape("Ortodoncia")+
			"&enlaceToken="+url.QueryEscape(enlace)+"&fecha="+fechaDePruebaDisponibilidad, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba 404 (ese tipo no lo atiende el dueño del enlace). body=%s", rec.Code, rec.Body.String())
	}
}

// crearEnlaceConOpciones — el enlace con las dos decisiones de la Fase
// 3.2.7b: a qué agenda va, y para qué ficha.
func crearEnlaceConOpciones(t *testing.T, router http.Handler, token string, paraTodos bool, pacienteID string) string {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodPost, "/enlaces-turno", token, crearEnlaceTurnoRequest{
		ParaTodosLosProfesionales: paraTodos, PacienteID: pacienteID,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear enlace: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var creado crearEnlaceTurnoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &creado); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	partes := strings.Split(creado.URL, "enlace=")
	if len(partes) != 2 {
		t.Fatalf("la URL del enlace no trae el token: %s", creado.URL)
	}
	return partes[1]
}

// TestEnlace_ParaTodosDejaElegirProfesional — pedido del cliente: el
// enlace ofrece dos opciones, "vos mismo" o "todos los profesionales".
//
// Con "todos", el wizard vuelve a comportarse como la página pública: se
// ofrecen los tipos de toda la clínica y el turno entra en la agenda de
// quien el paciente elija, no en la de quien generó el link.
func TestEnlace_ParaTodosDejaElegirProfesional(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, colegaID, tokenColega := clinicaConDosProfesionales(t, gdb, router, "enlace-todos@example.com")
	tipoDe(t, gdb, clinicID, colegaID, "Limpieza dental", 30)
	tipoDe(t, gdb, clinicID, ownerDePrueba(t, gdb, clinicID), "Ortodoncia", 45)
	slug := titular.Profesional.Slug

	// El COLEGA genera el link "para todos".
	enlace := crearEnlaceConOpciones(t, router, tokenColega, true, "")

	// La lista de tipos ya no se acota a los suyos: "Ortodoncia" es del
	// titular y también se ofrece.
	rec := doJSON(t, router, http.MethodGet,
		"/clinicas/"+slug+"/tipos-consulta?enlaceToken="+url.QueryEscape(enlace), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET tipos: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var tipos []tipoConsultaPublicoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &tipos); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	ofrecidos := map[string]bool{}
	for _, tipo := range tipos {
		ofrecidos[tipo.Nombre] = true
	}
	if !ofrecidos["Ortodoncia"] {
		t.Errorf("con un enlace para todos no se ofrece 'Ortodoncia', que atiende el titular: %+v", tipos)
	}

	// Y el turno entra en la agenda del elegido, no en la del colega que
	// generó el link.
	titularID := ownerDePrueba(t, gdb, clinicID)
	req := solicitudDePrueba("Ortodoncia", fechaDePruebaDisponibilidad, "08:00", "")
	req.EnlaceToken = enlace
	req.ProfesionalID = titularID.String()
	rec = doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos", req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var turno db.Turno
	if err := gdb.Where("clinic_id = ?", clinicID).Order("created_at DESC").First(&turno).Error; err != nil {
		t.Fatalf("no se encontró el turno: %v", err)
	}
	if turno.AtendidoPorUserID == nil || *turno.AtendidoPorUserID != titularID {
		t.Errorf("el turno quedó en la agenda de %v, esperaba la del profesional elegido", turno.AtendidoPorUserID)
	}
}

// TestEnlace_PropioSigueMandandoElDueno — la otra mitad: el enlace de
// siempre no pregunta con quién, y el turno es de quien lo generó. Es
// para lo que se creó "Compartir link".
func TestEnlace_PropioSigueMandandoElDueno(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, colegaID, tokenColega := clinicaConDosProfesionales(t, gdb, router, "enlace-propio@example.com")
	tipoDe(t, gdb, clinicID, colegaID, "Limpieza dental", 30)
	slug := titular.Profesional.Slug

	enlace := crearEnlaceConOpciones(t, router, tokenColega, false, "")

	// Aunque el cuerpo mande OTRO profesional, manda el dueño del enlace.
	req := solicitudDePrueba("Limpieza dental", fechaDePruebaDisponibilidad, "08:00", "")
	req.EnlaceToken = enlace
	req.ProfesionalID = ownerDePrueba(t, gdb, clinicID).String()
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos", req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var turno db.Turno
	if err := gdb.Where("clinic_id = ?", clinicID).Order("created_at DESC").First(&turno).Error; err != nil {
		t.Fatalf("no se encontró el turno: %v", err)
	}
	if turno.AtendidoPorUserID == nil || *turno.AtendidoPorUserID != colegaID {
		t.Errorf("el turno quedó en la agenda de %v, esperaba la del dueño del enlace", turno.AtendidoPorUserID)
	}
}

// TestEnlace_ConFichaNoVuelveAPedirLosDatos — el enlace generado para una
// ficha concreta: el wizard no le pide nada a esa persona, así que el
// pedido llega sin mail y sin DNI. La identidad la pone el enlace.
func TestEnlace_ConFichaNoVuelveAPedirLosDatos(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, _, _ := clinicaConDosProfesionales(t, gdb, router, "enlace-ficha@example.com")
	slug := titular.Profesional.Slug
	ficha := fichaDePrueba(t, gdb, clinicID, "30111222", "bruno@example.com", false)

	enlace := crearEnlaceConOpciones(t, router, titular.Token, false, ficha.ID.String())

	// Lo que el wizard sabe del link antes de arrancar.
	rec := doJSON(t, router, http.MethodGet,
		"/clinicas/"+slug+"/enlaces-turno/validar?token="+url.QueryEscape(enlace), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("validar: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var info enlaceTurnoValidoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &info); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	if info.Paciente == nil || info.Paciente.ID != ficha.ID.String() {
		t.Fatalf("la validación no dice qué ficha trae el enlace: %+v", info)
	}
	if !info.Paciente.TieneDatosPropios {
		t.Error("la ficha tiene mail y teléfono: el wizard no tendría que pedirlos")
	}
	// Y no más que eso: el mail de un paciente no sale de la clínica.
	if strings.Contains(rec.Body.String(), "bruno@example.com") {
		t.Error("la respuesta pública del enlace filtra el mail del paciente")
	}

	// El pedido llega SIN mail y sin DNI, como lo manda el wizard.
	req := solicitudDePrueba(nombreTipoSembrado, fechaDePruebaDisponibilidad, "08:00", "")
	req.EnlaceToken = enlace
	req.PacienteVerificadoID = ficha.ID.String()
	req.NombreContacto, req.ApellidoContacto, req.DNIContacto = "", "", ""
	req.TelefonoContacto, req.EmailContacto = "", ""
	rec = doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos", req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	var turno db.Turno
	if err := gdb.Where("clinic_id = ?", clinicID).Order("created_at DESC").First(&turno).Error; err != nil {
		t.Fatalf("no se encontró el turno: %v", err)
	}
	if turno.PacienteID == nil || *turno.PacienteID != ficha.ID {
		t.Errorf("el turno quedó vinculado a %v, esperaba la ficha del enlace", turno.PacienteID)
	}
	if turno.DNIContacto != ficha.DNI {
		t.Errorf("DNIContacto = %q, esperaba el de la ficha", turno.DNIContacto)
	}
}

// TestEnlace_NoSirveParaOtraFicha — la excepción es del enlace CON ESA
// ficha, y nada más.
//
// Un enlace se reenvía: sin esta igualdad alcanzaría con tener cualquier
// link de la clínica para reservar a nombre de cualquier ficha cuyo id se
// conociera, que es justo el agujero que el chequeo de identidad vino a
// tapar.
func TestEnlace_NoSirveParaOtraFicha(t *testing.T) {
	router, gdb := newTestRouter(t)
	titular, clinicID, _, _ := clinicaConDosProfesionales(t, gdb, router, "enlace-ajena@example.com")
	slug := titular.Profesional.Slug
	laDelEnlace := fichaDePrueba(t, gdb, clinicID, "30111222", "bruno@example.com", false)
	otra := fichaDePrueba(t, gdb, clinicID, "30999888", "otro@example.com", false)

	enlace := crearEnlaceConOpciones(t, router, titular.Token, false, laDelEnlace.ID.String())

	req := solicitudDePrueba(nombreTipoSembrado, fechaDePruebaDisponibilidad, "08:00", "")
	req.EnlaceToken = enlace
	req.PacienteVerificadoID = otra.ID.String()
	req.NombreContacto, req.ApellidoContacto, req.DNIContacto = "", "", ""
	req.TelefonoContacto, req.EmailContacto = "", ""
	rec := doJSON(t, router, http.MethodPost, "/clinicas/"+slug+"/turnos", req)
	if rec.Code == http.StatusCreated {
		t.Fatal("un enlace sirvió para reservar a nombre de una ficha que no es la suya")
	}
}
