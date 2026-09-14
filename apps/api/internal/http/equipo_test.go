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
