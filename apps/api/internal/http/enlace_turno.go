package http

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/security"
)

// enlaceTurnoTTL — 1 hora (spec del cliente, Fase 2 ítem 5). Ver el
// comentario grande de db.EnlaceTurno para el resto de las reglas de
// vencimiento (por tiempo Y por uso, lo que llegue primero).
const enlaceTurnoTTL = 1 * time.Hour

var errEnlaceTurnoInvalido = errors.New("este link ya no es válido")

// registerEnlaceTurnoRoutes monta POST /enlaces-turno — autenticado
// (dentro del grupo requireClinic de router.go), "+ Agregar turno" →
// "Compartir link de turnero" del panel.
func registerEnlaceTurnoRoutes(r chi.Router, gdb *gorm.DB, deps AuthDeps) {
	r.Post("/enlaces-turno", crearEnlaceTurnoHandler(gdb, deps))
}

type crearEnlaceTurnoResponse struct {
	URL      string `json:"url"`
	ExpiraEn string `json:"expiraEn"`
}

// crearEnlaceTurnoRequest — las dos decisiones que el profesional toma al
// generar el link (Fase 3.2.7b).
type crearEnlaceTurnoRequest struct {
	// ParaTodosLosProfesionales — false (default) es el enlace de
	// siempre: el turno entra en la agenda de quien lo genera y el wizard
	// no pregunta con quién. True deja elegir al paciente.
	ParaTodosLosProfesionales bool `json:"paraTodosLosProfesionales"`
	// PacienteID — opcional. Con una ficha elegida, el wizard no vuelve a
	// pedir los datos que esa ficha ya tiene.
	PacienteID string `json:"pacienteId"`
}

// crearEnlaceTurnoHandler — genera el link de 1h y arma la URL completa
// (mismo criterio que resetURL en auth.go: el backend conoce AppBaseURL,
// el frontend no necesita adivinarlo). La clínica se resuelve por sesión
// (profesionalIDFromRequest), no por slug en el path — este endpoint lo
// llama el propio profesional logueado desde el panel, nunca un visitante
// público.
func crearEnlaceTurnoHandler(gdb *gorm.DB, deps AuthDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var clinic db.Clinic
		if err := gdb.First(&clinic, "id = ?", clinicID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el link")
			return
		}

		// Cuerpo OPCIONAL: sin él, el enlace es el de siempre (propio, sin
		// paciente). Los tests y cualquier consumidor anterior a esta fase
		// mandan POST sin body, y tienen que seguir andando.
		var req crearEnlaceTurnoRequest
		if r.ContentLength > 0 {
			if err := decodeJSON(w, r, &req); err != nil {
				writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
				return
			}
		}

		// La ficha, si la eligió: de ESTA clínica y nada más. La identidad
		// del paciente es de la clínica (TR-144), así que no se acota al
		// profesional — pero sí a que exista y sea de acá, o el enlace
		// llevaría a una ficha ajena.
		var pacienteID *uuid.UUID
		if id := strings.TrimSpace(req.PacienteID); id != "" {
			parsed, err := uuid.Parse(id)
			if err != nil {
				writeError(w, http.StatusBadRequest, "el paciente elegido no es válido")
				return
			}
			var paciente db.Paciente
			if err := gdb.Where("id = ? AND clinic_id = ?", parsed, clinicID).First(&paciente).Error; err != nil {
				writeError(w, http.StatusNotFound, "el paciente elegido no existe")
				return
			}
			pacienteID = &paciente.ID
		}

		token, tokenHash, err := security.NewToken()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el link")
			return
		}
		expiraEn := time.Now().Add(enlaceTurnoTTL)
		// Con dueño: el enlace es de quien lo genera, y es lo que decide a
		// qué agenda entran los turnos que se saquen con él (Fase 3.2.5).
		enlace := db.EnlaceTurno{
			UserID:                    usuarioDeLaSesionOpcional(r),
			ClinicID:                  clinicID,
			TokenHash:                 tokenHash,
			ExpiraEn:                  expiraEn,
			ParaTodosLosProfesionales: req.ParaTodosLosProfesionales,
			PacienteID:                pacienteID,
		}
		if err := gdb.Create(&enlace).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el link")
			return
		}

		url := strings.TrimRight(deps.AppBaseURL, "/") + "/" + clinic.Slug + "?enlace=" + token
		writeJSON(w, http.StatusCreated, crearEnlaceTurnoResponse{
			URL:      url,
			ExpiraEn: expiraEn.Format(time.RFC3339),
		})
	}
}

type enlaceTurnoValidoResponse struct {
	Valido bool `json:"valido"`
	// ElegisProfesional — si el wizard tiene que preguntar con quién. Con
	// un enlace "propio" no se pregunta: ya lo decidió quien lo generó.
	ElegisProfesional bool `json:"elegisProfesional"`
	// Paciente — la ficha que el enlace trae elegida, si trae alguna.
	Paciente *pacienteDelEnlaceResponse `json:"paciente,omitempty"`
}

// pacienteDelEnlaceResponse — lo MÍNIMO que el wizard necesita para saber
// qué pasos saltearse, y nada más.
//
// Este endpoint es público: lo único que lo protege es tener el token, que
// es justamente lo que el profesional le mandó a esta persona. Aun así no
// viaja la ficha entera —ni DNI, ni mail, ni teléfono—: alcanza con el
// nombre para mostrar de quién es el turno, y dos banderas para decidir
// qué preguntar. Un dato que no hace falta para pintar la pantalla no
// tiene por qué salir de la clínica.
type pacienteDelEnlaceResponse struct {
	ID       string `json:"id"`
	Nombre   string `json:"nombre"`
	Apellido string `json:"apellido"`
	// TieneDatosPropios — mail Y teléfono cargados. Sin los dos, el camino
	// "para mí" tiene que pedir lo que falte.
	TieneDatosPropios bool `json:"tieneDatosPropios"`
	// TieneTutores — al menos un tutor conocido. Con uno, el camino "para
	// otro" no pide ni tutor ni paciente: ya están los dos.
	TieneTutores bool `json:"tieneTutores"`
}

// validarEnlaceTurnoPublicoHandler — GET /clinicas/{slug}/enlaces-turno/
// validar?token=... (público, sin sesión): chequeo de solo lectura, sin
// consumir nada — el wizard lo llama apenas se abre por este link, para
// mostrar de una "este link ya venció" en vez de dejar completar todo el
// formulario y recién ahí fallar en el paso final. La validación REAL
// (la que de verdad cuenta) es la que corre dentro de la transacción de
// solicitarTurnoPublicoHandler al confirmar el turno — esto es pura UX.
func validarEnlaceTurnoPublicoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		token := strings.TrimSpace(r.URL.Query().Get("token"))
		if token == "" {
			writeError(w, http.StatusBadRequest, "falta el token del link")
			return
		}

		enlace, err := buscarEnlaceTurnoVigente(gdb, clinic.ID, token)
		if err != nil {
			if errors.Is(err, errEnlaceTurnoInvalido) {
				writeJSON(w, http.StatusOK, enlaceTurnoValidoResponse{Valido: false})
				return
			}
			writeError(w, http.StatusInternalServerError, "no se pudo validar el link")
			return
		}
		out := enlaceTurnoValidoResponse{
			Valido:            enlace.Vigente(time.Now()),
			ElegisProfesional: enlace.ParaTodosLosProfesionales,
		}
		if out.Valido && enlace.PacienteID != nil {
			var paciente db.Paciente
			if err := gdb.First(&paciente, "id = ?", *enlace.PacienteID).Error; err == nil {
				var tutores int64
				gdb.Model(&db.PacienteTutor{}).Where("paciente_id = ?", paciente.ID).Limit(1).Count(&tutores)
				out.Paciente = &pacienteDelEnlaceResponse{
					ID: paciente.ID.String(), Nombre: paciente.Nombre, Apellido: paciente.Apellido,
					TieneDatosPropios: paciente.Email != nil && *paciente.Email != "" &&
						paciente.Telefono != nil && *paciente.Telefono != "",
					TieneTutores: tutores > 0,
				}
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// buscarEnlaceTurnoVigente busca el enlace por token+clínica sin mirar
// todavía si le queda cupo (Vigente lo resuelve el caller) — separado de
// consumirEnlaceTurno de abajo porque el chequeo de solo lectura
// (validarEnlaceTurnoPublicoHandler) necesita la fila pero NUNCA debe
// escribirla.
func buscarEnlaceTurnoVigente(tx *gorm.DB, clinicID uuid.UUID, token string) (db.EnlaceTurno, error) {
	tokenHash := security.HashToken(token)
	var enlace db.EnlaceTurno
	err := tx.Where("clinic_id = ? AND token_hash = ?", clinicID, tokenHash).First(&enlace).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return db.EnlaceTurno{}, errEnlaceTurnoInvalido
	}
	if err != nil {
		return db.EnlaceTurno{}, err
	}
	return enlace, nil
}

// consumirEnlaceTurno — el chequeo que de verdad importa, corrido DENTRO
// de la misma transacción que crea el turno (solicitarTurnoPublicoHandler,
// mismo criterio que consumirVerificacionTurnoPublico): si la creación del
// turno falla más adelante (horario ya no disponible), la transacción
// entera se revierte y el enlace queda sin consumir, para que la persona
// pueda reintentar con otro horario sin que el link se les gaste de
// arriba.
//
// `esParaOtro` decide qué contador mueve — el profesional NO fija esto al
// generar el link (pedido explícito del cliente): lo elige la propia
// persona en la pantalla "¿Para quién es el turno?" de siempre, en cada
// intento. Un turno "para mí" apaga el link para cualquier uso posterior,
// sea cual sea; "para otro" solo gasta un cupo de los 5.
func consumirEnlaceTurno(tx *gorm.DB, clinicID uuid.UUID, token string, esParaOtro bool) error {
	enlace, err := buscarEnlaceTurnoVigente(tx, clinicID, token)
	if err != nil {
		return err
	}
	ahora := time.Now()
	if ahora.After(enlace.ExpiraEn) {
		return errEnlaceTurnoInvalido
	}
	if esParaOtro {
		if enlace.UsosParaOtro >= db.EnlaceTurnoLimiteUsosParaOtro {
			return errEnlaceTurnoInvalido
		}
		enlace.UsosParaOtro++
	} else {
		if enlace.UsadoParaMi {
			return errEnlaceTurnoInvalido
		}
		enlace.UsadoParaMi = true
	}
	return tx.Save(&enlace).Error
}

// identidadDeLaFichaDelEnlace — el mail con el que se identifica el
// pedido cuando el enlace trae la ficha elegida (Fase 3.2.7b).
//
// Solo si el enlace trae EXACTAMENTE esa ficha: un enlace se reenvía, y
// sin esa igualdad alcanzaría con tener cualquier link de la clínica para
// hacerse pasar por cualquier ficha cuyo id se conociera.
//
// "Para otro" devuelve el mail del primer tutor conocido —la identidad de
// ese camino es la de quien reserva, no la del paciente (TR-116)— y "para
// mí", el propio de la ficha.
func identidadDeLaFichaDelEnlace(gdb *gorm.DB, clinicID uuid.UUID, token, pacienteIDStr string, paraOtro bool) (string, bool) {
	pacienteID, err := uuid.Parse(pacienteIDStr)
	if err != nil {
		return "", false
	}
	enlace, err := buscarEnlaceTurnoVigente(gdb, clinicID, token)
	if err != nil || enlace.PacienteID == nil || *enlace.PacienteID != pacienteID {
		return "", false
	}

	if paraOtro {
		var tutor db.PacienteTutor
		if err := gdb.Where("paciente_id = ?", pacienteID).Order("created_at").First(&tutor).Error; err != nil {
			return "", false
		}
		return tutor.Email, tutor.Email != ""
	}

	var paciente db.Paciente
	if err := gdb.Where("id = ? AND clinic_id = ?", pacienteID, clinicID).First(&paciente).Error; err != nil {
		return "", false
	}
	if paciente.Email == nil || *paciente.Email == "" {
		return "", false
	}
	return *paciente.Email, true
}
