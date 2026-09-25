package http

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"path"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"dental-mirage/api/internal/storage"
)

func routerDeUploads(store storage.Storage) http.Handler {
	r := chi.NewRouter()
	r.Get("/uploads/{nombre}", servirArchivoSubidoHandler(store))
	return r
}

// TestServirArchivoSubido_DevuelveLaFotoConSusCabeceras — TR-167: el tipo
// sale de la extensión y la respuesta se puede cachear para siempre.
func TestServirArchivoSubido_DevuelveLaFotoConSusCabeceras(t *testing.T) {
	store, err := storage.NewLocalStorage(t.TempDir(), "/uploads")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Save(context.Background(), "abc_DEF-1.w960.webp", strings.NewReader("webp")); err != nil {
		t.Fatal(err)
	}

	rec := httptest.NewRecorder()
	routerDeUploads(store).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/uploads/abc_DEF-1.w960.webp", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperaba 200", rec.Code)
	}
	if rec.Body.String() != "webp" {
		t.Errorf("body = %q", rec.Body.String())
	}
	for cabecera, esperado := range map[string]string{
		"Content-Type":           "image/webp",
		"Content-Length":         "4",
		"X-Content-Type-Options": "nosniff",
		"Cache-Control":          "public, max-age=31536000, immutable",
	} {
		if got := rec.Header().Get(cabecera); got != esperado {
			t.Errorf("%s = %q, esperaba %q", cabecera, got, esperado)
		}
	}
}

// TestServirArchivoSubido_SoloNombresDeFotos — un nombre que no tiene la
// forma de un archivo subido es 404 sin preguntarle nada al storage: la
// ruta no puede servir otra cosa que fotos.
func TestServirArchivoSubido_SoloNombresDeFotos(t *testing.T) {
	store := &storageQueAnota{}
	router := routerDeUploads(store)
	for _, nombre := range []string{"passwd", "abc.svg", "abc.html", "abc.w96.webp", "..%2Fabc.jpg", "abc.jpg.exe"} {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/uploads/"+nombre, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("%q: status = %d, esperaba 404", nombre, rec.Code)
		}
	}
	if len(store.abiertos) > 0 {
		t.Errorf("el storage no debería haberse consultado, abrió %v", store.abiertos)
	}
}

func TestServirArchivoSubido_Inexistente404YErrorDelStorage502(t *testing.T) {
	store, err := storage.NewLocalStorage(t.TempDir(), "/uploads")
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	routerDeUploads(store).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/uploads/noexiste.jpg", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("inexistente: status = %d, esperaba 404", rec.Code)
	}

	rec = httptest.NewRecorder()
	routerDeUploads(&storageQueAnota{err: errors.New("R2 caído")}).
		ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/uploads/abc.jpg", nil))
	if rec.Code != http.StatusBadGateway {
		t.Errorf("storage caído: status = %d, esperaba 502", rec.Code)
	}
}

// TestSubirYServirFoto_DePuntaAPunta — lo que sube POST /panel/pagina/fotos
// es lo que después sirve GET /uploads, por el mismo router.
func TestSubirYServirFoto_DePuntaAPunta(t *testing.T) {
	router, gdb := newTestRouterWithStorage(t)
	reg := registrarProfesionalDePrueba(t, gdb, router, altaDePruebaInput{
		Nombre: "Lucas", Email: "uploads-punta@example.com", Password: "password123456", NombreClinica: "Clínica Lucas",
	})
	rec := subirFotoDePrueba(t, router, reg.Token, "image/png", pngDePrueba(t, 600, 300))
	if rec.Code != http.StatusOK {
		t.Fatalf("subida: status = %d. body=%s", rec.Code, rec.Body.String())
	}
	var subida subirFotoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &subida); err != nil {
		t.Fatalf("respuesta no es JSON válido: %v", err)
	}

	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/uploads/"+path.Base(subida.URL), nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET %s: status = %d", subida.URL, rec.Code)
	}
	if rec.Body.Len() == 0 || !strings.HasPrefix(rec.Header().Get("Content-Type"), "image/") {
		t.Errorf("respuesta vacía o de tipo %q", rec.Header().Get("Content-Type"))
	}
}

// storageQueAnota — un Storage que registra qué le pidieron abrir y
// responde siempre con err (o ErrNoExiste).
type storageQueAnota struct {
	abiertos []string
	err      error
}

func (s *storageQueAnota) Save(context.Context, string, io.Reader) (string, error) {
	return "", errors.New("no implementado")
}

func (s *storageQueAnota) Open(_ context.Context, nombre string) (io.ReadCloser, int64, error) {
	s.abiertos = append(s.abiertos, nombre)
	if s.err != nil {
		return nil, 0, s.err
	}
	return nil, 0, storage.ErrNoExiste
}
