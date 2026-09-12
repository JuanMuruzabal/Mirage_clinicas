package http

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
)

// Fase 3.1.1 — la IP real del visitante.
//
// EL PROBLEMA. `clientIP()` (auth.go) toma el último valor de
// `X-Forwarded-For`, que con exactamente un proxy de confianza adelante es
// la IP real de quien pidió (TR-121). Esa premisa NO se cumple para nada
// de lo que pasa por el frontend: `apps/web/src/lib/api.ts` es
// `server-only` y el navegador nunca llama a esta API directo (CLAUDE.md,
// "BFF con Server Actions"), así que cada pedido del wizard público llega
// con la IP del PROCESO WEB, la misma para todos los visitantes de todas
// las clínicas.
//
// Las consecuencias no eran teóricas: el detector de rotación por IP
// (`bloquearIPPorRotacionYBorrarTurnos`) dispara con 4 mails o 4 DNIs
// distintos en 30 minutos desde "una misma IP", y borra los turnos sin
// verificar de esa ventana. Con todos los visitantes bajo una sola IP,
// cuatro pacientes distintos sacando turno la misma tarde alcanzaban para
// que perdieran sus turnos. Se detectó en QA (2026-09-12) cuando pasó
// exactamente eso en desarrollo. El mismo defecto afecta al rate-limiting
// por IP de auth y a lo que queda registrado en la auditoría.
//
// LA SOLUCIÓN, Y POR QUÉ NECESITA UN SECRETO. El BFF sí conoce la IP del
// visitante y la manda en `X-Prisma-Client-IP`. Pero esta API es un
// servicio PÚBLICO (render.yaml: `type: web`), así que cualquiera puede
// pegarle directo — y una cabecera que se cree sin más sería un regalo:
// mandás la IP que quieras y quedás fuera del alcance del rate-limiting y
// de los tres detectores de abuso del wizard. Por eso el BFF acompaña la
// IP con un secreto compartido (`X-Prisma-Bff-Auth`), y este middleware la
// acepta SOLO si ese secreto coincide.
//
// DÓNDE ESCRIBE EL RESULTADO. En vez de exponer una función nueva que los
// 14 call sites de `clientIP()` tendrían que recordar usar, el middleware
// reescribe `X-Forwarded-For` con la IP del visitante. Todo lo que ya
// preguntaba por la IP sigue preguntando igual y empieza a recibir la
// correcta — rate limiters, detectores, auditoría y logs incluidos. Es
// también lo que mantiene intacta la lógica de TR-121: sigue habiendo un
// único valor de confianza al final de la cabecera.
//
// SIN SECRETO CONFIGURADO no hace nada: la cabecera se descarta y el
// sistema se comporta igual que antes de esta fase. Es lo que corresponde
// — preferimos agrupar de más (varios visitantes bajo una IP) antes que
// dejar que alguien elija la suya.
const (
	headerIPDelVisitante = "X-Prisma-Client-IP"
	headerAuthDelBFF     = "X-Prisma-Bff-Auth"
)

// confiarEnIPDelBFF devuelve el middleware descripto arriba. Con
// `secretoCompartido` vacío devuelve uno que solo limpia las cabeceras:
// nunca hay que dejar pasar hacia adentro una IP que no se validó, aunque
// hoy nadie la lea.
func confiarEnIPDelBFF(secretoCompartido string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := ipDelVisitanteSegunElBFF(r, secretoCompartido)

			// Se borran SIEMPRE, con secreto válido o sin él: de acá para
			// adentro estas cabeceras no existen, así que ningún handler
			// puede confundirse y leerlas sin pasar por esta validación.
			r.Header.Del(headerIPDelVisitante)
			r.Header.Del(headerAuthDelBFF)

			if ip != "" {
				// Un único valor, que es el que clientIP() va a tomar por
				// ser el último. Se reemplaza en vez de agregar: lo que
				// venía era la cadena de proxies hasta el BFF, y su último
				// eslabón es justamente la IP equivocada que motivó todo
				// esto.
				r.Header.Set("X-Forwarded-For", ip)
			}

			next.ServeHTTP(w, r)
		})
	}
}

// ipDelVisitanteSegunElBFF valida las dos cabeceras y devuelve la IP, o ""
// si no hay que confiar en ellas.
func ipDelVisitanteSegunElBFF(r *http.Request, secretoCompartido string) string {
	if secretoCompartido == "" {
		return ""
	}
	recibido := r.Header.Get(headerAuthDelBFF)
	if recibido == "" {
		return ""
	}
	// Comparación en tiempo constante — comparar secretos con `==` filtra
	// por cuánto tarda en fallar cuántos caracteres iniciales acertó quien
	// prueba.
	if subtle.ConstantTimeCompare([]byte(recibido), []byte(secretoCompartido)) != 1 {
		return ""
	}

	ip := strings.TrimSpace(r.Header.Get(headerIPDelVisitante))
	if ip == "" {
		return ""
	}
	// Que venga del BFF no la hace válida: si no parsea como IP, es basura
	// (o un intento de ensuciar la clave de los rate limiters, que usan
	// este string tal cual) y se descarta.
	if net.ParseIP(ip) == nil {
		return ""
	}
	return ip
}
