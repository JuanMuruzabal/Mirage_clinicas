package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// PP-4 (plan de pulido, H13): la descripción de las fotos. La de la portada
// es una columna de paginas_publicas y recorre el mismo camino que el SEO
// (borrador → versión publicada → página pública → restaurar); la de las
// fotos de los módulos va en su config y la valida el esquema generado.

func TestFotoPortadaAlt_ViajaDelBorradorALaVersionPublicadaYSeRestaura(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Alba", Email: "pagina-alt1@example.com", Password: "password123456", NombreClinica: "Clínica Alba",
	})

	alt := "  La recepción,\n con un sillón   verde "
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{FotoPortadaAlt: &alt}); rec.Code != http.StatusOK {
		t.Fatalf("PATCH: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var borrador paginaPublicaResponse
	_ = json.Unmarshal(doJSONAuth(t, router, http.MethodGet, "/panel/pagina", reg.Token, nil).Body.Bytes(), &borrador)
	const esperado = "La recepción, con un sillón verde"
	if borrador.FotoPortadaAlt != esperado {
		t.Fatalf("FotoPortadaAlt = %q, esperaba una sola línea: %q", borrador.FotoPortadaAlt, esperado)
	}

	if rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", reg.Token, nil); rec.Code != http.StatusOK {
		t.Fatalf("publicar: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var publica clinicaPublicaResponse
	_ = json.Unmarshal(doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil).Body.Bytes(), &publica)
	if publica.FotoPortadaAlt != esperado {
		t.Fatalf("la página pública no sirve el alt publicado: %q", publica.FotoPortadaAlt)
	}

	vacio := ""
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{FotoPortadaAlt: &vacio}); rec.Code != http.StatusOK {
		t.Fatalf("PATCH 2: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(doJSONAuth(t, router, http.MethodGet, "/panel/pagina", reg.Token, nil).Body.Bytes(), &borrador)
	if borrador.FotoPortadaAlt != "" || borrador.UltimaVersionPublicada.Contenido.FotoPortadaAlt != esperado {
		t.Fatalf("vaciar el borrador no tenía que tocar la versión: borrador=%q versión=%q",
			borrador.FotoPortadaAlt, borrador.UltimaVersionPublicada.Contenido.FotoPortadaAlt)
	}
	rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/versiones/1/restaurar", reg.Token, map[string]any{"revision": borrador.Revision})
	if rec.Code != http.StatusOK {
		t.Fatalf("restaurar: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var restaurado paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &restaurado)
	if restaurado.FotoPortadaAlt != esperado {
		t.Errorf("restaurar la v1 no trajo su alt: %q", restaurado.FotoPortadaAlt)
	}
}

func TestFotoAlt_RechazaDescripcionesDemasiadoLargas(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Bruno", Email: "pagina-alt2@example.com", Password: "password123456", NombreClinica: "Clínica Bruno",
	})

	largo := strings.Repeat("á", maxLargoAltFoto+1)
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{FotoPortadaAlt: &largo}); rec.Code != http.StatusBadRequest {
		t.Errorf("alt de portada largo: status = %d, esperaba 400", rec.Code)
	}

	justo := strings.Repeat("á", maxLargoAltFoto)
	casos := []struct {
		nombre string
		config map[string]any
		status int
	}{
		{"foto con alt al límite", map[string]any{"subtipo": "banner", "fotoUrl": "/uploads/a.jpg", "fotoAlt": justo}, http.StatusOK},
		{"foto con alt largo", map[string]any{"subtipo": "banner", "fotoUrl": "/uploads/a.jpg", "fotoAlt": largo}, http.StatusBadRequest},
	}
	for _, c := range casos {
		modulos := []moduloRequest{{Tipo: "foto", Orden: 0, Visible: true, Config: c.config}}
		if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &modulos}); rec.Code != c.status {
			t.Errorf("%s: status = %d, esperaba %d. body=%s", c.nombre, rec.Code, c.status, rec.Body.String())
		}
	}

	galeria := []moduloRequest{{Tipo: "galeria", Orden: 0, Visible: true, Config: map[string]any{
		"fotoUrls": []any{"/uploads/a.jpg", "/uploads/b.jpg"},
		"fotoAlts": []any{"", largo},
	}}}
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &galeria}); rec.Code != http.StatusBadRequest {
		t.Errorf("galería con un alt largo: status = %d, esperaba 400", rec.Code)
	}
}
