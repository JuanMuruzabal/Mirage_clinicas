package http

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/push"
)

// Notificaciones por cuenta (TR-179). Todo cuelga de la SESIÓN, no de la
// clínica activa: la bandeja es de la persona y junta lo de todas sus
// clínicas — por eso cada notificación de turno dice de qué clínica viene.
// Ninguna consulta de este archivo mira otra bandeja que la propia
// (`user_id = <sesión>`), y una notificación ajena da 404, no 403.
func registrarNotificacionesRoutes(r chi.Router, gdb *gorm.DB, deps AuthDeps) {
	r.Get("/me/notificaciones", listarNotificacionesHandler(gdb))
	r.Get("/me/notificaciones/contador", contadorNotificacionesHandler(gdb))
	r.Post("/me/notificaciones/{id}/leer", leerNotificacionHandler(gdb))
	r.Post("/me/notificaciones/{id}/abrir", abrirNotificacionHandler(gdb))
	r.Get("/me/push", configuracionPushHandler(deps))
	r.Post("/me/push/suscripciones", guardarSuscripcionPushHandler(gdb))
	r.Delete("/me/push/suscripciones", borrarSuscripcionPushHandler(gdb))
}

type notificacionResponse struct {
	ID        string               `json:"id"`
	Tipo      string               `json:"tipo"`
	CreadaEn  string               `json:"creadaEn"`
	LeidaEn   *string              `json:"leidaEn"`
	ClinicaID *string              `json:"clinicaId,omitempty"`
	TurnoID   *string              `json:"turnoId,omitempty"`
	Datos     db.DatosNotificacion `json:"datos"`
}

type listaNotificacionesResponse struct {
	Notificaciones []notificacionResponse `json:"notificaciones"`
	Nuevas         int64                  `json:"nuevas"`
	Leidas         int64                  `json:"leidas"`
}

func toNotificacionResponse(n db.Notificacion) notificacionResponse {
	out := notificacionResponse{
		ID:       n.ID.String(),
		Tipo:     n.Tipo,
		CreadaEn: n.CreatedAt.UTC().Format(time.RFC3339),
		Datos:    n.Datos,
	}
	if n.LeidaEn != nil {
		leida := n.LeidaEn.UTC().Format(time.RFC3339)
		out.LeidaEn = &leida
	}
	if n.ClinicID != nil {
		c := n.ClinicID.String()
		out.ClinicaID = &c
	}
	if n.TurnoID != nil {
		t := n.TurnoID.String()
		out.TurnoID = &t
	}
	return out
}

// Tope de la lista: una bandeja no es un archivo. Las leídas crecen sin
// techo, y lo que importa es lo reciente.
const (
	notificacionesPorDefecto = 30
	notificacionesMaximo     = 100
)

// listarNotificacionesHandler — GET /me/notificaciones?estado=nuevas|leidas.
// Devuelve la pestaña pedida y los contadores de las DOS, en una sola
// pasada (`COUNT(*) FILTER`, TR-161): las pestañas muestran los dos números.
func listarNotificacionesHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromRequest(w, r)
		if !ok {
			return
		}
		limite := notificacionesPorDefecto
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
			limite = min(v, notificacionesMaximo)
		}

		consulta := gdb.Where("user_id = ?", userID)
		if r.URL.Query().Get("estado") == "leidas" {
			consulta = consulta.Where("leida_en IS NOT NULL").Order("leida_en DESC")
		} else {
			consulta = consulta.Where("leida_en IS NULL").Order("created_at DESC")
		}
		var filas []db.Notificacion
		if err := consulta.Limit(limite).Find(&filas).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron leer las notificaciones")
			return
		}

		var contadores struct{ Nuevas, Leidas int64 }
		if err := gdb.Raw(`SELECT
				COUNT(*) FILTER (WHERE leida_en IS NULL) AS nuevas,
				COUNT(*) FILTER (WHERE leida_en IS NOT NULL) AS leidas
			FROM notificaciones WHERE user_id = ?`, userID).Scan(&contadores).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron contar las notificaciones")
			return
		}

		out := listaNotificacionesResponse{
			Notificaciones: make([]notificacionResponse, 0, len(filas)),
			Nuevas:         contadores.Nuevas,
			Leidas:         contadores.Leidas,
		}
		for _, n := range filas {
			out.Notificaciones = append(out.Notificaciones, toNotificacionResponse(n))
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// contadorNotificacionesHandler — GET /me/notificaciones/contador: el
// número de la campana. Se pide seguido, así que es UNA consulta que usa el
// índice parcial idx_notificaciones_nuevas y no trae ninguna fila.
func contadorNotificacionesHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromRequest(w, r)
		if !ok {
			return
		}
		var nuevas int64
		if err := gdb.Model(&db.Notificacion{}).
			Where("user_id = ? AND leida_en IS NULL", userID).Count(&nuevas).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron contar las notificaciones")
			return
		}
		writeJSON(w, http.StatusOK, map[string]int64{"nuevas": nuevas})
	}
}

// marcarLeida — solo la primera vez: la fecha de lectura no se pisa.
func marcarLeida(gdb *gorm.DB, n *db.Notificacion) error {
	if n.LeidaEn != nil {
		return nil
	}
	ahora := time.Now()
	if err := gdb.Model(&db.Notificacion{}).
		Where("id = ? AND user_id = ? AND leida_en IS NULL", n.ID, n.UserID).
		Update("leida_en", ahora).Error; err != nil {
		return err
	}
	n.LeidaEn = &ahora
	return nil
}

// leerNotificacionHandler — POST /me/notificaciones/{id}/leer. Se llama al
// EXPANDIR la tarjeta, no al mostrarla en la lista.
func leerNotificacionHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromRequest(w, r)
		if !ok {
			return
		}
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusNotFound, "notificación no encontrada")
			return
		}
		// SOLO la propia: una ajena es 404, porque que exista no es algo
		// que otra cuenta tenga que saber.
		var n db.Notificacion
		err = gdb.Where("id = ? AND user_id = ?", id, userID).First(&n).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			writeError(w, http.StatusNotFound, "notificación no encontrada")
			return
		}
		if err == nil {
			err = marcarLeida(gdb, &n)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo marcar como leída")
			return
		}
		writeJSON(w, http.StatusOK, toNotificacionResponse(n))
	}
}

type abrirNotificacionResponse struct {
	Tipo string `json:"tipo"`
	// Estado del turno al que lleva: "agendado", "cancelada", o vacío si
	// ya no existe (TurnoID sin FK, ver Notificacion).
	EstadoTurno string `json:"estadoTurno,omitempty"`
	TurnoID     string `json:"turnoId,omitempty"`
	// Fecha — el día del turno HOY (YYYY-MM-DD, Córdoba), no el de la foto:
	// si lo reprogramaron, lleva al día nuevo.
	Fecha string `json:"fecha,omitempty"`
	// CambioDeClinica — la sesión quedó parada en otra clínica: la web
	// recarga la página entera, porque el header y el selector de clínica
	// muestran la anterior.
	CambioDeClinica bool `json:"cambioDeClinica"`
	// SinAcceso — la persona ya no trabaja en esa clínica.
	SinAcceso bool `json:"sinAcceso"`
}

// abrirNotificacionHandler — POST /me/notificaciones/{id}/abrir: "Ver
// turno" (y el toque en el aviso del celular). Marca la notificación como
// leída y deja la SESIÓN donde el turno se ve:
//   - en la clínica del turno, si la persona está parada en otra;
//   - si es recepción, en la agenda del profesional que lo atiende — en la
//     de otro profesional el turno no aparece (TR-160).
//
// Devuelve el estado REAL del turno, no el de la foto de la notificación.
func abrirNotificacionHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		session, ok := sessionFromContext(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
			return
		}
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusNotFound, "notificación no encontrada")
			return
		}
		var n db.Notificacion
		err = gdb.Where("id = ? AND user_id = ?", id, session.UserID).First(&n).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			writeError(w, http.StatusNotFound, "notificación no encontrada")
			return
		}
		if err == nil {
			err = marcarLeida(gdb, &n)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo abrir la notificación")
			return
		}

		out := abrirNotificacionResponse{Tipo: n.Tipo}
		if n.Tipo != db.NotificacionTurnoNuevo || n.ClinicID == nil || n.TurnoID == nil {
			writeJSON(w, http.StatusOK, out)
			return
		}
		out.TurnoID = n.TurnoID.String()

		var miembro db.ClinicMember
		if err := gdb.Preload("Roles").Where("user_id = ? AND clinic_id = ? AND status = ?",
			session.UserID, *n.ClinicID, db.ClinicMemberStatusActive).First(&miembro).Error; err != nil {
			out.SinAcceso = true
			writeJSON(w, http.StatusOK, out)
			return
		}

		var turno db.Turno
		if err := gdb.Select("id", "estado", "hora_inicio").
			Where("id = ? AND clinic_id = ?", *n.TurnoID, *n.ClinicID).First(&turno).Error; err == nil {
			out.EstadoTurno = turno.Estado
			if turno.HoraInicio != nil {
				out.Fecha = clock.In(*turno.HoraInicio).Format("2006-01-02")
			}
		}

		cambios := map[string]any{}
		if session.ClinicID == nil || *session.ClinicID != *n.ClinicID {
			cambios["clinic_id"] = *n.ClinicID
			out.CambioDeClinica = true
		}
		if tieneRol(rolesDe(miembro), db.RoleRecepcion) {
			cambios["viendo_user_id"] = profesionalParaLaVista(gdb, *n.ClinicID, n.Datos.ProfesionalUserID)
		}
		if len(cambios) > 0 {
			if err := gdb.Model(&db.Session{}).Where("id = ?", session.ID).Updates(cambios).Error; err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo abrir el turno")
				return
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// profesionalParaLaVista — la agenda donde recepción tiene que quedar
// parada para ver el turno. nil (la vista general, donde se ve toda la
// clínica) si ese profesional ya no atiende ahí.
func profesionalParaLaVista(gdb *gorm.DB, clinicID uuid.UUID, profesionalUserID string) *uuid.UUID {
	userID, err := uuid.Parse(profesionalUserID)
	if err != nil {
		return nil
	}
	var miembro db.ClinicMember
	if err := gdb.Preload("Roles").Where("clinic_id = ? AND user_id = ? AND status = ?",
		clinicID, userID, db.ClinicMemberStatusActive).First(&miembro).Error; err != nil || !esProfesional(miembro) {
		return nil
	}
	return &userID
}

// crearNotificacionesDeTurnoNuevo — un turno que entró por la página
// pública o por un link compartido (TR-179: solo esos; lo que se carga
// desde el panel ya lo sabe quien lo cargó). Una fila para el profesional
// que lo atiende y otra para cada recepcionista ACTIVA de la clínica, que
// dice para quién es. Va dentro de la transacción del turno: si el turno
// no se confirma, tampoco la notificación.
func crearNotificacionesDeTurnoNuevo(tx *gorm.DB, clinic db.Clinic, turno db.Turno, tipoNombre string, porEnlace bool) ([]db.Notificacion, error) {
	if turno.AtendidoPorUserID == nil || turno.HoraInicio == nil || turno.HoraFin == nil {
		return nil, nil
	}
	profesionalID := *turno.AtendidoPorUserID
	base := db.DatosNotificacion{
		PacienteNombre:    strings.TrimSpace(turno.NombreContacto + " " + turno.ApellidoContacto),
		ClinicaNombre:     clinic.Nombre,
		ProfesionalNombre: nombreDelProfesional(tx, &profesionalID),
		ProfesionalUserID: profesionalID.String(),
		TipoConsulta:      tipoNombre,
		HoraInicio:        clock.In(*turno.HoraInicio).Format(time.RFC3339),
		HoraFin:           clock.In(*turno.HoraFin).Format(time.RFC3339),
		PorEnlace:         porEnlace,
	}

	var recepcion []uuid.UUID
	if err := tx.Model(&db.ClinicMember{}).Scopes(db.ConRol(db.RoleRecepcion)).
		Where("clinic_id = ? AND status = ?", clinic.ID, db.ClinicMemberStatusActive).
		Pluck("user_id", &recepcion).Error; err != nil {
		return nil, err
	}

	clinicID, turnoID := clinic.ID, turno.ID
	filas := []db.Notificacion{{
		UserID: profesionalID, Tipo: db.NotificacionTurnoNuevo,
		ClinicID: &clinicID, TurnoID: &turnoID, Datos: base,
	}}
	for _, userID := range recepcion {
		if userID == profesionalID {
			continue
		}
		copia := base
		copia.ParaRecepcion = true
		filas = append(filas, db.Notificacion{
			UserID: userID, Tipo: db.NotificacionTurnoNuevo,
			ClinicID: &clinicID, TurnoID: &turnoID, Datos: copia,
		})
	}
	if err := tx.Create(&filas).Error; err != nil {
		return nil, err
	}
	return filas, nil
}

// ---------------------------------------------------------------------
// Avisos al celular (Web Push)
// ---------------------------------------------------------------------

type configuracionPushResponse struct {
	// ClavePublica — la que el navegador necesita para suscribirse. Vacía:
	// los avisos no están configurados en este entorno, y la web no ofrece
	// activarlos.
	ClavePublica string `json:"clavePublica"`
}

func configuracionPushHandler(deps AuthDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clave := ""
		if deps.Push != nil {
			clave = deps.Push.ClavePublica()
		}
		writeJSON(w, http.StatusOK, configuracionPushResponse{ClavePublica: clave})
	}
}

type suscripcionPushRequest struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

// guardarSuscripcionPushHandler — POST /me/push/suscripciones, con la
// suscripción tal cual la devuelve el navegador (PushSubscription.toJSON).
// El endpoint es único por dispositivo: si ya existía —de esta cuenta o de
// otra que usó el mismo navegador antes— pasa a ser de esta cuenta. Así un
// celular compartido avisa solo a quien tiene la sesión abierta.
func guardarSuscripcionPushHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromRequest(w, r)
		if !ok {
			return
		}
		var req suscripcionPushRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.Endpoint = strings.TrimSpace(req.Endpoint)
		// Solo https: un endpoint es una URL a la que la API le va a
		// mandar pedidos, y no puede apuntar a la red interna.
		if !strings.HasPrefix(req.Endpoint, "https://") || len(req.Endpoint) > 1000 ||
			req.Keys.P256dh == "" || req.Keys.Auth == "" || len(req.Keys.P256dh) > 200 || len(req.Keys.Auth) > 100 {
			writeError(w, http.StatusBadRequest, "la suscripción no es válida")
			return
		}
		fila := db.PushSuscripcion{UserID: userID, Endpoint: req.Endpoint, P256dh: req.Keys.P256dh, Auth: req.Keys.Auth}
		err := gdb.Transaction(func(tx *gorm.DB) error {
			if err := tx.Where("endpoint = ?", req.Endpoint).Delete(&db.PushSuscripcion{}).Error; err != nil {
				return err
			}
			return tx.Create(&fila).Error
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron activar los avisos")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]bool{"activo": true})
	}
}

// borrarSuscripcionPushHandler — DELETE /me/push/suscripciones: desactivar
// los avisos en ESTE dispositivo. Solo borra una suscripción propia.
func borrarSuscripcionPushHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromRequest(w, r)
		if !ok {
			return
		}
		var req struct {
			Endpoint string `json:"endpoint"`
		}
		if err := decodeJSON(w, r, &req); err != nil || strings.TrimSpace(req.Endpoint) == "" {
			writeError(w, http.StatusBadRequest, "falta el endpoint")
			return
		}
		if err := gdb.Where("endpoint = ? AND user_id = ?", strings.TrimSpace(req.Endpoint), userID).
			Delete(&db.PushSuscripcion{}).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron desactivar los avisos")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// avisoPush — un envío pendiente: a qué navegador y qué decirle.
type avisoPush struct {
	suscripcion push.Suscripcion
	mensaje     push.Mensaje
}

// avisarPorPush — después de que la transacción del turno comiteó. Busca
// los navegadores de las cuentas notificadas (una consulta, en el request)
// y los manda en segundo plano: el paciente que sacó el turno no tiene por
// qué esperar a que respondan los servicios de push de Google o Apple.
//
// Es una goroutine DESPUÉS de la respuesta, no para paralelizar consultas
// (TR-161 sigue en pie): no consulta la base, salvo para borrar una
// suscripción que el servicio de push dio por muerta.
func avisarPorPush(gdb *gorm.DB, enviador push.Enviador, notificaciones []db.Notificacion) {
	if enviador == nil || enviador.ClavePublica() == "" || len(notificaciones) == 0 {
		return
	}
	porUsuario := map[uuid.UUID]db.Notificacion{}
	usuarios := make([]uuid.UUID, 0, len(notificaciones))
	for _, n := range notificaciones {
		porUsuario[n.UserID] = n
		usuarios = append(usuarios, n.UserID)
	}
	var suscripciones []db.PushSuscripcion
	if err := gdb.Where("user_id IN ?", usuarios).Find(&suscripciones).Error; err != nil {
		slog.Warn("no se pudieron leer las suscripciones push", "error", err)
		return
	}
	avisos := make([]avisoPush, 0, len(suscripciones))
	for _, s := range suscripciones {
		avisos = append(avisos, avisoPush{
			suscripcion: push.Suscripcion{Endpoint: s.Endpoint, P256dh: s.P256dh, Auth: s.Auth},
			mensaje:     mensajePushDe(porUsuario[s.UserID]),
		})
	}
	if len(avisos) == 0 {
		return
	}
	go enviarAvisos(context.Background(), gdb, enviador, avisos)
}

// enviarAvisos — separado de avisarPorPush para poder probarlo sin la
// goroutine (los tests corren dentro de una transacción, que no admite
// uso concurrente).
func enviarAvisos(ctx context.Context, gdb *gorm.DB, enviador push.Enviador, avisos []avisoPush) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	for _, a := range avisos {
		err := enviador.Enviar(ctx, a.suscripcion, a.mensaje)
		if errors.Is(err, push.ErrSuscripcionVencida) {
			_ = gdb.Where("endpoint = ?", a.suscripcion.Endpoint).Delete(&db.PushSuscripcion{}).Error
			continue
		}
		if err != nil {
			slog.Warn("no se pudo mandar un aviso push", "error", err)
		}
	}
}

// mensajePushDe — el texto del aviso: lo que se lee con el celular
// bloqueado. Hora primero, que es lo que decide si hay que moverse.
func mensajePushDe(n db.Notificacion) push.Mensaje {
	d := n.Datos
	titulo := "Turno nuevo"
	if inicio, err := time.Parse(time.RFC3339, d.HoraInicio); err == nil {
		titulo = "Turno nuevo · " + fechaCortaEs(inicio) + " " + clock.In(inicio).Format("15:04")
	}
	partes := []string{d.PacienteNombre}
	if d.TipoConsulta != "" {
		partes = append(partes, d.TipoConsulta)
	}
	if d.ParaRecepcion && d.ProfesionalNombre != "" {
		partes = append(partes, "con "+d.ProfesionalNombre)
	}
	if d.ClinicaNombre != "" {
		partes = append(partes, d.ClinicaNombre)
	}
	tag := "notificacion-" + n.ID.String()
	if n.TurnoID != nil {
		tag = "turno-" + n.TurnoID.String()
	}
	return push.Mensaje{
		Titulo: titulo,
		Cuerpo: strings.Join(partes, " · "),
		URL:    "/notificaciones/" + n.ID.String(),
		Tag:    tag,
	}
}

var diasCortosEs = [...]string{"dom", "lun", "mar", "mié", "jue", "vie", "sáb"}

// fechaCortaEs — "lun 28/9", en la hora de Córdoba.
func fechaCortaEs(t time.Time) string {
	local := clock.In(t)
	return diasCortosEs[local.Weekday()] + " " + strconv.Itoa(local.Day()) + "/" + strconv.Itoa(int(local.Month()))
}
