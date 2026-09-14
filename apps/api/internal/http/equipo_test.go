package http

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"dental-mirage/api/internal/db"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Fase 3.2.4 — el equipo de la clínica.
//
// Lo que estos tests protegen: que nadie quede adentro de una clínica sin
// haber dicho que sí, y que quien invita no pueda equivocarse de persona
// en silencio.

func leerEquipo(t *testing.T, router http.Handler, token string) equipoResponse {
	t.Helper()
	rec := doJSONAuth(t, router, http.MethodGet, "/equipo", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /equipo: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp equipoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	return resp
}

// invitadoDePrueba deja una cuenta lista para recibir invitaciones: mail
// verificado y perfil cargado, sin ninguna clínica.
func invitadoDePrueba(t *testing.T, router http.Handler, gdb *gorm.DB, email string, tipoPerfil string) string {
	t.Helper()
	token := registrarYVerificarDePrueba(t, router, gdb, email)

	req := onboardingPerfilRequest{
		TipoPerfil: tipoPerfil,
		Nombre:     "Invitada", Apellido: "De Prueba", Telefono: "+5493511234567",
	}
	if tipoPerfil == db.PerfilTipoProfesional {
		var especialidad db.Especialidad
		if err := gdb.Where("nombre = ?", "Odontología general").First(&especialidad).Error; err != nil {
			t.Fatalf("no se encontró la especialidad de prueba: %v", err)
		}
		req.MatriculaTipo = db.MatriculaTipoNacional
		req.MatriculaNumero = "MP-" + email[:3]
		req.EspecialidadIDs = []string{especialidad.ID.String()}
	}
	rec := doJSONAuth(t, router, http.MethodPatch, "/onboarding/perfil", token, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("perfil del invitado: status=%d body=%s", rec.Code, rec.Body.String())
	}
	return token
}

func invitacionesDe(t *testing.T, router http.Handler, token string) []invitacionRecibidaResponse {
	t.Helper()
	return leerMisClinicas(t, router, token).Invitaciones
}

// TestEquipo_InvitarPorMailQuedaPendienteHastaQueAcepta — el recorrido
// completo, que es lo que de verdad hay que proteger: la clínica invita,
// la persona LO VE en su pantalla, confirma, y recién ahí es miembro.
func TestEquipo_InvitarPorMailQuedaPendienteHastaQueAcepta(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-equipo@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Equipo",
	})
	invitada := invitadoDePrueba(t, router, gdb, "recepcion-equipo@example.com", db.PerfilTipoActividades)

	rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", titular.Token, invitarColaboradorRequest{
		Rol: db.RoleRecepcion, Email: "recepcion-equipo@example.com",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("invitar: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Todavía NO es miembro: aparece como pendiente del lado de la clínica.
	equipo := leerEquipo(t, router, titular.Token)
	if len(equipo.Miembros) != 1 {
		t.Errorf("miembros = %d, esperaba solo al titular", len(equipo.Miembros))
	}
	if len(equipo.Pendientes) != 1 || equipo.Pendientes[0].Email != "recepcion-equipo@example.com" {
		t.Fatalf("pendientes = %+v", equipo.Pendientes)
	}

	// Y el mail salió.
	if sender.invitacionEnviadaA("recepcion-equipo@example.com") == nil {
		t.Error("no se mandó el mail de invitación")
	}

	// Del lado de la invitada: la ve en su pantalla de clínicas.
	pendientes := invitacionesDe(t, router, invitada)
	if len(pendientes) != 1 || pendientes[0].NombreClinica != "Clínica Equipo" {
		t.Fatalf("invitaciones recibidas = %+v", pendientes)
	}

	// Confirma, y recién ahí entra.
	rec = doJSONAuth(t, router, http.MethodPost, "/me/invitaciones/"+pendientes[0].ID+"/aceptar", invitada, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("aceptar: status=%d body=%s", rec.Code, rec.Body.String())
	}

	clinicas := leerMisClinicas(t, router, invitada)
	if len(clinicas.Clinicas) != 1 || clinicas.Clinicas[0].Nombre != "Clínica Equipo" {
		t.Fatalf("después de aceptar, sus clínicas son %+v", clinicas.Clinicas)
	}
	if len(clinicas.Invitaciones) != 0 {
		t.Errorf("la invitación aceptada sigue figurando como pendiente: %+v", clinicas.Invitaciones)
	}
	equipo = leerEquipo(t, router, titular.Token)
	if len(equipo.Miembros) != 2 || len(equipo.Pendientes) != 0 {
		t.Errorf("equipo tras aceptar: %d miembros, %d pendientes", len(equipo.Miembros), len(equipo.Pendientes))
	}
}

// TestEquipo_InvitarPorCodigoTampocoSumaAlInstante — el brief original
// decía que el código sumaba al instante; el cliente lo corrigió después
// ("las clínicas a las que me han invitado o yo haya pasado el código, se
// verán... como pendiente a confirmar"). Compartir un código es
// ofrecerse, no aceptar.
func TestEquipo_InvitarPorCodigoTampocoSumaAlInstante(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-codigo@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Código",
	})
	invitado := invitadoDePrueba(t, router, gdb, "colega-codigo@example.com", db.PerfilTipoProfesional)

	rec := doJSONAuth(t, router, http.MethodPost, "/me/codigo-invitacion", invitado, nil)
	var codigo codigoInvitacionResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &codigo)

	rec = doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", titular.Token, invitarColaboradorRequest{
		Rol: db.RoleProfesional, Codigo: codigo.Codigo,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("invitar por código: status=%d body=%s", rec.Code, rec.Body.String())
	}

	// El mail sale del PERFIL de esa persona, no de lo que se tipeó: por
	// este camino un error de tipeo en la dirección no existe.
	var resp invitarColaboradorResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Email != "colega-codigo@example.com" || !resp.PorCodigo {
		t.Errorf("respuesta = %+v", resp)
	}

	equipo := leerEquipo(t, router, titular.Token)
	if len(equipo.Miembros) != 1 {
		t.Errorf("el código sumó a alguien sin que confirmara: %d miembros", len(equipo.Miembros))
	}
	if len(invitacionesDe(t, router, invitado)) != 1 {
		t.Error("la invitación por código no le aparece a la persona")
	}
}

func TestEquipo_UnCodigoVencidoNoSirve(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-vencido@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Vencida",
	})
	invitado := invitadoDePrueba(t, router, gdb, "colega-vencido@example.com", db.PerfilTipoProfesional)

	rec := doJSONAuth(t, router, http.MethodPost, "/me/codigo-invitacion", invitado, nil)
	var codigo codigoInvitacionResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &codigo)

	if err := gdb.Model(&db.User{}).Where("email = ?", "colega-vencido@example.com").
		Update("codigo_invitacion_expira_at", time.Now().Add(-time.Hour)).Error; err != nil {
		t.Fatalf("no se pudo vencer el código: %v", err)
	}

	rec = doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", titular.Token, invitarColaboradorRequest{
		Rol: db.RoleProfesional, Codigo: codigo.Codigo,
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba 404 con un código vencido", rec.Code)
	}
}

// Los dos avisos que pide el brief.
func TestEquipo_AvisosDeYaEsMiembroYYaTieneInvitacion(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-avisos@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Avisos",
	})
	invitada := invitadoDePrueba(t, router, gdb, "repetida@example.com", db.PerfilTipoActividades)

	invitar := func() int {
		rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", titular.Token, invitarColaboradorRequest{
			Rol: db.RoleRecepcion, Email: "repetida@example.com",
		})
		return rec.Code
	}

	if code := invitar(); code != http.StatusCreated {
		t.Fatalf("primera invitación: status=%d", code)
	}
	if code := invitar(); code != http.StatusConflict {
		t.Errorf("status = %d, esperaba 409 por invitación pendiente", code)
	}

	pendientes := invitacionesDe(t, router, invitada)
	rec := doJSONAuth(t, router, http.MethodPost, "/me/invitaciones/"+pendientes[0].ID+"/aceptar", invitada, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("aceptar: status=%d body=%s", rec.Code, rec.Body.String())
	}

	if code := invitar(); code != http.StatusConflict {
		t.Errorf("status = %d, esperaba 409 porque ya trabaja en la clínica", code)
	}
}

// TestEquipo_SoloElTitularInvita — el brief: "el creador: el responsable
// de asignar roles e invitar a sus colegas".
func TestEquipo_SoloElTitularInvita(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-permiso@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Permiso",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-permiso@example.com", db.RoleProfesional)

	rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", tokenColega, invitarColaboradorRequest{
		Rol: db.RoleRecepcion, Email: "otra@example.com",
	})
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba 403 para quien no es el titular", rec.Code)
	}

	// Pero VER el equipo sí puede: saber con quién se trabaja no es un
	// permiso especial.
	equipo := leerEquipo(t, router, tokenColega)
	if len(equipo.Miembros) != 2 {
		t.Errorf("miembros = %d, esperaba 2", len(equipo.Miembros))
	}
	if equipo.PuedeInvitar {
		t.Error("puedeInvitar = true para quien no es el titular")
	}
}

// TestEquipo_NadieAceptaLaInvitacionDeOtro — el id de una invitación no es
// secreto: viaja en la pantalla de quien invitó. Sin esta verificación,
// cualquiera con sesión se metería en una clínica ajena.
func TestEquipo_NadieAceptaLaInvitacionDeOtro(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-ajena@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Ajena Inv",
	})
	invitada := invitadoDePrueba(t, router, gdb, "para-ella@example.com", db.PerfilTipoActividades)
	colado := invitadoDePrueba(t, router, gdb, "colado-inv@example.com", db.PerfilTipoActividades)

	rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", titular.Token, invitarColaboradorRequest{
		Rol: db.RoleRecepcion, Email: "para-ella@example.com",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("invitar: status=%d", rec.Code)
	}
	pendientes := invitacionesDe(t, router, invitada)
	if len(pendientes) != 1 {
		t.Fatalf("pendientes = %+v", pendientes)
	}

	rec = doJSONAuth(t, router, http.MethodPost, "/me/invitaciones/"+pendientes[0].ID+"/aceptar", colado, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperaba 404 al aceptar una invitación ajena", rec.Code)
	}

	// Y no entró a ningún lado.
	if clinicas := leerMisClinicas(t, router, colado); len(clinicas.Clinicas) != 0 {
		t.Errorf("el colado quedó adentro de %d clínicas", len(clinicas.Clinicas))
	}
}

// TestEquipo_AceptarComoProfesionalExigeMatricula — misma regla que crear
// la clínica propia o entrar a atender (Fase 3.2.3): quien se sumó a la
// app para hacer recepción no tiene matrícula.
func TestEquipo_AceptarComoProfesionalExigeMatricula(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-matricula@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Matrícula",
	})
	sinMatricula := invitadoDePrueba(t, router, gdb, "sin-matricula@example.com", db.PerfilTipoActividades)

	rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", titular.Token, invitarColaboradorRequest{
		Rol: db.RoleProfesional, Email: "sin-matricula@example.com",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("invitar: status=%d", rec.Code)
	}
	pendientes := invitacionesDe(t, router, sinMatricula)

	rec = doJSONAuth(t, router, http.MethodPost, "/me/invitaciones/"+pendientes[0].ID+"/aceptar", sinMatricula, nil)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba 403 al aceptar como profesional sin matrícula. body=%s", rec.Code, rec.Body.String())
	}
}

// TestEquipo_QuitarNoBorraLaMembresiaNiAlTitular — la membresía se marca,
// nunca se borra (TR-137): la FK compuesta de `turnos` bloquearía la baja
// de cualquier profesional con historial, y ese historial tiene que
// sobrevivir a que la persona se vaya.
func TestEquipo_QuitarNoBorraLaMembresiaNiAlTitular(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-quitar@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Quitar",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-quitar@example.com", db.RoleProfesional)

	var colega db.User
	if err := gdb.Where("email = ?", "colega-quitar@example.com").First(&colega).Error; err != nil {
		t.Fatalf("no se encontró al colega: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodDelete, "/equipo/miembros/"+colega.ID.String(), titular.Token, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("quitar: status=%d body=%s", rec.Code, rec.Body.String())
	}

	var miembro db.ClinicMember
	if err := gdb.Where("clinic_id = ? AND user_id = ?", clinicID, colega.ID).First(&miembro).Error; err != nil {
		t.Fatalf("la membresía se borró en vez de marcarse: %v", err)
	}
	if miembro.Status != db.ClinicMemberStatusRemoved {
		t.Errorf("status = %q, esperaba removed", miembro.Status)
	}

	// Y al titular no se lo puede quitar: sin él la clínica queda sin
	// nadie que pueda invitar ni repartir roles.
	var duenio db.User
	_ = gdb.Where("email = ?", "titular-quitar@example.com").First(&duenio).Error
	rec = doJSONAuth(t, router, http.MethodDelete, "/equipo/miembros/"+duenio.ID.String(), titular.Token, nil)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba 403 al intentar quitar al titular", rec.Code)
	}
}

// TestEquipo_VolverASumarAQuienSeFue — la membresía marcada `removed`
// sigue ahí, y el índice único (clinic_id, user_id) rechazaría una
// segunda. Aceptar tiene que REACTIVAR la que existe.
func TestEquipo_VolverASumarAQuienSeFue(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-reingreso@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Reingreso",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	invitada := invitadoDePrueba(t, router, gdb, "vuelve@example.com", db.PerfilTipoActividades)

	var user db.User
	_ = gdb.Where("email = ?", "vuelve@example.com").First(&user).Error
	miembro := db.ClinicMember{ClinicID: clinicID, UserID: user.ID, Status: db.ClinicMemberStatusRemoved}
	if err := gdb.Create(&miembro).Error; err != nil {
		t.Fatalf("no se pudo preparar la membresía vieja: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", titular.Token, invitarColaboradorRequest{
		Rol: db.RoleRecepcion, Email: "vuelve@example.com",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("invitar: status=%d body=%s", rec.Code, rec.Body.String())
	}
	pendientes := invitacionesDe(t, router, invitada)
	rec = doJSONAuth(t, router, http.MethodPost, "/me/invitaciones/"+pendientes[0].ID+"/aceptar", invitada, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("aceptar el reingreso: status=%d body=%s", rec.Code, rec.Body.String())
	}

	var cuantas int64
	gdb.Model(&db.ClinicMember{}).Where("clinic_id = ? AND user_id = ?", clinicID, user.ID).Count(&cuantas)
	if cuantas != 1 {
		t.Errorf("quedaron %d membresías para la misma persona en la misma clínica", cuantas)
	}
}

func TestEquipo_RechazarBorraLaInvitacion(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-rechazo@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Rechazo",
	})
	invitada := invitadoDePrueba(t, router, gdb, "rechaza@example.com", db.PerfilTipoActividades)

	rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", titular.Token, invitarColaboradorRequest{
		Rol: db.RoleRecepcion, Email: "rechaza@example.com",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("invitar: status=%d", rec.Code)
	}
	pendientes := invitacionesDe(t, router, invitada)

	rec = doJSONAuth(t, router, http.MethodDelete, "/me/invitaciones/"+pendientes[0].ID, invitada, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("rechazar: status=%d body=%s", rec.Code, rec.Body.String())
	}

	if len(invitacionesDe(t, router, invitada)) != 0 {
		t.Error("la invitación rechazada sigue apareciendo")
	}
	// Y la clínica puede volver a invitar: rechazar libera el "ya tiene
	// una invitación pendiente", por si fue un malentendido.
	rec = doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", titular.Token, invitarColaboradorRequest{
		Rol: db.RoleRecepcion, Email: "rechaza@example.com",
	})
	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, esperaba poder volver a invitar tras un rechazo", rec.Code)
	}
}

// TestEquipo_CancelarYReenviarUnaInvitacion — los dos botones de la
// tarjeta pendiente. Estaban probados del lado de la pantalla (con la
// acción mockeada) y no del lado del backend: el gate de cobertura fue el
// que lo marcó, con 9% y 7% en esos dos handlers. Un endpoint que solo
// prueba el frontend con un mock no está probado.
func TestEquipo_CancelarYReenviarUnaInvitacion(t *testing.T) {
	router, gdb, sender := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-cancelar@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Cancelar",
	})

	invitar := func(email string) string {
		t.Helper()
		rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", titular.Token, invitarColaboradorRequest{
			Rol: db.RoleRecepcion, Email: email,
		})
		if rec.Code != http.StatusCreated {
			t.Fatalf("invitar: status=%d body=%s", rec.Code, rec.Body.String())
		}
		var resp invitarColaboradorResponse
		_ = json.Unmarshal(rec.Body.Bytes(), &resp)
		return resp.ID
	}

	id := invitar("pendiente@example.com")

	// Reenviar renueva el vencimiento: si no, una invitación de hace ocho
	// días se reenviaría vencida, y la persona recibiría un mail que no
	// sirve para nada.
	viejo := time.Now().Add(2 * time.Hour)
	if err := gdb.Model(&db.ClinicInvitation{}).Where("id = ?", id).Update("expires_at", viejo).Error; err != nil {
		t.Fatalf("no se pudo acortar el vencimiento: %v", err)
	}
	rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones/"+id+"/reenviar", titular.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("reenviar: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var invitacion db.ClinicInvitation
	_ = gdb.First(&invitacion, "id = ?", id).Error
	if !invitacion.ExpiresAt.After(viejo.Add(time.Hour)) {
		t.Errorf("reenviar no renovó el vencimiento: %v", invitacion.ExpiresAt)
	}
	if sender.invitacionEnviadaA("pendiente@example.com") == nil {
		t.Error("reenviar no mandó el mail")
	}

	// Cancelar la saca de la lista, y libera el "ya tiene una invitación
	// pendiente" — por si fue un error de mail.
	rec = doJSONAuth(t, router, http.MethodDelete, "/equipo/invitaciones/"+id, titular.Token, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("cancelar: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if equipo := leerEquipo(t, router, titular.Token); len(equipo.Pendientes) != 0 {
		t.Errorf("la invitación cancelada sigue pendiente: %+v", equipo.Pendientes)
	}
	invitar("pendiente@example.com")
}

// TestEquipo_NoSeTocaLaInvitacionDeOtraClinica — el id de una invitación
// no dice de qué clínica es. Sin acotar la búsqueda a la clínica activa,
// el titular de una podría cancelar las invitaciones de otra.
func TestEquipo_NoSeTocaLaInvitacionDeOtraClinica(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	unaClinica := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-una@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Una",
	})
	otraClinica := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-otra@example.com", Password: "unaClaveLarga123", Nombre: "Otra", NombreClinica: "Clínica Otra",
	})

	rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", unaClinica.Token, invitarColaboradorRequest{
		Rol: db.RoleRecepcion, Email: "invitada-de-una@example.com",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("invitar: status=%d", rec.Code)
	}
	var resp invitarColaboradorResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)

	for _, caso := range []struct {
		nombre string
		metodo string
		ruta   string
	}{
		{"cancelar", http.MethodDelete, "/equipo/invitaciones/" + resp.ID},
		{"reenviar", http.MethodPost, "/equipo/invitaciones/" + resp.ID + "/reenviar"},
	} {
		rec := doJSONAuth(t, router, caso.metodo, caso.ruta, otraClinica.Token, nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s desde otra clínica: status = %d, esperaba 404", caso.nombre, rec.Code)
		}
	}

	// Y sigue ahí.
	if equipo := leerEquipo(t, router, unaClinica.Token); len(equipo.Pendientes) != 1 {
		t.Errorf("la invitación desapareció: %+v", equipo.Pendientes)
	}
}

// TestEquipo_InvitarConDatosIncompletos — los rechazos de forma. Sin esto,
// un rol vacío crearía una invitación que nadie puede aceptar (el motor
// rechaza el rol al asignarlo, recién al final del recorrido).
func TestEquipo_InvitarConDatosIncompletos(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-forma@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Forma",
	})

	casos := []struct {
		nombre string
		req    invitarColaboradorRequest
	}{
		{"sin rol", invitarColaboradorRequest{Email: "alguien@example.com"}},
		{"rol inventado", invitarColaboradorRequest{Rol: "jefe", Email: "alguien@example.com"}},
		{"sin código ni mail", invitarColaboradorRequest{Rol: db.RoleRecepcion}},
		{"código Y mail", invitarColaboradorRequest{Rol: db.RoleRecepcion, Codigo: "PR-ABCD-EFGH", Email: "alguien@example.com"}},
	}
	for _, caso := range casos {
		rec := doJSONAuth(t, router, http.MethodPost, "/equipo/invitaciones", titular.Token, caso.req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, esperaba 400", caso.nombre, rec.Code)
		}
	}
}

// TestEquipo_QuitarAQuienNoEstaEsUn404 — y a un id que ni siquiera es un
// uuid, también: la ruta no puede reventar con lo que le manden.
func TestEquipo_QuitarAQuienNoEstaEsUn404(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-404@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica 404",
	})

	for _, id := range []string{uuid.New().String(), "no-es-un-uuid"} {
		rec := doJSONAuth(t, router, http.MethodDelete, "/equipo/miembros/"+id, titular.Token, nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("quitar %q: status = %d, esperaba 404", id, rec.Code)
		}
	}
}

// TestEquipo_CambiarLosRolesDeUnColaborador — la otra mitad de lo que el
// brief le da al creador: "el responsable de ASIGNAR ROLES e invitar a sus
// colegas". Con esto se delega la página (rol `admin`) a alguien que ya
// está en el equipo.
func TestEquipo_CambiarLosRolesDeUnColaborador(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-roles@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Roles",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-roles@example.com", db.RoleRecepcion)

	var colega db.User
	if err := gdb.Where("email = ?", "colega-roles@example.com").First(&colega).Error; err != nil {
		t.Fatalf("no se encontró al colega: %v", err)
	}

	// Recepción + administración de la página: se acumulan, son tags.
	rec := doJSONAuth(t, router, http.MethodPut, "/equipo/miembros/"+colega.ID.String()+"/roles", titular.Token,
		cambiarRolesRequest{Roles: []string{db.RoleRecepcion, db.RoleAdmin}})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("cambiar roles: status=%d body=%s", rec.Code, rec.Body.String())
	}

	equipo := leerEquipo(t, router, titular.Token)
	var roles []string
	for _, m := range equipo.Miembros {
		if m.UserID == colega.ID.String() {
			roles = m.Roles
		}
	}
	if len(roles) != 2 || !tieneRol(roles, db.RoleAdmin) || !tieneRol(roles, db.RoleRecepcion) {
		t.Fatalf("roles = %v, esperaba recepcion + admin", roles)
	}

	// Y al quitarle admin, se va: se manda el juego COMPLETO, no un
	// agregado.
	rec = doJSONAuth(t, router, http.MethodPut, "/equipo/miembros/"+colega.ID.String()+"/roles", titular.Token,
		cambiarRolesRequest{Roles: []string{db.RoleRecepcion}})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("quitar admin: status=%d body=%s", rec.Code, rec.Body.String())
	}
	equipo = leerEquipo(t, router, titular.Token)
	for _, m := range equipo.Miembros {
		if m.UserID == colega.ID.String() && tieneRol(m.Roles, db.RoleAdmin) {
			t.Error("el rol admin sobrevivió a un cambio que no lo incluía")
		}
	}
}

func TestEquipo_CambiarRolesRechazaLoQueNoCorresponde(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-roles2@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Roles 2",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-roles2@example.com", db.RoleRecepcion)

	var colega, duenio db.User
	_ = gdb.Where("email = ?", "colega-roles2@example.com").First(&colega).Error
	_ = gdb.Where("email = ?", "titular-roles2@example.com").First(&duenio).Error

	casos := []struct {
		nombre   string
		userID   string
		roles    []string
		esperado int
	}{
		// Sin roles, la persona queda adentro del panel sin que ninguna
		// regla pueda decidir nada sobre ella.
		{"sin roles", colega.ID.String(), []string{}, http.StatusBadRequest},
		// `owner` no se reparte: se es dueño por haber creado la clínica.
		{"owner", colega.ID.String(), []string{db.RoleOwner}, http.StatusBadRequest},
		{"rol inventado", colega.ID.String(), []string{"jefe"}, http.StatusBadRequest},
		// Los excluyentes los rechaza el motor (índice único parcial).
		{"profesional y recepción", colega.ID.String(), []string{db.RoleProfesional, db.RoleRecepcion}, http.StatusConflict},
		// El titular no se toca.
		{"al titular", duenio.ID.String(), []string{db.RoleRecepcion}, http.StatusForbidden},
	}
	for _, caso := range casos {
		rec := doJSONAuth(t, router, http.MethodPut, "/equipo/miembros/"+caso.userID+"/roles", titular.Token,
			cambiarRolesRequest{Roles: caso.roles})
		if rec.Code != caso.esperado {
			t.Errorf("%s: status = %d, esperaba %d. body=%s", caso.nombre, rec.Code, caso.esperado, rec.Body.String())
		}
	}
}

// TestEquipo_PasarAProfesionalExigeMatricula — la cuarta puerta de la
// misma regla (crear la clínica propia, entrar a atender, aceptar una
// invitación de profesional, y ahora recibir el rol). Un rol que deja a
// alguien atendiendo sin matrícula ni especialidades es justo lo que la
// página pública muestra de quien atiende.
func TestEquipo_PasarAProfesionalExigeMatricula(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-roles3@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Roles 3",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)

	// Alguien que entró a la app para hacer recepción: sin matrícula.
	invitada := invitadoDePrueba(t, router, gdb, "recepcion-sube@example.com", db.PerfilTipoActividades)
	_ = invitada
	var user db.User
	_ = gdb.Where("email = ?", "recepcion-sube@example.com").First(&user).Error
	miembro := db.ClinicMember{ClinicID: clinicID, UserID: user.ID, Status: db.ClinicMemberStatusActive}
	if err := gdb.Create(&miembro).Error; err != nil {
		t.Fatalf("no se pudo sumar a la clínica: %v", err)
	}
	if err := db.AsignarRol(gdb, miembro.ID, db.RoleRecepcion); err != nil {
		t.Fatalf("no se pudo asignar el rol: %v", err)
	}

	rec := doJSONAuth(t, router, http.MethodPut, "/equipo/miembros/"+user.ID.String()+"/roles", titular.Token,
		cambiarRolesRequest{Roles: []string{db.RoleProfesional}})
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba 409 al hacer profesional a quien no cargó matrícula. body=%s", rec.Code, rec.Body.String())
	}
}

// Y un colaborador cualquiera no reparte roles: es cosa del titular.
func TestEquipo_SoloElTitularCambiaRoles(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Email: "titular-roles4@example.com", Password: "unaClaveLarga123", Nombre: "Ana", NombreClinica: "Clínica Roles 4",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-roles4@example.com", db.RoleProfesional)
	otro := sumarColaboradorDePrueba(t, gdb, router, clinicID, "otro-roles4@example.com", db.RoleRecepcion)
	_ = otro

	var victima db.User
	_ = gdb.Where("email = ?", "otro-roles4@example.com").First(&victima).Error

	rec := doJSONAuth(t, router, http.MethodPut, "/equipo/miembros/"+victima.ID.String()+"/roles", tokenColega,
		cambiarRolesRequest{Roles: []string{db.RoleAdmin}})
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, esperaba 403 para quien no es el titular", rec.Code)
	}
}
