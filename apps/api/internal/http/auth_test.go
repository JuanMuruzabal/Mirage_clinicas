package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/auth"
	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

func newTestRouter(t *testing.T) http.Handler {
	t.Helper()
	gdb := testdb.New(t)
	return NewRouter(gdb, "un-secret-de-test", []string{"http://localhost:3000"})
}

func doJSON(t *testing.T, router http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("no se pudo serializar el body: %v", err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestRegister_Exitoso(t *testing.T) {
	router := newTestRouter(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:        "María Games",
		Email:         "maria@example.com",
		Password:      "password123",
		NombreClinica: "Consultorio Dr. Games",
	})

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var resp authResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if resp.Token == "" {
		t.Error("esperaba un token no vacío")
	}
	if resp.Profesional.Slug != "consultorio-dr-games" {
		t.Errorf("Slug = %q, esperaba %q", resp.Profesional.Slug, "consultorio-dr-games")
	}
	if resp.Profesional.Email != "maria@example.com" {
		t.Errorf("Email = %q, esperaba %q", resp.Profesional.Email, "maria@example.com")
	}
}

func TestRegister_EmailDuplicado(t *testing.T) {
	router := newTestRouter(t)

	req := registerRequest{
		Nombre:        "María Games",
		Email:         "duplicado@example.com",
		Password:      "password123",
		NombreClinica: "Clínica A",
	}
	if rec := doJSON(t, router, http.MethodPost, "/auth/register", req); rec.Code != http.StatusCreated {
		t.Fatalf("primer registro falló: status=%d body=%s", rec.Code, rec.Body.String())
	}

	req.NombreClinica = "Clínica B"
	rec := doJSON(t, router, http.MethodPost, "/auth/register", req)
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, esperaba %d (email duplicado)", rec.Code, http.StatusConflict)
	}
}

func TestRegister_PasswordCorta(t *testing.T) {
	router := newTestRouter(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:        "María Games",
		Email:         "corta@example.com",
		Password:      "1234",
		NombreClinica: "Clínica",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestRegister_EmailInvalido(t *testing.T) {
	router := newTestRouter(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:        "María Games",
		Email:         "no-es-un-email",
		Password:      "password123",
		NombreClinica: "Clínica",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestRegister_SeedeaTiposDeConsultaPorDefecto(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret", []string{"http://localhost:3000"})

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:        "Julián Ortiz",
		Email:         "julian@example.com",
		Password:      "password123",
		NombreClinica: "Clínica Ortiz",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("registro falló: status=%d body=%s", rec.Code, rec.Body.String())
	}

	var resp authResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)

	var count int64
	if err := gdb.Table("tipos_consulta").Where("profesional_id = ?", resp.Profesional.ID).Count(&count).Error; err != nil {
		t.Fatalf("no se pudo consultar tipos_consulta: %v", err)
	}
	if count != 2 {
		t.Errorf("count = %d, esperaba 2 tipos de consulta seedeados (TR-001)", count)
	}
}

func TestLogin_Exitoso(t *testing.T) {
	router := newTestRouter(t)

	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:        "María Games",
		Email:         "login@example.com",
		Password:      "password123",
		NombreClinica: "Clínica",
	})

	rec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{
		Email:    "login@example.com",
		Password: "password123",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestLogin_PasswordIncorrecta(t *testing.T) {
	router := newTestRouter(t)

	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:        "María Games",
		Email:         "wrongpass@example.com",
		Password:      "password123",
		NombreClinica: "Clínica",
	})

	rec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{
		Email:    "wrongpass@example.com",
		Password: "password-incorrecta",
	})
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestLogin_UsuarioInexistente(t *testing.T) {
	router := newTestRouter(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/login", loginRequest{
		Email:    "no-existe@example.com",
		Password: "password123",
	})
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestMe_ConTokenValido(t *testing.T) {
	router := newTestRouter(t)

	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:        "María Games",
		Email:         "me@example.com",
		Password:      "password123",
		NombreClinica: "Clínica",
	})
	var reg authResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got profesionalResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.Email != "me@example.com" {
		t.Errorf("Email = %q, esperaba %q", got.Email, "me@example.com")
	}
}

func TestRegister_BodyInvalido(t *testing.T) {
	router := newTestRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader("esto no es json"))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestRegister_NombreOClinicaVacios(t *testing.T) {
	router := newTestRouter(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:        "  ",
		Email:         "vacio@example.com",
		Password:      "password123",
		NombreClinica: "Clínica",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("nombre vacío: status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}

	rec = doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:        "María Games",
		Email:         "vacio2@example.com",
		Password:      "password123",
		NombreClinica: "   ",
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("nombreClinica vacío: status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestLogin_BodyInvalido(t *testing.T) {
	router := newTestRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader("esto no es json"))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestMe_ProfesionalInexistente(t *testing.T) {
	router := newTestRouter(t)

	token, err := auth.GenerateToken("un-secret-de-test", uuid.New())
	if err != nil {
		t.Fatalf("no se pudo generar el token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestMe_SubjectNoEsUnUUID(t *testing.T) {
	router := newTestRouter(t)

	claims := auth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "no-es-un-uuid",
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte("un-secret-de-test"))
	if err != nil {
		t.Fatalf("no se pudo firmar el token de prueba: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

// listEspecialidadIDs lee ids directo de la base (no de GET /especialidades
// — ese endpoint filtra por Activa=true desde TR-011, y estos tests de
// asociación necesitan poder elegir más de una, visible o no; la
// visibilidad es una preocupación de UI, no de si el registro/edición
// puede asociarlas).
func listEspecialidadIDs(t *testing.T, gdb *gorm.DB, n int) []string {
	t.Helper()
	var especialidades []db.Especialidad
	if err := gdb.Order("nombre").Limit(n).Find(&especialidades).Error; err != nil {
		t.Fatalf("no se pudo leer especialidades de la base: %v", err)
	}
	if len(especialidades) < n {
		t.Fatalf("el catálogo tiene %d especialidades, se pidieron %d", len(especialidades), n)
	}
	ids := make([]string, n)
	for i, e := range especialidades {
		ids[i] = e.ID.String()
	}
	return ids
}

func TestRegister_AsociaEspecialidadesElegidas(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret-de-test", []string{"http://localhost:3000"})
	ids := listEspecialidadIDs(t, gdb, 2)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:          "María Games",
		Email:           "especialidades@example.com",
		Password:        "password123",
		NombreClinica:   "Clínica",
		EspecialidadIDs: ids,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var resp authResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if len(resp.Profesional.Especialidades) != 2 {
		t.Errorf("len(Especialidades) = %d, esperaba 2", len(resp.Profesional.Especialidades))
	}
}

func TestRegister_EspecialidadInexistenteFalla(t *testing.T) {
	router := newTestRouter(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:          "María Games",
		Email:           "especialidad-mala@example.com",
		Password:        "password123",
		NombreClinica:   "Clínica",
		EspecialidadIDs: []string{uuid.New().String()},
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestRegister_EspecialidadIDMalFormadoFalla(t *testing.T) {
	router := newTestRouter(t)

	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:          "María Games",
		Email:           "especialidad-mal-formada@example.com",
		Password:        "password123",
		NombreClinica:   "Clínica",
		EspecialidadIDs: []string{"no-es-un-uuid"},
	})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestUpdateMe_ActualizaNombreTelefonoYReemplazaEspecialidades(t *testing.T) {
	gdb := testdb.New(t)
	router := NewRouter(gdb, "un-secret-de-test", []string{"http://localhost:3000"})
	ids := listEspecialidadIDs(t, gdb, 3)

	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre:          "María Games",
		Email:           "update-me@example.com",
		Password:        "password123",
		NombreClinica:   "Clínica",
		EspecialidadIDs: ids[:1],
	})
	var reg authResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	telefono := "+5493511234567"
	body, _ := json.Marshal(updateMeRequest{
		Nombre:          "María Games Editado",
		Telefono:        &telefono,
		EspecialidadIDs: ids[1:3],
	})
	req := httptest.NewRequest(http.MethodPatch, "/me", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var got profesionalResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.Nombre != "María Games Editado" {
		t.Errorf("Nombre = %q, esperaba %q", got.Nombre, "María Games Editado")
	}
	if got.Telefono == nil || *got.Telefono != telefono {
		t.Errorf("Telefono = %v, esperaba %q", got.Telefono, telefono)
	}
	// Reemplazo, no acumulación: la especialidad original (ids[0]) ya no
	// debería estar.
	if len(got.Especialidades) != 2 {
		t.Fatalf("len(Especialidades) = %d, esperaba 2 (reemplazo, no acumulación)", len(got.Especialidades))
	}
	for _, e := range got.Especialidades {
		if e.ID == ids[0] {
			t.Errorf("la especialidad original %q debería haber sido reemplazada, no acumulada", ids[0])
		}
	}
}

func TestUpdateMe_SinToken(t *testing.T) {
	router := newTestRouter(t)

	body, _ := json.Marshal(updateMeRequest{Nombre: "Alguien"})
	req := httptest.NewRequest(http.MethodPatch, "/me", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestUpdateMe_NombreVacio(t *testing.T) {
	router := newTestRouter(t)

	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre: "María Games", Email: "update-me-vacio@example.com", Password: "password123", NombreClinica: "Clínica",
	})
	var reg authResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	body, _ := json.Marshal(updateMeRequest{Nombre: "   "})
	req := httptest.NewRequest(http.MethodPatch, "/me", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestSlugify_NormalizaTildesYEnie(t *testing.T) {
	got := slugify("Clínica Peña Ñoño áéíóú")
	want := "clinica-pena-nono-aeiou"
	if got != want {
		t.Errorf("slugify(...) = %q, esperaba %q", got, want)
	}
}

func TestUpdateMe_BodyInvalido(t *testing.T) {
	router := newTestRouter(t)

	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre: "María Games", Email: "update-body-invalido@example.com", Password: "password123", NombreClinica: "Clínica",
	})
	var reg authResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	req := httptest.NewRequest(http.MethodPatch, "/me", strings.NewReader("esto no es json"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestUpdateMe_EspecialidadInvalida(t *testing.T) {
	router := newTestRouter(t)

	regRec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre: "María Games", Email: "update-especialidad-mala@example.com", Password: "password123", NombreClinica: "Clínica",
	})
	var reg authResponse
	_ = json.Unmarshal(regRec.Body.Bytes(), &reg)

	body, _ := json.Marshal(updateMeRequest{Nombre: "María", EspecialidadIDs: []string{uuid.New().String()}})
	req := httptest.NewRequest(http.MethodPatch, "/me", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestUpdateMe_ProfesionalInexistente(t *testing.T) {
	router := newTestRouter(t)

	token, err := auth.GenerateToken("un-secret-de-test", uuid.New())
	if err != nil {
		t.Fatalf("no se pudo generar el token: %v", err)
	}

	body, _ := json.Marshal(updateMeRequest{Nombre: "Alguien"})
	req := httptest.NewRequest(http.MethodPatch, "/me", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusNotFound)
	}
}

func TestUpdateMe_SubjectNoEsUnUUID(t *testing.T) {
	router := newTestRouter(t)

	claims := auth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "no-es-un-uuid",
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte("un-secret-de-test"))
	if err != nil {
		t.Fatalf("no se pudo firmar el token de prueba: %v", err)
	}

	body, _ := json.Marshal(updateMeRequest{Nombre: "Alguien"})
	req := httptest.NewRequest(http.MethodPatch, "/me", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+signed)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestUniqueSlug_NombresRepetidosGeneranSufijo(t *testing.T) {
	router := newTestRouter(t)

	doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre: "Uno", Email: "slug1@example.com", Password: "password123", NombreClinica: "Sonrisas",
	})
	rec := doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
		Nombre: "Dos", Email: "slug2@example.com", Password: "password123", NombreClinica: "Sonrisas",
	})

	var resp authResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Profesional.Slug != "sonrisas-2" {
		t.Errorf("Slug = %q, esperaba %q", resp.Profesional.Slug, "sonrisas-2")
	}
}
