package http

import (
	"errors"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"unicode"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"dental-mirage/api/internal/auth"
	"dental-mirage/api/internal/db"
)

const minPasswordLen = 8

// registerAuthRoutes monta /auth/register y /auth/login (spec §3, §9.3;
// autenticación email+password propia — TR-005 en docs/tradeoffs.md, sin
// login social en el MVP).
func registerAuthRoutes(r chi.Router, gdb *gorm.DB, jwtSecret string) {
	h := &authHandler{db: gdb, jwtSecret: jwtSecret}
	r.Post("/register", h.register)
	r.Post("/login", h.login)
}

type authHandler struct {
	db        *gorm.DB
	jwtSecret string
}

type registerRequest struct {
	Nombre        string  `json:"nombre"`
	Email         string  `json:"email"`
	Password      string  `json:"password"`
	Telefono      *string `json:"telefono,omitempty"`
	NombreClinica string  `json:"nombreClinica"`
	// EspecialidadIDs (spec §3, paso 4): tags elegidos del catálogo cerrado
	// (TR-004) durante el flujo de alta — todo el wizard se envía junto acá,
	// no en pasos separados contra el backend (ver docs/tradeoffs.md).
	EspecialidadIDs []string `json:"especialidadIds,omitempty"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// updateMeRequest — T1.5 ("Tu perfil"): solo datos personales y
// especialidades son editables en el MVP, no email ni nombre de clínica.
type updateMeRequest struct {
	Nombre          string   `json:"nombre"`
	Telefono        *string  `json:"telefono,omitempty"`
	EspecialidadIDs []string `json:"especialidadIds,omitempty"`
}

// profesionalResponse nunca incluye password_hash — no es asunto del
// frontend (spec §9.3, el JWT viaja en cookie httpOnly, no en el body de
// una respuesta que un Client Component pudiera loguear por error).
type profesionalResponse struct {
	ID             string                 `json:"id"`
	Nombre         string                 `json:"nombre"`
	Email          string                 `json:"email"`
	Telefono       *string                `json:"telefono,omitempty"`
	NombreClinica  string                 `json:"nombreClinica"`
	Slug           string                 `json:"slug"`
	Especialidades []especialidadResponse `json:"especialidades"`
}

type authResponse struct {
	Profesional profesionalResponse `json:"profesional"`
	Token       string              `json:"token"`
}

func toProfesionalResponse(p db.Profesional) profesionalResponse {
	especialidades := make([]especialidadResponse, len(p.Especialidades))
	for i, e := range p.Especialidades {
		especialidades[i] = toEspecialidadResponse(e)
	}
	return profesionalResponse{
		ID:             p.ID.String(),
		Nombre:         p.Nombre,
		Email:          p.Email,
		Telefono:       p.Telefono,
		NombreClinica:  p.NombreClinica,
		Slug:           p.Slug,
		Especialidades: especialidades,
	}
}

// loadEspecialidades valida y resuelve los ids elegidos del catálogo
// cerrado (TR-004) contra filas reales — un id con formato UUID inválido,
// o que no corresponde a ninguna especialidad existente, es un 400 (error
// de negocio del caller), nunca un 500 ni una fila fantasma insertada en el
// catálogo por accidente.
func loadEspecialidades(gdb *gorm.DB, raw []string) ([]db.Especialidad, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	ids := make([]uuid.UUID, len(raw))
	for i, s := range raw {
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, err
		}
		ids[i] = id
	}

	var especialidades []db.Especialidad
	if err := gdb.Where("id IN ?", ids).Find(&especialidades).Error; err != nil {
		return nil, err
	}
	if len(especialidades) != len(ids) {
		return nil, errors.New("una o más especialidades no existen")
	}
	return especialidades, nil
}

func (h *authHandler) register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
		return
	}

	req.Nombre = strings.TrimSpace(req.Nombre)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.NombreClinica = strings.TrimSpace(req.NombreClinica)

	if req.Nombre == "" || req.NombreClinica == "" {
		writeError(w, http.StatusBadRequest, "nombre y nombre de la clínica son obligatorios")
		return
	}
	if _, err := mail.ParseAddress(req.Email); err != nil {
		writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
		return
	}
	if len(req.Password) < minPasswordLen {
		writeError(w, http.StatusBadRequest, "la contraseña debe tener al menos 8 caracteres")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo procesar la contraseña")
		return
	}

	especialidades, err := loadEspecialidades(h.db, req.EspecialidadIDs)
	if err != nil {
		writeError(w, http.StatusBadRequest, "una de las especialidades elegidas no es válida")
		return
	}

	slug, err := uniqueSlug(h.db, req.NombreClinica)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo generar el identificador de la clínica")
		return
	}

	profesional := db.Profesional{
		Nombre:        req.Nombre,
		Email:         req.Email,
		PasswordHash:  string(hash),
		Telefono:      req.Telefono,
		NombreClinica: req.NombreClinica,
		Slug:          slug,
	}

	err = h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&profesional).Error; err != nil {
			return err
		}
		// TR-001: cada profesional nuevo arranca con su propio par de tipos
		// de consulta (Consulta general / Urgencia) — catálogo por
		// profesional, no global.
		if err := db.SeedTiposConsultaDefault(tx, profesional.ID); err != nil {
			return err
		}
		if len(especialidades) == 0 {
			return nil
		}
		// especialidades ya son filas reales (loadEspecialidades las validó
		// contra la base) — Append acá solo inserta las filas de la tabla
		// puente, no reintenta crear/actualizar el catálogo.
		return tx.Model(&profesional).Association("Especialidades").Append(&especialidades)
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "ya existe una cuenta con ese email")
			return
		}
		writeError(w, http.StatusInternalServerError, "no se pudo crear la cuenta")
		return
	}

	// Re-fetch con Preload: tx.Model(...).Association(...).Append(...) no
	// deja profesional.Especialidades reflejando lo asociado en memoria.
	if err := h.db.Preload("Especialidades").First(&profesional, "id = ?", profesional.ID).Error; err != nil {
		writeError(w, http.StatusInternalServerError, "cuenta creada pero no se pudo leerla de vuelta")
		return
	}

	token, err := auth.GenerateToken(h.jwtSecret, profesional.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo generar la sesión")
		return
	}

	writeJSON(w, http.StatusCreated, authResponse{
		Profesional: toProfesionalResponse(profesional),
		Token:       token,
	})
}

func (h *authHandler) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))

	var profesional db.Profesional
	err := h.db.Preload("Especialidades").Where("email = ?", email).First(&profesional).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeError(w, http.StatusUnauthorized, "email o contraseña incorrectos")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo iniciar sesión")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(profesional.PasswordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "email o contraseña incorrectos")
		return
	}

	token, err := auth.GenerateToken(h.jwtSecret, profesional.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no se pudo generar la sesión")
		return
	}

	writeJSON(w, http.StatusOK, authResponse{
		Profesional: toProfesionalResponse(profesional),
		Token:       token,
	})
}

func meHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := claimsFromContext(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
			return
		}
		id, err := uuid.Parse(claims.Subject)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "token inválido")
			return
		}

		var profesional db.Profesional
		if err := gdb.Preload("Especialidades").First(&profesional, "id = ?", id).Error; err != nil {
			writeError(w, http.StatusNotFound, "profesional no encontrado")
			return
		}

		writeJSON(w, http.StatusOK, toProfesionalResponse(profesional))
	}
}

// updateMeHandler — T1.5 ("Tu perfil"): edita datos personales y
// especialidades del profesional autenticado. Email y nombre de clínica no
// son editables en el MVP (no lo pide la spec §4.2's contraparte, T1.5).
func updateMeHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := claimsFromContext(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
			return
		}
		id, err := uuid.Parse(claims.Subject)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "token inválido")
			return
		}

		var req updateMeRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.Nombre = strings.TrimSpace(req.Nombre)
		if req.Nombre == "" {
			writeError(w, http.StatusBadRequest, "el nombre es obligatorio")
			return
		}

		especialidades, err := loadEspecialidades(gdb, req.EspecialidadIDs)
		if err != nil {
			writeError(w, http.StatusBadRequest, "una de las especialidades elegidas no es válida")
			return
		}

		var profesional db.Profesional
		if err := gdb.First(&profesional, "id = ?", id).Error; err != nil {
			writeError(w, http.StatusNotFound, "profesional no encontrado")
			return
		}

		err = gdb.Transaction(func(tx *gorm.DB) error {
			profesional.Nombre = req.Nombre
			profesional.Telefono = req.Telefono
			if err := tx.Model(&profesional).Select("Nombre", "Telefono").Updates(profesional).Error; err != nil {
				return err
			}
			// Replace (no Append): la lista enviada reemplaza a la anterior
			// entera — es como espera funcionar un editor de tags en el
			// frontend (T1.5), no un alta incremental.
			return tx.Model(&profesional).Association("Especialidades").Replace(&especialidades)
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar el perfil")
			return
		}

		if err := gdb.Preload("Especialidades").First(&profesional, "id = ?", id).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "perfil actualizado pero no se pudo leerlo de vuelta")
			return
		}

		writeJSON(w, http.StatusOK, toProfesionalResponse(profesional))
	}
}

var slugInvalidChars = regexp.MustCompile(`[^a-z0-9]+`)

// uniqueSlug deriva el slug de la ruta pública (/clinica-x, spec §5) a
// partir del nombre de la clínica, agregando un sufijo numérico si ya
// existe. No usa el nombre del profesional ni el email — el slug es de la
// CLÍNICA, es lo que un paciente ve en la URL.
func uniqueSlug(gdb *gorm.DB, nombreClinica string) (string, error) {
	base := slugify(nombreClinica)
	if base == "" {
		base = "clinica"
	}

	candidate := base
	for i := 2; ; i++ {
		var count int64
		if err := gdb.Model(&db.Profesional{}).Where("slug = ?", candidate).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
		candidate = base + "-" + itoa(i)
	}
}

func slugify(value string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(value) {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(stripDiacritic(r))
		} else {
			b.WriteRune(' ')
		}
	}
	return strings.Trim(slugInvalidChars.ReplaceAllString(strings.Join(strings.Fields(b.String()), "-"), "-"), "-")
}

// stripDiacritic normaliza vocales acentuadas comunes en español (nombres
// de clínica reales van a tener tildes/ñ) a su equivalente ASCII para que
// el slug quede limpio en la URL.
func stripDiacritic(r rune) rune {
	switch r {
	case 'á':
		return 'a'
	case 'é':
		return 'e'
	case 'í':
		return 'i'
	case 'ó':
		return 'o'
	case 'ú':
		return 'u'
	case 'ñ':
		return 'n'
	default:
		return r
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

// isUniqueViolation detecta el código de error de Postgres para una
// violación de constraint único (23505) sin importar pgx/postgres puro,
// buscando el código en el texto del error — suficiente para distinguir
// "email duplicado" de cualquier otro error de escritura sin acoplarse al
// tipo concreto del driver.
func isUniqueViolation(err error) bool {
	return strings.Contains(err.Error(), "23505") || strings.Contains(err.Error(), "duplicate key")
}
