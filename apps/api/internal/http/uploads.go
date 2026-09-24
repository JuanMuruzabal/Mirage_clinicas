package http

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"dental-mirage/api/internal/storage"
)

// servirArchivoSubidoHandler — GET /uploads/{nombre}: devuelve una foto
// subida, la tenga el disco (dev) o R2 (prod, TR-167). Quien la pide es la
// ruta /uploads de la web (apps/web/src/app/uploads), no el navegador.
//
// Solo acepta la forma exacta de un nombre subido (storage.NombreValido):
// cualquier otra cosa es 404 sin llegar al storage, y así esta ruta no puede
// leer nada que no sea una foto. El Content-Type sale de la extensión, no de
// lo que diga el storage.
func servirArchivoSubidoHandler(store storage.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		nombre := chi.URLParam(r, "nombre")
		if !storage.NombreValido(nombre) {
			http.NotFound(w, r)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		contenido, largo, err := store.Open(ctx, nombre)
		if errors.Is(err, storage.ErrNoExiste) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			slog.Error("no se pudo leer un archivo subido", "error", err)
			writeError(w, http.StatusBadGateway, "no se pudo leer el archivo")
			return
		}
		defer func() { _ = contenido.Close() }()

		h := w.Header()
		h.Set("Content-Type", storage.ContentTypeDe(nombre))
		h.Set("X-Content-Type-Options", "nosniff")
		// El nombre es un token aleatorio y el contenido no cambia nunca.
		h.Set("Cache-Control", "public, max-age=31536000, immutable")
		if largo >= 0 {
			h.Set("Content-Length", strconv.FormatInt(largo, 10))
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.Copy(w, contenido)
	}
}
