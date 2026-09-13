# Fase 3.1.2 — la topología era otra

**Fecha:** 2026-09-13 · **Decisión:** `docs/Arquitectura y base/tradeoffs.md` TR-136 (corrige TR-121, completa TR-134) · **Continúa:** `fase3.1.1-ip-real-del-visitante.md`

La fase anterior arregló que la API viera la IP del proceso web en vez de la del visitante. Esta descubrió que **el arreglo no alcanzaba**, porque la premisa de la que partía —heredada de TR-121— nunca había sido cierta.

Es la fase más corta de todas y probablemente la que más enseña, porque el error no estuvo en el código sino en el **método**.

---

## Cómo apareció: una pregunta, no un error

Nadie reportó un bug. Revisando si un atacante podía volver a afectar a pacientes legítimos, salió la pregunta:

> *"¿la app tiene Cloudflare, que es el captcha, que es un CDN?"*

La respuesta corta es que **Turnstile no es un CDN**: es un widget que el navegador carga, genera un token, y el backend lo valida server-to-server. Cloudflare nunca intermedia el tráfico de la app.

Pero verificarlo tomó diez segundos y devolvió otra cosa:

```
$ curl -sI https://miragesoftware.online
Server: cloudflare
CF-RAY: a3a32f8b2e938700-EZE
x-render-origin-server: Render
```

Lo mismo en `dental-mirage-api.onrender.com`, que es un dominio **de Render**, no del proyecto. Conclusión: **Render pone Cloudflare delante de todos sus servicios.** Viene incluido.

## La medición que lo cerró

Con eso a la vista, la pregunta pasó a ser qué llega realmente al contenedor. Un `GET /especialidades` desde una IP pública conocida (`190.137.139.220`), y la línea correspondiente del log de Render:

```
ruta=/especialidades status=200 ip=10.29.215.4
```

`10.29.215.4` es una dirección **privada**: el router interno de Render. Ni el visitante, ni Cloudflare.

Eso significa que el "último valor de `X-Forwarded-For`" de TR-121 **nunca fue el visitante en producción**. No es que dejó de funcionar: nunca funcionó. Desde el primer deploy, todo lo que decide por IP —el rate-limiting de auth, los tres detectores de abuso del wizard, la auditoría, los logs— venía agrupando el tráfico entero bajo un puñado de direcciones internas.

Y la Fase 3.1.1, escrita el día anterior, **heredaba el mismo error**: el BFF leía la cadena con el mismo criterio.

## La regla nueva

El problema de la regla vieja era **asumir cuántos saltos hay**. La nueva no asume:

1. **`CF-Connecting-IP`**, que Cloudflare sobrescribe en cada request. No es falsificable mientras el origen solo sea alcanzable a través de él — el caso en Render.
2. Si no está, **la última IP pública** de `X-Forwarded-For`. Sigue valiendo el razonamiento de TR-121 (el cliente solo controla el principio de la cadena), pero saltea los saltos de infraestructura del final.
3. Si no hay ninguna pública —desarrollo, tests, red interna— el último valor tal cual: exactamente el comportamiento anterior, para no cambiar nada donde no hacía falta.

### El límite que no se puede superar, y por qué está en un test

Con la cadena real, la "última IP pública" **no alcanza**:

```
190.137.139.220,  172.71.98.5,  10.29.215.4
    visitante      Cloudflare    Render
```

`172.71.x` es un rango **público** de Cloudflare. Ninguna heurística sobre `X-Forwarded-For` puede distinguirlo del visitante sin conocer de memoria los rangos de Cloudflare.

Por eso `CF-Connecting-IP` no es un lujo sino la fuente principal: sin ella, lo más lejos que se llega es al borde del CDN — mejor que una IP interna, pero todavía compartido por muchos visitantes.

Ese límite está escrito como test (`TestClientIP_CadenaRealDeRender`, que verifica **las dos** ramas) para que nadie lo "simplifique" más adelante creyendo que el fallback alcanza.

## El detalle que casi lo arruina todo

El pedido del BFF a la API **también** viaja por la URL pública. O sea que Cloudflare le pone *su* `CF-Connecting-IP`… con la IP del **proceso web**, que es justo la que la fase anterior vino a corregir.

Como la regla nueva prefiere esa cabecera, le habría ganado a la IP real del visitante y el arreglo no habría servido de nada. El middleware la borra (junto con `True-Client-IP`) cuando aplica la IP que declara el BFF.

Es el tipo de interacción que no se ve leyendo ninguno de los dos archivos por separado.

## Las tres lecturas, en orden

La secuencia completa del mismo campo, a lo largo de dos días:

| Momento | Log | Qué era esa IP |
|---|---|---|
| Antes de todo | `ip=10.29.215.4` | El router interno de Render |
| Con la corrección, sin el secreto cargado | `ip=74.220.48.143 ip_fuente=cf` | La salida del servicio web |
| Cerrado | `ip=190.137.139.220 ip_fuente=bff` | El visitante |

**Las dos primeras son indistinguibles de "funciona" si uno mira solo la IP.** Son direcciones válidas, bien formadas, distintas entre sí. Solo cambiando de pregunta —"¿de dónde salió esta IP?" en vez de "¿qué IP es?"— se vuelven diagnósticas.

De ahí el campo `ip_fuente` (`bff` / `cf` / `xff` / `xff-interna`), que es permanente y no un log temporal de debug.

## Dos errores propios, encontrados por el mismo camino

**El aviso de arranque no avisó.** El WARN de "`BFF_SHARED_SECRET` sin configurar" estaba condicionado a `APP_ENV != development`, y `APP_ENV` vale `development` en Render por decisión (TR-021). O sea que nunca se emitía justo en el entorno donde importaba.

Es **exactamente** el error que TR-135 había corregido para las herramientas de desarrollo —"ningún guard puede basarse en `APP_ENV`"— repetido tres commits después, en el mismo archivo. Saber la regla no alcanzó; hizo falta que el aviso faltara cuando tenía que aparecer.

**La variable nunca se creó.** `render.yaml` la declara con `generateValue` + `fromService`, pero eso solo se aplica si los servicios están conectados al blueprint — y acá se crearon sueltos. El README afirmaba que "no hay nada que cargar a mano": cierto bajo un supuesto que no se cumplía. **Esa afirmación equivocada en la documentación fue lo que hizo perder el rastro**, porque daba por resuelto un paso que nunca ocurrió.

## Lo que hay que llevarse

**TR-121 escribió su propia condición de caducidad** y el error duró meses igual:

> *"Si en algún momento se suma un segundo proxy real delante de Render (un CDN, por ejemplo), esta lógica deja de alcanzar."*

La condición ya se cumplía cuando se escribió esa línea. Faltó una sola cosa: **medir** si se cumplía, en vez de deducir la topología del nombre del proveedor.

Un PaaS no es un servidor con menos trabajo: es un conjunto de capas que uno no eligió, que no siempre están documentadas y que pueden cambiar sin aviso. Lo que llega al contenedor se comprueba con un request; no se infiere.

Es el mismo error de método que ya había aparecido con `APP_ENV` (§17.3 de la radiografía técnica): deducir configuración en vez de leer la fuente. Dos veces el mismo patrón, en dos semanas, sobre dos temas distintos.

## Verificación

**9 tests backend.** La cadena real con y sin `CF-Connecting-IP`; que una cabecera basura o privada ahí no gane; que una cadena sin ninguna IP pública conserve el comportamiento viejo; que la IP del BFF le gane al `CF-Connecting-IP` del propio pedido del BFF; y el par de síntomas de "falta la variable" escrito como test. El test de falsificación de TR-121 **sigue pasando sin cambios**, que era la condición para no haber roto lo que sí protegía.

**1019 tests frontend**, con los casos espejo en el BFF.

**Contra el deploy real**, que es lo único que cuenta acá:

```
ruta=/especialidades   ip=190.137.139.220  ip_fuente=cf    ← request directo
ruta=/clinicas/{slug}  ip=190.137.139.220  ip_fuente=bff   ← a través del BFF
```

Las dos mitades: la API leyendo bien por su cuenta, y el BFF propagando la IP del visitante.
