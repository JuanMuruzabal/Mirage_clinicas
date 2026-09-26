# Radiografía técnica del sistema — segunda

**PRISMA · Auditoría interna de ingeniería, segunda pasada general**

La primera radiografía (`radiografia-tecnica_1.md`, 2026-09-08) se hizo cuando el sistema era una clínica con un profesional. Desde entonces entraron la Fase 3 completa (multi-tenant, recepción, invitaciones), la Fase 4 y el plan Prisma Engine (editor, subida de fotos, SEO, storage R2) y el plan de pulido. La `optimizacion-post-fase3.md` miró el panel y el wizard; esta pasada mira **todo el proyecto**, con foco en lo que nunca se auditó.

- **Alcance:** `apps/api` (Go, 17 paquetes, ~25.700 líneas de producción) + `apps/web` (Next.js, 207 archivos, ~36.400 líneas) + infraestructura (Docker, Render, CI).
- **Fecha:** 2026-09-26, sobre `dev` en `17a8e57` (PR #68).
- **Método:** escaneo automático de dependencias (`govulncheck`, `pnpm audit`), análisis estático (`gosec`), mapa completo de rutas y middleware, y lectura dirigida por módulo. **Cada hallazgo marcado "reproducido" se confirmó con un test contra Postgres real**, no por lectura; los tests están transcriptos en la sección 8 para convertirlos en regresiones cuando se arregle.
- **No reemplaza:** un pentest, ni `/code-review ultra` (que revisa el diff de una rama o PR, no el repositorio entero).

## Índice

1. [Veredicto](#veredicto)
2. [Hallazgos bloqueantes](#hallazgos-bloqueantes)
3. [Alto impacto](#alto-impacto)
4. [A vigilar](#a-vigilar)
5. [Lo que se verificó y está bien](#lo-que-se-verificó-y-está-bien)
6. [Escaneos automáticos, en detalle](#escaneos-automáticos-en-detalle)
7. [Optimización](#optimización)
8. [Plan de acción](#plan-de-acción)
9. [Fase A — cómo se cerró](#fase-a--cómo-se-cerró)
10. [Reproducciones](#reproducciones)

---

> **Estado al 2026-09-26: Fase A cerrada** (B1, B2 y B3 arreglados, cada uno con su test de regresión verificado en los dos sentidos) y la **pasada de optimización aplicada** (sección 7). Al arreglar B3 apareció un hallazgo más de la misma familia, **B4**, cerrado en el mismo paso. Ver la sección 9.

## Veredicto

La base sigue siendo sólida, y en varias cosas mejoró desde la primera radiografía: las dos auditorías de aislamiento corren en CI, el IDOR por id de URL tiene su propio test, la subida de fotos está bien pensada de punta a punta y ninguna herramienta automática encontró un problema real en el código Go.

Lo que encontró esta pasada está en otro lado: en **las costuras entre features que se diseñaron por separado**. El enlace compartido (Fase 2) salta la verificación de mail a propósito, y el camino "ya he venido antes" (Fase 2.4) confía en que el mail ya se verificó: juntos, dejan reservar a nombre del paciente de otra familia. La verificación automática de mail (TR-051) "no exponía nada" cuando se decidió, y dejó de ser cierto el día que las invitaciones empezaron a dirigirse a un mail (Fase 3.2.4). Ninguna de las dos se ve mirando una feature sola.

| Bloqueante | Alto impacto | A vigilar | Ya está bien |
|---|---|---|---|
| 2 | 3 | 8 | 14 |

> **B3 bajó de bloqueante a latente (2026-09-26):** Juan confirmó que Render tiene cargada `RESEND_API_KEY`, así que en producción la verificación automática de mail está apagada y B3 no se puede explotar hoy. Queda documentado porque se reactiva solo con borrar esa variable.

---

## Hallazgos bloqueantes

### 🔴 B1 — Next.js 16.3.0 tiene dos RCE críticas publicadas

`pnpm audit` las marca como **critical**, y ya se confirmaron contra los avisos oficiales:

| Aviso | Qué es | ¿Nos aplica? |
|---|---|---|
| [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) (CVSS 9.5) | Ejecución remota de código sin autenticación en el **optimizador de imágenes**, al procesar un AVIF (vía `sharp` → `libheif`). | **Sí, en producción.** `next/image` se usa en `app/page.tsx` y `next.config.ts` no desactiva el optimizador, así que `/_next/image` está vivo en Render. |
| [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) (CVSS 9.0) | RCE por path traversal cuando el servidor corre sobre **Windows**. | Producción no: Render es Linux. **Sí en cada `next dev` de las máquinas de desarrollo**, que son Windows. |

**Arreglo:** subir `next` a **16.3.3** (corrige las dos y arrastra `sharp` ≥ 0.35.4, que tiene su propia alta). Es un cambio de una línea en `apps/web/package.json` + `pnpm install`; no toca ninguna área del plan Prisma Engine.

> `apps/web/package.json:23` · `apps/web/src/app/page.tsx` (usa `next/image`) · `apps/web/next.config.ts` (sin `images.unoptimized`)

### 🔴 B2 — Con un enlace compartido se listan y se reservan turnos a nombre de pacientes de OTRA familia — reproducido

El enlace de "Compartir link" (TR-120) salta la verificación de mail **a propósito**: quien lo tiene es de confianza. Pero `validarIdentidadPublicaOEnlace` hace eso para **todo** el wizard, y dos caminos que dependían de un mail probado quedaron abiertos:

1. **Listar.** `GET /clinicas/{slug}/pacientes/verificado?tutorEmail=X&enlaceToken=Y` devuelve los pacientes cuyo tutor es `X`, **sin que nadie haya probado ser `X`** (id, nombre con inicial y DNI censurado). `CLAUDE.md` lo prohíbe de forma explícita: *"esa lista nunca puede mostrarse antes del código — diría qué pacientes tiene un tutor a cualquiera que tipee su mail"*. El GET no consume el enlace, así que se puede repetir sin límite durante su hora de vida.
2. **Reservar.** Con el id que devolvió la lista, `POST /clinicas/{slug}/turnos` con `pacienteVerificadoId` + `enlaceToken` + el mail del tutor **declarado, no probado** crea el turno (201). El chequeo "el mail responde a esta ficha o a uno de sus tutores" (`pacienteRespondeAlMail`/`pacienteTieneTutorConMail`) compara contra el mail declarado, y con enlace nadie lo verificó.

**Quién puede hacerlo:** cualquiera que tenga un enlace vigente. Un enlace se manda a un paciente y se puede reenviar; dura una hora y admite 5 turnos "para otro". **Qué se pierde:** privacidad (qué chicos tiene a cargo una persona) e integridad (turnos en la historia de un paciente ajeno, que además ocupan su cupo de "un turno activo por tipo").

**Arreglo propuesto:** con enlace, el camino "ya he venido antes" solo puede tocar la ficha **a la que el enlace apunta** (`enlaces_turno.paciente_id`, que ya existe desde la 3.2.7b y ya resuelve la identidad con `identidadDeLaFichaDelEnlace`). Un enlace sin ficha no lista ni elige pacientes existentes: pide datos o pide el código de mail, como sin enlace. Hay que mirar también el modo por DNI del mismo endpoint, que con enlace es un oráculo de "¿este DNI y este mail van juntos?".

> `internal/http/paciente_verificado_publico.go:336` (`validarIdentidadPublicaOEnlace`), `:384` (modo tutor) · `internal/http/turno_publico.go:1018` y `:1351` (reserva con `pacienteVerificadoId`)

### 🟡 B3 (latente) — Sin Resend configurado, cualquiera acepta una invitación dirigida a otra persona — reproducido, condicional

Sin `RESEND_API_KEY`, `AutoVerifyEmail` deja las cuentas nuevas **verificadas de entrada** (TR-051). Cuando se decidió no exponía nada. Desde la Fase 3.2.4, **una invitación se dirige a un MAIL**, y aceptarla solo exige que la sesión sea de una cuenta con ese mail (`invitacionParaMi` compara `user.Email`). Sumadas:

1. La clínica invita a `recepcionista@…` con rol `recepcion`.
2. Alguien que **no** es dueño de ese mail se registra con él (201 + sesión, sin mandar nada).
3. Ve la invitación en `/clinicas` y la acepta (200): entra a la clínica, y con `recepcion` **ve todos los pacientes y turnos de todos los profesionales**.

Lo mismo vale para una invitación de `profesional` (con matrícula inventada) o de `admin` (edita la página pública).

**Es condicional:** depende de si Render tiene cargada `RESEND_API_KEY`. Es `sync: false` en `render.yaml`, así que desde el repo no se puede saber. **Confirmado el 2026-09-26: está cargada**, así que hoy no aplica a producción. El riesgo es que vuelva solo: alcanza con que alguien borre o renombre la variable, sin ningún cambio de código.

**Arreglo propuesto, en cualquiera de los dos casos:** poner `AutoVerifyEmail` detrás de `HerramientasDeDesarrolloHabilitadas()`, como ya se hizo con `ExponerCodigoVerificacion` y `SimularBloqueosSeguridad` (TR-135): la auditoría de TR-135 ya advertía que atarlo a "¿está configurado Resend?" era atarlo a una variable no relacionada. Y que el proceso se niegue a arrancar con un `APP_BASE_URL` público y sin Resend, igual que con el secreto de firma (A4 de la primera radiografía).

> `cmd/api/main.go:321` (`AutoVerifyEmail: cfg.ResendAPIKey == ""`) · `internal/http/auth.go:447` · `internal/http/invitaciones_recibidas.go` (`invitacionParaMi`)

---

### 🟡 B4 (latente) — Los controles de arranque miraban `APP_ENV`, que en Render vale `development` — encontrado al arreglar B3

El proceso se niega a arrancar con el secreto de firma de ejemplo (A4 de la primera radiografía), y descarta el `BFF_SHARED_SECRET` de ejemplo. Los dos controles se salteaban cuando `APP_ENV` era `development`, y **en Render vale `development` a propósito** (TR-021, un solo entorno). O sea: **nunca corrieron en el único entorno público**. Un `JWT_SECRET` vacío en el dashboard habría arrancado firmando el `state` de OAuth con el secreto publicado en el repo, y un `BFF_SHARED_SECRET` copiado del `.env.example` habría dejado a cualquiera elegir su IP ante el rate-limiting.

Es el mismo error que TR-135 corrigió para las herramientas de desarrollo, que quedó sin corregir en estos dos. Hoy las variables están bien cargadas, así que no se puede explotar; se cierra porque el control existe justamente para el día en que no lo estén.

**Arreglo (hecho):** los dos miran si la app se sirve en localhost (`AppBaseURL`), igual que `HerramientasDeDesarrolloHabilitadas`. Y con una URL pública el arranque se frena también si falta `RESEND_API_KEY` (cierra B3 del todo).

> Nota aparte, sin cambios: el guardián de migraciones destructivas (TR-132) también mira `APP_ENV`, y por eso en Render no pide `DB_ALLOW_DESTRUCTIVE`. Eso ya estaba documentado como decisión abierta en la sección 17.3 de la primera radiografía; cambiarlo afecta cómo se deploya, así que no entra sin decidirlo.

---

## Alto impacto

### 🟠 A1 — Los endpoints públicos de lectura no tienen límite de pedidos

Tienen tope por IP el login, el registro, los códigos, el reset, "Mis turnos" y la verificación del wizard. **No lo tienen**, y son públicos y sin sesión:

| Endpoint | Costo por pedido |
|---|---|
| `GET /clinicas` (buscador) | **1 + 3 consultas por clínica publicada, sin paginación.** Por cada resultado corre `ownerProfile` (2) y `profesionalesActivosDeLaClinica` (1). Con 200 clínicas son 601 consultas por búsqueda. |
| `GET /clinicas/{slug}/profesionales` | Busca el primer hueco en una ventana de 30 días por cada profesional (optimizado en el addendum de TR-162, 172 → 13 ms, pero sigue siendo el más caro por pedido). |
| `GET /clinicas/{slug}/disponibilidad` y `/disponibilidad-mes` | Cálculo de agenda completo. |
| `GET /clinicas/{slug}`, `/tipos-consulta`, `/enlaces-turno/validar`, `/sitemap/clinicas` | Livianos, pero ilimitados. |

Un solo cliente puede sostener carga cara sobre la API sin romper nada ni dejar rastro distinto de un visitante normal. Render free tiene una sola instancia, así que el `IPLimiter` en memoria alcanza (ya limpia sus contadores vencidos).

**Arreglo:** un tope por IP generoso para el grupo público de lectura (del orden de decenas por minuto) y, en el buscador, paginación y **una sola consulta** para el nombre del titular y las especialidades de todos los resultados, en vez de 3 por clínica.

> `internal/http/clinicas.go` (`buscarClinicasHandler`) · `internal/http/turno_publico.go:682-697`

### 🟠 A2 — Los dos contenedores corren como root, y la imagen de la API está fuera de soporte

- Ni `apps/api/Dockerfile` ni `apps/web/Dockerfile` declaran `USER`: la API y Next corren como **root** dentro del contenedor. Con B1 abierto, una RCE en el optimizador de imágenes corre con todos los privilegios del contenedor.
- La API usa `alpine:3.20` como base de runtime, que **salió de soporte en abril de 2026**: ya no recibe parches de seguridad.

**Arreglo:** `USER` sin privilegios en los dos (la imagen `node` ya trae el usuario `node`; en alpine, un `adduser -S`) y subir la base a una Alpine soportada.

### 🟠 A3 — El buscador muestra clínicas en modo mantenimiento

`buscarClinicasHandler` filtra por `deployada_en IS NOT NULL` pero **no por `oculta`**. Una clínica que puso su página "en mantenimiento" (spec §5.2) sigue apareciendo en el buscador público, y el resultado lleva a una pantalla de mantenimiento. El sitemap sí la excluye (PE-9), así que hoy los dos listados públicos no coinciden. Es un bug de producto más que de seguridad, pero va junto con A1 porque se toca la misma consulta.

---

## A vigilar

1. **`sharp` 0.35.3 (alta, `libheif`)** — se corrige solo al subir Next (B1).
2. **`js-yaml` 4.3.1 (alta)** — solo en desarrollo, vía `eslint`. Consumo de CPU con YAML malicioso; no hay YAML de terceros en el flujo. Se va con la próxima actualización de ESLint.
3. **`golang.org/x/crypto/openpgp` (GO-2026-5932)** — el módulo está en `go.mod` pero ese paquete no se usa; `govulncheck` confirma que el código no lo alcanza. Sin arreglo publicado.
4. **CSP sin `object-src 'none'` ni `Permissions-Policy`.** `default-src 'self'` ya cubre `object-src`, así que no es un agujero, pero lo recomendado es cerrarlo del todo. Sumar `Permissions-Policy: camera=(), microphone=(), geolocation=()`. (`middleware.ts` es zona Prisma Engine: avisar a Kevin.)
5. **CI sin `permissions:` explícito.** El `GITHUB_TOKEN` de cada job hereda el permiso por defecto del repo. Declarar `permissions: contents: read` arriba del workflow. Las actions van por tag mayor (`@v4`), no por SHA: aceptable para actions oficiales.
6. **El mail de Google no se normaliza a minúsculas** en `findOrCreateUserForGoogle`. Google casi siempre lo devuelve en minúsculas; si alguna vez no, se crearía una segunda cuenta con el mismo mail en otra caja.
7. **El buscador no escapa `%` ni `_`** en `ILIKE '%q%'`. Sin impacto de seguridad (va parametrizado), pero `q=%` devuelve todo.
8. **En Windows de 32 bits se guarda la foto original** (no hay codificador WebP, TR-165). Solo se valida el encabezado. No es un camino de producción, y el archivo se sirve igual como imagen con `nosniff`.

---

## Lo que se verificó y está bien

1. **Subida de fotos — no se puede colar un script.** Pregunta explícita de esta auditoría. Solo JPEG, PNG y WebP, sin SVG (el único formato de imagen que ejecuta código). La imagen se **decodifica completa y se vuelve a generar** desde sus píxeles como WebP, así que un HTML o JavaScript escondido en el archivo, y el EXIF, no sobreviven. Tope de 5 MB antes de leer, de 30 megapíxeles antes de decodificar, y dos procesamientos a la vez. El nombre lo genera el servidor (token aleatorio) y tiene que pasar una expresión regular estricta tanto en la API como en la ruta `/uploads` de la web. Se sirve con el tipo que dicta la extensión y `X-Content-Type-Options: nosniff`.
2. **Sesiones.** Token opaco hasheado, 30 días absolutos / 7 de inactividad, `last_seen_at` escrito con throttle (no una escritura por pedido), revocación de todas las sesiones al resetear la contraseña. Cookie `httpOnly`, `secure` en producción, `sameSite=lax`.
3. **Login y registro.** Límite por IP y por cuenta, backoff exponencial en el login, anti-enumeración en el registro, el login exige mail verificado, Google exige `email_verified` y no vincula una cuenta nativa sin verificar.
4. **Códigos de verificación del wizard.** Tope por IP y por mail, al enviar y al confirmar.
5. **Aislamiento entre profesionales y clínicas.** Las dos auditorías en CI (`TestAislamiento_*`); los endpoints de equipo que modifican algo exigen `owner`, y la página pública exige `admin`.
6. **Invitaciones (con Resend configurado).** Se aceptan solo con una sesión del mail invitado, sin vencer y sin aceptar; el mail se prueba al registrarse.
7. **JSON-LD** (`[slug]/page.tsx`): el único `dangerouslySetInnerHTML` del frontend, y escapa `<` para que un texto del admin no cierre el `<script>`.
8. **CSP con nonce por pedido**, HSTS con preload, `frame-ancestors 'none'`, `nosniff` y `Referrer-Policy` en toda respuesta de la web.
9. **Límites de recursos:** 1 MiB en todo JSON, 5 MB en la subida, `Timeout` de 30 s en el router, `ReadHeaderTimeout` en el servidor.
10. **Rutas de archivos:** el storage local usa `filepath.Base` y la misma expresión regular; R2 hace lo mismo con `nombreSeguro`.
11. **`govulncheck`: 0 vulnerabilidades alcanzables** desde el código Go.
12. **`gosec`: sin hallazgos reales.** Los 6 G101 son textos en español que el analizador confundió con credenciales; SHA-1 es el que exige la API de HaveIBeenPwned (k-anonimato: viajan 5 caracteres del hash); el aviso de parseo multipart sin límite está cubierto por el `MaxBytesReader` de la línea anterior.
13. **Sin secretos en el repositorio**: ninguna clave, token ni `.env` versionado.
14. **Índices en todos los tokens y slugs** que se buscan en caminos públicos (`token_hash` único en sesiones, verificaciones, enlaces e invitaciones; `slug` único en clínicas).

---

## Escaneos automáticos, en detalle

| Herramienta | Resultado |
|---|---|
| `pnpm audit` | 4: **2 críticas** (Next, B1), 2 altas (`sharp` vía Next, `js-yaml` de desarrollo) |
| `govulncheck` (Go 1.26.8) | 0 alcanzables · 1 en un módulo requerido y no usado (`x/crypto/openpgp`) |
| `gosec` | 14 avisos, 0 reales (ver arriba) |
| Búsqueda de secretos (`git grep`) | 0 |

Sobre la versión de Go: `go.mod` dice `go 1.26.0`. La imagen de Docker (`golang:1.26-alpine`) compila con el último parche 1.26.x, que es lo que corre en Render. CI compila con `go-version-file`, es decir 1.26.0 exacto; no es un riesgo en producción, pero CI prueba con un parche distinto del que se despliega.

---

## Optimización

Mismo método que `optimizacion-post-fase3.md`: **contar y medir antes de tocar**. Un test temporal registró un contador de consultas en gorm y midió cada endpoint público con 25 clínicas publicadas; el panel y el wizard ya se habían medido en la ronda post-Fase 3.

### Endpoints públicos

| Endpoint | Antes | Después | Qué pasaba |
|---|---|---|---|
| **Buscador** (`GET /clinicas`) | **201 consultas · 119–210 ms** | **5 consultas · ~5 ms** | Por cada clínica, `ownerProfile` (3) + `profesionalesActivosDeLaClinica` (1 + 2 por profesional). **Crecía con el sistema**: con 200 clínicas, unas 1.600 consultas por búsqueda |
| **Página pública** (`GET /clinicas/{slug}`), 1 profesional | 17 consultas · 13 ms | **12 consultas · ~5,5 ms** | La misma lista de profesionales se calculaba dos veces, y las estadísticas en dos consultas sobre las mismas filas |
| Página pública, 4 profesionales | 26 consultas | **12** | Ahora no depende de cuántos profesionales tenga la clínica |
| Profesionales / disponibilidad (wizard) | 9 · 5–11 ms | sin cambios | Ya optimizado en la ronda post-Fase 3 (addendum de TR-162) |
| Sitemap, especialidades, tipos | 1–3 | sin cambios | — |

**El arreglo:** `perfilesPublicosDe` resuelve titular y profesionales activos de **varias clínicas en 3 consultas fijas** (membresías con su rol, perfiles, especialidades), con los mismos criterios que las dos funciones que reemplaza. La usan el buscador, la página pública y el editor. `TestBuscarClinicas_LasConsultasNoCrecenConLasClinicas` y `TestGetClinicaPublica_ConsultasConVariosProfesionales` fijan que la cantidad de consultas no crece: con el código viejo fallan con 25 → 73 y 17 → 26.

### El hash de contraseñas no tenía techo de memoria

argon2id reserva 19 MiB por hash mientras corre (medido: **~20 MB y ~23 ms de CPU** por hash en una máquina de desarrollo; en la fracción de CPU de Render free, bastante más, así que se superponen todavía más). No había tope de hashes simultáneos: unos 25 logins a la vez —un pico, o alguien que los provoque desde muchas IPs, esquivando el límite por IP— llenan los 512 MB de la instancia y **el proceso muere para todos**. Ahora corren **4 a la vez como máximo** (peor caso ~80 MB), y el resto espera su turno unos milisegundos; mismo criterio que el procesamiento de fotos. Un test lanza 20 hashes simultáneos y verifica que nunca corren más de 4.

### Frontend

- **La página pública ya hace un solo viaje a la API por visita**: `cargarClinicaPublica` está memoizada por request con `cache()` desde PE-9 (metadata, página e imagen para compartir la comparten).
- **El reparto de JavaScript es razonable**: `dnd-kit` (204 KB) solo baja en el editor, y la página pública carga los efectos de forma diferida.
- **`/buscar` descarga `framer-motion` (131 KB) para un efecto de aparición** (`ScrollReveal`). Es la dependencia que el plan Prisma Engine tiene en revisión (`scroll-reveal.tsx` está en su zona), así que queda para Kevin: con un `IntersectionObserver` y CSS alcanza.

### Identificado y no aplicado, con su condición

- **Caché de la página pública entre requests** (`revalidate` + invalidar al publicar). Hoy cada visita pega en la API, que ahora son 12 consultas y ~5 ms. Convendría cuando el tráfico de una página lo justifique, y hay que resolver cómo se refrescan las estadísticas (pacientes atendidos, turnos realizados), que cambian sin publicar. Además `[slug]` es zona Prisma Engine.
- **Paginación del buscador.** Con consultas fijas, lo que crece es solo el tamaño de la respuesta (~140 bytes por clínica). Se suma cuando haya cientos de clínicas publicadas.

---

## Plan de acción

Mismo criterio que la primera: primero lo que cierra un riesgo real, después lo que destraba escala.

### Fase A — Ya — ✅ **cerrada el 2026-09-26** (ver la sección 9)

1. **Subir Next.js a 16.3.3** (B1). Verificación: `pnpm audit` sin críticas, `build:web` y la suite web.
2. **Cerrar el enlace compartido** (B2): con enlace, el camino "ya he venido antes" solo toca la ficha del enlace. Las dos reproducciones de la sección 8 se vuelven tests que tienen que dar 403/400.
3. **`AutoVerifyEmail` detrás de `HerramientasDeDesarrolloHabilitadas()`** (B3), y no arrancar con URL pública sin Resend. Resend está cargado en Render, así que no es urgente, pero es barato y evita que el problema vuelva sin que nadie lo note.

### Fase B — Antes de sumar clínicas reales

1. **Tope por IP en los endpoints públicos de lectura** y el buscador en una consulta, paginado y filtrando `oculta` (A1, A3).
2. **Contenedores sin root y Alpine soportada** (A2).
3. **`permissions: contents: read` en CI** y normalizar el mail de Google (a vigilar 5 y 6).

### Fase C — Cuando haga falta

1. `object-src 'none'` y `Permissions-Policy` en la CSP, coordinado con Kevin (zona Prisma Engine).
2. Escapar `%`/`_` en el buscador.
3. CI en el mismo parche de Go que producción.
4. Lo que quedó de la Fase C de la primera radiografía sigue igual (partir `turno_publico.go`/`turnos.go`/`pedir-turno-form.tsx`, Redis para el limitador recién con más de una instancia).

---

## Fase A — cómo se cerró

Cada arreglo en su commit, con un test que **falla con el código anterior y pasa con el nuevo** (verificado en los dos sentidos, revirtiendo el arreglo). Decisiones en `tradeoffs.md` TR-175 a TR-177; el porqué y lo descartado, en `como-se-arreglo-cada-cosa.md`.

| | Qué se hizo | Verificación |
|---|---|---|
| **B1** | Next.js 16.3.0 → **16.3.3** (arrastra `sharp` 0.35.4 y `js-yaml` parcheado) | `pnpm audit`: **0 vulnerabilidades**. Suite web, typecheck, lint y build en verde |
| **B2** | **Un enlace prueba la identidad solo de la ficha a la que apunta** (TR-175). Con un enlace generado desde una ficha, "ya he venido antes" sigue sin código pero acotado a esa ficha; con un enlace genérico, pide el código de mail como sin enlace, y la reserva gasta las dos cosas. "Primera vez" no cambia | 5 tests nuevos en `enlace_identidad_publica_test.go` (fallan los 5 con el código anterior) y 3 adaptados. En el wizard, 4 tests nuevos o adaptados |
| **B3 + B4** | `AutoVerifyEmail` solo en localhost; el arranque con URL pública exige `RESEND_API_KEY` y un `JWT_SECRET` propio; el `BFF_SHARED_SECRET` de ejemplo se descarta por URL, no por `APP_ENV` (TR-176) | 4 tests (fallan con las condiciones viejas). El caso "Render" —`APP_ENV=development` con URL pública— es el que prueba B4 |

**Un costo de B2, dicho:** el pedido del cliente de "en 'primera vez', si el DNI y el mail ya son de una ficha verificada, mostrale su tarjeta" deja de aplicar **con un enlace genérico**. El turno se saca igual y queda en su ficha (la detección de conflictos la reconoce por el mail); lo que no aparece es la pantalla "¿Sos vos?". Sin enlace, o con un enlace de ficha, sigue igual.

**B2 tocó `apps/web/src/components/public/pedir-turno-form.tsx` y la optimización tocó `clinicas.go`**, las dos en la zona del plan Prisma Engine, con el OK de Juan en cada caso: solo el wizard de turno, y mismas respuestas JSON.

---

## Reproducciones

Los tres tests que confirmaron B2 y B3, tal como se corrieron antes del arreglo (paquete `internal/http`, Postgres real): **pasaban**, y eso era la prueba del problema. Con las aserciones invertidas son hoy los tests de regresión de la sección 9.

**B2 — listar los pacientes de un tutor ajeno con un enlace:**

```go
reg, tipoID := profesionalConTipoConsulta(t, gdb, router, "rx2-enlace@example.com")
crearPacienteVerificadoConTutorDePrueba(t, gdb, reg.Profesional.ID, tipoID, "40111222", "Hijo", "mama.ajena@example.com", 0)
enlace := crearEnlaceTurnoDePrueba(t, router, reg.Token)

q := url.Values{}
q.Set("tutorEmail", "mama.ajena@example.com") // nadie probó ser esta persona
q.Set("enlaceToken", enlace)
rec := doJSON(t, router, http.MethodGet, "/clinicas/"+reg.Profesional.Slug+"/pacientes/verificado?"+q.Encode(), nil)
// → 200 [{"id":"754184bc-…","nombre":"Hijo I.","dni":"40***222"}]
```

**B2 — reservar a nombre de ese paciente:**

```go
rec := doJSON(t, router, http.MethodPost, "/clinicas/"+reg.Profesional.Slug+"/turnos", solicitarTurnoPublicoRequest{
	PacienteVerificadoID: hijo.ID.String(),
	Tipo: nombreTipoSembrado, Fecha: fechaDePruebaDisponibilidad, Hora: "10:00",
	EnlaceToken: enlace, ParaOtro: true,
	EmailContacto: "mama.ajena2@example.com", TutorEmail: "mama.ajena2@example.com", // declarados, no probados
})
// → 201 {"id":"19a84896-…","horaInicio":"2030-06-03T10:00:00-03:00",…}
```

**B3 — aceptar una invitación ajena con verificación automática:**

```go
router, gdb := newTestRouterWithAutoVerify(t)
// la clínica invita a recepcionista.real@example.com con rol recepcion
// alguien que no es esa persona se registra con ese mail:
rec = doJSON(t, router, http.MethodPost, "/auth/register", registerRequest{
	Email: "recepcionista.real@example.com", Password: "otraClaveLarga456", AceptaTerminos: true,
}) // → 201 con sesión
// completa un perfil de "actividades", lista sus invitaciones y acepta:
rec = doJSONAuth(t, router, http.MethodPost, "/me/invitaciones/"+pendientes[0].ID+"/aceptar", tok, nil)
// → 200 {"clinicaId":"f510173e-…"}
```
