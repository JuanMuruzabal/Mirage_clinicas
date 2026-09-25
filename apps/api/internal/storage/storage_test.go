package storage_test

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dental-mirage/api/internal/storage"
)

func TestLocalStorage_SaveEscribeElArchivoYDevuelveLaURLPublica(t *testing.T) {
	dir := t.TempDir()
	s, err := storage.NewLocalStorage(dir, "http://localhost:8080/uploads")
	if err != nil {
		t.Fatalf("NewLocalStorage error inesperado: %v", err)
	}

	url, err := s.Save(context.Background(), "foto.jpg", strings.NewReader("contenido de prueba"))
	if err != nil {
		t.Fatalf("Save error inesperado: %v", err)
	}
	if url != "http://localhost:8080/uploads/foto.jpg" {
		t.Errorf("url = %q, esperaba .../uploads/foto.jpg", url)
	}

	contenido, err := os.ReadFile(filepath.Join(dir, "foto.jpg"))
	if err != nil {
		t.Fatalf("no se pudo leer el archivo guardado: %v", err)
	}
	if string(contenido) != "contenido de prueba" {
		t.Errorf("contenido = %q, esperaba %q", contenido, "contenido de prueba")
	}
}

// TestLocalStorage_SaveIgnoraElPathDelNombre — filename nunca debe poder
// escapar el directorio de storage (path traversal): solo se usa el base
// name.
func TestLocalStorage_SaveIgnoraElPathDelNombre(t *testing.T) {
	dir := t.TempDir()
	s, err := storage.NewLocalStorage(dir, "http://localhost:8080/uploads")
	if err != nil {
		t.Fatalf("NewLocalStorage error inesperado: %v", err)
	}

	url, err := s.Save(context.Background(), "../../etc/passwd", strings.NewReader("x"))
	if err != nil {
		t.Fatalf("Save error inesperado: %v", err)
	}
	if url != "http://localhost:8080/uploads/passwd" {
		t.Errorf("url = %q, esperaba que se recortara a solo el base name", url)
	}
	if _, err := os.Stat(filepath.Join(dir, "passwd")); err != nil {
		t.Errorf("el archivo debería haberse guardado dentro de dir, con el base name: %v", err)
	}
}

func TestNewLocalStorage_CreaElDirectorioSiNoExiste(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "subdir-nuevo")
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("el directorio de prueba no debería existir todavía")
	}

	if _, err := storage.NewLocalStorage(dir, "http://localhost:8080/uploads"); err != nil {
		t.Fatalf("NewLocalStorage error inesperado: %v", err)
	}
	if _, err := os.Stat(dir); err != nil {
		t.Errorf("NewLocalStorage debería haber creado el directorio: %v", err)
	}
}

func TestNewLocalStorage_RecortaLaBarraFinalDePublicURLBase(t *testing.T) {
	dir := t.TempDir()
	s, err := storage.NewLocalStorage(dir, "http://localhost:8080/uploads/")
	if err != nil {
		t.Fatalf("NewLocalStorage error inesperado: %v", err)
	}

	url, err := s.Save(context.Background(), "x.jpg", strings.NewReader("x"))
	if err != nil {
		t.Fatalf("Save error inesperado: %v", err)
	}
	if url != "http://localhost:8080/uploads/x.jpg" {
		t.Errorf("url = %q, esperaba una sola barra entre el base y el nombre", url)
	}
}

func TestLocalStorage_OpenLeeLoGuardadoYDistingueElInexistente(t *testing.T) {
	s, err := storage.NewLocalStorage(t.TempDir(), "/uploads")
	if err != nil {
		t.Fatalf("NewLocalStorage error inesperado: %v", err)
	}
	if _, err := s.Save(context.Background(), "tok.webp", strings.NewReader("abc")); err != nil {
		t.Fatalf("Save error inesperado: %v", err)
	}

	contenido, largo, err := s.Open(context.Background(), "tok.webp")
	if err != nil {
		t.Fatalf("Open error inesperado: %v", err)
	}
	defer func() { _ = contenido.Close() }()
	datos, _ := io.ReadAll(contenido)
	if string(datos) != "abc" || largo != 3 {
		t.Errorf("Open = %q (largo %d), esperaba %q (3)", datos, largo, "abc")
	}

	if _, _, err := s.Open(context.Background(), "otro.webp"); !errors.Is(err, storage.ErrNoExiste) {
		t.Errorf("inexistente: err = %v, esperaba ErrNoExiste", err)
	}
	// Tampoco sale del directorio con un nombre armado.
	otro, _, err := s.Open(context.Background(), "../tok.webp")
	if err != nil {
		t.Fatalf("../tok.webp debería recortarse al base name y encontrarse: %v", err)
	}
	_ = otro.Close()
}

// TestNombreValido — el mismo patrón que la ruta /uploads de la web
// (NOMBRE_DE_ARCHIVO en apps/web/src/app/uploads/[...path]/route.ts).
func TestNombreValido(t *testing.T) {
	for nombre, esperado := range map[string]bool{
		"abc_DEF-123.jpg":                 true,
		"abc.png":                         true,
		"abc.w480.webp":                   true,
		"abc.w1600.webp":                  true,
		"abc.w96.webp":                    false,
		"abc.svg":                         false,
		"abc.jpeg":                        false,
		"../abc.jpg":                      false,
		"sub/abc.jpg":                     false,
		"abc.jpg\n":                       false,
		".jpg":                            false,
		strings.Repeat("a", 129) + ".jpg": false,
	} {
		if got := storage.NombreValido(nombre); got != esperado {
			t.Errorf("NombreValido(%q) = %v, esperaba %v", nombre, got, esperado)
		}
	}
}

func TestContentTypeDe(t *testing.T) {
	for nombre, esperado := range map[string]string{
		"a.jpg":       "image/jpeg",
		"a.png":       "image/png",
		"a.w960.webp": "image/webp",
		"a.exe":       "application/octet-stream",
	} {
		if got := storage.ContentTypeDe(nombre); got != esperado {
			t.Errorf("ContentTypeDe(%q) = %q, esperaba %q", nombre, got, esperado)
		}
	}
}
