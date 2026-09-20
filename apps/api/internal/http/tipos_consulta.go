package http

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// colorRegex valida un hex de 6 dígitos ("#RRGGBB") — mismo formato que
// TipoConsulta.Color siempre tuvo (Sistema Cascarón, TR-010).
var colorRegex = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

const (
	duracionMinutosMax           = 8 * 60 // 8 horas — tope defensivo, no una regla de negocio real
	tiempoPostConsultaMinutosMax = 4 * 60 // 4 horas
)

// nilSiVacio — "" (el campo no vino, o vino en blanco) pasa a nil para
// las columnas nullable de TipoConsulta (PreferenciaHoraDesde/Hasta) —
// mismo criterio que CantidadSesiones ya usaba con *int.
func nilSiVacio(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

type tipoConsultaResponse struct {
	ID                        string `json:"id"`
	Nombre                    string `json:"nombre"`
	Color                     string `json:"color"`
	DuracionMinutos           int    `json:"duracionMinutos"`
	TiempoPostConsultaMinutos int    `json:"tiempoPostConsultaMinutos"`
	CantidadSesiones          *int   `json:"cantidadSesiones,omitempty"`
	// PreferenciaHoraDesde/PreferenciaHoraHasta (nueva función, pedido
	// textual del cliente, 2026-09-08): "el profesional solo quiere
	// atender consultas generales de 8:00 a 12:00" — ver el comentario
	// grande en db.TipoConsulta.
	PreferenciaHoraDesde *string `json:"preferenciaHoraDesde,omitempty"`
	PreferenciaHoraHasta *string `json:"preferenciaHoraHasta,omitempty"`
}

func toTipoConsultaResponse(t db.TipoConsulta) tipoConsultaResponse {
	return tipoConsultaResponse{
		ID:                        t.ID.String(),
		Nombre:                    t.Nombre,
		Color:                     t.Color,
		DuracionMinutos:           t.DuracionMinutos,
		TiempoPostConsultaMinutos: t.TiempoPostConsultaMinutos,
		CantidadSesiones:          t.CantidadSesiones,
		PreferenciaHoraDesde:      t.PreferenciaHoraDesde,
		PreferenciaHoraHasta:      t.PreferenciaHoraHasta,
	}
}

// registerTipoConsultaRoutes monta el catálogo de tipos de consulta —
// POR PROFESIONAL (TR-001 en docs/Arquitectura y base/tradeoffs.md, distinto del catálogo
// global de especialidades). GET ya existía (usado por "+ Agregar turno"
// y el calendario para pintar cada turno con su color); POST/PATCH/DELETE
// son F2.3.4 (docs/Arquitectura y base/implementation-plan.md §11.3) — hasta ahora el
// catálogo solo se armaba con los 2 tipos sembrados al registrarse
// (SeedTiposConsultaDefault), sin forma de gestionarlo desde la UI.
func registerTipoConsultaRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/tipos-consulta", listTiposConsultaHandler(gdb))
	// Los de los colegas, y el alta por copia — ver
	// tipos_consulta_colegas.go.
	registerTiposConsultaDeColegasRoutes(r, gdb)
	r.Post("/tipos-consulta", crearTipoConsultaHandler(gdb))
	r.Patch("/tipos-consulta/{id}", editarTipoConsultaHandler(gdb))
	r.Delete("/tipos-consulta/{id}", eliminarTipoConsultaHandler(gdb))
}

func listTiposConsultaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		// LOS TUYOS, no los de la clínica (Fase 3.2.5). La columna
		// `user_id` existe desde la 3.2.1 —"el tipo de consulta es de UN
		// profesional", ver el comentario en db.TipoConsulta— pero este
		// listado seguía filtrando solo por clínica: con dos odontólogos,
		// cada uno veía en su configuración de agenda los tipos del otro y
		// podía editárselos.
		//
		// `user_id IS NULL` entra igual: son las filas anteriores a la
		// 3.2.1 que la migración todavía no asignó. Dejarlas afuera le
		// vaciaría la pantalla a una clínica vieja; incluirlas no le
		// muestra a nadie nada ajeno, porque la migración se las da al
		// owner y en una clínica de uno solo el owner es el único que hay.
		//
		// LA AGENDA, NO EL USUARIO DE LA SESIÓN (QA de la 3.2.6,
		// 2026-09-20). Este archivo se quedó en `session.UserID` cuando la
		// 3.2.6 mudó todo lo demás al foco, y por eso recepción veía
		// SIEMPRE la misma lista —la suya, la de alguien que no atiende—
		// sin importar qué profesional tuviera elegido. El tipo que creaba
		// ahí nacía a su nombre, así que después no lo encontraba para
		// editarlo ni borrarlo ("tipo de consulta no encontrado") y la
		// disponibilidad de "+ Agregar turno" no daba ningún horario.
		//
		// `?profesionalUserId=` permite además pedir los de otra agenda
		// sin cambiar la vista: es lo que necesita "+ Agregar turno" para
		// que los tipos que ofrece sean los del profesional elegido EN EL
		// MODAL.
		duenio, ok := agendaAConfigurar(w, r, gdb, profesionalID, r.URL.Query().Get("profesionalUserId"))
		if !ok {
			return
		}
		if duenio == uuid.Nil {
			// Recepción sin profesional elegido: no hay una configuración
			// "de toda la clínica" que mostrar.
			writeJSON(w, http.StatusOK, []tipoConsultaResponse{})
			return
		}
		var tipos []db.TipoConsulta
		if err := gdb.Where("clinic_id = ?", profesionalID).Scopes(soloDeLaAgendaDe(duenio)).
			Order("created_at").Find(&tipos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los tipos de consulta")
			return
		}

		out := make([]tipoConsultaResponse, len(tipos))
		for i, t := range tipos {
			out[i] = toTipoConsultaResponse(t)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// tipoConsultaRequest respalda tanto POST (alta) como PATCH (edición
// completa, mismo criterio que editarPacienteHandler en pacientes.go: se
// reemplazan todos los campos editables, no un PATCH parcial de verdad).
type tipoConsultaRequest struct {
	Nombre                    string `json:"nombre"`
	Color                     string `json:"color"`
	DuracionMinutos           int    `json:"duracionMinutos"`
	TiempoPostConsultaMinutos int    `json:"tiempoPostConsultaMinutos"`
	CantidadSesiones          *int   `json:"cantidadSesiones"`
	// PreferenciaHoraDesde/PreferenciaHoraHasta (nueva función, pedido
	// textual del cliente, 2026-09-08) — "" (ambos vacíos) significa "sin
	// preferencia", el caso normal. Con uno solo lleno es un error (ver
	// validar más abajo) — nunca un HoraDesde sin su Hasta a medias.
	PreferenciaHoraDesde string `json:"preferenciaHoraDesde"`
	PreferenciaHoraHasta string `json:"preferenciaHoraHasta"`
	// ProfesionalUserID — en qué agenda se crea este tipo (QA de la
	// 3.2.6). Vacío = la del profesional en foco, o la propia. Recepción
	// crea tipos PARA un profesional, nunca para sí misma: no atiende.
	ProfesionalUserID string `json:"profesionalUserId"`
}

// validar corrige espacios y devuelve un mensaje de error controlado (nunca
// un 500) si algún campo no es válido — F2.3.4, mismos topes que
// duracionMinutosMax/tiempoPostConsultaMinutosMax de arriba.
func (req *tipoConsultaRequest) validar() string {
	req.Nombre = strings.TrimSpace(req.Nombre)
	req.Color = strings.TrimSpace(req.Color)
	req.PreferenciaHoraDesde = strings.TrimSpace(req.PreferenciaHoraDesde)
	req.PreferenciaHoraHasta = strings.TrimSpace(req.PreferenciaHoraHasta)

	if req.Nombre == "" {
		return "el nombre no puede estar vacío"
	}
	if !colorRegex.MatchString(req.Color) {
		return "el color debe ser un hex de 6 dígitos, por ejemplo #E7D9BE"
	}
	if req.DuracionMinutos <= 0 || req.DuracionMinutos > duracionMinutosMax {
		return "la duración debe ser mayor a 0 y menor a 8 horas"
	}
	if req.TiempoPostConsultaMinutos < 0 || req.TiempoPostConsultaMinutos > tiempoPostConsultaMinutosMax {
		return "el tiempo posterior a la consulta debe estar entre 0 y 4 horas"
	}
	if req.CantidadSesiones != nil && *req.CantidadSesiones < 1 {
		return "la cantidad de sesiones debe ser mayor a 0"
	}
	// Preferencia de atención (nueva función, 2026-09-08): "el profesional
	// solo quiere atender consultas generales de 8:00 a 12:00" — ambos
	// vacíos (sin preferencia) o ambos con un horario válido, nunca uno
	// solo.
	if (req.PreferenciaHoraDesde == "") != (req.PreferenciaHoraHasta == "") {
		return "la preferencia de atención necesita desde y hasta, o ninguno de los dos"
	}
	if req.PreferenciaHoraDesde != "" {
		if !horaRegex.MatchString(req.PreferenciaHoraDesde) || !horaRegex.MatchString(req.PreferenciaHoraHasta) {
			return "la preferencia de atención debe tener el formato HH:MM"
		}
		if req.PreferenciaHoraHasta <= req.PreferenciaHoraDesde {
			return "la preferencia de atención: la hora hasta debe ser posterior a la de desde"
		}
	}
	return ""
}

func crearTipoConsultaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var req tipoConsultaRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		if msg := req.validar(); msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}

		// NO DOS VECES EL MISMO TIPO (corrección del 2026-09-15,
		// reportada por el cliente). Tener "Consulta general" dos veces en
		// la propia lista no es una elección: es un error de tipeo o un
		// clic de más, y después hay que elegir entre dos opciones
		// idénticas cada vez que se carga un turno.
		//
		// Se compara por nombre NORMALIZADO (sin acentos, sin mayúsculas,
		// sin puntuación): "consulta general" y "Consulta General" son el
		// mismo tipo. El color y la duración no entran — son configuración
		// de la agenda, no identidad del tipo.
		//
		// IGUALDAD EXACTA y no `seParecen`, a diferencia del filtro de
		// sugerencias. Bloquear y ocultar no merecen el mismo criterio:
		// ocultar de más solo quita una sugerencia, bloquear de más impide
		// escribir un nombre legítimo. Con el umbral difuso, "Control 1" y
		// "Control 2" quedan a un carácter de distancia y el segundo sería
		// irrechazable — y eso lo decide el profesional, no nosotros.
		//
		// Solo contra los PROPIOS: que un colega tenga "Consulta general"
		// no impide tener la tuya, con tus tiempos. Ese es justamente el
		// sentido de copiar en vez de compartir (TR-142).
		// De la agenda que se está configurando, no de quien apreta el
		// botón: recepción crea tipos PARA un profesional.
		duenio, ok := agendaAConfigurar(w, r, gdb, profesionalID, req.ProfesionalUserID)
		if !ok {
			return
		}
		if duenio == uuid.Nil {
			writeError(w, http.StatusConflict, errFaltaElegirProfesional.Error())
			return
		}

		var mios []db.TipoConsulta
		if err := gdb.Where("clinic_id = ?", profesionalID).Scopes(soloDeLaAgendaDe(duenio)).
			Find(&mios).Error; err == nil {
			for _, mio := range mios {
				if normalizarNombreTipo(mio.Nombre) == normalizarNombreTipo(req.Nombre) {
					writeError(w, http.StatusConflict,
						"ya tenés un tipo de consulta llamado \""+mio.Nombre+"\"")
					return
				}
			}
		}

		tipo := db.TipoConsulta{
			ClinicID:                  profesionalID,
			UserID:                    &duenio,
			Nombre:                    req.Nombre,
			Color:                     req.Color,
			DuracionMinutos:           req.DuracionMinutos,
			TiempoPostConsultaMinutos: req.TiempoPostConsultaMinutos,
			CantidadSesiones:          req.CantidadSesiones,
			PreferenciaHoraDesde:      nilSiVacio(req.PreferenciaHoraDesde),
			PreferenciaHoraHasta:      nilSiVacio(req.PreferenciaHoraHasta),
		}
		if err := gdb.Create(&tipo).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo crear el tipo de consulta")
			return
		}

		writeJSON(w, http.StatusCreated, toTipoConsultaResponse(tipo))
	}
}

func editarTipoConsultaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		tipoID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de tipo de consulta inválido")
			return
		}

		var req tipoConsultaRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		if msg := req.validar(); msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}

		var tipo db.TipoConsulta
		// El tipo de un colega no se edita ni se borra: el listado ya
		// mostraba solo los propios, pero con el id a mano la escritura
		// seguía abierta.
		if err := gdb.Scopes(soloMisTiposDeConsulta(r)).
			Where("id = ? AND clinic_id = ?", tipoID, profesionalID).First(&tipo).Error; err != nil {
			writeError(w, http.StatusNotFound, "tipo de consulta no encontrado")
			return
		}

		tipo.Nombre = req.Nombre
		tipo.Color = req.Color
		tipo.DuracionMinutos = req.DuracionMinutos
		tipo.TiempoPostConsultaMinutos = req.TiempoPostConsultaMinutos
		tipo.CantidadSesiones = req.CantidadSesiones
		tipo.PreferenciaHoraDesde = nilSiVacio(req.PreferenciaHoraDesde)
		tipo.PreferenciaHoraHasta = nilSiVacio(req.PreferenciaHoraHasta)

		if err := gdb.Save(&tipo).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar el tipo de consulta")
			return
		}

		writeJSON(w, http.StatusOK, toTipoConsultaResponse(tipo))
	}
}

// eliminarTipoConsultaHandler — R2F-4 en docs/Arquitectura y base/implementation-plan.md §11.4
// dejó pendiente esta regla: no se puede borrar un tipo de consulta que ya
// tiene turnos asociados (agendados, pendientes o cancelados) — un delete
// duro dejaría esos turnos con un tipo_consulta_id huérfano (sin FK real
// en la base, spec de siempre) y el calendario/ficha de turno no podrían
// resolver más su nombre/color.
func eliminarTipoConsultaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		tipoID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de tipo de consulta inválido")
			return
		}

		var tipo db.TipoConsulta
		// El tipo de un colega no se edita ni se borra: el listado ya
		// mostraba solo los propios, pero con el id a mano la escritura
		// seguía abierta.
		if err := gdb.Scopes(soloMisTiposDeConsulta(r)).
			Where("id = ? AND clinic_id = ?", tipoID, profesionalID).First(&tipo).Error; err != nil {
			writeError(w, http.StatusNotFound, "tipo de consulta no encontrado")
			return
		}

		var turnosAsociados int64
		if err := gdb.Model(&db.Turno{}).Where("tipo_consulta_id = ?", tipoID).Count(&turnosAsociados).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo verificar los turnos asociados")
			return
		}
		if turnosAsociados > 0 {
			writeError(w, http.StatusConflict, "no se puede eliminar un tipo de consulta con turnos asociados")
			return
		}

		if err := gdb.Delete(&tipo).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo eliminar el tipo de consulta")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
