package http

import (
	"net/http"
	"strconv"

	"gorm.io/gorm"
)

// Paginación de los listados del panel — Fase B de la auditoría
// (docs/Seguridad y optimizacion/radiografia-tecnica_1.md).
//
// `/turnos` y `/pacientes` traían TODAS las filas del profesional en cada
// consulta. Con una clínica de varios años de historial eso crece solo,
// sin que nadie "rompa" nada: un día la tabla tarda segundos en cargar y
// no hay un cambio puntual al que culpar.
//
// La paginación es OPT-IN a propósito: sin `limit` en la query, el
// comportamiento es exactamente el de antes. Eso es lo que mantiene
// intactos a los otros consumidores de estos endpoints —sobre todo el
// calendario, que ya viene acotado por `desde`/`hasta` y necesita el
// rango visible COMPLETO para pintarlo bien (paginarlo silenciosamente
// le escondería turnos)— mientras las vistas de lista, que son las que
// crecen sin techo, piden su página explícitamente.
//
// UX elegida por el cliente (2026-09-08): "Cargar más" en vez de páginas
// numeradas. El panel ya tiene filtros fuertes (HOY/SEMANA/MES,
// Desde/Hasta, tipo de consulta, estado, buscador), así que el caso "ir a
// la página 7" es raro — casi siempre se filtra. Por eso alcanza con
// `limit`/`offset` y el total, sin cursores: el frontend pide la
// siguiente tanda con el offset corrido.

const (
	// paginacionLimiteMax — techo defensivo. Un `limit` más grande que
	// esto se recorta en silencio: el punto de paginar es que ninguna
	// consulta pueda pedir la tabla entera, y un cliente (o alguien
	// probando la API a mano) no debería poder saltearse eso pidiendo
	// limit=999999.
	paginacionLimiteMax = 200

	// headerTotal — el total de filas que matchean los filtros, ANTES de
	// aplicar limit/offset. Va en un header y no en el body a propósito:
	// así la respuesta sigue siendo el mismo array JSON de siempre y
	// ningún consumidor existente se rompe.
	headerTotal = "X-Total-Count"
)

// paginacionDeRequest lee `limit`/`offset` de la query. `aplicar` es false
// cuando no vino `limit` — ahí el caller devuelve todo, como siempre.
// Valores inválidos (no numéricos, negativos) se tratan como "no
// paginar" en vez de como un error: son un cliente mal escrito, no algo
// que deba tumbar una pantalla del panel.
func paginacionDeRequest(r *http.Request) (limit, offset int, aplicar bool) {
	limitStr := r.URL.Query().Get("limit")
	if limitStr == "" {
		return 0, 0, false
	}
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		return 0, 0, false
	}
	if limit > paginacionLimiteMax {
		limit = paginacionLimiteMax
	}

	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o > 0 {
			offset = o
		}
	}
	return limit, offset, true
}

// aplicarPaginacion cuenta el total con los filtros ya aplicados, lo
// escribe en el header, y devuelve la query acotada a la página pedida.
//
// El Count corre sobre una `Session` nueva: sin eso, GORM arrastra las
// condiciones acumuladas y el `Find` posterior se contaminaría con lo que
// dejó el Count.
func aplicarPaginacion(w http.ResponseWriter, query *gorm.DB, modelo any, limit, offset int) (*gorm.DB, error) {
	var total int64
	if err := query.Session(&gorm.Session{}).Model(modelo).Count(&total).Error; err != nil {
		return nil, err
	}
	w.Header().Set(headerTotal, strconv.FormatInt(total, 10))
	return query.Limit(limit).Offset(offset), nil
}
