# Fase 3.1.1 — la IP real del visitante

**Fecha:** 2026-09-12 · **Decisión:** `docs/Arquitectura y base/tradeoffs.md` TR-134 · **Código:** `apps/api/internal/http/ip_del_visitante.go`, `apps/web/src/lib/api.ts`

Una fase corta que arregla un defecto de fondo: **el backend nunca supo quién le estaba hablando.**

---

## Cómo apareció

Durante el QA de la Fase 3.1 desapareció una ficha de paciente ("josefin") mientras se probaba el wizard. La explicación estaba en el log de la API:

```
[simulado] rotación por IP detectada: ip=172.22.0.4 mails=4 dnis=4
(turnos anteriores borrados de verdad; la IP NO quedó bloqueada)
```

El detector de rotación por IP había hecho su trabajo: cuatro mails y cuatro DNIs distintos en media hora desde la misma IP es el patrón de alguien fabricando identidades, así que borró los turnos sin verificar de esa ventana. Sin turnos, la ficha quedó sin nada que la sostuviera y el barrido se la llevó.

El problema es qué era `172.22.0.4`: **el contenedor `web`**. No un atacante — el propio frontend.

## El defecto

`clientIP()` toma el último valor de `X-Forwarded-For`, y eso es correcto **con exactamente un proxy de confianza adelante** (TR-121): el cliente puede escribir los valores que quiera, pero el último lo agrega el proxy y no se puede falsificar.

Esa premisa no se cumple para nada de lo que pasa por el frontend. `apps/web/src/lib/api.ts` es `server-only` y el navegador **nunca** llama a la API Go directo — todo va por Server Actions (CLAUDE.md, "BFF con Server Actions"). Entonces quien abre la conexión con la API no es el paciente: es el proceso web. Y su IP es la misma para todos los visitantes de todas las clínicas, siempre.

Los 14 lugares que preguntan por la IP estaban midiendo eso:

| Quién pregunta | Qué creía medir | Qué medía |
|---|---|---|
| Rate-limiting por IP de auth | intentos de login de una persona | intentos de **todo el mundo** junto |
| Detector de rotación por IP | un atacante rotando identidades | **todos los pacientes** de todas las clínicas |
| Detector de mail con muchos DNIs | (usa mail, no IP) | — |
| Auditoría y logs | desde dónde se hizo cada cosa | siempre la misma IP |

El de rotación era el más dañino porque **borra datos**: cuatro pacientes distintos sacando turno la misma tarde alcanzaban para que perdieran sus turnos. No es un escenario raro para una clínica.

**Lo que enseña este bug:** un control de seguridad puede estar perfectamente implementado y aun así no proteger nada, si el dato que mide no es el que cree estar midiendo. El código del detector nunca estuvo mal. Lo que estaba mal era su entrada.

## La solución, y por qué necesita un secreto

El BFF **sí** conoce la IP del visitante: le llega en `X-Forwarded-For` del proxy de Render. Solo hay que pasarla.

El obstáculo es que **esta API es un servicio público** (`render.yaml`: `type: web`, con URL propia en `onrender.com`). Una cabecera `X-Prisma-Client-IP` que se creyera sin más sería un regalo para cualquiera: mandás la IP que quieras y quedás fuera del alcance del rate-limiting y de los detectores. El arreglo se convertiría en el agujero.

Por eso la IP viaja acompañada de un **secreto compartido** (`X-Prisma-Bff-Auth`), y la API la acepta solo si coincide:

```go
if subtle.ConstantTimeCompare([]byte(recibido), []byte(secretoCompartido)) != 1 {
    return ""
}
```

La comparación va en tiempo constante: comparar secretos con `==` filtra, por cuánto tarda en fallar, cuántos caracteres iniciales acertó quien está probando.

Y la IP se valida con `net.ParseIP` aunque venga del BFF — es la **clave** con la que los rate limiters cuentan, así que no puede ser un string arbitrario.

## La decisión de diseño que evitó tocar 14 lugares

La forma obvia sería exponer una función nueva (`ipRealDelVisitante(r)`) y cambiar los 14 call sites. Eso deja una trampa permanente: el día que alguien agregue el lugar 15 y use `clientIP()` por costumbre, el bug vuelve en silencio.

En vez de eso, un **middleware reescribe `X-Forwarded-For`** con la IP ya validada:

```go
r.Header.Set("X-Forwarded-For", ip)
```

Todo lo que ya preguntaba por la IP sigue preguntando igual y empieza a recibir la correcta — rate limiters, detectores, auditoría y logs incluidos. `clientIP()` no cambió ni una línea, y la lógica de TR-121 queda intacta: sigue habiendo un único valor de confianza al final de la cabecera.

Dos detalles del middleware:

- **Corre antes del logger**, para que la línea de log diga la IP real. El orden en `NewRouterWithDeps` es `RequestID → IP del BFF → logger`.
- **Borra las cabeceras siempre**, con secreto válido o sin él. De ahí para adentro no existen: ningún handler puede leerlas sin pasar por la validación.

## Qué pasa si el secreto falta

Nada se rompe: la cabecera se descarta y el sistema se comporta exactamente como antes de esta fase.

Esa es la dirección correcta del error. Agrupar de más —varios visitantes bajo una IP, molesto pero seguro— es preferible a dejar que alguien elija la suya y evada todos los controles.

El proceso **avisa con un `WARN` al arrancar** si falta fuera de `development`, pero no frena el arranque. Es distinto de `JWT_SECRET` (TR-125, que sí es fatal): allá la ausencia vuelve el sistema **inseguro**; acá solo lo vuelve **ciego**. Un deploy no debería caerse por eso.

## Alternativas descartadas

**Que el BFF agregue la IP a `X-Forwarded-For`.** Sería lo más natural, y no funciona: el proxy de Render agrega *después* la IP de origen del servicio web, así que el último valor —el que `clientIP()` lee— volvería a ser el equivocado. Justamente lo que queríamos evitar.

**Hacer la API un servicio privado de Render.** Es la solución más limpia a nivel topología: sin URL pública no hay quién falsifique cabeceras, y el secreto sobra. Se descartó porque cambia el plan de hosting y deja la API sin URL para debug. Queda anotada como el camino natural si algún día se paga un plan con servicios privados.

**Firmar la IP con HMAC y timestamp.** Más ceremonia sin ganancia: el canal es HTTPS y el secreto no viaja a terceros.

## Lo que esto NO arregla

En **desarrollo local** el navegador le pega derecho a Next, sin proxy que ponga `X-Forwarded-For`. No hay IP que propagar, así que todos los visitantes siguen compartiendo una. Para probar el wizard con varios pacientes en local, el techo de 4 mails o 4 DNIs en 30 minutos sigue vigente — igual que antes de esta fase.

## Configuración

| Dónde | Variable | Valor |
|---|---|---|
| `apps/api` | `BFF_SHARED_SECRET` | el mismo que el del web |
| `apps/web` | `BFF_SHARED_SECRET` | el mismo que el de la API |
| `docker-compose.yml` | ambos | `dev-bff-secret` por default |
| `render.yaml` | api | `generateValue: true` |
| `render.yaml` | web | `fromService` apuntando al de la api |

En Render **no hay nada que cargar a mano**: la API genera el valor y el web lo lee de ella. Un solo valor, imposible de desincronizar. Si por algún motivo no coincidieran, la API ignora la cabecera en silencio y el único rastro es el `WARN` de arranque.

## Verificación

**Backend (6 tests).** Que la IP se usa con el secreto correcto. Que **no** se cree con secreto equivocado, sin secreto en la request, sin secreto configurado en la API, o con una IP que no parsea. Que el tráfico sin cabeceras se comporta igual que antes (último valor de `X-Forwarded-For`). Y el que de verdad importa: que un turno pedido con las cabeceras queda guardado con la IP del visitante en `turnos.ip_contacto` — el dato exacto que alimenta al detector de rotación.

Ese último se validó con **control negativo**: desconectando el middleware del router a mano, falla con el mensaje correcto. Un test de integración que no se ve fallar no prueba que la pieza esté conectada.

**Frontend (5 tests).** Manda IP y secreto cuando corresponde. Toma el **último** valor de `x-forwarded-for`, no el primero (mismo criterio que TR-121). No manda nada sin secreto configurado ni sin cabecera. Y sobrevive a que `headers()` falle fuera de un contexto de request, sin tumbar el pedido.

**Contra el contenedor real**, que es donde esto se puede romper de verdad:

```
$ curl -H "X-Prisma-Bff-Auth: dev-bff-secret" -H "X-Prisma-Client-IP: 201.235.14.7" .../health
→ ip=201.235.14.7

$ curl -H "X-Prisma-Bff-Auth: me-lo-invente"  -H "X-Prisma-Client-IP: 8.8.8.8" .../health
→ ip=172.22.0.1
```

Con el secreto correcto el log toma la IP declarada; con uno inválido, la IP real de la conexión.
