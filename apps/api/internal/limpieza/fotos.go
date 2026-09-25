// Package limpieza — tareas de mantenimiento que corren solas dentro del
// proceso de la API, como la purga de basura de auth (cmd/api/main.go).
//
// FotosHuerfanas (PP-7, H22): el editor de la página pública sube una foto
// en cuanto se elige, antes de guardar el borrador. Si después se descarta el
// borrador, se reemplaza la foto o se quita el módulo, el archivo queda en el
// storage sin que nada lo use. Una vez por día se borran los que no usa el
// borrador de ninguna página NI ninguna versión publicada (restaurar una
// versión vieja tiene que traer sus fotos), y que tienen más de 24 h —
// decisión de Juan, 2026-09-25. El historial no se acota.
package limpieza

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"gorm.io/gorm"

	"dental-mirage/api/internal/storage"
)

// GraciaFotos — un archivo más nuevo que esto no se borra aunque nadie lo
// use todavía: puede ser la foto que alguien acaba de subir y está por
// guardar con el borrador.
const GraciaFotos = 24 * time.Hour

// candadoFotos — la clave del advisory lock de Postgres que evita que dos
// instancias de la API limpien a la vez. Un número fijo cualquiera, distinto
// del de RunMigrations.
const candadoFotos = 7_224_022

// Una referencia a una foto subida en cualquier texto (una URL guardada, o un
// jsonb pasado a texto): /uploads/<token>, con o sin la variante .wNNN. Del
// mismo patrón que storage.NombreValido.
var referencia = regexp.MustCompile(`/uploads/([A-Za-z0-9_-]{1,128})(?:\.w\d{3,4})?\.(?:jpg|png|webp)`)

// Resultado — para el log.
type Resultado struct {
	Revisadas int
	Borradas  int
	// SinCandado: otra instancia está limpiando; esta no hizo nada.
	SinCandado bool
}

// tokenDe — el nombre sin la variante ni la extensión: "abc.w480.webp" y
// "abc.webp" son la misma foto (PE-9 guarda las variantes y referencia la
// más grande), así que se conservan o se borran juntas.
func tokenDe(nombre string) string {
	if i := strings.IndexByte(nombre, '.'); i >= 0 {
		return nombre[:i]
	}
	return nombre
}

// FotosHuerfanas — ver el comentario del paquete. El orden importa: primero
// se lista el storage y DESPUÉS se leen las referencias, así una foto que se
// sube y se guarda en el medio o no está en la lista, o ya está referenciada.
// La gracia de 24 h cubre la que se subió y todavía no se guardó.
func FotosHuerfanas(ctx context.Context, gdb *gorm.DB, store storage.Limpiable, ahora time.Time) (Resultado, error) {
	var res Resultado
	err := gdb.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tengo bool
		if err := tx.Raw("SELECT pg_try_advisory_xact_lock(?)", candadoFotos).Scan(&tengo).Error; err != nil {
			return fmt.Errorf("pidiendo el candado: %w", err)
		}
		if !tengo {
			res.SinCandado = true
			return nil
		}

		archivos, err := store.List(ctx)
		if err != nil {
			return err
		}
		res.Revisadas = len(archivos)
		if len(archivos) == 0 {
			return nil
		}

		// Todo lugar donde puede estar la URL de una foto subida: la portada
		// y los módulos del borrador, cada versión publicada (su foto jsonb
		// trae portada y módulos) y la foto de perfil (hoy no se sube, pero
		// si algún día se sube por el mismo storage, ya está cubierta).
		var textos []string
		if err := tx.Raw(`
			SELECT foto_portada_url FROM paginas_publicas WHERE foto_portada_url IS NOT NULL
			UNION ALL SELECT config::text FROM pagina_publica_modulos WHERE config IS NOT NULL
			UNION ALL SELECT contenido::text FROM pagina_publica_versiones WHERE contenido IS NOT NULL
			UNION ALL SELECT foto_url FROM professional_profiles WHERE foto_url IS NOT NULL`).Scan(&textos).Error; err != nil {
			return fmt.Errorf("leyendo las fotos en uso: %w", err)
		}
		enUso := map[string]bool{}
		for _, t := range textos {
			for _, m := range referencia.FindAllStringSubmatch(t, -1) {
				enUso[m[1]] = true
			}
		}

		for _, a := range archivos {
			if !storage.NombreValido(a.Nombre) || enUso[tokenDe(a.Nombre)] || ahora.Sub(a.Modificado) < GraciaFotos {
				continue
			}
			if err := store.Delete(ctx, a.Nombre); err != nil {
				return err
			}
			res.Borradas++
		}
		return nil
	})
	return res, err
}
