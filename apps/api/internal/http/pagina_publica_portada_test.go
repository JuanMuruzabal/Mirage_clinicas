package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// Fase 4.4 (pedido del cliente tras la primera prueba): el nombre de la
// clínica sobre la foto de portada, con su propio color, y un nombre propio
// para cada módulo en el editor.

func TestActualizarPaginaPublica_NombreSobrePortadaYSuColor(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Ada", Email: "pagina-nombre1@example.com", Password: "password123456", NombreClinica: "Clínica Ada",
	})

	// Por default: debajo de la foto, sin color elegido.
	rec := doJSONAuth(t, router, http.MethodGet, "/panel/pagina", reg.Token, nil)
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.NombreSobrePortada || got.NombreColor != "" {
		t.Fatalf("default: sobrePortada=%v color=%q, esperaba false y \"\"", got.NombreSobrePortada, got.NombreColor)
	}

	color := "dorado"
	rec = parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{NombreSobrePortada: boolPtr(true), NombreColor: &color})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d. body=%s", rec.Code, rec.Body.String())
	}
	got = paginaPublicaResponse{}
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if !got.NombreSobrePortada || got.NombreColor != "dorado" {
		t.Fatalf("sobrePortada=%v color=%q, esperaba true y dorado", got.NombreSobrePortada, got.NombreColor)
	}

	// Lo ve el visitante, no solo el editor.
	pub := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug, nil)
	var publica clinicaPublicaResponse
	_ = json.Unmarshal(pub.Body.Bytes(), &publica)
	if !publica.NombreSobrePortada || publica.NombreColor != "dorado" {
		t.Fatalf("público: sobrePortada=%v color=%q, esperaba true y dorado", publica.NombreSobrePortada, publica.NombreColor)
	}

	// Apagarlo tiene que poder: un false explícito no se pierde (mismo
	// cuidado que con Visible — un bool con default no puede ignorar el false).
	rec = parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{NombreSobrePortada: boolPtr(false)})
	got = paginaPublicaResponse{}
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.NombreSobrePortada {
		t.Error("NombreSobrePortada = true después de mandar false")
	}
	if got.NombreColor != "dorado" {
		t.Errorf("NombreColor = %q, esperaba que un PATCH sin ese campo no lo toque (dorado)", got.NombreColor)
	}
}

func TestActualizarPaginaPublica_ElColorDelNombreEsUnSetCurado(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Beto", Email: "pagina-nombre2@example.com", Password: "password123456", NombreClinica: "Clínica Beto",
	})

	for _, malo := range []string{"#ff0000", "rojo", "red", "javascript:alert(1)", "expression(1)", "BLANCO", "url(x)"} {
		c := malo
		if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{NombreColor: &c}); rec.Code != http.StatusBadRequest {
			t.Errorf("color %q: status = %d, esperaba 400", malo, rec.Code)
		}
	}
	for _, bueno := range []string{"blanco", "negro", "dorado", "celeste", ""} {
		c := bueno
		if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{NombreColor: &c}); rec.Code != http.StatusOK {
			t.Errorf("color %q: status = %d, esperaba 200. body=%s", bueno, rec.Code, rec.Body.String())
		}
	}
}

// TestPaginasPublicas_LaBaseRechazaUnColorFueraDelSet — la constraint es la
// red de seguridad si algún camino escribe sin pasar por el handler.
func TestPaginasPublicas_LaBaseRechazaUnColorFueraDelSet(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Cora", Email: "pagina-nombre3@example.com", Password: "password123456", NombreClinica: "Clínica Cora",
	})
	doJSONAuth(t, router, http.MethodGet, "/panel/pagina", reg.Token, nil) // crea la fila

	err := gdb.Exec("UPDATE paginas_publicas SET nombre_color = 'fucsia' WHERE clinic_id = ?", reg.Profesional.ID).Error
	if err == nil || !strings.Contains(err.Error(), "chk_pagina_publica_nombre_color") {
		t.Fatalf("err = %v, esperaba que la constraint chk_pagina_publica_nombre_color lo rechace", err)
	}
}

func TestActualizarPaginaPublica_ElNombreDeUnModuloSeGuardaYTieneTope(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Dani", Email: "pagina-nombre4@example.com", Password: "password123456", NombreClinica: "Clínica Dani",
	})

	modulos := []moduloRequest{
		{Tipo: "foto", Orden: 0, Visible: true, Config: map[string]any{"subtipo": "banner", "fotoUrl": "", "nombre": "Sala de espera"}},
		{Tipo: "foto", Orden: 1, Visible: true, Config: map[string]any{"subtipo": "banner", "fotoUrl": "", "nombre": "Equipo"}},
	}
	rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &modulos})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var got paginaPublicaResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got.Modulos) != 2 || got.Modulos[0].Config["nombre"] != "Sala de espera" || got.Modulos[1].Config["nombre"] != "Equipo" {
		t.Fatalf("módulos = %+v, esperaba los dos nombres propios en orden", got.Modulos)
	}

	// Vale para cualquier tipo, también los que no tienen otra config.
	sin := []moduloRequest{{Tipo: "contacto", Orden: 0, Visible: true, Config: map[string]any{"nombre": "Cómo llegar"}}}
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &sin}); rec.Code != http.StatusOK {
		t.Errorf("nombre en un módulo de contacto: status = %d, esperaba 200", rec.Code)
	}

	largo := []moduloRequest{{Tipo: "contacto", Orden: 0, Visible: true, Config: map[string]any{"nombre": strings.Repeat("a", maxLargoNombreModulo+1)}}}
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &largo}); rec.Code != http.StatusBadRequest {
		t.Errorf("nombre de %d caracteres: status = %d, esperaba 400", maxLargoNombreModulo+1, rec.Code)
	}
	justo := []moduloRequest{{Tipo: "contacto", Orden: 0, Visible: true, Config: map[string]any{"nombre": strings.Repeat("a", maxLargoNombreModulo)}}}
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &justo}); rec.Code != http.StatusOK {
		t.Errorf("nombre de %d caracteres: status = %d, esperaba 200", maxLargoNombreModulo, rec.Code)
	}

	noTexto := []moduloRequest{{Tipo: "contacto", Orden: 0, Visible: true, Config: map[string]any{"nombre": 42}}}
	if rec := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Modulos: &noTexto}); rec.Code != http.StatusBadRequest {
		t.Errorf("nombre que no es texto: status = %d, esperaba 400", rec.Code)
	}
}
