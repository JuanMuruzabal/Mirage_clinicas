// Package storage guarda archivos subidos por el profesional (hoy: la foto
// de perfil de ProfessionalProfile, spec §4 Paso 2) — patrón dev/prod de
// CLAUDE.md: interfaz + disco local en dev + R2/S3 en prod, inyectada
// desde cmd/api/main.go.
package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Storage guarda un archivo y devuelve la URL pública desde donde se
// sirve. filename debe ser ya único (ver internal/security.NewToken para
// generar un nombre no adivinable) — esta interfaz no decide nombres.
type Storage interface {
	Save(ctx context.Context, filename string, r io.Reader) (url string, err error)
}

// LocalStorage guarda en disco, bajo Dir, y sirve las URLs con el prefijo
// PublicURLBase (un Route Handler /uploads/{filename} en Next.js, o un
// static file server simple, sirve ese directorio en dev — fuera del
// alcance de este paquete).
type LocalStorage struct {
	Dir           string
	PublicURLBase string // ej. "http://localhost:8080/uploads"
}

func NewLocalStorage(dir, publicURLBase string) (*LocalStorage, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("no se pudo crear el directorio de storage local: %w", err)
	}
	return &LocalStorage{Dir: dir, PublicURLBase: strings.TrimSuffix(publicURLBase, "/")}, nil
}

func (s *LocalStorage) Save(_ context.Context, filename string, r io.Reader) (string, error) {
	// filename nunca debe poder escapar Dir (path traversal) — solo se
	// usa el base name, nunca el path tal cual vino.
	safeName := filepath.Base(filename)
	dest := filepath.Join(s.Dir, safeName)

	f, err := os.Create(dest)
	if err != nil {
		return "", fmt.Errorf("no se pudo crear el archivo: %w", err)
	}
	defer func() { _ = f.Close() }()

	if _, err := io.Copy(f, r); err != nil {
		return "", fmt.Errorf("no se pudo escribir el archivo: %w", err)
	}

	return s.PublicURLBase + "/" + safeName, nil
}
