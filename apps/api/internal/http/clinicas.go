package http

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// clinicaResultado es lo que ve un visitante del buscador público (spec
// §6) — nunca datos sensibles del profesional (email, teléfono, etc.).
type clinicaResultado struct {
	Slug              string   `json:"slug"`
	NombreClinica     string   `json:"nombreClinica"`
	ProfesionalNombre string   `json:"profesionalNombre"`
	Especialidades    []string `json:"especialidades"`
}

// registerClinicaRoutes monta GET /clinicas — el buscador público de
// clínicas por nombre de clínica, nombre de profesional o especialidad
// (spec §6, FR-10), sin autenticación: es para pacientes, no para
// profesionales logueados.
//
// Adelantado desde Sprint 4 (T4.5) a pedido explícito del cliente en
// Sprint 1 — con una simplificación documentada (TR-012 en
// docs/tradeoffs.md), cerrada en Sprint 4 (T4.2 ya existe:
// PATCH /panel/pagina/deployar en pagina_publica.go): el buscador ahora sí
// filtra por `deployada_en IS NOT NULL` (spec §5.2, "para que el buscador
// [...] no muestre páginas vacías o incompletas").
func registerClinicaRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/clinicas", buscarClinicasHandler(gdb))
	r.Get("/clinicas/{slug}", getClinicaPublicaHandler(gdb))
}

// clinicaPublicaResponse — GET /clinicas/{slug}: a diferencia de
// clinicaResultado (listado del buscador), SÍ incluye Telefono — es la
// página pública de la clínica (T3.1/T3.2, plantilla completa en Sprint
// 4/T4.3), donde el teléfono del profesional es el número al que el
// formulario de pedir turno arma el link de WhatsApp (TR-003). Es un dato
// que el propio profesional publica a propósito para que lo contacten, no
// un dato sensible como el email o el hash de contraseña.
type clinicaPublicaResponse struct {
	Slug              string   `json:"slug"`
	NombreClinica     string   `json:"nombreClinica"`
	ProfesionalNombre string   `json:"profesionalNombre"`
	Telefono          *string  `json:"telefono,omitempty"`
	Especialidades    []string `json:"especialidades"`
	// Oculta (T4.4, spec §5.2): modo "en mantenimiento" — el visitante de
	// `/{slug}` ve una pantalla de mantenimiento en vez del contenido. Sin
	// relación con `deployada_en`: "Ver página" desde el editor tiene que
	// poder previsualizar la página ANTES del primer deploy, así que esta
	// ruta nunca se bloquea por falta de deploy, solo por `oculta`.
	Oculta bool `json:"oculta"`
}

// getClinicaPublicaHandler resuelve la página pública de una clínica por
// slug (spec §5, ruta `/clinica-x`) — stub de contenido hasta T4.3
// (Sprint 4): por ahora solo lo que necesita el formulario de pedir turno.
// `PaginaPublica` puede no existir todavía (se crea recién en
// GET/PATCH /panel/pagina, ver pagina_publica.go) — sin fila, el default
// es "no oculta", igual que el default de la columna en la base.
func getClinicaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")

		var profesional db.Profesional
		if err := gdb.Preload("Especialidades").Where("slug = ?", slug).First(&profesional).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		var pagina db.PaginaPublica
		oculta := false
		if err := gdb.Where("profesional_id = ?", profesional.ID).First(&pagina).Error; err == nil {
			oculta = pagina.Oculta
		}

		especialidades := make([]string, len(profesional.Especialidades))
		for i, e := range profesional.Especialidades {
			especialidades[i] = e.Nombre
		}
		writeJSON(w, http.StatusOK, clinicaPublicaResponse{
			Slug:              profesional.Slug,
			NombreClinica:     profesional.NombreClinica,
			ProfesionalNombre: profesional.Nombre,
			Telefono:          profesional.Telefono,
			Especialidades:    especialidades,
			Oculta:            oculta,
		})
	}
}

func buscarClinicasHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		especialidad := strings.TrimSpace(r.URL.Query().Get("especialidad"))

		// Solo clínicas deployadas (spec §5.2, T4.5 — ver TR-012 en
		// docs/tradeoffs.md): join 1:1 con paginas_publicas, sin fila o con
		// `deployada_en` nulo, no aparece en el buscador.
		query := gdb.Model(&db.Profesional{}).Preload("Especialidades").
			Joins("JOIN paginas_publicas pp ON pp.profesional_id = profesionales.id AND pp.deployada_en IS NOT NULL").
			Order("nombre_clinica")

		if q != "" {
			like := "%" + q + "%"
			query = query.Where("nombre_clinica ILIKE ? OR nombre ILIKE ?", like, like)
		}
		if especialidad != "" {
			query = query.
				Joins("JOIN profesional_especialidades pe ON pe.profesional_id = profesionales.id").
				Joins("JOIN especialidades e ON e.id = pe.especialidad_id AND e.nombre = ?", especialidad)
		}

		var profesionales []db.Profesional
		if err := query.Find(&profesionales).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo buscar clínicas")
			return
		}

		out := make([]clinicaResultado, len(profesionales))
		for i, p := range profesionales {
			especialidades := make([]string, len(p.Especialidades))
			for j, e := range p.Especialidades {
				especialidades[j] = e.Nombre
			}
			out[i] = clinicaResultado{
				Slug:              p.Slug,
				NombreClinica:     p.NombreClinica,
				ProfesionalNombre: p.Nombre,
				Especialidades:    especialidades,
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}
