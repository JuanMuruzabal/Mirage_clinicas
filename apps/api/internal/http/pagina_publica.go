package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// registerPaginaPublicaRoutes monta /panel/pagina — el editor de página
// pública (spec §5). En este sprint (T4.1/T4.2) solo la barra de acciones
// es funcional (Ocultar/Deployar): la edición real de contenido/diseño
// "queda para desarrollo posterior" (spec §5.1), así que no hay endpoints
// de contenido acá todavía.
func registerPaginaPublicaRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/panel/pagina", getPaginaPublicaHandler(gdb))
	r.Patch("/panel/pagina/ocultar", ocultarPaginaPublicaHandler(gdb))
	r.Patch("/panel/pagina/deployar", deployarPaginaPublicaHandler(gdb))
}

type paginaPublicaResponse struct {
	Oculta      bool    `json:"oculta"`
	DeployadaEn *string `json:"deployadaEn,omitempty"`
}

func toPaginaPublicaResponse(p db.PaginaPublica) paginaPublicaResponse {
	resp := paginaPublicaResponse{Oculta: p.Oculta}
	if p.DeployadaEn != nil {
		iso := p.DeployadaEn.UTC().Format(time.RFC3339)
		resp.DeployadaEn = &iso
	}
	return resp
}

// getOrCrearPaginaPublica — PaginaPublica es 1:1 con Profesional pero la
// fila no se crea al registrarse (el esquema existe desde T0.3, el editor
// y el deploy son Sprint 4, ver internal/db/models.go) — se crea la
// primera vez que hace falta en vez de tocar el flujo de registro por una
// feature que llega dos sprints después.
func getOrCrearPaginaPublica(gdb *gorm.DB, profesionalID uuid.UUID) (*db.PaginaPublica, error) {
	var pagina db.PaginaPublica
	err := gdb.Where("profesional_id = ?", profesionalID).First(&pagina).Error
	if err == nil {
		return &pagina, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	pagina = db.PaginaPublica{ProfesionalID: profesionalID}
	if err := gdb.Create(&pagina).Error; err != nil {
		return nil, err
	}
	return &pagina, nil
}

func getPaginaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		pagina, err := getOrCrearPaginaPublica(gdb, profesionalID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la página")
			return
		}
		writeJSON(w, http.StatusOK, toPaginaPublicaResponse(*pagina))
	}
}

type ocultarPaginaPublicaRequest struct {
	Oculta bool `json:"oculta"`
}

// ocultarPaginaPublicaHandler — PATCH /panel/pagina/ocultar: modo
// "en mantenimiento" para los visitantes (spec §5.2) — no borra ni
// des-deploya nada, solo cambia lo que ve un visitante de `/{slug}` (ver
// getClinicaPublicaHandler en clinicas.go).
func ocultarPaginaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		var req ocultarPaginaPublicaRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		pagina, err := getOrCrearPaginaPublica(gdb, profesionalID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la página")
			return
		}
		pagina.Oculta = req.Oculta
		if err := gdb.Save(pagina).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar la página")
			return
		}
		writeJSON(w, http.StatusOK, toPaginaPublicaResponse(*pagina))
	}
}

// deployarPaginaPublicaHandler — PATCH /panel/pagina/deployar: publica la
// página por primera vez (spec §5.2 — "importante para que el buscador
// público de clínicas [...] no muestre páginas vacías o incompletas", ver
// el filtro `deployada_en IS NOT NULL` en buscarClinicasHandler,
// clinicas.go). Idempotente: no hay forma de "des-deployar" en el MVP, así
// que llamarlo de nuevo no pisa la fecha original ni es un error — el
// frontend hace desaparecer el botón apenas ve `deployadaEn` no nulo
// (spec §5.2: "solo visible la primera vez"), pero el backend no depende
// de eso para mantener la garantía.
func deployarPaginaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		pagina, err := getOrCrearPaginaPublica(gdb, profesionalID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener la página")
			return
		}
		if pagina.DeployadaEn == nil {
			ahora := clock.Now()
			pagina.DeployadaEn = &ahora
			if err := gdb.Save(pagina).Error; err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo publicar la página")
				return
			}
		}
		writeJSON(w, http.StatusOK, toPaginaPublicaResponse(*pagina))
	}
}
