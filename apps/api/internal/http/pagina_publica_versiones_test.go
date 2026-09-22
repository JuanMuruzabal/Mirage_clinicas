package http

import (
	"encoding/json"
	"net/http"
	"testing"
)

// PE-8 (plan Prisma Engine): borrador/versión publicada separados, candado
// optimista del borrador (Revision), historial y restaurar.

func TestActualizarPaginaPublica_RevisionDesactualizadaResponde409ConQuienYCuando(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Uma", Email: "pagina-rev1@example.com", Password: "password123456", NombreClinica: "Clínica Uma",
	})

	bio := "primer guardado"
	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", reg.Token, actualizarPaginaPublicaRequest{Bio: &bio, Revision: intPtr(0)})
	if rec.Code != http.StatusOK {
		t.Fatalf("primer PATCH: status = %d. body=%s", rec.Code, rec.Body.String())
	}

	// Reintenta con la MISMA revisión que ya se usó (0) — como si otra
	// pestaña/persona no se hubiera enterado del primer guardado.
	bio2 := "segundo guardado, revisión vieja"
	rec2 := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", reg.Token, actualizarPaginaPublicaRequest{Bio: &bio2, Revision: intPtr(0)})
	if rec2.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec2.Code, http.StatusConflict, rec2.Body.String())
	}
	var conflicto conflictoRevisionBody
	if err := json.Unmarshal(rec2.Body.Bytes(), &conflicto); err != nil {
		t.Fatalf("respuesta 409 no es JSON válido: %v", err)
	}
	if conflicto.RevisionActual != 1 {
		t.Errorf("RevisionActual = %d, esperaba 1 (la que dejó el primer guardado)", conflicto.RevisionActual)
	}
	if conflicto.ActualizadaEn == "" {
		t.Error("ActualizadaEn vino vacío, esperaba la fecha del primer guardado")
	}
	if conflicto.ActualizadaPorNombre == nil {
		t.Error("ActualizadaPorNombre vino nil, esperaba el nombre de quien guardó")
	}

	// El borrador NO cambió: sigue con el bio del primer guardado.
	getRec := doJSONAuth(t, router, http.MethodGet, "/panel/pagina", reg.Token, nil)
	var got paginaPublicaResponse
	_ = json.Unmarshal(getRec.Body.Bytes(), &got)
	if got.Bio == nil || *got.Bio != bio {
		t.Errorf("Bio = %v, esperaba %q (el conflicto no debe pisar el guardado ajeno)", got.Bio, bio)
	}
}

func TestActualizarPaginaPublica_SinRevisionResponde400(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Vito", Email: "pagina-rev2@example.com", Password: "password123456", NombreClinica: "Clínica Vito",
	})

	bio := "sin revision"
	rec := doJSONAuth(t, router, http.MethodPatch, "/panel/pagina", reg.Token, actualizarPaginaPublicaRequest{Bio: &bio})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestHistorialPaginaPublica_ListaVersionesMasNuevaPrimero(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Wanda", Email: "pagina-hist1@example.com", Password: "password123456", NombreClinica: "Clínica Wanda",
	})

	bio1 := "versión uno"
	parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Bio: &bio1})
	if rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", reg.Token, nil); rec.Code != http.StatusOK {
		t.Fatalf("no se pudo publicar v1: status=%d body=%s", rec.Code, rec.Body.String())
	}

	bio2 := "versión dos"
	parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Bio: &bio2})
	if rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", reg.Token, nil); rec.Code != http.StatusOK {
		t.Fatalf("no se pudo publicar v2: status=%d body=%s", rec.Code, rec.Body.String())
	}

	rec := doJSONAuth(t, router, http.MethodGet, "/panel/pagina/versiones", reg.Token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var historial []versionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &historial); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}
	if len(historial) != 2 {
		t.Fatalf("len(historial) = %d, esperaba 2", len(historial))
	}
	if historial[0].Numero != 2 || historial[1].Numero != 1 {
		t.Fatalf("orden de números = [%d, %d], esperaba [2, 1] (más nueva primero)", historial[0].Numero, historial[1].Numero)
	}
	if historial[0].Contenido.Bio == nil || *historial[0].Contenido.Bio != bio2 {
		t.Errorf("Contenido.Bio de la versión 2 = %v, esperaba %q", historial[0].Contenido.Bio, bio2)
	}
	if historial[1].Contenido.Bio == nil || *historial[1].Contenido.Bio != bio1 {
		t.Errorf("Contenido.Bio de la versión 1 = %v, esperaba %q", historial[1].Contenido.Bio, bio1)
	}
	if historial[0].PublicadaPorNombre == "" {
		t.Error("PublicadaPorNombre vino vacío")
	}
}

func TestRestaurarVersionPaginaPublica_CopiaElContenidoAlBorradorSinPublicar(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Xoana", Email: "pagina-restaurar1@example.com", Password: "password123456", NombreClinica: "Clínica Xoana",
	})

	bioOriginal := "contenido de la versión 1"
	rec1 := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Bio: &bioOriginal})
	var draft1 paginaPublicaResponse
	_ = json.Unmarshal(rec1.Body.Bytes(), &draft1)
	if rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", reg.Token, nil); rec.Code != http.StatusOK {
		t.Fatalf("no se pudo publicar v1: status=%d body=%s", rec.Code, rec.Body.String())
	}

	bioNuevo := "lo pisé sin querer"
	rec2 := parchearPagina(t, router, reg.Token, actualizarPaginaPublicaRequest{Bio: &bioNuevo})
	var draft2 paginaPublicaResponse
	_ = json.Unmarshal(rec2.Body.Bytes(), &draft2)

	// Restaurar la versión 1 — el body pide la Revision actual del borrador.
	rec3 := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/versiones/1/restaurar", reg.Token, map[string]any{"revision": draft2.Revision})
	if rec3.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec3.Code, http.StatusOK, rec3.Body.String())
	}
	var restaurado paginaPublicaResponse
	_ = json.Unmarshal(rec3.Body.Bytes(), &restaurado)
	if restaurado.Bio == nil || *restaurado.Bio != bioOriginal {
		t.Errorf("Bio tras restaurar = %v, esperaba %q (el de la versión 1)", restaurado.Bio, bioOriginal)
	}

	// Restaurar NO publica: sigue habiendo una sola versión, y la página
	// pública sigue sirviendo la 1 (no cambió).
	histRec := doJSONAuth(t, router, http.MethodGet, "/panel/pagina/versiones", reg.Token, nil)
	var historial []versionResponse
	_ = json.Unmarshal(histRec.Body.Bytes(), &historial)
	if len(historial) != 1 {
		t.Fatalf("len(historial) tras restaurar = %d, esperaba 1 (restaurar no publica)", len(historial))
	}
}

func TestRestaurarVersionPaginaPublica_VersionInexistenteDevuelve404(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Yago", Email: "pagina-restaurar2@example.com", Password: "password123456", NombreClinica: "Clínica Yago",
	})

	rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/versiones/1/restaurar", reg.Token, map[string]any{"revision": 0})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

func TestRestaurarVersionPaginaPublica_RevisionDesactualizadaResponde409(t *testing.T) {
	router, gdb := newTestRouter(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Zoe", Email: "pagina-restaurar3@example.com", Password: "password123456", NombreClinica: "Clínica Zoe",
	})

	if rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/publicar", reg.Token, nil); rec.Code != http.StatusOK {
		t.Fatalf("no se pudo publicar: status=%d body=%s", rec.Code, rec.Body.String())
	}

	rec := doJSONAuth(t, router, http.MethodPost, "/panel/pagina/versiones/1/restaurar", reg.Token, map[string]any{"revision": 99})
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, esperaba %d. body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}
}

func TestPublicarPaginaPublica_HistorialYRestaurarRequierenAutenticacion(t *testing.T) {
	router, _ := newTestRouter(t)

	if rec := doJSON(t, router, http.MethodGet, "/panel/pagina/versiones", nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("historial: status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
	if rec := doJSON(t, router, http.MethodPost, "/panel/pagina/versiones/1/restaurar", nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("restaurar: status = %d, esperaba %d", rec.Code, http.StatusUnauthorized)
	}
}
