package http

import (
	"net/http"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/ratelimit"
)

// limitarLecturasPublicas — tope por IP para las lecturas públicas sin
// sesión: buscador, página pública, sitemap y la agenda del wizard
// (radiografía técnica 2, A1, 2026-09-26). Hasta esa fecha tenían tope el
// login, los códigos y "Mis turnos", pero no esto, y algunas lecturas son
// caras: la disponibilidad recorre agendas enteras.
//
// Solo cuenta GET y HEAD: los POST de este mismo grupo (pedir el código,
// confirmar, sacar el turno) ya tienen sus propios topes, más estrictos.
//
// NO cuenta el tráfico sin IP pública ("xff-interna" o "remote": desarrollo
// y tests), porque ahí todos los pedidos comparten la misma IP y el tope
// frenaría a todos juntos. En producción la IP la declara el BFF
// (BFF_SHARED_SECRET, TR-134) o Cloudflare. Igual que los demás límites por
// IP, depende de que ese secreto coincida en los dos servicios: si no
// coincidiera, todos los visitantes llegarían con la IP del servidor web.
// render.yaml lo genera en la API y lo copia a la web (`fromService`), así
// que no se pueden desincronizar a mano.
func limitarLecturasPublicas(limiter *ratelimit.IPLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if limiter == nil || (r.Method != http.MethodGet && r.Method != http.MethodHead) {
				next.ServeHTTP(w, r)
				return
			}
			ip, fuente := clientIPConFuente(r)
			if fuente == "xff-interna" || fuente == "remote" {
				next.ServeHTTP(w, r)
				return
			}
			if !limiter.Allow(db.RateLimitScopeLecturaPublica, ip, ratelimit.LimitLecturaPublicaPerIP) {
				w.Header().Set("Retry-After", "60")
				writeError(w, http.StatusTooManyRequests, "demasiadas consultas seguidas — esperá un minuto y volvé a intentar")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
