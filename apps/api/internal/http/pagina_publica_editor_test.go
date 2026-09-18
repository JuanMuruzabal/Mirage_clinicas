package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"dental-mirage/api/internal/db"
)

// Fase 4.4/4.5 — lo que el editor necesita del backend: la foto de
// portada (el PATCH no la aceptaba), la validación de lo que después se
// renderiza en la vidriera pública (URLs y links) y la dirección efectiva.

// parchearPagina manda un PATCH /panel/pagina y devuelve el recorder — los
// tests de abajo solo se diferencian en el body y en qué esperan.
func parchearPagina(t *testing.T, router http.Handler, token string, body actualizarPaginaPublicaRequest) *httptest.ResponseRecorder {
	t.Helper()
	return doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", token, body)
}

func TestActualizarPaginaPublica_GuardaLaFotoDePortada(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Kira", Email: "pagina-portada1@example.com", Password: "password123456", NombreClinica: "Clínica Kira",
	})

	foto := "http://localhost:8080/uploads/abc.jpg"
	rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{FotoPortadaURL: &foto})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.FotoPortadaURL == nil || *got.FotoPortadaURL != foto {
		t.Fatalf("FotoPortadaURL = %v, esperaba %q", got.FotoPortadaURL, foto)
	}

	// Vaciar: "" la borra (null no puede: un *string no distingue null de ausente).
	vacia := ""
	rec = parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{FotoPortadaURL: &vacia})
	if rec.Code != http.StatusOK {
		t.Fatalf("status al vaciar = %d. body=%s", rec.Code, rec.Body.String())
	}
	got = paginaPublicaResponse{}
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.FotoPortadaURL != nil {
		t.Errorf("FotoPortadaURL = %q después de mandar \"\", esperaba nil (NULL, no cadena vacía)", *got.FotoPortadaURL)
	}
}

func TestActualizarPaginaPublica_RechazaURLsDeFotoConEsquemasPeligrosos(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Lia", Email: "pagina-portada2@example.com", Password: "password123456", NombreClinica: "Clínica Lia",
	})

	for _, u := range []string{"javascript:alert(1)", "data:image/png;base64,AAAA", "//evil.example/x.png", "ftp://x/y.png"} {
		foto := u
		rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{FotoPortadaURL: &foto})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("portada %q: status = %d, esperaba 400", u, rec.Code)
		}

		modulos := []moduloRequest{{Tipo: "foto", Visible: true, Config: map[string]any{"subtipo": "banner", "fotoUrl": u}}}
		rec = parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &modulos})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("módulo foto %q: status = %d, esperaba 400", u, rec.Code)
		}

		galeria := []moduloRequest{{Tipo: "galeria", Visible: true, Config: map[string]any{"fotoUrls": []any{u}}}}
		rec = parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &galeria})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("galería %q: status = %d, esperaba 400", u, rec.Code)
		}
	}

	// Contrapeso: una ruta propia de uploads y una URL https sí valen.
	for _, u := range []string{"/uploads/a.png", "https://cdn.example.com/a.png"} {
		foto := u
		rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{FotoPortadaURL: &foto})
		if rec.Code != http.StatusOK {
			t.Errorf("portada %q: status = %d, esperaba 200. body=%s", u, rec.Code, rec.Body.String())
		}
	}
}

func TestActualizarPaginaPublica_ValidaRedesSociales(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Mora", Email: "pagina-redes@example.com", Password: "password123456", NombreClinica: "Clínica Mora",
	})

	casos := []struct {
		nombre string
		redes  map[string]string
		status int
	}{
		{"usuario suelto", map[string]string{"instagram": "@clinicamora"}, http.StatusOK},
		{"url https", map[string]string{"facebook": "https://facebook.com/clinicamora"}, http.StatusOK},
		{"numero de whatsapp", map[string]string{"whatsapp": "+5493511234567"}, http.StatusOK},
		{"red que no existe", map[string]string{"tiktok": "@x"}, http.StatusBadRequest},
		{"esquema javascript", map[string]string{"instagram": "javascript:alert(1)"}, http.StatusBadRequest},
		{"demasiado largo", map[string]string{"instagram": strings.Repeat("a", maxLargoRed+1)}, http.StatusBadRequest},
	}
	for _, c := range casos {
		rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{RedesSociales: c.redes})
		if rec.Code != c.status {
			t.Errorf("%s: status = %d, esperaba %d. body=%s", c.nombre, rec.Code, c.status, rec.Body.String())
		}
	}
}

// TestActualizarPaginaPublica_UnaRedVaciadaNoSobrevive — el editor manda el
// mapa completo; una red que el admin borró llega como "" y no se guarda.
func TestActualizarPaginaPublica_UnaRedVaciadaNoSobrevive(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Nico", Email: "pagina-redes2@example.com", Password: "password123456", NombreClinica: "Clínica Nico",
	})

	rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{
		RedesSociales: map[string]string{"instagram": "@nico", "facebook": "   "},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if _, hay := got.RedesSociales["facebook"]; hay {
		t.Errorf("RedesSociales = %v, no esperaba una entrada para facebook (vacía)", got.RedesSociales)
	}
	if got.RedesSociales["instagram"] != "@nico" {
		t.Errorf("RedesSociales[instagram] = %q, esperaba @nico", got.RedesSociales["instagram"])
	}
}

func TestActualizarPaginaPublica_PoneTopeALosTextos(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Olga", Email: "pagina-topes@example.com", Password: "password123456", NombreClinica: "Clínica Olga",
	})

	bioLarga := strings.Repeat("a", maxLargoBio+1)
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Bio: &bioLarga}); rec.Code != http.StatusBadRequest {
		t.Errorf("bio de %d caracteres: status = %d, esperaba 400", maxLargoBio+1, rec.Code)
	}
	bioJusta := strings.Repeat("a", maxLargoBio)
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Bio: &bioJusta}); rec.Code != http.StatusOK {
		t.Errorf("bio de %d caracteres: status = %d, esperaba 200", maxLargoBio, rec.Code)
	}

	largo := []moduloRequest{{Tipo: "texto_libre", Visible: true, Config: map[string]any{"titulo": "t", "texto": strings.Repeat("a", maxLargoTextoLibre+1)}}}
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &largo}); rec.Code != http.StatusBadRequest {
		t.Errorf("texto libre largo: status = %d, esperaba 400", rec.Code)
	}
	titulo := []moduloRequest{{Tipo: "texto_libre", Visible: true, Config: map[string]any{"titulo": strings.Repeat("a", maxLargoTituloTexto+1), "texto": "x"}}}
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &titulo}); rec.Code != http.StatusBadRequest {
		t.Errorf("título largo: status = %d, esperaba 400", rec.Code)
	}
}

// TestActualizarPaginaPublica_VaciarBioLaGuardaComoNull — mandar "" borra la
// bio y la deja en NULL, no como una cadena vacía.
func TestActualizarPaginaPublica_VaciarBioLaGuardaComoNull(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Rita", Email: "pagina-bio@example.com", Password: "password123456", NombreClinica: "Clínica Rita",
	})

	bio := "Hola"
	parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Bio: &bio})
	vacia := "   "
	rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Bio: &vacia})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Bio != nil {
		t.Errorf("Bio = %q, esperaba nil", *got.Bio)
	}
}

// TestPaginaPublica_LaDireccionDeLaClinicaViajaAlEditor — el editor recibe
// la dirección de la clínica SIN el override: si viniera ya resuelta,
// borrar el override en la pantalla dejaría la previsualización sin saber a
// qué volver.
func TestPaginaPublica_LaDireccionDeLaClinicaViajaAlEditor(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Pia", Email: "pagina-dir@example.com", Password: "password123456", NombreClinica: "Clínica Pia",
	})
	if err := gdb.Model(&db.Clinic{}).Where("slug = ?", reg.Profesional.Slug).Update("direccion", "Av. Colón 100").Error; err != nil {
		t.Fatalf("no se pudo fijar la dirección de la clínica: %v", err)
	}

	override := "Bv. San Juan 200"
	rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{DireccionOverride: &override})
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.DireccionClinica == nil || *got.DireccionClinica != "Av. Colón 100" {
		t.Fatalf("DireccionClinica = %v, esperaba la de la clínica aunque haya override", got.DireccionClinica)
	}
	if got.DireccionOverride == nil || *got.DireccionOverride != override {
		t.Fatalf("DireccionOverride = %v, esperaba %q", got.DireccionOverride, override)
	}
}

// TestGetClinicaPublica_PersonalizadaDistingueOcultosDeNuncaEditada — el
// endpoint público no devuelve los módulos ocultos, así que sin
// `personalizada` una página con todo oculto se vería igual que una que
// nadie tocó, y el frontend le armaría la estructura por defecto.
func TestGetClinicaPublica_PersonalizadaDistingueOcultosDeNuncaEditada(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Sol", Email: "pagina-personalizada@example.com", Password: "password123456", NombreClinica: "Clínica Sol",
	})
	leer := func() clinicaPublicaResponse {
		rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d. body=%s", rec.Code, rec.Body.String())
		}
		var got clinicaPublicaResponse
		_ = json.Unmarshal(rec.Body.Bytes(), &got)
		return got
	}

	if got := leer(); got.Personalizada || len(got.Modulos) != 0 {
		t.Fatalf("sin editar: personalizada=%v modulos=%d, esperaba false y 0", got.Personalizada, len(got.Modulos))
	}

	ocultos := []moduloRequest{{Tipo: "sobre_nosotros", Orden: 0, Visible: false}}
	parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &ocultos})
	if got := leer(); !got.Personalizada || len(got.Modulos) != 0 {
		t.Fatalf("todo oculto: personalizada=%v modulos=%d, esperaba true y 0", got.Personalizada, len(got.Modulos))
	}

	visibles := []moduloRequest{{Tipo: "sobre_nosotros", Orden: 0, Visible: true}}
	parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &visibles})
	if got := leer(); !got.Personalizada || len(got.Modulos) != 1 {
		t.Fatalf("con uno visible: personalizada=%v modulos=%d, esperaba true y 1", got.Personalizada, len(got.Modulos))
	}
}

// TestActualizarPaginaPublica_UnModuloOcultoSeGuardaOculto — regresión: el
// modelo tiene `default:true` en Visible y GORM ignoraba un false al crear,
// así que "ocultar" un módulo se guardaba como visible.
func TestActualizarPaginaPublica_UnModuloOcultoSeGuardaOculto(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Tina", Email: "pagina-oculto@example.com", Password: "password123456", NombreClinica: "Clínica Tina",
	})

	modulos := []moduloRequest{
		{Tipo: "sobre_nosotros", Orden: 0, Visible: true},
		{Tipo: "contacto", Orden: 1, Visible: false},
		{Tipo: "especialidades", Orden: 2, Visible: false},
	}
	rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &modulos})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got.Modulos) != 3 {
		t.Fatalf("%d módulos, esperaba 3", len(got.Modulos))
	}
	visibles := map[string]bool{}
	ids := map[string]bool{}
	for _, m := range got.Modulos {
		visibles[m.Tipo] = m.Visible
		ids[m.ID] = true
	}
	if !visibles["sobre_nosotros"] || visibles["contacto"] || visibles["especialidades"] {
		t.Errorf("visibilidad = %v, esperaba solo sobre_nosotros visible", visibles)
	}
	if len(ids) != 3 {
		t.Errorf("ids = %v, esperaba 3 distintos (el ID tiene que salir del default de la base)", ids)
	}
}
