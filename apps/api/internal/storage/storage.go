// Package storage guarda y sirve las fotos subidas desde el editor de la
// página pública — patrón dev/prod de CLAUDE.md: interfaz + disco local en
// dev (LocalStorage) + Cloudflare R2 en prod (R2Storage, Fase 4.6, TR-167),
// inyectada desde cmd/api/main.go.
//
// Las dos implementaciones devuelven la MISMA URL relativa
// ("/uploads/<nombre>"): el archivo lo sirve la web desde su propio origen
// (apps/web/src/app/uploads), que se lo pide a esta API (GET /uploads/{nombre},
// internal/http/router.go), que lo lee con Open. El bucket de R2 es privado y
// el navegador nunca le habla — ni a la API (BFF) ni a R2.
package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ErrNoExiste — Open no encontró el archivo. El handler lo traduce a 404.
var ErrNoExiste = errors.New("storage: el archivo no existe")

// Storage guarda un archivo y devuelve la URL pública desde donde se sirve,
// y lo vuelve a leer para servirlo. filename debe ser ya único (ver
// internal/security.NewToken para generar un nombre no adivinable) — esta
// interfaz no decide nombres.
type Storage interface {
	Save(ctx context.Context, filename string, r io.Reader) (url string, err error)
	// Open devuelve el contenido y su tamaño en bytes (-1 si no se conoce).
	// Quien llama cierra el ReadCloser. ErrNoExiste si no está.
	Open(ctx context.Context, filename string) (io.ReadCloser, int64, error)
}

// Archivo — lo que devuelve List: el nombre y cuándo se escribió.
type Archivo struct {
	Nombre     string
	Modificado time.Time
}

// Limpiable — un Storage que además se puede recorrer y del que se puede
// borrar (PP-7, H22): lo usa la limpieza diaria de fotos huérfanas
// (internal/limpieza). Aparte de Storage para no obligar a cada fake de
// test a implementarlo; las dos implementaciones reales lo cumplen.
type Limpiable interface {
	Storage
	// List devuelve SOLO los archivos con forma de foto subida
	// (NombreValido): cualquier otra cosa en el directorio o el bucket no es
	// de esta app y no se toca.
	List(ctx context.Context) ([]Archivo, error)
	// Delete borra un archivo. Que ya no exista no es un error.
	Delete(ctx context.Context, nombre string) error
}

// nombreDeArchivo — la ÚNICA forma que tiene un archivo subido:
// <token base64url>.<extensión>, o desde PE-9 <token>.w<ancho>.webp (las
// variantes de internal/imagenes). Es el mismo patrón que valida la ruta
// /uploads de la web (NOMBRE_DE_ARCHIVO en apps/web/src/app/uploads): si
// cambia uno, cambia el otro. Sin barras ni puntos sueltos, así que tampoco
// puede escapar del directorio ni del bucket.
var nombreDeArchivo = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}(\.w\d{3,4})?\.(jpg|png|webp)$`)

var contentTypePorExtension = map[string]string{
	"jpg":  "image/jpeg",
	"png":  "image/png",
	"webp": "image/webp",
}

// NombreValido — ¿nombre tiene la forma de un archivo subido?
func NombreValido(nombre string) bool {
	return nombreDeArchivo.MatchString(nombre)
}

// ContentTypeDe — el tipo MIME según la extensión del nombre (ya validado
// con NombreValido). Sale de la extensión y no del contenido a propósito: el
// archivo se sirve desde el origen de la web, y un tipo que no sea imagen
// serviría contenido activo desde ahí.
func ContentTypeDe(nombre string) string {
	if ct, ok := contentTypePorExtension[strings.TrimPrefix(filepath.Ext(nombre), ".")]; ok {
		return ct
	}
	return "application/octet-stream"
}

// LocalStorage guarda en disco, bajo Dir, y arma las URLs con el prefijo
// PublicURLBase. Solo para desarrollo: el disco de un contenedor de Render
// se pierde en cada deploy (ver buildStorage en cmd/api/main.go).
type LocalStorage struct {
	Dir           string
	PublicURLBase string // ej. "/uploads"
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

func (s *LocalStorage) Open(_ context.Context, filename string) (io.ReadCloser, int64, error) {
	f, err := os.Open(filepath.Join(s.Dir, filepath.Base(filename)))
	if errors.Is(err, os.ErrNotExist) {
		return nil, 0, ErrNoExiste
	}
	if err != nil {
		return nil, 0, fmt.Errorf("no se pudo abrir el archivo: %w", err)
	}
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		_ = f.Close()
		return nil, 0, ErrNoExiste
	}
	return f, info.Size(), nil
}

func (s *LocalStorage) List(_ context.Context) ([]Archivo, error) {
	entradas, err := os.ReadDir(s.Dir)
	if err != nil {
		return nil, fmt.Errorf("no se pudo listar el storage local: %w", err)
	}
	var archivos []Archivo
	for _, e := range entradas {
		if e.IsDir() || !NombreValido(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		archivos = append(archivos, Archivo{Nombre: e.Name(), Modificado: info.ModTime()})
	}
	return archivos, nil
}

func (s *LocalStorage) Delete(_ context.Context, nombre string) error {
	err := os.Remove(filepath.Join(s.Dir, filepath.Base(nombre)))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("no se pudo borrar el archivo: %w", err)
	}
	return nil
}

// Las dos implementaciones reales se pueden limpiar (PP-7, H22).
var (
	_ Limpiable = (*LocalStorage)(nil)
	_ Limpiable = (*R2Storage)(nil)
)
