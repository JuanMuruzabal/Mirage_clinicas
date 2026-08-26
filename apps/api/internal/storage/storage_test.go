package storage_test

import (
	"context"
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
