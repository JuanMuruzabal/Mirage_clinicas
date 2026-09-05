package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// registerSeguridadTurnoPublicoRoutes — corrección de seguridad (Fase
// 2.4.1), pedido textual del cliente: "el apartado de auditoría de
// turnos de bloqueos, donde muestre los mails bloqueados etc, por las
// dudas de algún malentendido" — visibilidad para el profesional sobre
// los mails/IPs que el sistema bloqueó solo, más la bitácora de qué se
// borró y por qué (ver db.AuditoriaBloqueoTurnoPublico). Las acciones de
// "desbloquear" existen porque un bloqueo automático puede ser un falso
// positivo (ej. dos personas de una misma casa compartiendo mail) — lo
// que NO se puede deshacer es el borrado de los turnos en sí, esos ya no
// existen.
func registerSeguridadTurnoPublicoRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/pacientes/seguridad/bloqueos", listBloqueosSeguridadHandler(gdb))
	r.Delete("/pacientes/seguridad/bloqueos-mail/{id}", desbloquearMailHandler(gdb))
	r.Delete("/pacientes/seguridad/bloqueos-ip/{id}", desbloquearIPHandler(gdb))
}

type mailBloqueadoResponse struct {
	ID             string `json:"id"`
	Email          string `json:"email"`
	BloqueadoHasta string `json:"bloqueadoHasta"`
	CreatedAt      string `json:"createdAt"`
}

type ipBloqueadaResponse struct {
	ID             string `json:"id"`
	IP             string `json:"ip"`
	BloqueadoHasta string `json:"bloqueadoHasta"`
	CreatedAt      string `json:"createdAt"`
}

type auditoriaBloqueoResponse struct {
	ID             string  `json:"id"`
	Motivo         string  `json:"motivo"`
	Email          *string `json:"email,omitempty"`
	IP             *string `json:"ip,omitempty"`
	DNIs           string  `json:"dnis"`
	TurnosBorrados int     `json:"turnosBorrados"`
	// Simulado (corrección de seguridad, Fase 2.4.1) — true en local (sin
	// RESEND_API_KEY): esta fila describe qué SE HABRÍA bloqueado/borrado,
	// nunca pasó de verdad — ver AuthDeps.SimularBloqueosSeguridad.
	Simulado  bool   `json:"simulado"`
	CreatedAt string `json:"createdAt"`
}

type bloqueosSeguridadResponse struct {
	MailsBloqueados []mailBloqueadoResponse    `json:"mailsBloqueados"`
	IPsBloqueadas   []ipBloqueadaResponse      `json:"ipsBloqueadas"`
	Auditoria       []auditoriaBloqueoResponse `json:"auditoria"`
}

// listBloqueosSeguridadHandler — GET /pacientes/seguridad/bloqueos.
// Mails/IPs: solo los bloqueos VIGENTES (bloqueado_hasta en el futuro) —
// uno vencido ya no le impide a nadie pedir turno, no tiene sentido
// mostrarlo como "bloqueado". Auditoría: el historial completo (hasta
// 200 más recientes), vigente o no — es el registro de qué pasó, no de
// qué sigue activo.
func listBloqueosSeguridadHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var mails []db.EmailBloqueadoTurnoPublico
		if err := gdb.Where("profesional_id = ? AND bloqueado_hasta > ?", profesionalID, time.Now()).
			Order("bloqueado_hasta DESC").Find(&mails).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron obtener los bloqueos")
			return
		}
		var ips []db.IPBloqueadaTurnoPublico
		if err := gdb.Where("profesional_id = ? AND bloqueado_hasta > ?", profesionalID, time.Now()).
			Order("bloqueado_hasta DESC").Find(&ips).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron obtener los bloqueos")
			return
		}
		var auditoria []db.AuditoriaBloqueoTurnoPublico
		if err := gdb.Where("profesional_id = ?", profesionalID).
			Order("created_at DESC").Limit(200).Find(&auditoria).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la auditoría")
			return
		}

		out := bloqueosSeguridadResponse{
			MailsBloqueados: make([]mailBloqueadoResponse, len(mails)),
			IPsBloqueadas:   make([]ipBloqueadaResponse, len(ips)),
			Auditoria:       make([]auditoriaBloqueoResponse, len(auditoria)),
		}
		for i, m := range mails {
			out.MailsBloqueados[i] = mailBloqueadoResponse{
				ID:             m.ID.String(),
				Email:          m.Email,
				BloqueadoHasta: m.BloqueadoHasta.Format(time.RFC3339),
				CreatedAt:      m.CreatedAt.Format(time.RFC3339),
			}
		}
		for i, ipRow := range ips {
			out.IPsBloqueadas[i] = ipBloqueadaResponse{
				ID:             ipRow.ID.String(),
				IP:             ipRow.IP,
				BloqueadoHasta: ipRow.BloqueadoHasta.Format(time.RFC3339),
				CreatedAt:      ipRow.CreatedAt.Format(time.RFC3339),
			}
		}
		for i, a := range auditoria {
			out.Auditoria[i] = auditoriaBloqueoResponse{
				ID:             a.ID.String(),
				Motivo:         a.Motivo,
				Email:          a.Email,
				IP:             a.IP,
				DNIs:           a.DNIs,
				TurnosBorrados: a.TurnosBorrados,
				Simulado:       a.Simulado,
				CreatedAt:      a.CreatedAt.Format(time.RFC3339),
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// desbloquearMailHandler — DELETE /pacientes/seguridad/bloqueos-mail/{id}
// (corrección de seguridad, Fase 2.4.1): recupera un falso positivo del
// bloqueo automático de mail — solo levanta el bloqueo, los turnos ya
// borrados no vuelven (no hay de dónde traerlos).
func desbloquearMailHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id inválido")
			return
		}
		res := gdb.Where("id = ? AND profesional_id = ?", id, profesionalID).Delete(&db.EmailBloqueadoTurnoPublico{})
		if res.Error != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo desbloquear el mail")
			return
		}
		if res.RowsAffected == 0 {
			writeError(w, http.StatusNotFound, "bloqueo no encontrado")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"mensaje": "mail desbloqueado"})
	}
}

// desbloquearIPHandler — mismo criterio que desbloquearMailHandler, para IP.
func desbloquearIPHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id inválido")
			return
		}
		res := gdb.Where("id = ? AND profesional_id = ?", id, profesionalID).Delete(&db.IPBloqueadaTurnoPublico{})
		if res.Error != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo desbloquear la IP")
			return
		}
		if res.RowsAffected == 0 {
			writeError(w, http.StatusNotFound, "bloqueo no encontrado")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"mensaje": "IP desbloqueada"})
	}
}

// registrarAuditoriaBloqueo — escribe la bitácora (ver
// db.AuditoriaBloqueoTurnoPublico) — se llama DENTRO de la misma
// transacción que bloquea y borra (o que los simula, ver
// db.AuditoriaBloqueoTurnoPublico.Simulado), para que quede o todo o nada.
func registrarAuditoriaBloqueo(tx *gorm.DB, profesionalID uuid.UUID, motivo string, email, ip *string, dnis []string, turnosBorrados int, simulado bool) error {
	return tx.Create(&db.AuditoriaBloqueoTurnoPublico{
		ProfesionalID:  profesionalID,
		Motivo:         motivo,
		Email:          email,
		IP:             ip,
		DNIs:           strings.Join(dnis, ", "),
		TurnosBorrados: turnosBorrados,
		Simulado:       simulado,
	}).Error
}
