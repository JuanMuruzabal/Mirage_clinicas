---
paths:
  - "packages/prisma-engine/**"
  - "apps/web/src/app/personalizar-pagina/**"
  - "apps/web/src/app/?slug?/**"
  - "apps/web/src/app/uploads/**"
  - "apps/web/src/components/editor-pagina/**"
  - "apps/web/src/components/public/**"
  - "apps/web/src/lib/pagina-publica/**"
  - "apps/web/src/lib/temas-pagina-publica/**"
  - "apps/web/src/app/actions/pagina-publica.ts"
  - "apps/web/src/lib/sitio.ts"
  - "apps/web/src/app/globals.css"
  - "apps/api/internal/http/pagina_publica.go"
  - "apps/api/internal/http/temas_pagina_publica.go"
  - "apps/api/internal/http/modulos_pe6.go"
  - "apps/api/internal/http/uploads.go"
  - "apps/api/internal/prismaengine/**"
  - "apps/api/internal/storage/**"
  - "apps/api/internal/imagenes/**"
  - "apps/api/internal/limpieza/**"
  - "lighthouserc.json"
---

# La página pública y su editor (Fase 4, Prisma Engine)

Se carga cuando la sesión lee o edita el motor (`packages/prisma-engine`), el editor de la página, la página pública de una clínica o los handlers y paquetes de la API que la sirven.

## Fase 4 — Personalización de la página pública

Pedido directo del cliente (2026-09-17, sin brief `.docx`), primer entregable de un revamp de frontend más amplio — el resto (UI del panel de gestión) queda para después, todavía sin fases numeradas. Definición funcional completa en `docs/Fases post MVP/Fase 4/fase4-personalizar-pagina.md`; estado de la implementación (para retomar) en `docs/Fases post MVP/Fase 4/fase4.4-4.5-estado-implementacion.md` (la 4.1 a 4.3 está en `fase4.1-a-4.3-estado-implementacion.md`, mergeada). Decisiones: `docs/Arquitectura y base/tradeoffs.md` TR-150 a TR-155; plan: `implementation-plan.md` §14. **Las subfases 4.4 y 4.5 entraron a `dev` como "etapa intermedia" (PR #44, 2026-09-18): el cliente va a sumar secciones extra de fine-tuning todavía sin definir, así que la Fase 4 no está cerrada.**

| Subfase | Qué | Estado |
|---|---|---|
| 4.1 | Modelo de datos: `PaginaPublica` extendida (bio, tema/variante/tipografía, foto de portada, redes sociales, mapa, dirección override) + tabla `PaginaPublicaModulo` | ✅ |
| 4.2 | Endpoints backend y frontend: `GET/PATCH /panel/pagina` (reemplazo completo, mismo criterio que `PUT /horario-atencion/general`), `POST /panel/pagina/fotos` (primer upload multipart del repo), estadísticas reales (pacientes atendidos/turnos realizados, nunca un valor cargado a mano), y el fix del bug owner-only (especialidades/búsqueda por nombre pasan a ser la unión de TODOS los profesionales activos, no solo el owner) | ✅ |
| 4.3 | Catálogo de temas: 5 temas × 3 variantes de color cada uno + 5 pares de tipografía **compartidos entre temas** (no uno por tema, para no cargar hasta 15 pares de Google Fonts) — validado con CHECK en Postgres (`chk_pagina_publica_tema*`) y en el handler (`temaEsValido`, que sí valida la relación tema↔variante — el CHECK de la base valida cada columna contra su propio catálogo plano, no esa relación cruzada) | ✅ |
| 4.4 | Editor: borrador único que se guarda de una vez, módulos reordenables (`@dnd-kit` + flechas), selector de tema, subida de fotos, vista previa móvil/tablet/escritorio | ✅ mergeada a `dev` (PR #44), sin QA en navegador |
| 4.5 | `ClinicaPublicaTemplate` dibuja el tema y los módulos persistidos | ✅ mergeada a `dev` (PR #44), sin QA en navegador |
| 4.6 | Storage real en producción: bucket privado de Cloudflare R2 (`R2Storage`), servido same-origin por la API (TR-167) | ✅ en código — falta crear el bucket y cargar `STORAGE_R2_*` en Render |

Lo que hay que saber al tocar la página pública o su editor (TR-151 a TR-153):

- **`@container` va SOLO alrededor de la grilla de módulos.** El wizard de turno y "Mis turnos" abren modales `position: fixed` desde adentro de `ClinicaPublicaTemplate`; un ancestro con `container-type` es su bloque contenedor y los recortaría al ancho de la página. Ningún test de jsdom lo detecta.
- **Editor y plantilla comparten `ContenidoPagina` y `modulosPorDefecto()`** (`lib/pagina-publica/`): una lista vacía es "nunca la personalizaron" (estructura por defecto), por eso el editor no deja quitar el último módulo y el endpoint público devuelve `personalizada` (no devuelve los módulos ocultos).
- **Para vaciar un campo opcional se manda `""`, no `null`** (un `*string` de Go no distingue `null` de ausente); el backend lo guarda como NULL.
- **Todo dato que la página pública convierte en `href`/`src` se valida en el backend Y se filtra en el frontend** (`enlaces.ts`): un `javascript:` cargado por un admin no puede volverse un link.
- **GORM ignora un `false` en un `bool` con `default:true` al hacer `Create`** — ocultar un módulo se guardaba como visible. Se escribe aparte con `Update`.
- **Las fotos locales se sirven same-origin** por `apps/web/src/app/uploads/[...path]/route.ts` (URL relativa `/uploads/x.jpg`, TR-154): la CSP (`img-src 'self' https:`) bloquea imágenes de otro origen o de http, y **jsdom no aplica CSP** — un test unitario no lo ve. El mapa del módulo Contacto entra por `frame-src https://www.google.com/maps`.
- **El nombre de un módulo (`config.nombre`) es una etiqueta del editor, no un título público; el nombre de la clínica puede ir sobre la portada con un color de un set curado** (`lib/pagina-publica/portada.ts`, TR-155). El color y su velo van juntos: sumar uno toca `COLORES_NOMBRE`, `coloresNombreValidos` (Go) y el CHECK `chk_pagina_publica_nombre_color`.
- **Las fotos se sirven SIEMPRE por `/uploads/{nombre}`**, con disco o con R2 (TR-167): la web se las pide a la API (`GET /uploads/{nombre}`, `internal/http/uploads.go`), que las lee con `Storage.Open`. El bucket es privado y la URL guardada es relativa. El patrón del nombre vive en DOS lugares (`storage.NombreValido` y `NOMBRE_DE_ARCHIVO` de la ruta de la web): si cambia uno, cambia el otro. **Sin R2 fuera de localhost no hay storage** y la subida responde 501 — hasta la 4.6 caía al disco del contenedor y las fotos se perdían en cada deploy. Si falta alguna `STORAGE_R2_*` con el bucket cargado, la API no arranca. `horarios` está aceptado por el backend pero no en el editor (¿de cuál de los N profesionales?).
- **Server Actions tienen 1 MB de body por default**; `next.config.ts` lo sube a 6 MB por las fotos.

**Borrador y publicación (PE-8, PR #54)** — cambia lo que dicen las filas 4.2/4.4 de arriba:

- **Guardar ya no publica.** `PATCH /panel/pagina` escribe el BORRADOR; `POST /panel/pagina/publicar` (reemplazó a `PATCH /panel/pagina/deployar`) lo copia como versión numerada a `pagina_publica_versiones` (foto jsonb, autor, fecha; índice único `(pagina_publica_id, numero)`). La primera publicación sigue marcando `deployada_en`.
- **`GET /clinicas/{slug}` sirve la ÚLTIMA VERSIÓN PUBLICADA, nunca el borrador**; sin ninguna versión responde `enPreparacion: true` (`PaginaEnPreparacion` en `[slug]/page.tsx`). Un test que lee la página pública después de un `PATCH` tiene que publicar antes — 30+ tests lo asumían al revés.
- **Candado optimista:** `PATCH /panel/pagina` exige `revision` en el body; el `UPDATE ... WHERE revision = ?` es atómico y, si no coincide, responde **409 con quién y cuándo** (`ConflictoRevisionPagina`). Del lado web, `apiActualizarPaginaPublica` devuelve `kind: "ok" | "conflicto" | "error"`, no un `ApiResult` aplanado.
- **Restaurar una versión** (`POST /panel/pagina/versiones/{numero}/restaurar`) copia su contenido al BORRADOR, con el mismo candado — nunca publica directo. Historial en `GET /panel/pagina/versiones`.
- En `lib/pagina-publica/borrador.ts` hay dos comparaciones distintas: `hayCambios` (borrador sin guardar) y `hayCambiosSinPublicar` (guardado vs. última versión publicada) . Las dos comparan una firma que saca `revision` desestructurando el objeto: un `Pick`/`Omit` recorta el TIPO, no el valor, y dos borradores iguales con distinta revisión nunca daban la misma firma (bug real).

**Tokens de diseño y variantes (PE-2 + PE-3, TR-163)** — lo que hay que saber antes de tocar la plantilla o un módulo:

- **Un campo nuevo de la página va en TRES lugares del backend:** `PaginaPublica`, `PaginaPublicaContenidoVersion`/`ContenidoVersion()` (la foto que se publica) y `aplicarContenidoAlBorrador` (restaurar). Si falta en la foto, la página pública lo pierde sin ningún error: sirve la versión, no el borrador. Lo mismo del lado web: `Borrador` y las DOS firmas de `borrador.ts`, con la clave en la misma posición (se comparan como texto).
- **Los tokens (`paginas_publicas.tema_tokens`, jsonb) son overrides del tema** y se validan contra el JSON Schema que genera `engine:generar` (`tema_tokens.schema.json`). El catálogo es `packages/prisma-engine/src/tokens.ts`. Sin tema se ignoran, salvo `portada` (layout, no estilo).
- **Una clase de un módulo no lleva colores ni medidas fijas: lee `--pp-*`** (`CLASE_TARJETA`, `CLASE_TEXTO`, `text-(--pp-texto)/80`…). Los defaults viven en `.pp-raiz` (`globals.css`) y son el aspecto de antes de PE-2. El style del tema tiene que ir **en el mismo elemento** que `.pp-raiz`, o las variables que referencian a otras se resuelven con los defaults.
- **Las opciones de sección (fondo, alineación, título público) las aplica la plantilla sobre el `<section>`**, vía `seccionPublicaDe` del paquete; un `render.tsx` no las mira. Qué ofrece cada módulo lo dice su `meta.ts` (`variantes`, `opcionesDeSeccion`), y los ids de variante viven en `variantes.ts` (sin zod: lo importa el bundle del cliente). `tokens-y-variantes.test.tsx` falla si `meta.ts` y el esquema no ofrecen las mismas variantes.
- **Los CHECK de tema/variante/tipografía se arman desde el catálogo** en cada migración (`checksDelCatalogoDeTemas`). Sumar un tema es tocar `catalogo/temas.json` + `paletas.ts` y regenerar; no hay SQL a mano.

**Efectos, movimiento y fondos (PE-4 + PE-5, TR-164)**:

- El movimiento global (`temaTokens.movimiento`) arranca en `quieto`; `sereno` y `dinámico` seleccionan entradas suaves por defecto. Cada módulo define sus slots hoja en `meta.ts`, y guarda overrides en `config.efectos`; el editor y el backend derivan sus opciones/esquemas del catálogo común.
- `temaTokens.fondoAnimado` elige el fondo de la página. Los fondos usan colores del tema, CSS 2D y tiempos lentos; se pausan fuera de pantalla o con la pestaña oculta. `prefers-reduced-motion` los deja estáticos.
- El HTML del servidor siempre muestra el contenido. Las entradas empiezan después de hidratar y el fallback de un chunk animado conserva el nodo original. No agregues efectos a la sección fija del turno ni a un contenedor que pueda cambiar el bloque de los modales.
- Si cambias el catálogo o los esquemas de módulos, corre `pnpm run engine:generar` y versiona sus JSON de Go junto con el cambio.

**SEO, compartir y rendimiento (PE-9, TR-165)**:

- `seo_titulo`/`seo_descripcion` vacíos = el default de `lib/pagina-publica/seo.ts` (nombre, especialidades, ciudad). El default no se guarda. Van en la foto de la versión como cualquier campo nuevo de la página: los tres lugares del backend y las dos firmas de `borrador.ts`.
- La URL absoluta del sitio sale de `urlDelSitio()` (`lib/sitio.ts`: `SITE_URL` → `RENDER_EXTERNAL_URL` → localhost), leída en runtime. Una ruta que la use tiene que ser dinámica: en el build de Docker no existe.
- Una foto subida se guarda como variantes `<token>.w480|960|1600.webp` (`internal/imagenes`) y la URL es la de la más grande; el `srcset` sale del nombre (`srcsetDeFoto`). Si cambiás los anchos, cambialos en Go (`imagenes.Anchos`) y en el paquete (`ANCHOS_DE_FOTO`) juntos, y el regex de `app/uploads/[...path]/route.ts`.
- En Go **windows/386** no hay codificador WebP (build tag): la subida guarda el original. CI y Render son linux/amd64; para probar el camino real en Windows, `GOARCH=amd64 go test ./internal/imagenes/`.
- **Una fuente nueva de la página pública va con `preload: false`** (`tipografias.ts`): con el default, cada página precargaba las de todos los temas y el primer render se demoraba segundos en 4G. Lo detectó el presupuesto de Lighthouse (`lighthouserc.json`, job `lighthouse`), que corre sobre páginas de demostración (`PRISMA_DEMO_PLANTILLAS=1`, `lib/pagina-publica/demostracion.ts`).

Los módulos se guardan con **reemplazo completo** (`DELETE` + `INSERT` transaccional), no un CRUD por módulo — no hay precedente en el repo de un PATCH parcial de un array polimórfico, y calza con que el editor de la 4.4 arma todo el layout en el cliente y guarda de una vez. `Modulos *[]moduloRequest` es un puntero al slice, no el slice solo: distingue "no vino en el body" (no tocar) de "vino `[]`" (borrar todos).

**Prisma Engine (plan completo).** `docs/Fases post MVP/Prisma Engine/plan-prisma-engine.md` (Kevin): PE-1 a PE-9 y la Fase 4.6 están en `dev`. Lo que dejó y hay que respetar:

- **Tipos de módulo, temas, variantes, tipografías y efectos viven en `packages/prisma-engine`** (`registro.ts`, `schemas.ts`, `catalogo/temas.json`, `efectos/catalogo.ts`, slots en cada `meta.ts`), no en un `switch` del editor o de `modulos-publicos.tsx` ni en un mapa a mano de Go. Después de tocarlos, `pnpm run engine:generar`.
- **El exporte de los esquemas de módulos usa `z.toJSONSchema` en `io: "output"`** (TR-198), porque es lo que cierra los objetos (`additionalProperties: false`) como lo hacía el exportador anterior: con `input`, Go aceptaba claves desconocidas en la raíz de los 14 módulos y ningún test de TypeScript lo veía. Si un esquema de módulo suma `.default`, `.transform`, `.pipe` o `.catch`, o si cambia el exportador, comparar lo que aceptan y rechazan los esquemas de Go viejos y nuevos sobre un corpus (receta en `Dependencias/actualizacion-de-dependencias-2026-10.md`, sección 10).
- **Quedó afuera, sin PR asignado:** de PE-8, el link de vista previa firmado del borrador, deshacer/rehacer en el editor y el resumen "qué cambió" antes de Publicar; de PE-1, `paginas_publicas.schema_version` + un `migrar(config, desde, hasta)` por módulo, que se suma en el primer PR que cambie la forma de un módulo. Lo marcado **[SUJETO A REVISIÓN]** en el plan (aval del profesional, subida de foto de perfil) puede cambiar si Juan opina distinto.

**Plan de pulido de la página pública y el editor (PP-1 a PP-6, desde 2026-09-25).** `docs/Fases post MVP/Prisma Engine/plan-pulido-pagina-y-editor.md`: hallazgos H1–H27 (vistos en Chrome + axe, no en jsdom), un PR por grupo, TR-168 en adelante. **PP-1, PP-2 y PP-3 mergeados a `dev` (#62, #63, #64); PP-4 a PP-6 mergeados (#65 a #67; TR-171 a TR-173); PP-7 (TR-174, lo que quedaba: H22 y H25–H27, decididos con Juan el 2026-09-25) implementado en `fix/pp-7-hallazgos-pendientes` — con él quedan resueltos los 27 hallazgos.** H25–H27 necesitan decisiones de diseño con Juan o el cliente. Lo que dejó:

- **Un grupo de opciones del editor es un `GrupoDeOpciones`** (`components/editor-pagina/grupo-de-opciones.tsx`, radio de WAI-ARIA: una parada de Tab, flechas que eligen), y unas pestañas son `Pestanas` — no botones sueltos con `role="radio"`/`role="tab"` (TR-171).
- **El texto secundario del editor va a `grafito/75` como mínimo** (`TONO_SECUNDARIO`): es lo más claro que da 4,5:1 sobre marfil, hueso y salvia-claro. `contraste.test.ts` falla si un archivo del editor o un `editor.tsx` de módulo usa un grafito más claro. Lo que se toca con el dedo lleva `CLASE_TACTIL` (44 px con `pointer: coarse`).
- **`Dialogo` puede abrirse en el primer render** (la galería de plantillas se abre sola en una página sin personalizar): por eso no dibuja nada hasta hidratar. Un portal a `document.body` en el SSR dejaba `/personalizar-pagina` en 500, y `next dev` lo tapaba recuperándose en el cliente — **mirá el log del servidor, no solo la pantalla**.
- **En un celular el editor muestra UNA cosa: Editar o Vista previa** (TR-172), y la barra de acciones es Guardar + Publicar + `MenuMas`. Todo eso es CSS (`hidden`/`lg:flex`), no `matchMedia`: no agregues un estado que dependa del ancho de la ventana, o el HTML del servidor y el del cliente difieren. Una acción nueva de la barra va en los dos lugares (visible desde `lg`, y en "Más").
- **Qué módulo está abierto lo decide `PaginaEditor`, no `ListaModulos`** (TR-173): tocar una sección de la vista previa también lo abre. La plantilla marca cada sección con `data-modulo` (su clave, o `portada`) SOLO con `vistaPrevia.seccionesElegibles` — la página pública no lleva nada de eso. Desde `lg` el editor son dos columnas `sticky` con su propio scroll: si movés la vista previa, hacelo sobre su recuadro, nunca con `scrollIntoView` de la ventana (el panel se va de la pantalla).
- **Un módulo nuevo necesita dibujo para el catálogo de "Agregar sección"**: su primera variante, o `miniatura` en su `meta.ts` si no tiene variantes (`miniaturaDeModulo`; `registro.test.ts` lo exige).
- **La página pública (TR-174):** el contenido va a `ANCHO_CONTENIDO` (~1100 px) y un párrafo largo a `CLASE_PARRAFO_LARGO` (~65ch); una lista o tabla de un módulo se ubica con `CLASE_ALINEAR_FLEX`/`CLASE_JUSTIFICAR_FLEX` (o `_SEGURO` si scrollea), nunca con `text-left` o un ancho completo fijos. La portada nombra solo a la clínica. Un teléfono que se MUESTRA pasa por `telefonoLegible`; el `href` sigue con el número crudo. El footer (`PieDePagina`) no se configura.
- **Las fotos subidas se limpian solas** (`internal/limpieza`, TR-174): una vez por día se borra lo que no referencia ningún borrador ni versión y tiene más de 24 h. **Si agregás un lugar nuevo donde se guarde una URL de `/uploads`, sumalo a la consulta de `FotosHuerfanas`**, o sus fotos se van a borrar al día siguiente.
- **Un componente que depende de la preferencia de movimiento o del navegador no la lee en el render de hidratación** (TR-174): el servidor no la conoce. `useSyncExternalStore` con `getServerSnapshot` en `false` y recién después la preferencia — mismo patrón que `Dialogo`.
- **Un `DndContext` lleva `id` de `useId`**: sin él dnd-kit numera sus ids con un contador global que en el servidor sigue subiendo entre requests, y la hidratación no coincide (TR-172).
- **El alt de las fotos es opcional y vacío = el genérico** (TR-171): `paginas_publicas.foto_portada_alt` para la portada, `fotoAlt` en la foto suelta y `fotoAlts` en la galería — una lista PARALELA a `fotoUrls` (no objetos, para no cambiar la forma del módulo); el editor las mantiene alineadas y cambiar la foto vacía su descripción.
- **Ningún `window.confirm` en el editor**: se usa `components/dialogo.tsx` (foco atrapado, Escape, devuelve el foco). Una acción destructiva reversible ("Quitar" un módulo, aplicar una plantilla) deja un aviso con **Deshacer** en vez de confirmar, y el aviso dura hasta el próximo cambio, no unos segundos (TR-170).
- **La vista previa del editor no es la página real** (TR-169): no abre el wizard, no emite `h1` ni repite ids. Publicar con cambios sin guardar **guarda primero** y no publica si el guardado falla. El módulo Horarios es la excepción al borrador: se aplica en vivo, con aviso.
- **Un efecto nunca deja el contenido en un estado intermedio** (TR-168): con movimiento reducido todo queda en su estado final, y el envoltorio del efecto no puede quedar entre un `<ul>` y su `<li>`. Las grillas de módulos usan container queries, no breakpoints de ventana (si no, la vista previa "Móvil" muestra columnas de escritorio).
- Cada rama PP se corta desde `origin/dev`. Para ver la página pública sin API ni Docker: `PRISMA_DEMO_PLANTILLAS=1 pnpm dev --port 3100` en `apps/web` y abrir `/demo-<plantilla>`. El editor necesita la API: en PP-4 se levantaron las dos en local (`go run ./cmd/api` con las env vars de `docker-compose.yml` y `DATABASE_URL` a `localhost`; `pnpm dev` con `API_URL`/`BFF_SHARED_SECRET`) y se lo revisó con Chrome headless por CDP, poniendo la cookie `dm_session` de una cuenta de prueba creada con `POST /auth/register` + los mismos pasos de `scripts/qa-entorno-dev.sh` (que ya manda los datos que pide la clínica: provincia, ciudad, dirección y teléfono).
