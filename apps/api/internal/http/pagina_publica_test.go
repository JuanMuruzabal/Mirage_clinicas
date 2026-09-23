package http

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/imagenes"
)

func TestGetPaginaPublica_SeCreaSolaLaPrimeraVezConValoresPorDefecto(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ana", Email: "pagina1@example.com", Password: "password123456", NombreClinica: "Clínica Ana",
	})

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/pagina", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got paginaPublicaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.Oculta {
		t.Error("Oculta = true, esperaba false por default")
	}
	if got.DeployadaEn != nil {
		t.Errorf("DeployadaEn = %v, esperaba nil (todavía no deployó)", *got.DeployadaEn)
	}
}

func TestGetPaginaPublica_RequiereAutenticacion(t *testing.T) {
	router, _ := newTestRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/panel/pagina", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestOcultarPaginaPublica_CambiaElValorYLoDevuelve(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Bruno", Email: "pagina2@example.com", Password: "password123456", NombreClinica: "Clínica Bruno",
	})

	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/ocultar", reg.Token, ocultarPaginaPublicaRequest{Oculta: true})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if !got.Oculta {
		t.Error("Oculta = false, esperaba true")
	}

	// Se puede volver a mostrar (des-ocultar) — no es un camino de una sola
	// dirección como deployar.
	rec2 := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/ocultar", reg.Token, ocultarPaginaPublicaRequest{Oculta: false})
	var got2 paginaPublicaResponse
	_ = json.Unmarshal(rec2.Body.Bytes(), &got2)
	if got2.Oculta {
		t.Error("después de des-ocultar, Oculta = true, esperaba false")
	}
}

func TestOcultarPaginaPublica_BodyInvalido(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Elena", Email: "pagina5@example.com", Password: "password123456", NombreClinica: "Clínica Elena",
	})

	req := httptest.NewRequest(http.MethodPatch, "/panel/pagina/ocultar", strings.NewReader("esto no es json"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusBadRequest)
	}
}

func TestPublicarPaginaPublica_SeteaDeployadaEnLaPrimeraVezYCreaLaVersion1(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Carla", Email: "pagina3@example.com", Password: "password123456", NombreClinica: "Clínica Carla",
	})

	rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.DeployadaEn == nil {
		t.Fatal("DeployadaEn = nil, esperaba una fecha")
	}
	if got.UltimaVersionPublicada == nil || got.UltimaVersionPublicada.Numero != 1 {
		t.Fatalf("UltimaVersionPublicada = %+v, esperaba la versión 1", got.UltimaVersionPublicada)
	}
}

// TestPublicarPaginaPublica_DeployadaEnNoCambiaPeroLaVersionAvanza — spec
// §5.2: "Deployar (solo visible la primera vez)" sigue valiendo para
// DeployadaEn — no hay forma de "des-deployar". Lo que SÍ cambia con PE-8:
// cada Publicar crea una versión nueva, aunque sea la segunda vez.
func TestPublicarPaginaPublica_DeployadaEnNoCambiaPeroLaVersionAvanza(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Diego", Email: "pagina4@example.com", Password: "password123456", NombreClinica: "Clínica Diego",
	})

	primera := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", reg.Token, nil)
	var got1 paginaPublicaResponse
	_ = json.Unmarshal(primera.Body.Bytes(), &got1)

	segunda := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", reg.Token, nil)
	if segunda.Code != http.StatusOK {
		t.Fatalf("segundo publicar: status = %d, esperaba %d. body=%s", segunda.Code, http.StatusOK, segunda.Body.String())
	}
	var got2 paginaPublicaResponse
	_ = json.Unmarshal(segunda.Body.Bytes(), &got2)

	if got1.DeployadaEn == nil || got2.DeployadaEn == nil {
		t.Fatal("esperaba DeployadaEn no nulo en ambas respuestas")
	}
	if *got1.DeployadaEn != *got2.DeployadaEn {
		t.Errorf("DeployadaEn cambió entre llamadas: %q -> %q, esperaba que se mantuviera", *got1.DeployadaEn, *got2.DeployadaEn)
	}
	if got2.UltimaVersionPublicada == nil || got2.UltimaVersionPublicada.Numero != 2 {
		t.Fatalf("UltimaVersionPublicada tras el segundo publicar = %+v, esperaba la versión 2", got2.UltimaVersionPublicada)
	}
}

func TestOcultarYPublicarPaginaPublica_RequierenAutenticacion(t *testing.T) {
	router, _ := newTestRouter(t)

	reqOcultar := httptest.NewRequest(http.MethodPatch, "/panel/pagina/ocultar", nil)
	recOcultar := httptest.NewRecorder()
	router.ServeHTTP(recOcultar, reqOcultar)
	if recOcultar.Code != http.StatusUnauthorized {
		t.Errorf("ocultar: status = %d, esperaba %d", recOcultar.Code, http.StatusUnauthorized)
	}

	reqPublicar := httptest.NewRequest(http.MethodPost, "/panel/pagina/publicar", nil)
	recPublicar := httptest.NewRecorder()
	router.ServeHTTP(recPublicar, reqPublicar)
	if recPublicar.Code != http.StatusUnauthorized {
		t.Errorf("publicar: status = %d, esperaba %d", recPublicar.Code, http.StatusUnauthorized)
	}
}

// ---------------------------------------------------------------------
// PATCH /panel/pagina — contenido (Fase 4.2)
// ---------------------------------------------------------------------

func TestActualizarPaginaPublica_ActualizaVariosCamposYLosDevuelve(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Fede", Email: "pagina-patch1@example.com", Password: "password123456", NombreClinica: "Clínica Fede",
	})

	bio := "Atendemos desde 1998."
	tema, variante := "calido", "calido-2"
	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", reg.Token, actualizarPaginaPublicaRequest{
		Bio: &bio, Tema: &tema, TemaVariante: &variante,
		RedesSociales: map[string]string{"instagram": "@clinicafede"},
		MostrarMapa:   boolPtr(true),
		Revision:      intPtr(0),
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got paginaPublicaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if got.Bio == nil || *got.Bio != bio {
		t.Errorf("Bio = %v, esperaba %q", got.Bio, bio)
	}
	if got.Tema != tema || got.TemaVariante != variante {
		t.Errorf("Tema/TemaVariante = %q/%q, esperaba %q/%q", got.Tema, got.TemaVariante, tema, variante)
	}
	if got.RedesSociales["instagram"] != "@clinicafede" {
		t.Errorf("RedesSociales[instagram] = %q, esperaba @clinicafede", got.RedesSociales["instagram"])
	}
	if !got.MostrarMapa {
		t.Error("MostrarMapa = false, esperaba true")
	}
}

func TestActualizarPaginaPublica_RechazaTemaInvalido(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Gina", Email: "pagina-patch2@example.com", Password: "password123456", NombreClinica: "Clínica Gina",
	})

	tema := "no-existe"
	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", reg.Token, actualizarPaginaPublicaRequest{Tema: &tema})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestActualizarPaginaPublica_RechazaVarianteDeOtroTema(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Hugo", Email: "pagina-patch3@example.com", Password: "password123456", NombreClinica: "Clínica Hugo",
	})

	tema, varianteAjena := "calido", "clinico-1"
	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", reg.Token, actualizarPaginaPublicaRequest{Tema: &tema, TemaVariante: &varianteAjena})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperaba %d — una variante de \"clinico\" no vale para \"calido\". body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestActualizarPaginaPublica_RechazaTipoDeModuloInvalido(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ines", Email: "pagina-patch4@example.com", Password: "password123456", NombreClinica: "Clínica Ines",
	})

	modulos := []moduloRequest{{Tipo: "portada", Orden: 0, Visible: true}} // "portada" es estructural, no se persiste
	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", reg.Token, actualizarPaginaPublicaRequest{Modulos: &modulos})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

// TestActualizarPaginaPublica_ModulosSeReemplazanCompletos — dos PATCH
// sucesivos: el segundo reemplaza TODOS los módulos del primero, no los
// acumula (reemplazo completo, no CRUD parcial — ver el comentario del
// handler).
func TestActualizarPaginaPublica_ModulosSeReemplazanCompletos(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Juan", Email: "pagina-patch5@example.com", Password: "password123456", NombreClinica: "Clínica Juan",
	})

	primeros := []moduloRequest{
		{Tipo: "sobre_nosotros", Orden: 0, Visible: true},
		{Tipo: "contacto", Orden: 1, Visible: true},
	}
	rec1 := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", reg.Token, actualizarPaginaPublicaRequest{Modulos: &primeros, Revision: intPtr(0)})
	if rec1.Code != http.StatusOK {
		t.Fatalf("primer PATCH: status = %d. body=%s", rec1.Code, rec1.Body.String())
	}
	var got1 paginaPublicaResponse
	_ = json.Unmarshal(rec1.Body.Bytes(), &got1)
	if len(got1.Modulos) != 2 {
		t.Fatalf("después del primer PATCH: %d módulos, esperaba 2", len(got1.Modulos))
	}

	segundos := []moduloRequest{{Tipo: "horarios", Orden: 0, Visible: true}}
	rec2 := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", reg.Token, actualizarPaginaPublicaRequest{Modulos: &segundos, Revision: intPtr(got1.Revision)})
	if rec2.Code != http.StatusOK {
		t.Fatalf("segundo PATCH: status = %d. body=%s", rec2.Code, rec2.Body.String())
	}
	var got2 paginaPublicaResponse
	_ = json.Unmarshal(rec2.Body.Bytes(), &got2)
	if len(got2.Modulos) != 1 || got2.Modulos[0].Tipo != "horarios" {
		t.Fatalf("después del segundo PATCH: %+v, esperaba solo el módulo \"horarios\"", got2.Modulos)
	}
}

func TestActualizarPaginaPublica_RequiereRolAdmin(t *testing.T) {
	router, gdb, _ := newTestRouterWithMail(t)
	titular := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Karina", Email: "pagina-patch6@example.com", Password: "password123456", NombreClinica: "Clínica Karina",
	})
	clinicID := uuid.MustParse(titular.Profesional.ID)
	tokenColega := sumarColaboradorDePrueba(t, gdb, router, clinicID, "colega-pagina@example.com", db.RoleProfesional)

	bio := "no debería poder"
	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", tokenColega, actualizarPaginaPublicaRequest{Bio: &bio})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, esperaba %d — un profesional sin rol admin no maneja la página pública", rec.Code, http.StatusForbidden)
	}
}

// ---------------------------------------------------------------------
// POST /panel/pagina/fotos — upload (Fase 4.2)
// ---------------------------------------------------------------------

func subirFotoDePrueba(t *testing.T, router http.Handler, token string, contentType string, contenido []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreatePart(map[string][]string{
		"Content-Disposition": {`form-data; name="foto"; filename="foto.jpg"`},
		"Content-Type":        {contentType},
	})
	if err != nil {
		t.Fatalf("no se pudo armar el multipart: %v", err)
	}
	if _, err := part.Write(contenido); err != nil {
		t.Fatalf("no se pudo escribir el contenido: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("no se pudo cerrar el multipart: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/panel/pagina/fotos", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

// pngDePrueba — una imagen de verdad: desde PE-9 el handler la decodifica
// para generar las variantes, así que unos bytes cualquiera ya no pasan.
func pngDePrueba(t *testing.T, ancho, alto int) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewNRGBA(image.Rect(0, 0, ancho, alto))); err != nil {
		t.Fatalf("no se pudo armar el PNG: %v", err)
	}
	return buf.Bytes()
}

// TestSubirFotoPaginaPublica_Exito — PE-9: la URL que vuelve es la de la
// variante WebP más grande que no agranda la foto (1200 px de ancho → la de
// 960), y el patrón "<token>.w<ancho>.webp" es el contrato con el `srcset`
// de la plantilla.
func TestSubirFotoPaginaPublica_Exito(t *testing.T) {
	router, gdb := newTestRouterWithStorage(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Lucas", Email: "pagina-foto1@example.com", Password: "password123456", NombreClinica: "Clínica Lucas",
	})

	rec := subirFotoDePrueba(t, router, reg.Token, "image/png", pngDePrueba(t, 1200, 600))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got subirFotoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if !strings.HasPrefix(got.URL, "http://localhost:8080/uploads/") {
		t.Errorf("URL = %q, esperaba que empezara con http://localhost:8080/uploads/", got.URL)
	}
	sufijo := ".w960.webp"
	if !imagenes.HayCodificadorWebP {
		sufijo = ".png" // Go windows/386: el original, sin variantes
	}
	if !strings.HasSuffix(got.URL, sufijo) {
		t.Errorf("URL = %q, esperaba que terminara en %s", got.URL, sufijo)
	}
}

// Un archivo que dice ser una imagen y no lo es: antes de PE-9 se guardaba
// igual (solo se miraba el Content-Type); ahora hay que decodificarlo.
func TestSubirFotoPaginaPublica_RechazaLoQueNoEsImagen(t *testing.T) {
	router, gdb := newTestRouterWithStorage(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Lucía", Email: "pagina-foto4@example.com", Password: "password123456", NombreClinica: "Clínica Lucía",
	})

	rec := subirFotoDePrueba(t, router, reg.Token, "image/png", []byte("no soy un png"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestSubirFotoPaginaPublica_RechazaContentTypeInvalido(t *testing.T) {
	router, gdb := newTestRouterWithStorage(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Mara", Email: "pagina-foto2@example.com", Password: "password123456", NombreClinica: "Clínica Mara",
	})

	rec := subirFotoDePrueba(t, router, reg.Token, "application/pdf", []byte("no es una imagen"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

// TestSubirFotoPaginaPublica_SinStorageResponde501 — Storage nil (dev sin
// configurar), mismo criterio que Google/Turnstile sin credenciales.
func TestSubirFotoPaginaPublica_SinStorageResponde501(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Nico", Email: "pagina-foto3@example.com", Password: "password123456", NombreClinica: "Clínica Nico",
	})

	rec := subirFotoDePrueba(t, router, reg.Token, "image/png", []byte("x"))
	if rec.Code != http.StatusNotImplemented {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusNotImplemented, rec.Body.String())
	}
}

func TestSubirFotoPaginaPublica_RequiereAutenticacion(t *testing.T) {
	router, _ := newTestRouterWithStorage(t)
	rec := subirFotoDePrueba(t, router, "", "image/png", []byte("x"))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}

// ---------------------------------------------------------------------
// Estadísticas reales (Fase 4.2)
// ---------------------------------------------------------------------

// TestGetPaginaPublica_EstadisticasCuentanSoloAsistio — pacientes_atendidos
// es un conteo DISTINCT (dos turnos del mismo paciente cuentan una vez),
// turnos_realizados no. Ausente y sin marcar no cuentan para ninguno de
// los dos (decisión cerrada: solo estadísticas reales del sistema).
func TestGetPaginaPublica_EstadisticasCuentanSoloAsistio(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Olga", Email: "pagina-stats1@example.com", Password: "password123456", NombreClinica: "Clínica Olga",
	})
	clinicID := uuid.MustParse(reg.Profesional.ID)

	pacienteA := crearPacienteDePruebaPaginaPublica(t, gdb, clinicID, "40111111")
	pacienteB := crearPacienteDePruebaPaginaPublica(t, gdb, clinicID, "40222222")

	asistio := "asistio"
	ausente := "ausente"
	crearTurnoConAsistencia(t, gdb, clinicID, &pacienteA, &asistio)
	crearTurnoConAsistencia(t, gdb, clinicID, &pacienteA, &asistio) // mismo paciente, otro turno
	crearTurnoConAsistencia(t, gdb, clinicID, &pacienteB, &asistio)
	crearTurnoConAsistencia(t, gdb, clinicID, &pacienteB, &ausente)
	crearTurnoConAsistencia(t, gdb, clinicID, &pacienteB, nil) // sin marcar todavía

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/pagina", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)

	if got.Estadisticas["pacientes_atendidos"] != 2 {
		t.Errorf("pacientes_atendidos = %d, esperaba 2", got.Estadisticas["pacientes_atendidos"])
	}
	if got.Estadisticas["turnos_realizados"] != 3 {
		t.Errorf("turnos_realizados = %d, esperaba 3", got.Estadisticas["turnos_realizados"])
	}
}

func crearPacienteDePruebaPaginaPublica(t *testing.T, gdb *gorm.DB, clinicID uuid.UUID, dni string) uuid.UUID {
	t.Helper()
	paciente := db.Paciente{ClinicID: clinicID, Nombre: "Paciente", Apellido: "De Prueba", DNI: dni}
	if err := gdb.Create(&paciente).Error; err != nil {
		t.Fatalf("no se pudo crear el paciente de prueba: %v", err)
	}
	return paciente.ID
}

func crearTurnoConAsistencia(t *testing.T, gdb *gorm.DB, clinicID uuid.UUID, pacienteID *uuid.UUID, asistencia *string) {
	t.Helper()
	turno := db.Turno{
		ClinicID: clinicID, PacienteID: pacienteID, Estado: "cancelada", Origen: "manual",
		NombreContacto: "Paciente", ApellidoContacto: "De Prueba",
		DNIContacto: "1", TelefonoContacto: "1", EmailContacto: "paciente@example.com",
		Asistencia: asistencia,
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno de prueba: %v", err)
	}
}

func boolPtr(b bool) *bool { return &b }

// intPtr — PE-8: cada PATCH/restaurar exitoso de la página pública exige la
// Revision actual (candado optimista), acá con frecuencia un literal.
func intPtr(i int) *int { return &i }
