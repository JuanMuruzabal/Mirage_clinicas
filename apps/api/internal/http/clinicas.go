package http

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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
func registerClinicaRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/clinicas", buscarClinicasHandler(gdb))
	r.Get("/clinicas/{slug}", getClinicaPublicaHandler(gdb))
}

// clinicaPublicaResponse — GET /clinicas/{slug}: a diferencia de
// clinicaResultado (listado del buscador), SÍ incluye Telefono — es la
// página pública de la clínica, donde el teléfono del profesional es el
// número al que el formulario de pedir turno arma el link de WhatsApp
// (TR-003). Es un dato que el propio profesional publica a propósito para
// que lo contacten, no un dato sensible como el email.
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

// ownerProfile busca el ProfessionalProfile del dueño (ClinicMember con
// role="owner") de una clínica — en el alcance actual (sin invitaciones,
// spec §9) es siempre exactamente uno, el que la creó en el Paso 3 del
// wizard.
func ownerProfile(gdb *gorm.DB, clinicID uuid.UUID) (db.ProfessionalProfile, bool) {
	var member db.ClinicMember
	if err := gdb.Where("clinic_id = ? AND role = ?", clinicID, db.RoleOwner).First(&member).Error; err != nil {
		return db.ProfessionalProfile{}, false
	}
	var profile db.ProfessionalProfile
	if err := gdb.Preload("Especialidades").First(&profile, "user_id = ?", member.UserID).Error; err != nil {
		return db.ProfessionalProfile{}, false
	}
	return profile, true
}

func nombreCompletoProfesional(p db.ProfessionalProfile) string {
	return strings.TrimSpace(p.Nombre + " " + p.Apellido)
}

func especialidadesNombres(p db.ProfessionalProfile) []string {
	out := make([]string, len(p.Especialidades))
	for i, e := range p.Especialidades {
		out[i] = e.Nombre
	}
	return out
}

// getClinicaPublicaHandler resuelve la página pública de una clínica por
// slug (spec §5, ruta `/clinica-x`). `PaginaPublica` puede no existir
// todavía (se crea recién en GET/PATCH /panel/pagina, ver
// pagina_publica.go) — sin fila, el default es "no oculta".
func getClinicaPublicaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")

		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		var pagina db.PaginaPublica
		oculta := false
		if err := gdb.Where("profesional_id = ?", clinic.ID).First(&pagina).Error; err == nil {
			oculta = pagina.Oculta
		}

		profile, _ := ownerProfile(gdb, clinic.ID)
		var telefono *string
		if profile.Telefono != "" {
			telefono = &profile.Telefono
		}

		writeJSON(w, http.StatusOK, clinicaPublicaResponse{
			Slug:              clinic.Slug,
			NombreClinica:     clinic.Nombre,
			ProfesionalNombre: nombreCompletoProfesional(profile),
			Telefono:          telefono,
			Especialidades:    especialidadesNombres(profile),
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
		query := gdb.Model(&db.Clinic{}).
			Joins("JOIN paginas_publicas pp ON pp.profesional_id = clinics.id AND pp.deployada_en IS NOT NULL").
			Order("clinics.nombre")

		if q != "" {
			like := "%" + q + "%"
			query = query.Where(
				`clinics.nombre ILIKE ? OR EXISTS (
					SELECT 1 FROM clinic_members cm
					JOIN professional_profiles prof ON prof.user_id = cm.user_id
					WHERE cm.clinic_id = clinics.id AND cm.role = ?
					  AND (prof.nombre ILIKE ? OR prof.apellido ILIKE ? OR (prof.nombre || ' ' || prof.apellido) ILIKE ?)
				)`,
				like, db.RoleOwner, like, like, like,
			)
		}
		if especialidad != "" {
			query = query.Where(
				`EXISTS (
					SELECT 1 FROM clinic_members cm
					JOIN professional_especialidades pe ON pe.user_id = cm.user_id
					JOIN especialidades e ON e.id = pe.especialidad_id
					WHERE cm.clinic_id = clinics.id AND cm.role = ? AND e.nombre = ?
				)`,
				db.RoleOwner, especialidad,
			)
		}

		var clinics []db.Clinic
		if err := query.Find(&clinics).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo buscar clínicas")
			return
		}

		out := make([]clinicaResultado, len(clinics))
		for i, c := range clinics {
			profile, _ := ownerProfile(gdb, c.ID)
			out[i] = clinicaResultado{
				Slug:              c.Slug,
				NombreClinica:     c.Nombre,
				ProfesionalNombre: nombreCompletoProfesional(profile),
				Especialidades:    especialidadesNombres(profile),
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}
