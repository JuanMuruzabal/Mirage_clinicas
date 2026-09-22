package http

import (
	"encoding/json"
	"net/http"
	"testing"
)

// PE-2/PE-3 (plan Prisma Engine): tokens de diseño y variantes de módulo.
// Lo que se protege acá es el camino completo del dato — guardar en el
// borrador, publicarlo, que la página pública lo sirva y que restaurar una
// versión lo traiga de vuelta —, porque el error fácil era sumarlo al
// borrador y olvidarlo en la foto de la versión (PE-8), con lo que la página
// publicada lo perdía sin ningún error.

func TestTemaTokens_ViajanDelBorradorALaVersionPublicadaYSeRestauran(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Yael", Email: "pagina-tokens1@example.com", Password: "password123456", NombreClinica: "Clínica Yael",
	})

	tema, variante := "oscuro", "oscuro-2"
	tokens := map[string]any{"forma": "redonda", "superficie": "elevada", "portada": "dividida"}
	modulos := []moduloRequest{{
		Tipo: "galeria", Orden: 0, Visible: true,
		Config: map[string]any{"fotoUrls": []any{"/uploads/a.jpg"}, "variante": "carrusel", "fondoSeccion": "contraste", "tituloPublico": "Nuestro consultorio"},
	}}
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{
		Tema: &tema, TemaVariante: &variante, TemaTokens: &tokens, Modulos: &modulos,
	}); rec.Code != http.StatusOK {
		t.Fatalf("PATCH: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	if rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", reg.Token, nil); rec.Code != http.StatusOK {
		t.Fatalf("publicar v1: status = %d. body=%s", rec.Code, rec.Body.String())
	}

	var publica clinicaPublicaResponse
	_ = json.Unmarshal(doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil).Body.Bytes(), &publica)
	if publica.TemaTokens["forma"] != "redonda" || publica.TemaTokens["portada"] != "dividida" {
		t.Fatalf("la página pública no sirve los tokens publicados: %v", publica.TemaTokens)
	}
	if len(publica.Modulos) != 1 || publica.Modulos[0].Config["variante"] != "carrusel" {
		t.Fatalf("la página pública no sirve la variante del módulo: %+v", publica.Modulos)
	}

	// Cambia los tokens en el borrador y publica v2: la v1 tiene que seguir
	// guardando los suyos, y restaurarla tiene que traerlos de vuelta.
	otros := map[string]any{}
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{TemaTokens: &otros}); rec.Code != http.StatusOK {
		t.Fatalf("PATCH 2: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var borrador paginaPublicaResponse
	_ = json.Unmarshal(doJSONAuth(t, router, http.MethodGet, "/panel/pagina", reg.Token, nil).Body.Bytes(), &borrador)
	if len(borrador.TemaTokens) != 0 {
		t.Fatalf("mandar {} tenía que sacar todos los overrides, quedó: %v", borrador.TemaTokens)
	}
	if borrador.UltimaVersionPublicada == nil || borrador.UltimaVersionPublicada.Contenido.TemaTokens["forma"] != "redonda" {
		t.Fatal("la última versión publicada perdió sus tokens al cambiar el borrador")
	}

	rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/versiones/1/restaurar", reg.Token, map[string]any{"revision": borrador.Revision})
	if rec.Code != http.StatusOK {
		t.Fatalf("restaurar: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var restaurado paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &restaurado)
	if restaurado.TemaTokens["superficie"] != "elevada" {
		t.Errorf("restaurar la v1 no trajo sus tokens: %v", restaurado.TemaTokens)
	}
}

func TestTemaTokens_RechazaValoresFueraDelCatalogo(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Zoe", Email: "pagina-tokens2@example.com", Password: "password123456", NombreClinica: "Clínica Zoe",
	})

	casos := map[string]map[string]any{
		"opción inventada":   {"forma": "triangular"},
		"clave desconocida":  {"radio": "12px"},
		"valor de otro tipo": {"densidad": 3},
	}
	for nombre, tokens := range casos {
		t.Run(nombre, func(t *testing.T) {
			rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{TemaTokens: &tokens})
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, esperaba 400. body=%s", rec.Code, rec.Body.String())
			}
		})
	}
}
