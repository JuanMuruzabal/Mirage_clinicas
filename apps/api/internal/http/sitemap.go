package http

import (
	"net/http"
	"time"

	"gorm.io/gorm"
)

// topeSitemap — un sitemap.xml admite hasta 50.000 URLs; pasado eso hay que
// partirlo en varios (generateSitemaps en la web). Con clínicas de Córdoba
// falta mucho: el tope está para que el endpoint, público y sin sesión,
// nunca devuelva una lista sin cota.
const topeSitemap = 50000

type clinicaDelSitemap struct {
	Slug          string `json:"slug"`
	ActualizadaEn string `json:"actualizadaEn"`
}

// sitemapClinicasHandler — GET /sitemap/clinicas (PE-9): las páginas que un
// buscador puede indexar, con la fecha de su última publicación para el
// <lastmod>. Entra una clínica con al menos una versión publicada y la
// página NO oculta: una en preparación o en mantenimiento no tiene nada que
// indexar (y la web la marca `noindex` por el mismo motivo).
//
// No devuelve nada que la página pública no muestre ya: slug y fecha.
func sitemapClinicasHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		var filas []struct {
			Slug          string
			ActualizadaEn time.Time
		}
		err := gdb.Table("clinics c").
			Select("c.slug AS slug, MAX(v.publicada_en) AS actualizada_en").
			Joins("JOIN paginas_publicas pp ON pp.clinic_id = c.id AND pp.oculta = false").
			Joins("JOIN pagina_publica_versiones v ON v.pagina_publica_id = pp.id").
			Group("c.slug").
			Order("c.slug").
			Limit(topeSitemap).
			Scan(&filas).Error
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo armar el sitemap")
			return
		}
		out := make([]clinicaDelSitemap, len(filas))
		for i, f := range filas {
			out[i] = clinicaDelSitemap{Slug: f.Slug, ActualizadaEn: f.ActualizadaEn.UTC().Format(time.RFC3339)}
		}
		writeJSON(w, http.StatusOK, out)
	}
}
