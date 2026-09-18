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

	// Contenido de la Fase 4.2 — el renderizado dinámico real es la Fase
	// 4.5, acá el backend ya expone el dato completo.
	Bio            *string           `json:"bio,omitempty"`
	Tema           string            `json:"tema"`
	TemaVariante   string            `json:"temaVariante"`
	TemaTipografia string            `json:"temaTipografia"`
	FotoPortadaURL *string           `json:"fotoPortadaUrl,omitempty"`
	RedesSociales  map[string]string `json:"redesSociales"`
	MostrarMapa    bool              `json:"mostrarMapa"`
	Direccion      *string           `json:"direccion,omitempty"`
	Modulos        []moduloResponse  `json:"modulos"`
	Estadisticas   map[string]int    `json:"estadisticas"`
}

// ownerProfile busca el ProfessionalProfile del dueño (ClinicMember con
// role="owner") de una clínica — en el alcance actual (sin invitaciones,
// spec §9) es siempre exactamente uno, el que la creó en el Paso 3 del
// wizard.
func ownerProfile(gdb *gorm.DB, clinicID uuid.UUID) (db.ProfessionalProfile, bool) {
	var member db.ClinicMember
	if err := gdb.Scopes(db.ConRol(db.RoleOwner)).Where("clinic_id = ?", clinicID).First(&member).Error; err != nil {
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

// profesionalesActivosDeLaClinica — Fase 4.2, fix del bug owner-only:
// desde la Fase 3.2 una clínica puede tener N profesionales, y hasta acá
// la página pública/el buscador solo miraban al owner (ownerProfile) —
// una clínica con 3 odontólogos mostraba especialidades como si hubiera
// uno solo. Mismo filtro que listarEquipoHandler (equipo.go, activos de
// la clínica) + el Preload que ya usa ownerProfile.
func profesionalesActivosDeLaClinica(gdb *gorm.DB, clinicID uuid.UUID) []db.ProfessionalProfile {
	var miembros []db.ClinicMember
	if err := gdb.Scopes(db.ConRol(db.RoleProfesional)).
		Where("clinic_id = ? AND status = ?", clinicID, db.ClinicMemberStatusActive).
		Find(&miembros).Error; err != nil {
		return nil
	}
	perfiles := make([]db.ProfessionalProfile, 0, len(miembros))
	for _, m := range miembros {
		var perfil db.ProfessionalProfile
		if err := gdb.Preload("Especialidades").First(&perfil, "user_id = ?", m.UserID).Error; err == nil {
			perfiles = append(perfiles, perfil)
		}
	}
	return perfiles
}

// especialidadesUnicasDe — unión deduplicada de las especialidades de
// varios profesionales, por NOMBRE (mismo criterio que el resto del
// sistema para comparar especialidades/tipos de consulta entre
// profesionales, ver TR-145 en docs/Arquitectura y base/tradeoffs.md).
func especialidadesUnicasDe(perfiles []db.ProfessionalProfile) []string {
	vistos := map[string]bool{}
	out := []string{}
	for _, p := range perfiles {
		for _, e := range p.Especialidades {
			if !vistos[e.Nombre] {
				vistos[e.Nombre] = true
				out = append(out, e.Nombre)
			}
		}
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
		if err := gdb.Preload("Modulos", func(tx *gorm.DB) *gorm.DB {
			return tx.Where("visible = ?", true).Order("orden")
		}).Where("clinic_id = ?", clinic.ID).First(&pagina).Error; err != nil {
			pagina = db.PaginaPublica{}
		}

		profile, _ := ownerProfile(gdb, clinic.ID)
		var telefono *string
		if profile.Telefono != "" {
			telefono = &profile.Telefono
		}

		// Especialidades: unión de TODOS los profesionales activos, no
		// solo el owner (fix del bug de arriba). ProfesionalNombre se
		// deja como el del owner a propósito — mostrar a todo el equipo
		// en la vidriera pública es un cambio de diseño de la plantilla
		// (Fase 4.5), no el alcance de este fix.
		especialidades := especialidadesUnicasDe(profesionalesActivosDeLaClinica(gdb, clinic.ID))

		modulos := make([]moduloResponse, len(pagina.Modulos))
		for i, m := range pagina.Modulos {
			modulos[i] = toModuloResponse(m)
		}
		redes := pagina.RedesSociales
		if redes == nil {
			redes = map[string]string{}
		}

		writeJSON(w, http.StatusOK, clinicaPublicaResponse{
			Slug:              clinic.Slug,
			NombreClinica:     clinic.Nombre,
			ProfesionalNombre: nombreCompletoProfesional(profile),
			Telefono:          telefono,
			Especialidades:    especialidades,
			Oculta:            pagina.Oculta,
			Bio:               pagina.Bio,
			Tema:              pagina.Tema,
			TemaVariante:      pagina.TemaVariante,
			TemaTipografia:    pagina.TemaTipografia,
			FotoPortadaURL:    pagina.FotoPortadaURL,
			RedesSociales:     redes,
			MostrarMapa:       pagina.MostrarMapa,
			Direccion:         direccionEfectiva(pagina, clinic),
			Modulos:           modulos,
			Estadisticas:      estadisticasDeLaClinica(gdb, clinic.ID),
		})
	}
}

// direccionEfectiva — el override de la página pública gana sobre la
// dirección de la Clinic (spec: "dirección con mapa" del módulo de
// contacto), si está seteado.
func direccionEfectiva(pagina db.PaginaPublica, clinic db.Clinic) *string {
	if pagina.DireccionOverride != nil && strings.TrimSpace(*pagina.DireccionOverride) != "" {
		return pagina.DireccionOverride
	}
	return clinic.Direccion
}

func buscarClinicasHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		especialidad := strings.TrimSpace(r.URL.Query().Get("especialidad"))

		// Solo clínicas deployadas (spec §5.2, T4.5 — ver TR-012 en
		// docs/Arquitectura y base/tradeoffs.md): join 1:1 con paginas_publicas, sin fila o con
		// `deployada_en` nulo, no aparece en el buscador.
		query := gdb.Model(&db.Clinic{}).
			Joins("JOIN paginas_publicas pp ON pp.clinic_id = clinics.id AND pp.deployada_en IS NOT NULL").
			Order("clinics.nombre")

		if q != "" {
			like := "%" + q + "%"
			// r.rol = RoleProfesional, no RoleOwner (fix Fase 4.2): buscar
			// "Dr. García" tiene que encontrar la clínica aunque García no
			// sea el dueño — antes de este fix, un profesional invitado
			// era invisible para el buscador público.
			query = query.Where(
				`clinics.nombre ILIKE ? OR EXISTS (
					SELECT 1 FROM clinic_members cm
					JOIN professional_profiles prof ON prof.user_id = cm.user_id
					JOIN clinic_member_roles r ON r.clinic_member_id = cm.id
					WHERE cm.clinic_id = clinics.id AND r.rol = ? AND cm.status = ?
					  AND (prof.nombre ILIKE ? OR prof.apellido ILIKE ? OR (prof.nombre || ' ' || prof.apellido) ILIKE ?)
				)`,
				like, db.RoleProfesional, db.ClinicMemberStatusActive, like, like, like,
			)
		}
		if especialidad != "" {
			query = query.Where(
				`EXISTS (
					SELECT 1 FROM clinic_members cm
					JOIN professional_especialidades pe ON pe.user_id = cm.user_id
					JOIN especialidades e ON e.id = pe.especialidad_id
					JOIN clinic_member_roles r ON r.clinic_member_id = cm.id
					WHERE cm.clinic_id = clinics.id AND r.rol = ? AND cm.status = ? AND e.nombre = ?
				)`,
				db.RoleProfesional, db.ClinicMemberStatusActive, especialidad,
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
				// Unión de todos los profesionales activos, no solo el
				// owner (mismo fix que getClinicaPublicaHandler).
				Especialidades: especialidadesUnicasDe(profesionalesActivosDeLaClinica(gdb, c.ID)),
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}
