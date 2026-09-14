package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"dental-mirage/api/internal/db"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Fase 3.2.3 — "¿Dónde trabajás hoy?".
//
// Lo que estos tests protegen no es una pantalla: es que la clínica en la
// que una persona está trabajando sea una ELECCIÓN suya y no el resultado
// de un `ORDER BY created_at`. Hasta la 3.2.2 daba igual porque nadie
// tenía dos; a partir de acá, equivocarse de clínica significa ver —y
// cargar— los pacientes de otro lugar.

// sumarAOtraClinicaDePrueba arma una segunda clínica con OTRO titular y
// suma al usuario indicado como profesional. Es la forma de tener a una
// misma persona en dos clínicas antes de que existan las invitaciones
// (Fase 3.2.4).
func sumarAOtraClinicaDePrueba(t *testing.T, gdb *gorm.DB, router http.Handler, email, nombreClinica, mailTitular string) uuid.UUID {
	t.Helper()
	otra := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: mailTitular, Password: "unaClaveLarga123", Nombre: "Otro Titular", NombreClinica: nombreClinica,
	})
	clinicID := uuid.MustParse(otra.Profesional.ID)

	var user db.User
	if err := gdb.Where("email = ?", email).First(&user).Error; err != nil {
		t.Fatalf("no se encontró al usuario %q: %v", email, err)
	}
	member := db.ClinicMember{ClinicID: clinicID, UserID: user.ID, Status: db.ClinicMemberStatusActive}
	if err := gdb.Create(&member).Error; err != nil {
		t.Fatalf("no se pudo sumar a la otra clínica: %v", err)
	}
	if err := db.AsignarRol(gdb, member.ID, db.RoleProfesional); err != nil {
		t.Fatalf("no se pudo asignar el rol: %v", err)
	}
	return clinicID
}

func leerMisClinicas(t *testing.T, router http.Handler, token string) misClinicasResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/me/clinicas", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /me/clinicas: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp misClinicasResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return resp
}

// TestMisClinicas_SeparaLaPropiaDeLasDeColegas — el mockup divide la
// pantalla en "Mi clínica" y "Otras clínicas", así que el backend tiene
// que decir cuál es cuál. No alcanza con el rol: el titular de su clínica
// y un profesional invitado pueden tener los dos rol `profesional`.
func TestMisClinicas_SeparaLaPropiaDeLasDeColegas(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "duena@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Propia",
	})
	sumarAOtraClinicaDePrueba(t, gdb, router, "duena@example.com", "Clínica Ajena", "titular-ajeno@example.com")

	resp := leerMisClinicas(t, router, titular.Token)
	if len(resp.Clinicas) != 2 {
		t.Fatalf("devolvió %d clínicas, esperaba 2", len(resp.Clinicas))
	}

	porNombre := map[string]clinicaDelUsuarioResponse{}
	for _, c := range resp.Clinicas {
		porNombre[c.Nombre] = c
	}
	propia, ajena := porNombre["Clínica Propia"], porNombre["Clínica Ajena"]

	if !propia.EsPropia {
		t.Error("la clínica que creó esta persona tiene que venir marcada como propia")
	}
	if ajena.EsPropia {
		t.Error("la clínica de un colega NO es propia, aunque trabaje ahí")
	}
	if propia.RolPrincipal != db.RoleOwner {
		t.Errorf("rolPrincipal de la propia = %q, esperaba owner", propia.RolPrincipal)
	}
	if ajena.RolPrincipal != db.RoleProfesional {
		t.Errorf("rolPrincipal de la ajena = %q, esperaba profesional", ajena.RolPrincipal)
	}
	// El titular arranca con owner+admin+profesional (Fase 3.2.2), así que
	// cuenta como profesional en su propia clínica.
	if propia.Profesionales != 1 {
		t.Errorf("profesionales de la propia = %d, esperaba 1", propia.Profesionales)
	}
	if ajena.Profesionales != 2 {
		t.Errorf("profesionales de la ajena = %d, esperaba 2 (su titular y esta persona)", ajena.Profesionales)
	}
}

// TestClinicaActiva_ElPanelSigueLaEleccion — el test que de verdad importa:
// no que el endpoint responda 200, sino que ELEGIR una clínica cambie los
// datos que devuelve el panel. Un paciente cargado en una clínica no
// puede verse desde la otra.
func TestClinicaActiva_ElPanelSigueLaEleccion(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	persona := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "dosclinicas@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Mañana",
	})
	otraID := sumarAOtraClinicaDePrueba(t, gdb, router, "dosclinicas@example.com", "Clínica Tarde", "titular-tarde@example.com")

	// Se elige la segunda clínica y se carga ahí un paciente.
	rec := doJSONAuth(t, router, http.MethodPut, "/me/clinica-activa", persona.Token,
		elegirClinicaActivaRequest{ClinicaID: otraID.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("elegir clínica: status=%d body=%s", rec.Code, rec.Body.String())
	}

	rec = doJSONAuth(t, router, http.MethodPost, "/pacientes", persona.Token, crearPacienteRequest{
		Nombre: "Paciente", Apellido: "De Tarde", DNI: "30111222", Telefono: "3510000000", Email: "tarde@example.com",
	})
	if rec.Code != http.StatusCreated && rec.Code != http.StatusOK {
		t.Fatalf("crear paciente: status=%d body=%s", rec.Code, rec.Body.String())
	}

	rec = doJSONAuth(t, router, http.MethodGet, "/pacientes", persona.Token, nil)
	if !strings.Contains(rec.Body.String(), "De Tarde") {
		t.Fatalf("el paciente cargado en la clínica elegida no aparece en su listado: %s", rec.Body.String())
	}

	// Se vuelve a la primera: el paciente de la otra no puede estar acá.
	rec = doJSONAuth(t, router, http.MethodPut, "/me/clinica-activa", persona.Token,
		elegirClinicaActivaRequest{ClinicaID: persona.Profesional.ID})
	if rec.Code != http.StatusOK {
		t.Fatalf("volver a la primera clínica: status=%d body=%s", rec.Code, rec.Body.String())
	}
	rec = doJSONAuth(t, router, http.MethodGet, "/pacientes", persona.Token, nil)
	if strings.Contains(rec.Body.String(), "De Tarde") {
		t.Fatalf("FUGA: el paciente de la otra clínica se ve desde esta: %s", rec.Body.String())
	}

	// Y /me tiene que decir lo mismo que el panel, o el header mostraría
	// una clínica distinta de la que se está viendo.
	rec = doJSONAuth(t, router, http.MethodGet, "/me", persona.Token, nil)
	var me meResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &me); err != nil || me.Clinica == nil {
		t.Fatalf("GET /me no devolvió clínica: %v body=%s", err, rec.Body.String())
	}
	if me.Clinica.Nombre != "Clínica Mañana" {
		t.Errorf("/me devolvió %q, esperaba la clínica activa (Clínica Mañana)", me.Clinica.Nombre)
	}
}

// TestClinicaActiva_UnaClinicaAjenaNoSePuedeElegir — 404 y no 403: que esa
// clínica exista no es información que le corresponda a quien no trabaja
// ahí. Mismo criterio que la ficha de un paciente ajeno (TR-138).
func TestClinicaActiva_UnaClinicaAjenaNoSePuedeElegir(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	persona := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "curiosa@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Curiosa",
	})
	ajena := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "ajena-duena@example.com", Password: "unaClaveLarga123", Nombre: "Otra", NombreClinica: "Clínica De Otro",
	})

	rec := doJSONAuth(t, router, http.MethodPut, "/me/clinica-activa", persona.Token,
		elegirClinicaActivaRequest{ClinicaID: ajena.Profesional.ID})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperaba 404 al elegir una clínica ajena", rec.Code)
	}

	// Y la sesión no quedó apuntando ahí.
	rec = doJSONAuth(t, router, http.MethodGet, "/me", persona.Token, nil)
	var me meResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &me)
	if me.Clinica == nil || me.Clinica.Nombre != "Clínica Curiosa" {
		t.Errorf("la sesión cambió de clínica pese al rechazo: %+v", me.Clinica)
	}
}

// TestClinicaActiva_SiTeSacanDelEquipoLaEleccionDejaDeValer — la elección
// guardada no puede sobrevivir a la membresía que la habilitaba. Si no,
// bastaría con elegir una clínica antes de que te saquen para seguir
// viendo sus pacientes hasta cerrar sesión.
func TestClinicaActiva_SiTeSacanDelEquipoLaEleccionDejaDeValer(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	persona := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "exmiembro@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Propia Ex",
	})
	otraID := sumarAOtraClinicaDePrueba(t, gdb, router, "exmiembro@example.com", "Clínica Que La Saca", "titular-saca@example.com")

	rec := doJSONAuth(t, router, http.MethodPut, "/me/clinica-activa", persona.Token,
		elegirClinicaActivaRequest{ClinicaID: otraID.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("elegir clínica: status=%d", rec.Code)
	}

	// La sacan del equipo (la membresía NO se borra nunca, se marca —
	// TR-137).
	var user db.User
	_ = gdb.Where("email = ?", "exmiembro@example.com").First(&user).Error
	if err := gdb.Model(&db.ClinicMember{}).
		Where("user_id = ? AND clinic_id = ?", user.ID, otraID).
		Update("status", db.ClinicMemberStatusRemoved).Error; err != nil {
		t.Fatalf("no se pudo marcar la membresía como removida: %v", err)
	}

	rec = doJSONAuth(t, router, http.MethodGet, "/me", persona.Token, nil)
	var me meResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &me); err != nil || me.Clinica == nil {
		t.Fatalf("GET /me: %v body=%s", err, rec.Body.String())
	}
	if me.Clinica.Nombre != "Clínica Propia Ex" {
		t.Errorf("/me devolvió %q — la elección guardada sobrevivió a la baja de la membresía", me.Clinica.Nombre)
	}
}

// TestCodigoInvitacion_SeGeneraVigenteYSeRenueva — el código con el que
// una persona se ofrece para que la sumen a una clínica (3.2.4).
func TestCodigoInvitacion_SeGeneraVigenteYSeRenueva(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	persona := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "codigo@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Código",
	})

	// Sin generarlo, no hay nada que mostrar.
	if resp := leerMisClinicas(t, router, persona.Token); resp.CodigoInvitacion != nil {
		t.Fatalf("no debería haber código antes de generarlo: %+v", resp.CodigoInvitacion)
	}

	rec := doJSONAuth(t, router, http.MethodPost, "/me/codigo-invitacion", persona.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("generar código: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var primero codigoInvitacionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &primero); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}

	// Formato PR-XXXX-XXXX, sin caracteres confundibles: el código se
	// dicta por teléfono y se vuelve a tipear del otro lado.
	if len(primero.Codigo) != 12 || !strings.HasPrefix(primero.Codigo, "PR-") || primero.Codigo[7] != '-' {
		t.Errorf("formato inesperado: %q", primero.Codigo)
	}
	if strings.ContainsAny(primero.Codigo[3:], "IO01") {
		t.Errorf("el código tiene caracteres confundibles: %q", primero.Codigo)
	}
	if d := time.Until(primero.VenceAt); d > 24*time.Hour+time.Minute || d < 23*time.Hour {
		t.Errorf("vence en %v, esperaba ~24 horas", d)
	}

	// Aparece en la pantalla.
	resp := leerMisClinicas(t, router, persona.Token)
	if resp.CodigoInvitacion == nil || resp.CodigoInvitacion.Codigo != primero.Codigo {
		t.Fatalf("el código generado no aparece en /me/clinicas: %+v", resp.CodigoInvitacion)
	}

	// "Generar otro" tiene que invalidar al primero — es el motivo por el
	// que alguien pediría otro (lo compartió por donde no debía).
	rec = doJSONAuth(t, router, http.MethodPost, "/me/codigo-invitacion", persona.Token, nil)
	var segundo codigoInvitacionResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &segundo)
	if segundo.Codigo == primero.Codigo {
		t.Fatal("generar otro devolvió el mismo código")
	}
	var user db.User
	_ = gdb.Where("email = ?", "codigo@example.com").First(&user).Error
	if user.CodigoInvitacion == nil || *user.CodigoInvitacion != segundo.Codigo {
		t.Errorf("la base guardó %v, esperaba el último código generado", user.CodigoInvitacion)
	}
}

// TestCodigoInvitacion_VencidoNoSeMuestra — mostrar un código vencido es
// invitar a compartir algo que no va a funcionar del otro lado.
func TestCodigoInvitacion_VencidoNoSeMuestra(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	persona := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "vencido@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Vencida",
	})
	rec := doJSONAuth(t, router, http.MethodPost, "/me/codigo-invitacion", persona.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("generar código: status=%d", rec.Code)
	}

	ayer := time.Now().Add(-time.Hour)
	if err := gdb.Model(&db.User{}).Where("email = ?", "vencido@example.com").
		Update("codigo_invitacion_expira_at", ayer).Error; err != nil {
		t.Fatalf("no se pudo vencer el código: %v", err)
	}

	if resp := leerMisClinicas(t, router, persona.Token); resp.CodigoInvitacion != nil {
		t.Errorf("un código vencido no se muestra: %+v", resp.CodigoInvitacion)
	}
}

// TestClinicaActiva_EntrarComoProfesionalExigeDatosDeProfesional — el caso
// que trae la Fase 3.2.4, escrito antes de que exista: alguien se registra
// para hacer recepcion en una clinica —sin matricula, porque no se le
// pide— y OTRA clinica lo invita a atender pacientes.
//
// Sin este guard entraria a una agenda propia sin matricula ni
// especialidades, que es justo lo que la pagina publica muestra de quien
// atiende.
func TestClinicaActiva_EntrarComoProfesionalExigeDatosDeProfesional(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)

	// Una persona que entro a la app para hacer actividades de la clinica.
	token := registrarYVerificarDePrueba(t, router, gdb, "recepcion-invitada@example.com")
	rec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", token, onboardingPerfilRequest{
		TipoPerfil: db.PerfilTipoActividades,
		Nombre:     "Lucía", Apellido: "Mostrador", Telefono: "+5493511234567",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("alta del perfil: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Dos clinicas la suman: en una hace recepcion, en la otra la quieren
	// atendiendo pacientes.
	deRecepcion := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-recepcion@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Mostrador",
	})
	deProfesional := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-atiende@example.com", Password: "unaClaveLarga123", Nombre: "Otra", NombreClinica: "Clínica Atiende",
	})

	var user db.User
	if err := gdb.Where("email = ?", "recepcion-invitada@example.com").First(&user).Error; err != nil {
		t.Fatalf("no se encontró al usuario: %v", err)
	}
	sumar := func(clinicID uuid.UUID, rol string) {
		t.Helper()
		member := db.ClinicMember{ClinicID: clinicID, UserID: user.ID, Status: db.ClinicMemberStatusActive}
		if err := gdb.Create(&member).Error; err != nil {
			t.Fatalf("no se pudo sumar a la clínica: %v", err)
		}
		if err := db.AsignarRol(gdb, member.ID, rol); err != nil {
			t.Fatalf("no se pudo asignar el rol: %v", err)
		}
	}
	sumar(uuid.MustParse(deRecepcion.Profesional.ID), db.RoleRecepcion)
	sumar(uuid.MustParse(deProfesional.Profesional.ID), db.RoleProfesional)

	// A la de recepción entra sin problema: ahí no atiende a nadie.
	rec = doJSONAuth(t, router, http.MethodPut, "/me/clinica-activa", token,
		elegirClinicaActivaRequest{ClinicaID: deRecepcion.Profesional.ID})
	if rec.Code != http.StatusOK {
		t.Fatalf("entrar como recepción: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// A la otra no, hasta completar los datos que le faltan.
	rec = doJSONAuth(t, router, http.MethodPut, "/me/clinica-activa", token,
		elegirClinicaActivaRequest{ClinicaID: deProfesional.Profesional.ID})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, esperaba 403 body=%s", rec.Code, rec.Body.String())
	}

	// Y la sesión NO cambió de clínica por el intento fallido.
	rec = doJSONAuth(t, router, http.MethodGet, "/me", token, nil)
	var me meResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &me)
	if me.Clinica == nil || me.Clinica.Nombre != "Clínica Mostrador" {
		t.Errorf("la sesión se movió pese al rechazo: %+v", me.Clinica)
	}

	// Completa la matrícula y ahora sí.
	var especialidad db.Especialidad
	_ = gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error
	rec = doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", token, onboardingPerfilRequest{
		TipoPerfil: db.PerfilTipoProfesional,
		Nombre:     "Lucía", Apellido: "Mostrador", Telefono: "+5493511234567",
		MatriculaTipo: db.MatriculaTipoNacional, MatriculaNumero: "MP-7788",
		EspecialidadIDs: []string{especialidad.ID.String()},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("completar datos profesionales: status=%d body=%s", rec.Code, rec.Body.String())
	}

	rec = doJSONAuth(t, router, http.MethodPut, "/me/clinica-activa", token,
		elegirClinicaActivaRequest{ClinicaID: deProfesional.Profesional.ID})
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, esperaba 200 ya con la matrícula cargada. body=%s", rec.Code, rec.Body.String())
	}
}
