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

	// EnPreparacion (PE-8, plan Prisma Engine): la clínica nunca publicó su
	// página — no hay ninguna PaginaPublicaVersion todavía. El resto de los
	// campos de contenido vienen en su cero-valor cuando esto es true; el
	// frontend muestra "Página en preparación" en vez de la plantilla.
	EnPreparacion bool `json:"enPreparacion"`

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
	// NombreSobrePortada/NombreColor: ver paginaPublicaResponse.
	NombreSobrePortada bool                         `json:"nombreSobrePortada"`
	NombreColor        string                       `json:"nombreColor"`
	TemaTokens         map[string]any               `json:"temaTokens"`
	Modulos            []moduloResponse             `json:"modulos"`
	Estadisticas       map[string]int               `json:"estadisticas"`
	HorariosClinica    horariosClinicaResponse      `json:"horariosClinica"`
	Servicios          []servicioDisponibleResponse `json:"servicios"`
	// Personalizada — la página tiene módulos guardados, aunque hoy estén
	// todos ocultos. Sin esto el frontend no puede distinguir "nunca la
	// editaron" (Modulos vacío → se arma la estructura por defecto) de
	// "los ocultaron todos a propósito" (Modulos vacío → mostrar solo
	// portada y turno), porque este endpoint filtra los no visibles.
	Personalizada bool `json:"personalizada"`
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
// getClinicaPublicaHandler (PE-8): sirve la ÚLTIMA VERSIÓN PUBLICADA, nunca
// el borrador en vivo — un "Guardar" a mitad de una edición no puede
// cambiar lo que ve un visitante. Sin ninguna versión todavía (nunca se
// publicó), la respuesta es "en preparación" (decidido por Kevin, 21/09):
// no hay contenido de qué mostrar, así que no se arma ninguno.
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
		if err := gdb.Where("clinic_id = ?", clinic.ID).First(&pagina).Error; err == nil {
			oculta = pagina.Oculta
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

		resp := clinicaPublicaResponse{
			Slug:              clinic.Slug,
			NombreClinica:     clinic.Nombre,
			ProfesionalNombre: nombreCompletoProfesional(profile),
			Telefono:          telefono,
			Especialidades:    especialidades,
			Oculta:            oculta,
			RedesSociales:     map[string]string{},
			TemaTokens:        map[string]any{},
			Estadisticas:      estadisticasDeLaClinica(gdb, clinic.ID),
		}
		horarios, err := horariosClinicaPublicos(gdb, clinic.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el horario de la clínica")
			return
		}
		resp.HorariosClinica = horarios
		servicios, err := serviciosDisponiblesDeLaClinica(gdb, clinic.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron obtener los servicios de la clínica")
			return
		}
		resp.Servicios = servicios

		var version *db.PaginaPublicaVersion
		if pagina.ID != uuid.Nil {
			version, _ = ultimaVersionPublicada(gdb, pagina.ID)
		}
		if version == nil {
			resp.EnPreparacion = true
			resp.Direccion = clinic.Direccion
			writeJSON(w, http.StatusOK, resp)
			return
		}

		c := version.Contenido
		modulosVisibles := make([]moduloResponse, 0, len(c.Modulos))
		for _, m := range c.Modulos {
			if !m.Visible {
				continue
			}
			config := configPublicaDeModulo(m.Tipo, m.Config)
			var datosVista map[string]any
			if m.Tipo == "equipo" {
				equipo, err := equipoPublicoDeModulo(gdb, clinic.ID, m.Config)
				if err != nil {
					writeError(w, http.StatusInternalServerError, "no se pudo obtener el equipo público")
					return
				}
				datosVista = map[string]any{"equipo": equipo}
			}
			modulosVisibles = append(modulosVisibles, moduloResponse{
				Tipo: m.Tipo, Orden: m.Orden, Visible: m.Visible, Config: config, DatosVista: datosVista,
			})
		}
		redes := c.RedesSociales
		if redes == nil {
			redes = map[string]string{}
		}
		resp.Bio = c.Bio
		resp.Tema = c.Tema
		resp.TemaVariante = c.TemaVariante
		resp.TemaTipografia = c.TemaTipografia
		resp.FotoPortadaURL = c.FotoPortadaURL
		resp.RedesSociales = redes
		resp.MostrarMapa = c.MostrarMapa
		resp.NombreSobrePortada = c.NombreSobrePortada
		resp.NombreColor = c.NombreColor
		resp.TemaTokens = tokensOVacio(c.TemaTokens)
		resp.Direccion = direccionEfectiva(c.DireccionOverride, clinic)
		resp.Modulos = modulosVisibles
		resp.Personalizada = len(c.Modulos) > 0
		writeJSON(w, http.StatusOK, resp)
	}
}

// direccionEfectiva — el override de la página pública gana sobre la
// dirección de la Clinic (spec: "dirección con mapa" del módulo de
// contacto), si está seteado.
func direccionEfectiva(direccionOverride *string, clinic db.Clinic) *string {
	if direccionOverride != nil && strings.TrimSpace(*direccionOverride) != "" {
		return direccionOverride
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
