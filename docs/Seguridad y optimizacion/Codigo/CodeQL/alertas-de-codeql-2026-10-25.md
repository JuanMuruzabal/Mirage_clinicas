# Alertas de code scanning (CodeQL) en `dev`: ronda del 2026-10-25

**PRISMA · Seguridad y optimización / Código / CodeQL** · TR-199 en `docs/Arquitectura y base/tradeoffs.md`

Cuando la rama por defecto de GitHub pasó a `dev` (2026-10-24), CodeQL empezó a mirar lo que realmente se integra (ver `../../Dependencias/actualizacion-de-dependencias-2026-10.md`, sección 2). Se abrieron 5 alertas sobre **nuestro código**. Al prender el conjunto `security-extended` ese mismo día aparecieron 13 más. Esta es la ronda que las cierra, ítem 4 del plan (el CI y la seguridad del repo, `../../CI/ci-de-seguridad.md`).

**Cómo leer la cuenta:** son **17 alertas de código arregladas** (4 originales + 13 del conjunto `extended`), más **una descartada** (el SHA-1 de HIBP, #7), y una de **Dependabot** que no es de CodeQL (`braces`, #32). Las 5 originales son esas 4 y la del SHA-1.

**Ninguna era explotable en producción.** Se arreglaron igual porque el arreglo era barato y saca ruido de la pestaña de seguridad: una pestaña con alertas "que no importan" entrena a no mirarla.

## Resumen

| Alerta | Dónde | Era explotable | Qué se hizo |
|---|---|---|---|
| `go/incorrect-integer-conversion` | `apps/api/internal/security/password.go` | No | Arreglada: cada parámetro se parsea con su tamaño |
| `go/incorrect-integer-conversion` | `apps/api/internal/documentos/lamina.go` | No | Arreglada: `ParseInt(…, 32)` |
| `js/incomplete-sanitization` | `apps/web/src/lib/api-documentos.test.ts` | No (es un test) | Arreglada: se compara el `pathname` de una URL |
| `js/incomplete-url-substring-sanitization` | `apps/web/src/lib/pagina-publica/tarjeta-compartir.test.ts` | No (es un test) | Arreglada: se compara el `hostname` de una URL |
| `go/weak-sensitive-data-hashing` (#7) | `apps/api/internal/security/pwned.go` | No: falso positivo | **Descartada** con su motivo |
| `braces`, GHSA-vfj7-8cjw-p6xm (#32) | transitiva de `eslint-config-next` | No: aviso retirado | **Descartada** (es de Dependabot) |
| `actions/unpinned-tag` ×4 | `.github/workflows/` | Riesgo de cadena de suministro | Arregladas: actions por SHA |
| `go/log-injection` ×9 | `turno_publico.go`, `mail.go`, `logging.go` | No en producción | Arregladas: `slog` y `X-Request-Id` |

## Las cuatro originales

### `go/incorrect-integer-conversion` en `password.go`

- **Qué detectó CodeQL:** `parseArgon2Params` leía los tres parámetros de un hash (`m`, `t` y `p`) con `strconv.ParseUint(valor, 10, 32)` y después hacía `uint8(n)` para el paralelismo (`p`). Un valor entre 256 y 2³² cabía en el `ParseUint` y se **truncaba en silencio** al `uint8`: `p=257` se leía como `p=1`.
- **Era explotable:** no. Los parámetros salen de un hash que generamos nosotros y guardamos en la base, no de lo que manda un usuario; para alterarlo hace falta acceso a la base, y quien lo tiene ya no necesita esto.
- **Qué se arregló:** cada parámetro se parsea con el tamaño de su campo (`m` y `t` con 32 bits, `p` con 8). Un valor fuera de rango da el mismo error que ya existía, `parámetro de hash inválido`, en vez de un número truncado. Una clave desconocida se sigue validando como número, para no cambiar lo que acepta.
- **Tests:** `password_parametros_test.go` cubre los bordes (`p` en 255, 256 y 257; `m` y `t` en 2³²−1 y 2³²; clave desconocida; valores no numéricos o negativos) y el camino público por `Verify`.

### `go/incorrect-integer-conversion` en `lamina.go`

- **Qué detectó CodeQL:** `strconv.Atoi(clave)` devuelve un `int` de 64 bits, que después se convierte a `rune` (32 bits).
- **Era explotable:** no. Las claves vienen de las métricas de ancho de Helvetica, un JSON fijo embebido en el binario (`go:embed`), que se lee en un `init()`.
- **Qué se arregló:** `strconv.ParseInt(clave, 10, 32)`, con el mismo `panic` si falla.
- **Tests:** no hizo falta uno nuevo. El `init()` del paquete lo ejecuta en cada corrida y la paridad con TypeScript compara las métricas.

### Los dos de los tests

- **`api-documentos.test.ts` (`js/incomplete-sanitization`):** armaba una expresión regular a mano escapando solo las barras de la ruta, y CodeQL con razón dice que escapar a medias es peor que no escapar. Ahora se parsea la URL (`new URL(...)`) y se compara el `pathname` con `endsWith`.
- **`tarjeta-compartir.test.ts` (`js/incomplete-url-substring-sanitization`):** decidía qué mock devolver con `url.startsWith("https://fonts.googleapis.com")`, que también cumple `https://fonts.googleapis.com.evil.com`. Ahora decide por `new URL(url).hostname === "fonts.googleapis.com"`.
- **Explotables:** no, son tests. Lo que verifican no cambió (la suite sigue en 2367 de 2367).

## Las descartadas

### El SHA-1 de HaveIBeenPwned (#7, `go/weak-sensitive-data-hashing`)

- **Qué detectó CodeQL:** `pwned.go` calcula un SHA-1 de la contraseña, y SHA-1 no es un hash apto para contraseñas.
- **Por qué es un falso positivo:** el SHA-1 es el algoritmo que **exige** la API de HaveIBeenPwned. Funciona por k-anonimato: se manda solo el prefijo de 5 caracteres del hash y la API devuelve todos los sufijos que empiezan igual, así que la contraseña ni su hash completo salen del servidor. El hash no se guarda ni se usa para autenticar. **Las contraseñas se guardan con argon2id.** El `//nolint:gosec` del archivo ya lo explicaba; ahora lo explica también el descarte en GitHub.
- **Qué se hizo:** descartada por API con ese motivo.

### `braces` (#32, GHSA-vfj7-8cjw-p6xm)

- **Qué es:** una alerta de **Dependabot**, no de CodeQL; está acá solo para que quede junto a las otras que se descartaron. Llega como transitiva de `eslint-config-next`.
- **Por qué se descartó:** GitHub retiró el aviso, y no tiene versión arreglada. Su detalle y el resto de las dependencias están en `../../Dependencias/actualizacion-de-dependencias-2026-10.md`.

## Las 13 del conjunto `extended`

### `actions/unpinned-tag` ×4

- **Qué detectó:** actions de GitHub usadas por etiqueta (`uses: foo/bar@v4`) y no por el SHA del commit. Una etiqueta se puede mover a otro código: en 2025 la action `tj-actions` comprometida filtró secretos de miles de repos así.
- **Era explotable:** es un riesgo de cadena de suministro, no una falla en el código.
- **Qué se arregló:** **todas** las actions del repo van por SHA completo con un comentario de la versión, no solo las cuatro marcadas. Está en `../../CI/ci-de-seguridad.md`, sección 2.9, y las mantiene Dependabot.

### `go/log-injection` ×9

CodeQL detectó que un dato de afuera llega a un log sin que se escapen los saltos de línea, con lo que un valor con `\n` puede inventar una línea de log falsa.

- **Las 8 de `log.Printf` de solo desarrollo:**
  - **Dónde:** los tres avisos `[simulado]` de `turno_publico.go` (mail con muchos DNIs, tope de DNI y tipo, rotación por IP) y los de `LogSender` en `mail.go`, el enviador de mails de desarrollo.
  - **Era explotable:** no en producción. Los `[simulado]` solo corren con las herramientas de desarrollo, y `LogSender` solo se usa sin Resend, es decir, en localhost. El log de requests de producción ya usa `slog`, que escapa.
  - **Qué se arregló:** pasaron a `slog` con atributos (`slog.Info("[mail:dev] bienvenida", "para", to, "nombre", nombre)`), que escapa los saltos de línea. Son **3** llamadas en `turno_publico.go` y **6** en `mail.go`: CodeQL marcó 5 de las 6 de `LogSender`, pero se migraron todas para que el archivo no mezcle dos formas de loguear. Los avisos siguen siendo legibles (se comprobó en contenedores con `[mail:dev]` de bienvenida y de recuperación).
- **La novena, el `request_id`:**
  - **Dónde:** el log de requests de `apps/api/internal/http/logging.go` escribe el `request_id`, y ese id lo toma `middleware.RequestID` de chi del header `X-Request-Id` **que mande el cliente**.
  - **Era explotable:** no daba acceso a nada, pero como la API es pública cualquiera podía elegir el id de su request, o copiar el de otro, y confundir a quien rastrea un pedido en los logs. El BFF no manda ese header, así que descartarlo no pierde nada.
  - **Qué se arregló:** no se tocó `logging.go`. Se agregó `descartarRequestIDEntrante` en `apps/api/internal/http/router.go` (registrado en la línea 52 y definido en la 206), un middleware que borra el `X-Request-Id` entrante **antes** de `middleware.RequestID`, así el id lo genera siempre el servidor. Mismo criterio que `ip_del_visitante.go` con las cabeceras de la IP.
  - **Por qué no validarlo contra un patrón:** aceptarlo, aunque sea con formato válido, sigue dejando que el cliente elija el id. Y nadie lo necesita.
  - **Tests:** `request_id_test.go` prueba la cadena del middleware (con un caso de control sin él, que muestra que el test mide algo real) y el router real de punta a punta: el `request_id` del cliente no aparece en el log.

## Qué se descartó como camino

- **Descartar las 9 de `log-injection` como falsos positivos:** 8 tenían un arreglo trivial.
- **Validar el `X-Request-Id`** contra un patrón en vez de borrarlo (ver arriba).

## Cuando salga una alerta nueva

Una ronda futura va en **un archivo nuevo con su fecha** (`alertas-de-codeql-AAAA-MM-DD.md`), en esta misma carpeta, y no pisa este: el historial queda sin tocar. De cada alerta, el mismo formato: qué detectó CodeQL, si era explotable de verdad y qué se arregló o por qué se descartó.
