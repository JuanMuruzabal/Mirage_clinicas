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

		token, tokenHash, err := security.NewToken()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el link")
			return
		}
		expiraEn := time.Now().Add(enlaceTurnoTTL)
		enlace := db.EnlaceTurno{
			ProfesionalID: clinicID,
			TokenHash:     tokenHash,
			ExpiraEn:      expiraEn,
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
		writeJSON(w, http.StatusOK, enlaceTurnoValidoResponse{Valido: enlace.Vigente(time.Now())})
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
	err := tx.Where("profesional_id = ? AND token_hash = ?", clinicID, tokenHash).First(&enlace).Error
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
