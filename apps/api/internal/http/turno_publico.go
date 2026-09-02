package http

import (
	"errors"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// dniRegex/telefonoRegex (TR-002 en docs/tradeoffs.md): DNI numérico de
// 7-8 dígitos; teléfono argentino de 10-13 dígitos, acepta un "+" líder
// (p. ej. +54 9 351 555-0142 sin espacios/guiones, que el frontend limpia
// antes de mandar).
var (
	dniRegex      = regexp.MustCompile(`^\d{7,8}$`)
	telefonoRegex = regexp.MustCompile(`^\+?\d{10,13}$`)
)

// errHorarioPublicoYaNoDisponible — Extra 2.3.5 (E5.2): el horario que el
// paciente eligió en el paso anterior del wizard dejó de estar disponible
// para cuando terminó de completar el resto del formulario (otro paciente
// lo tomó, o el profesional cargó un turno a mano encima). Sentinel propio
// para distinguirlo de cualquier otro error de la transacción y devolver
// un mensaje específico, no el genérico de "no se pudo registrar".
var errHorarioPublicoYaNoDisponible = errors.New("el horario elegido ya no está disponible")

// registerTurnoPublicoRoutes monta las rutas del formulario público de
// pedido de turno (spec §4.4, Extra 2.3.5/E5.2-E5.3): sin autenticación,
// las completa un paciente entrando a la página pública de la clínica, no
// un profesional logueado. `deps` (E5.6) trae Mail/AccountLimiter/
// IPLimiter para "Confirmanos que sos vos" — mismas dependencias que
// registerAuthRoutes, ninguna nueva.
func registerTurnoPublicoRoutes(r chi.Router, gdb *gorm.DB, deps AuthDeps) {
	r.Get("/clinicas/{slug}/tipos-consulta", listTiposConsultaPublicoHandler(gdb))
	r.Get("/clinicas/{slug}/disponibilidad", listDisponibilidadPublicaHandler(gdb))
	r.Post("/clinicas/{slug}/verificacion-email", enviarVerificacionTurnoPublicoHandler(gdb, deps))
	r.Post("/clinicas/{slug}/verificacion-email/confirmar", confirmarVerificacionTurnoPublicoHandler(gdb, deps))
	r.Post("/clinicas/{slug}/turnos", solicitarTurnoPublicoHandler(gdb))
}

// tipoConsultaPublicoResponse — versión reducida de tipoConsultaResponse
// (tipos_consulta.go) para el wizard público: nada de tiempo post-consulta,
// cantidad de sesiones ni preferencia de atención — son detalles internos
// del cálculo de disponibilidad, no algo que el paciente necesite ver o
// pueda elegir.
type tipoConsultaPublicoResponse struct {
	ID              string `json:"id"`
	Nombre          string `json:"nombre"`
	Color           string `json:"color"`
	DuracionMinutos int    `json:"duracionMinutos"`
}

// listTiposConsultaPublicoHandler — GET /clinicas/{slug}/tipos-consulta
// (E5.2): primer paso de datos que necesita el wizard público después de
// los datos de contacto, para poder pedir la disponibilidad del tipo
// elegido.
func listTiposConsultaPublicoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		var tipos []db.TipoConsulta
		if err := gdb.Where("profesional_id = ?", clinic.ID).Order("nombre").Find(&tipos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los tipos de consulta")
			return
		}

		out := make([]tipoConsultaPublicoResponse, len(tipos))
		for i, t := range tipos {
			out[i] = tipoConsultaPublicoResponse{ID: t.ID.String(), Nombre: t.Nombre, Color: t.Color, DuracionMinutos: t.DuracionMinutos}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// listDisponibilidadPublicaHandler — GET /clinicas/{slug}/disponibilidad
// (E5.2): mismo cálculo que GET /disponibilidad (disponibilidad.go,
// autenticado, lo usa el profesional desde el panel), reusado tal cual —
// la única diferencia es cómo se resuelve la clínica (por slug público en
// vez de por sesión). Nunca excluirTurnoId: acá siempre se está pidiendo
// un turno nuevo, nunca reprogramando uno existente.
func listDisponibilidadPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		tipoConsultaIDStr := strings.TrimSpace(r.URL.Query().Get("tipoConsultaId"))
		fechaStr := strings.TrimSpace(r.URL.Query().Get("fecha"))
		if tipoConsultaIDStr == "" || fechaStr == "" {
			writeError(w, http.StatusBadRequest, "tipoConsultaId y fecha son obligatorios")
			return
		}
		tipoConsultaID, err := uuid.Parse(tipoConsultaIDStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "tipoConsultaId inválido")
			return
		}
		fecha, err := clock.ParseDate(fechaStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "la fecha debe tener el formato YYYY-MM-DD")
			return
		}

		var tipo db.TipoConsulta
		if err := gdb.Where("id = ? AND profesional_id = ?", tipoConsultaID, clinic.ID).First(&tipo).Error; err != nil {
			writeError(w, http.StatusNotFound, "tipo de consulta no encontrado")
			return
		}

		slots, err := calcularDisponibilidad(gdb, clinic.ID, tipo, fecha, nil)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular la disponibilidad")
			return
		}

		writeJSON(w, http.StatusOK, disponibilidadResponse{Slots: slots})
	}
}

type solicitarTurnoPublicoRequest struct {
	NombreContacto   string `json:"nombreContacto"`
	ApellidoContacto string `json:"apellidoContacto"`
	DNIContacto      string `json:"dniContacto"`
	TelefonoContacto string `json:"telefonoContacto"`
	EmailContacto    string `json:"emailContacto"`
	Motivo           string `json:"motivo"`
	// TipoConsultaID/Fecha/Hora — Extra 2.3.5 (E5.2): antes de esto, el
	// formulario público solo mandaba datos de contacto y el turno quedaba
	// `pendiente`, sin horario, a la espera de que el profesional lo
	// agendara a mano (TR-006). Ahora el paciente elige tipo de consulta,
	// fecha y horario disponible en el propio formulario (E5.3) y el turno
	// nace `agendado`, con horario real, de punta a punta.
	TipoConsultaID string `json:"tipoConsultaId"`
	Fecha          string `json:"fecha"`
	Hora           string `json:"hora"`
	// VerificacionToken (E5.6, "Confirmanos que sos vos") — token opaco
	// emitido por POST /clinicas/{slug}/verificacion-email/confirmar tras
	// validar el código de 6 dígitos mandado a EmailContacto. Sin un token
	// válido, sin usar y para el mismo mail, el turno no se crea — ver
	// consumirVerificacionTurnoPublico en verificacion_turno_publico.go.
	VerificacionToken string `json:"verificacionToken"`
}

type solicitarTurnoPublicoResponse struct {
	ID         string `json:"id"`
	HoraInicio string `json:"horaInicio"`
	HoraFin    string `json:"horaFin"`
}

// solicitarTurnoPublicoHandler — POST /clinicas/{slug}/turnos, reescrito
// para Extra 2.3.5 (E5.2, docs/implementation-plan.md §11.5): crea el
// turno directamente `agendado`, con `HoraInicio`/`HoraFin` reales — nunca
// más `pendiente`. Reusa calcularDisponibilidad (disponibilidad.go, misma
// función que usa el profesional desde el panel, TR-086) para revalidar
// el horario elegido, y crearOBuscarPacientePorDNI (turnos.go, E5.1) para
// no duplicar la ficha de un paciente que ya pidió turno antes con el
// mismo DNI.
func solicitarTurnoPublicoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		var req solicitarTurnoPublicoRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.NombreContacto = strings.TrimSpace(req.NombreContacto)
		req.ApellidoContacto = strings.TrimSpace(req.ApellidoContacto)
		req.DNIContacto = strings.TrimSpace(req.DNIContacto)
		req.TelefonoContacto = strings.TrimSpace(req.TelefonoContacto)
		req.EmailContacto = strings.TrimSpace(strings.ToLower(req.EmailContacto))
		req.Motivo = strings.TrimSpace(req.Motivo)
		req.TipoConsultaID = strings.TrimSpace(req.TipoConsultaID)
		req.Fecha = strings.TrimSpace(req.Fecha)
		req.Hora = strings.TrimSpace(req.Hora)
		req.VerificacionToken = strings.TrimSpace(req.VerificacionToken)

		if req.VerificacionToken == "" {
			writeError(w, http.StatusBadRequest, "verificá tu mail antes de pedir el turno")
			return
		}
		if req.NombreContacto == "" || req.ApellidoContacto == "" {
			writeError(w, http.StatusBadRequest, "nombre y apellido son obligatorios")
			return
		}
		if !dniRegex.MatchString(req.DNIContacto) {
			writeError(w, http.StatusBadRequest, "el DNI debe tener 7 u 8 dígitos, sin puntos")
			return
		}
		if !telefonoRegex.MatchString(req.TelefonoContacto) {
			writeError(w, http.StatusBadRequest, "el teléfono no tiene un formato válido")
			return
		}
		if _, err := mail.ParseAddress(req.EmailContacto); err != nil {
			writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
			return
		}
		tipoConsultaID, err := uuid.Parse(req.TipoConsultaID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "el tipo de consulta no es válido")
			return
		}
		fecha, err := clock.ParseDate(req.Fecha)
		if err != nil {
			writeError(w, http.StatusBadRequest, "la fecha debe tener el formato YYYY-MM-DD")
			return
		}
		if !horaRegex.MatchString(req.Hora) {
			writeError(w, http.StatusBadRequest, "el horario elegido no es válido")
			return
		}

		var tipo db.TipoConsulta
		if err := gdb.Where("id = ? AND profesional_id = ?", tipoConsultaID, clinic.ID).First(&tipo).Error; err != nil {
			writeError(w, http.StatusNotFound, "tipo de consulta no encontrado")
			return
		}

		horaInicio := combinarFechaYHora(fecha, req.Hora)
		if horaInicio.Before(clock.Now()) {
			writeError(w, http.StatusBadRequest, "no se puede pedir un turno en una fecha pasada")
			return
		}
		horaFin := horaInicio.Add(time.Duration(tipo.DuracionMinutos) * time.Minute)

		turno := db.Turno{
			ProfesionalID:    clinic.ID,
			Estado:           "agendado",
			TipoConsultaID:   &tipo.ID,
			HoraInicio:       &horaInicio,
			HoraFin:          &horaFin,
			NombreContacto:   req.NombreContacto,
			ApellidoContacto: req.ApellidoContacto,
			DNIContacto:      req.DNIContacto,
			TelefonoContacto: req.TelefonoContacto,
			EmailContacto:    req.EmailContacto,
			Motivo:           req.Motivo,
			Origen:           "pagina_publica",
		}

		err = gdb.Transaction(func(tx *gorm.DB) error {
			// Consume el token de "Confirmanos que sos vos" (E5.6) ANTES de
			// cualquier otra cosa — un pedido sin prueba de verificación
			// válida para ESTE mail no debe siquiera llegar a chequear
			// disponibilidad. Si el resto de la transacción falla más
			// adelante (horario ya no disponible), todo se revierte
			// junto, token incluido — el paciente puede reintentar con
			// otro horario sin verificar de nuevo.
			if err := consumirVerificacionTurnoPublico(tx, clinic.ID.String(), req.EmailContacto, req.VerificacionToken); err != nil {
				return err
			}

			// Revalida el horario DENTRO de la transacción — el paciente
			// pudo tardar en completar el resto del formulario y otra
			// persona (o el propio profesional, a mano) ya haber tomado
			// ese horario mientras tanto. El exclusion constraint (T2.5)
			// es la garantía final a nivel de base; este chequeo es lo que
			// convierte esa carrera en un mensaje legible ("elegí otro
			// horario") en vez del genérico de más abajo.
			slots, err := calcularDisponibilidad(tx, clinic.ID, tipo, fecha, nil)
			if err != nil {
				return err
			}
			disponible := false
			for _, s := range slots {
				if s == req.Hora {
					disponible = true
					break
				}
			}
			if !disponible {
				return errHorarioPublicoYaNoDisponible
			}

			paciente, err := crearOBuscarPacientePorDNI(tx, clinic.ID, &turno)
			if err != nil {
				return err
			}
			turno.PacienteID = &paciente.ID

			return tx.Create(&turno).Error
		})

		if err != nil {
			if errors.Is(err, errTurnoVerifPruebaInvalida) {
				writeError(w, http.StatusForbidden, "verificá tu mail antes de pedir el turno")
				return
			}
			if errors.Is(err, errHorarioPublicoYaNoDisponible) || isExclusionViolation(err) {
				writeError(w, http.StatusConflict, "ese horario ya no está disponible, elegí otro")
				return
			}
			writeError(w, http.StatusInternalServerError, "no se pudo registrar el turno")
			return
		}

		writeJSON(w, http.StatusCreated, solicitarTurnoPublicoResponse{
			ID:         turno.ID.String(),
			HoraInicio: turno.HoraInicio.Format(time.RFC3339),
			HoraFin:    turno.HoraFin.Format(time.RFC3339),
		})
	}
}
