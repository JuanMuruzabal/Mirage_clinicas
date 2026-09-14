package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	dmmail "dental-mirage/api/internal/mail"
	"dental-mirage/api/internal/security"
)

// El equipo de la clínica — Fase 3.2.4.
//
// El brief: *"para añadir colaboradores debe haber un botón que diga
// invitar colaborador... primero pedirá el rol, luego donde se ingresará
// el token/código de la persona o el mail"*.
//
// UNA SOLA MECÁNICA PARA LOS DOS CAMINOS. Tanto el código como el mail
// terminan en una fila de `clinic_invitations`, y la membresía recién
// nace cuando la persona **acepta**. La alternativa era que el código
// sumara al instante (como decía el brief original) y solo el mail
// quedara pendiente; la descartó el propio cliente al pedir que "las
// clínicas a las que me han invitado o yo haya pasado el código" se vean
// como pendientes de confirmar. Y es lo correcto de fondo: compartir un
// código es ofrecerse, no aceptar. Nadie queda adentro de una clínica sin
// haber dicho que sí.
//
// La otra razón de peso para elegir `clinic_invitations` y no una
// membresía en estado `invited`: **se puede invitar a un mail que todavía
// no tiene cuenta**, y `clinic_members.user_id` es NOT NULL. Una
// invitación se dirige a una dirección; una membresía, a una persona que
// ya existe.

// InvitacionTTL — una invitación sin aceptar vence a los 7 días. Es lo
// que tarda alguien en volver de unas vacaciones, y lo bastante corto
// para que un mail viejo reenviado no sume a nadie meses después.
const InvitacionTTL = 7 * 24 * time.Hour

func registerEquipoRoutes(r chi.Router, gdb *gorm.DB, sender dmmail.Sender, appBaseURL string) {
	// Ver el equipo lo puede cualquier miembro: saber con quién se trabaja
	// no es un permiso especial, y la 3.2.5 va a mostrar esta misma lista
	// en el header del panel.
	r.Get("/equipo", listarEquipoHandler(gdb))

	// La presencia se lee con el mismo permiso que el equipo, y por el
	// mismo motivo: saber quién está trabajando ahora no es más privado
	// que saber quiénes son. Ver presencia.go — es también el latido de
	// quien pregunta.
	r.Get("/equipo/presencia", presenciaHandler(gdb))

	// Invitar y quitar, solo el titular. El brief: "el creador: el
	// responsable de asignar roles e invitar a sus colegas".
	r.Group(func(r chi.Router) {
		r.Use(requireRol(db.RoleOwner))
		r.Post("/equipo/invitaciones", invitarColaboradorHandler(gdb, sender, appBaseURL))
		r.Post("/equipo/invitaciones/{id}/reenviar", reenviarInvitacionHandler(gdb, sender, appBaseURL))
		r.Delete("/equipo/invitaciones/{id}", cancelarInvitacionHandler(gdb))
		r.Put("/equipo/miembros/{userId}/roles", cambiarRolesHandler(gdb))
		r.Delete("/equipo/miembros/{userId}", quitarColaboradorHandler(gdb))
	})
}

type miembroDelEquipoResponse struct {
	UserID string   `json:"userId"`
	Nombre string   `json:"nombre"`
	Email  string   `json:"email"`
	Roles  []string `json:"roles"`
	// EsTitular — el dueño de la clínica. Su tarjeta no tiene acciones
	// ("no te podés quitar a vos mismo", brief) y va primero.
	EsTitular bool `json:"esTitular"`
	EsVos     bool `json:"esVos"`
	// Presencia (Fase 3.2.5). Viene ya en esta respuesta, además de en
	// /equipo/presencia, para que la primera pintura del popover no
	// muestre a todo el mundo ausente hasta el primer latido.
	UltimaActividad *time.Time `json:"ultimaActividad"`
	EnLinea         bool       `json:"enLinea"`
}

type invitacionPendienteResponse struct {
	ID      string    `json:"id"`
	Email   string    `json:"email"`
	Rol     string    `json:"rol"`
	VenceAt time.Time `json:"venceAt"`
}

type equipoResponse struct {
	Miembros     []miembroDelEquipoResponse    `json:"miembros"`
	Pendientes   []invitacionPendienteResponse `json:"pendientes"`
	PuedeInvitar bool                          `json:"puedeInvitar"`
}

func listarEquipoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		session, _ := sessionFromContext(r)

		var clinica db.Clinic
		if err := gdb.First(&clinica, "id = ?", clinicID).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		var miembros []db.ClinicMember
		if err := gdb.Preload("Roles").
			Where("clinic_id = ? AND status = ?", clinicID, db.ClinicMemberStatusActive).
			Order("created_at").Find(&miembros).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo leer el equipo")
			return
		}

		ultimaPorUsuario := presenciaDeLaClinica(gdb, clinicID)
		corteDePresencia := time.Now().Add(-PresenciaEnLinea)

		resp := equipoResponse{
			Miembros:     []miembroDelEquipoResponse{},
			Pendientes:   []invitacionPendienteResponse{},
			PuedeInvitar: tieneAlgunRol(r, db.RoleOwner),
		}
		for _, miembro := range miembros {
			var user db.User
			if err := gdb.First(&user, "id = ?", miembro.UserID).Error; err != nil {
				continue
			}
			nombre := user.Email
			var perfil db.ProfessionalProfile
			if err := gdb.First(&perfil, "user_id = ?", miembro.UserID).Error; err == nil {
				nombre = strings.TrimSpace(perfil.Nombre + " " + perfil.Apellido)
			}
			fila := miembroDelEquipoResponse{
				UserID: miembro.UserID.String(), Nombre: nombre, Email: user.Email,
				Roles:     rolesDe(miembro),
				EsTitular: clinica.OwnerID == miembro.UserID,
				EsVos:     session != nil && session.UserID == miembro.UserID,
			}
			if ultima, hay := ultimaPorUsuario[miembro.UserID]; hay {
				copia := ultima
				fila.UltimaActividad = &copia
				fila.EnLinea = ultima.After(corteDePresencia)
			}
			resp.Miembros = append(resp.Miembros, fila)
		}

		var invitaciones []db.ClinicInvitation
		if err := gdb.Where("clinic_id = ? AND accepted_at IS NULL AND expires_at > ?", clinicID, time.Now()).
			Order("created_at").Find(&invitaciones).Error; err == nil {
			for _, inv := range invitaciones {
				resp.Pendientes = append(resp.Pendientes, invitacionPendienteResponse{
					ID: inv.ID.String(), Email: inv.Email, Rol: inv.Role, VenceAt: inv.ExpiresAt,
				})
			}
		}

		writeJSON(w, http.StatusOK, resp)
	}
}

type invitarColaboradorRequest struct {
	Rol string `json:"rol"`
	// Uno de los dos, nunca los dos: el código que la persona generó en su
	// pantalla de clínicas, o su mail.
	Codigo string `json:"codigo"`
	Email  string `json:"email"`
}

type invitarColaboradorResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Rol   string `json:"rol"`
	// PorCodigo — la invitación se resolvió por código, así que el mail lo
	// sacamos del perfil de esa persona y no de lo que se tipeó.
	PorCodigo bool `json:"porCodigo"`
}

func invitarColaboradorHandler(gdb *gorm.DB, sender dmmail.Sender, appBaseURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		session, _ := sessionFromContext(r)

		var req invitarColaboradorRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		rol := strings.TrimSpace(req.Rol)
		if rol != db.RoleProfesional && rol != db.RoleRecepcion && rol != db.RoleAdmin {
			writeError(w, http.StatusBadRequest, "elegí un rol para el colaborador")
			return
		}

		codigo := strings.ToUpper(strings.TrimSpace(req.Codigo))
		email := strings.ToLower(strings.TrimSpace(req.Email))
		if (codigo == "") == (email == "") {
			writeError(w, http.StatusBadRequest, "indicá un código de perfil o un mail, no las dos cosas")
			return
		}

		porCodigo := codigo != ""
		if porCodigo {
			// El código identifica a una PERSONA; de ahí sale el mail, así
			// que un error de tipeo en la dirección no existe por este
			// camino. Un código vencido se trata igual que uno inexistente:
			// decir "existió pero venció" le confirmaría a quien prueba
			// códigos al azar que acertó uno.
			var user db.User
			if err := gdb.Where("codigo_invitacion = ? AND codigo_invitacion_expira_at > ?", codigo, time.Now()).
				First(&user).Error; err != nil {
				writeError(w, http.StatusNotFound, "ese código no existe o ya venció")
				return
			}
			email = user.Email
		}

		// Ya trabaja acá — el aviso que pide el brief ("colaborador ya
		// presente en la clínica, si es que lo vuelvo a invitar").
		var user db.User
		if err := gdb.Where("email = ?", email).First(&user).Error; err == nil {
			var yaEs db.ClinicMember
			if err := gdb.Where("clinic_id = ? AND user_id = ? AND status = ?",
				clinicID, user.ID, db.ClinicMemberStatusActive).First(&yaEs).Error; err == nil {
				writeError(w, http.StatusConflict, "esa persona ya trabaja en esta clínica")
				return
			}
		}

		// Ya tiene una invitación sin responder — el otro aviso del brief.
		var pendiente db.ClinicInvitation
		if err := gdb.Where("clinic_id = ? AND email = ? AND accepted_at IS NULL AND expires_at > ?",
			clinicID, email, time.Now()).First(&pendiente).Error; err == nil {
			writeError(w, http.StatusConflict, "esa persona ya tiene una invitación pendiente")
			return
		}

		// Del token solo se guarda el hash, y el token en claro NO se manda
		// a ningún lado: aceptar no es un link de un solo uso sino una
		// decisión que se toma con sesión iniciada, desde la pantalla de
		// clínicas. La columna queda igual como el lugar natural si alguna
		// vez existe ese link, y mientras tanto le da a cada invitación un
		// valor único propio.
		_, tokenHash, err := security.NewToken()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar la invitación")
			return
		}
		invitacion := db.ClinicInvitation{
			ClinicID: clinicID, Email: email, Role: rol, TokenHash: tokenHash,
			ExpiresAt: time.Now().Add(InvitacionTTL), InvitedByUserID: session.UserID,
		}
		if err := gdb.Create(&invitacion).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo crear la invitación")
			return
		}

		enviarInvitacion(r, gdb, sender, appBaseURL, clinicID, invitacion, session.UserID)
		recordAuditEvent(gdb, &session.UserID, db.AuditEventColaboradorInvitado, clientIP(r), r.UserAgent())

		writeJSON(w, http.StatusCreated, invitarColaboradorResponse{
			ID: invitacion.ID.String(), Email: email, Rol: rol, PorCodigo: porCodigo,
		})
	}
}

// enviarInvitacion arma y manda el mail. Nunca devuelve error: un envío
// que falla no puede tumbar una invitación ya creada — la persona la ve
// igual en su pantalla de clínicas, que es donde la acepta. Mismo criterio
// que el resto de los mails del proyecto.
func enviarInvitacion(
	r *http.Request, gdb *gorm.DB, sender dmmail.Sender, appBaseURL string,
	clinicID uuid.UUID, invitacion db.ClinicInvitation, invitadorID uuid.UUID,
) {
	if sender == nil {
		return
	}
	var clinica db.Clinic
	if err := gdb.First(&clinica, "id = ?", clinicID).Error; err != nil {
		return
	}
	invitadoPor := ""
	var perfil db.ProfessionalProfile
	if err := gdb.First(&perfil, "user_id = ?", invitadorID).Error; err == nil {
		invitadoPor = strings.TrimSpace(perfil.Nombre + " " + perfil.Apellido)
	}
	_ = sender.SendInvitacionColaboradorEmail(r.Context(), invitacion.Email, dmmail.InvitacionColaboradorInfo{
		NombreClinica: clinica.Nombre,
		InvitadoPor:   invitadoPor,
		Rol:           etiquetaDeRol(invitacion.Role),
		Email:         invitacion.Email,
		// El link lleva a la pantalla donde la invitación ya está esperando
		// — no es un link de un solo uso que acepte por sí mismo: aceptar
		// es una decisión que se toma con sesión iniciada, viendo de qué
		// clínica se trata. El token queda guardado para poder distinguir
		// invitaciones si alguna vez hiciera falta.
		URL:   appBaseURL + "/clinicas",
		Vence: invitacion.ExpiresAt.Format("02/01/2006"),
	})
}

// etiquetaDeRol — el nombre que ve la persona, no el valor interno.
func etiquetaDeRol(rol string) string {
	switch rol {
	case db.RoleProfesional:
		return "Profesional"
	case db.RoleRecepcion:
		return "Recepcionista"
	case db.RoleAdmin:
		return "Administrador de página"
	case db.RoleOwner:
		return "Titular"
	}
	return rol
}

func reenviarInvitacionHandler(gdb *gorm.DB, sender dmmail.Sender, appBaseURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		session, _ := sessionFromContext(r)
		invitacion, ok := invitacionDeLaClinica(w, r, gdb, clinicID)
		if !ok {
			return
		}

		// Reenviar RENUEVA el vencimiento: si no, una invitación de hace
		// ocho días se reenviaría vencida y la persona vería un mail que
		// no sirve para nada.
		invitacion.ExpiresAt = time.Now().Add(InvitacionTTL)
		if err := gdb.Model(&invitacion).Update("expires_at", invitacion.ExpiresAt).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo reenviar la invitación")
			return
		}

		enviarInvitacion(r, gdb, sender, appBaseURL, clinicID, invitacion, session.UserID)
		writeJSON(w, http.StatusOK, map[string]string{"mensaje": "invitación reenviada"})
	}
}

func cancelarInvitacionHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		invitacion, ok := invitacionDeLaClinica(w, r, gdb, clinicID)
		if !ok {
			return
		}
		// Se borra: una invitación que nadie aceptó no es historia
		// clínica ni tiene nada colgando. Lo que sí queda es el registro
		// de auditoría de quién la creó.
		if err := gdb.Delete(&invitacion).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo cancelar la invitación")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// invitacionDeLaClinica resuelve el {id} de la ruta acotado a la clínica
// activa: una invitación de OTRA clínica responde 404, no 403 — que
// exista no es información de quien no es su dueño (mismo criterio que
// TR-138).
func invitacionDeLaClinica(w http.ResponseWriter, r *http.Request, gdb *gorm.DB, clinicID uuid.UUID) (db.ClinicInvitation, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "invitación no encontrada")
		return db.ClinicInvitation{}, false
	}
	var invitacion db.ClinicInvitation
	if err := gdb.Where("id = ? AND clinic_id = ? AND accepted_at IS NULL", id, clinicID).
		First(&invitacion).Error; err != nil {
		writeError(w, http.StatusNotFound, "invitación no encontrada")
		return db.ClinicInvitation{}, false
	}
	return invitacion, true
}

func quitarColaboradorHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		userID, err := uuid.Parse(chi.URLParam(r, "userId"))
		if err != nil {
			writeError(w, http.StatusNotFound, "esa persona no trabaja en esta clínica")
			return
		}

		var clinica db.Clinic
		if err := gdb.First(&clinica, "id = ?", clinicID).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}
		// "La tarjeta del titular no tiene acciones (no te podés quitar a
		// vos mismo)" — brief. Y sin titular la clínica queda sin nadie
		// que pueda invitar ni repartir roles: es un estado del que no se
		// vuelve.
		if clinica.OwnerID == userID {
			writeError(w, http.StatusForbidden, "no se puede quitar al titular de la clínica")
			return
		}

		var miembro db.ClinicMember
		if err := gdb.Where("clinic_id = ? AND user_id = ? AND status = ?",
			clinicID, userID, db.ClinicMemberStatusActive).First(&miembro).Error; err != nil {
			writeError(w, http.StatusNotFound, "esa persona no trabaja en esta clínica")
			return
		}

		// La membresía NO se borra: se marca (TR-137). La foreign key
		// compuesta de `turnos` bloquearía la baja de cualquier
		// profesional con historial, y ese historial tiene que sobrevivir
		// a que la persona se vaya.
		if err := gdb.Model(&miembro).Update("status", db.ClinicMemberStatusRemoved).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo quitar a esa persona")
			return
		}
		if session, ok := sessionFromContext(r); ok {
			recordAuditEvent(gdb, &session.UserID, db.AuditEventColaboradorQuitado, clientIP(r), r.UserAgent())
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

type cambiarRolesRequest struct {
	Roles []string `json:"roles"`
}

// cambiarRolesHandler — repartir roles entre los que ya están, que es la
// otra mitad de lo que el brief le da al creador: *"el responsable de
// asignar roles e invitar a sus colegas"*. Invitar ya estaba; esto es
// poder delegar la página, o pasar a alguien de recepción a profesional.
//
// Reemplaza el juego completo de roles en vez de sumar o restar de a uno:
// con roles excluyentes entre sí, un "agregá profesional" sobre alguien
// que es recepción no tiene una respuesta obvia —¿reemplaza, falla,
// convive?— y las tres son defendibles. Mandar el juego entero no deja
// lugar a la duda: es exactamente lo que va a quedar.
func cambiarRolesHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		userID, err := uuid.Parse(chi.URLParam(r, "userId"))
		if err != nil {
			writeError(w, http.StatusNotFound, "esa persona no trabaja en esta clínica")
			return
		}

		var req cambiarRolesRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}

		// Sin ningún rol, la persona queda adentro del panel sin que
		// ninguna regla pueda decidir nada sobre ella (ver requireClinic).
		if len(req.Roles) == 0 {
			writeError(w, http.StatusBadRequest, "elegí al menos un rol")
			return
		}
		for _, rol := range req.Roles {
			if rol != db.RoleProfesional && rol != db.RoleRecepcion && rol != db.RoleAdmin {
				// `owner` no se reparte: se es dueño de la clínica por
				// haberla creado, no porque alguien lo asigne. Traspasarla
				// es otra operación, y todavía no existe.
				writeError(w, http.StatusBadRequest, "ese rol no se puede asignar")
				return
			}
		}

		var clinica db.Clinic
		if err := gdb.First(&clinica, "id = ?", clinicID).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}
		if clinica.OwnerID == userID {
			writeError(w, http.StatusForbidden, "los roles del titular no se cambian")
			return
		}

		var miembro db.ClinicMember
		if err := gdb.Where("clinic_id = ? AND user_id = ? AND status = ?",
			clinicID, userID, db.ClinicMemberStatusActive).First(&miembro).Error; err != nil {
			writeError(w, http.StatusNotFound, "esa persona no trabaja en esta clínica")
			return
		}

		// Pasar a alguien a `profesional` exige que tenga matrícula, igual
		// que en las otras tres puertas (crear la clínica propia, entrar a
		// atender, aceptar una invitación de profesional). Si no, el rol
		// lo dejaría atendiendo pacientes sin datos que mostrar.
		if tieneRol(req.Roles, db.RoleProfesional) {
			var perfil db.ProfessionalProfile
			if err := gdb.First(&perfil, "user_id = ?", userID).Error; err != nil ||
				perfil.TipoPerfil != db.PerfilTipoProfesional {
				writeError(w, http.StatusConflict, "esa persona todavía no cargó sus datos profesionales")
				return
			}
		}

		err = gdb.Transaction(func(tx *gorm.DB) error {
			if err := tx.Where("clinic_member_id = ?", miembro.ID).Delete(&db.ClinicMemberRole{}).Error; err != nil {
				return err
			}
			for _, rol := range req.Roles {
				if err := db.AsignarRol(tx, miembro.ID, rol); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			// El índice único parcial de la 3.2.1: profesional y recepción
			// no conviven. Lo impide el motor; acá se traduce.
			if isUniqueViolation(err) {
				writeError(w, http.StatusConflict, "no se puede ser profesional y recepción en la misma clínica")
				return
			}
			writeError(w, http.StatusInternalServerError, "no se pudieron cambiar los roles")
			return
		}

		if session, ok := sessionFromContext(r); ok {
			recordAuditEvent(gdb, &session.UserID, db.AuditEventRoleChanged, clientIP(r), r.UserAgent())
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
