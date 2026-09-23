package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// PE-9 (plan Prisma Engine): SEO y sitemap. Mismo criterio que los tests de
// tokens (pagina_publica_tokens_test.go): lo que se protege es el camino
// completo del dato — borrador, versión publicada, página pública y
// restaurar —, porque un campo que falta en la foto de la versión se pierde
// sin ningún error.

func TestSeo_ViajaDelBorradorALaVersionPublicadaYSeRestaura(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Sol", Email: "pagina-seo1@example.com", Password: "password123456", NombreClinica: "Clínica Sol",
	})

	titulo := "  Clínica Sol —\n ortodoncia   en Córdoba "
	descripcion := "Turnos online, sin llamar."
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{SeoTitulo: &titulo, SeoDescripcion: &descripcion}); rec.Code != http.StatusOK {
		t.Fatalf("PATCH: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var borrador paginaPublicaResponse
	_ = json.Unmarshal(doJSONAuth(t, router, http.MethodGet, "/panel/pagina", reg.Token, nil).Body.Bytes(), &borrador)
	if borrador.SeoTitulo != "Clínica Sol — ortodoncia en Córdoba" {
		t.Errorf("SeoTitulo = %q, esperaba los espacios y el salto colapsados", borrador.SeoTitulo)
	}
	// Lo que el editor necesita para sugerir el default.
	if borrador.CiudadClinica == nil || *borrador.CiudadClinica != "Córdoba" || borrador.EspecialidadesClinica == nil {
		t.Errorf("faltan ciudad/especialidades de la clínica: %v / %v", borrador.CiudadClinica, borrador.EspecialidadesClinica)
	}

	// Publicado: la página pública sirve el de la versión.
	var publica clinicaPublicaResponse
	if rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", reg.Token, nil); rec.Code != http.StatusOK {
		t.Fatalf("publicar: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil).Body.Bytes(), &publica)
	if publica.SeoTitulo != "Clínica Sol — ortodoncia en Córdoba" || publica.SeoDescripcion != descripcion {
		t.Fatalf("la página pública no sirve el SEO publicado: %q / %q", publica.SeoTitulo, publica.SeoDescripcion)
	}
	if publica.Ciudad == nil || *publica.Ciudad != "Córdoba" || publica.TelefonoClinica == nil {
		t.Errorf("faltan los datos de la clínica para el JSON-LD: ciudad=%v tel=%v", publica.Ciudad, publica.TelefonoClinica)
	}

	// "" vuelve al default, y restaurar la v1 trae el SEO de vuelta.
	vacio := ""
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{SeoTitulo: &vacio, SeoDescripcion: &vacio}); rec.Code != http.StatusOK {
		t.Fatalf("PATCH 2: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(doJSONAuth(t, router, http.MethodGet, "/panel/pagina", reg.Token, nil).Body.Bytes(), &borrador)
	if borrador.SeoTitulo != "" || borrador.UltimaVersionPublicada.Contenido.SeoTitulo == "" {
		t.Fatalf("vaciar el borrador no tenía que tocar la versión publicada: borrador=%q versión=%q",
			borrador.SeoTitulo, borrador.UltimaVersionPublicada.Contenido.SeoTitulo)
	}
	rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/versiones/1/restaurar", reg.Token, map[string]any{"revision": borrador.Revision})
	if rec.Code != http.StatusOK {
		t.Fatalf("restaurar: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var restaurado paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &restaurado)
	if restaurado.SeoDescripcion != descripcion {
		t.Errorf("restaurar la v1 no trajo su descripción: %q", restaurado.SeoDescripcion)
	}
}

func TestSeo_RechazaTextosDemasiadoLargos(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Tomás", Email: "pagina-seo2@example.com", Password: "password123456", NombreClinica: "Clínica Tomás",
	})

	titulo := strings.Repeat("á", maxLargoSeoTitulo+1)
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{SeoTitulo: &titulo}); rec.Code != http.StatusBadRequest {
		t.Errorf("título largo: status = %d, esperaba 400", rec.Code)
	}
	descripcion := strings.Repeat("a", maxLargoSeoDescripcion+1)
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{SeoDescripcion: &descripcion}); rec.Code != http.StatusBadRequest {
		t.Errorf("descripción larga: status = %d, esperaba 400", rec.Code)
	}
	// Justo en el límite, contado en caracteres y no en bytes ("á" son dos).
	justo := strings.Repeat("á", maxLargoSeoTitulo)
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{SeoTitulo: &justo}); rec.Code != http.StatusOK {
		t.Errorf("título en el límite: status = %d. body=%s", rec.Code, rec.Body.String())
	}
}

// El sitemap lista solo lo que un buscador puede indexar: publicada y no
// oculta.
func TestSitemapClinicas_SoloPublicadasYVisibles(t *testing.T) {
	router, gdb := newTestRouter(t)
	publicada := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ada", Email: "sitemap1@example.com", Password: "password123456", NombreClinica: "Clínica Publicada",
	})
	sinPublicar := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Bruno", Email: "sitemap2@example.com", Password: "password123456", NombreClinica: "Clínica Sin Publicar",
	})
	oculta := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Carla", Email: "sitemap3@example.com", Password: "password123456", NombreClinica: "Clínica Oculta",
	})
	for _, reg := range []clinicaDePruebaResult{publicada, oculta} {
		if rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", reg.Token, nil); rec.Code != http.StatusOK {
			t.Fatalf("publicar: status = %d. body=%s", rec.Code, rec.Body.String())
		}
	}
	if rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina/ocultar", oculta.Token, ocultarPaginaPublicaRequest{Oculta: true}); rec.Code != http.StatusOK {
		t.Fatalf("ocultar: status = %d", rec.Code)
	}

	rec := doJSON(t, router, http.MethodGet, "/sitemap/clinicas", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var got []clinicaDelSitemap
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	slugs := map[string]string{}
	for _, c := range got {
		slugs[c.Slug] = c.ActualizadaEn
	}
	if slugs[publicada.Profesional.Slug] == "" {
		t.Errorf("falta la clínica publicada (o su fecha): %+v", got)
	}
	if _, ok := slugs[sinPublicar.Profesional.Slug]; ok {
		t.Error("una clínica sin publicar no tiene nada que indexar")
	}
	if _, ok := slugs[oculta.Profesional.Slug]; ok {
		t.Error("una clínica en mantenimiento no va en el sitemap")
	}
}
