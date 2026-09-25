# Fase 4.1 a 4.3 — Estado de la implementación (para retomar)

> **Actualización 2026-09-18 (tarde): la 4.1 a 4.3 ya está commiteada y MERGEADA a `dev` (PR #43).** El resto de este documento dice "nada commiteado, falta commit + PR" y quedó desactualizado en ese punto — se conserva como registro. Para la 4.4 y 4.5 ver `fase4.4-4.5-estado-implementacion.md`; las decisiones de arquitectura están en `tradeoffs.md` TR-150 a TR-153.

**Actualizado 2026-09-18: 4.1+4.2+4.3 completas y verificadas — falta solo el commit + PR.**
Todo lo que este documento listaba como pendiente (tests de `clinicas_test.go`/CHECK de temas, frontend de la 4.2 completo, verificación final) ya está hecho — ver "Qué quedó HECHO" más abajo, ahora fusionado en una sola sección. Nada se commiteó todavía: sigue pendiente de que el usuario confirme el paso de commit + PR (pedido explícito: recién cuando las tres subfases estén completas y verificadas, no antes).

**Rama:** `feature/fase4.1-a-4.3-personalizar-pagina` (sale de `dev`, nada commiteado todavía — todo sigue como cambios sin stagear).

**Por qué está todo junto en una rama:** pedido explícito del usuario — todavía no tiene ownership del repo, así que 4.1 + 4.2 + 4.3 van en un solo PR para que el dueño revise menos PRs separados. El PR se abre recién cuando la 4.3 esté cerrada del todo, no antes.

**Definición funcional aprobada:** `docs/Fases post MVP/Fase 4/fase4-personalizar-pagina.md` (leer primero si hace falta refrescar el alcance).

**Plan técnico de 4.2+4.3 aprobado por el usuario:** `C:\Users\kevin\.claude\plans\swift-forging-meerkat.md` (fuera del repo, en el home de Claude Code) — tiene el detalle de diseño completo (por qué reemplazo total de módulos y no CRUD parcial, por qué tipografía compartida entre temas, estructura exacta de los endpoints). Vale la pena releerlo antes de seguir.

---

## Qué quedó HECHO y VERIFICADO

### Subfase 4.1 — Modelo de datos (100% completa)
- `PaginaPublica` extendida (`apps/api/internal/db/models.go`): `Bio`, `Tema`/`TemaVariante`/`TemaTipografia`, `FotoPortadaURL`, `RedesSociales` (jsonb), `MostrarMapa`, `DireccionOverride`, relación `Modulos`.
- Tabla nueva `PaginaPublicaModulo` (`pagina_publica_modulos`).
- FK `fk_pagina_publica_modulos_pagina` en RESTRICT (`migrate_fk.go`).
- Tests de FK (rechazo + contrapeso) en `migrate_fk_test.go`.

### Subfase 4.2 — Endpoints backend (backend 100% completo y testeado; frontend 0%)

**Backend Go, todo en `apps/api/internal/http/pagina_publica.go` (reescrito) y `clinicas.go`:**
- `PATCH /panel/pagina` — reemplazo completo del contenido (bio, tema/variante/tipografía, redes sociales, mostrar mapa, dirección override, y `modulos` como reemplazo total vía DELETE+INSERT transaccional). Valida tema/variante/tipografía contra el catálogo de la 4.3 y cada tipo de módulo contra la lista cerrada.
- `GET /panel/pagina` — devuelve todo el contenido + `modulos` + `estadisticas` calculadas en el momento.
- `POST /panel/pagina/fotos` — upload multipart, wireado a `internal/storage.Storage` (nuevo campo `AuthDeps.Storage`, nil-safe → 501 sin configurar). Valida content-type (jpeg/png/webp) y tamaño (5 MiB).
- `estadisticasDeLaClinica()` — `pacientes_atendidos` (COUNT DISTINCT) y `turnos_realizados`, **solo turnos con `asistencia = 'asistio'`**, clínica-wide. Nada de rating/reseñas (decisión cerrada con el usuario).
- **Fix del bug owner-only**: `profesionalesActivosDeLaClinica()` + `especialidadesUnicasDe()` (nuevos helpers en `clinicas.go`) — especialidades de la página pública y del buscador ahora son la unión de TODOS los profesionales activos, no solo el owner. `buscarClinicasHandler` ahora busca por nombre de CUALQUIER profesional activo (antes solo el owner podía aparecer en resultados de búsqueda por nombre).
  - **`ProfesionalNombre` se dejó como el owner a propósito** — mostrar a todo el equipo en la vidriera pública es diseño de plantilla, eso es la 4.5, no este fix.

**Storage wiring (`cmd/api/main.go`, `internal/http/auth.go`, `internal/http/router.go`):**
- `Config.StorageDir`/`StoragePublicURL`/R2 **ya existían** en `config.go`/`.env.example` (reservados para foto de perfil, nunca usados) — se reusaron tal cual, no se inventaron env vars nuevas.
- *(Superado por la 4.6, TR-167: hoy `buildStorage` usa R2 si está configurado.)* `buildStorage()` en `main.go`: si `STORAGE_R2_BUCKET` está seteado, **falla el arranque** (R2 no existe todavía, TR-046/Fase 4.6) en vez de degradar en silencio a disco local (que se perdería en cada deploy).
- `/uploads/*` se sirve como archivos estáticos desde `router.go`, montado solo si `AuthDeps.StorageDir != ""`.

**Tests (todos en `apps/api/internal/http/pagina_publica_test.go`, TODOS PASANDO):** PATCH de contenido exitoso, rechazo de tema inválido, rechazo de variante de OTRO tema (ej. `clinico-1` con `tema=calido`), rechazo de tipo de módulo inválido (`portada` no se persiste), reemplazo completo de módulos en 2 PATCH sucesivos, 403 sin rol admin, upload exitoso, rechazo de content-type inválido, 501 sin storage, 401 sin auth, estadísticas con turnos asistido/ausente/sin marcar mezclados (helper nuevo `newTestRouterWithStorage` en `testhelpers_test.go`).

### Subfase 4.3 — Catálogo de temas (100% completa, el mecanismo de aplicación visual es 4.5)

**Frontend (`apps/web/src/lib/temas-pagina-publica/`, carpeta nueva):**
- `paletas.ts` — 5 temas (calido/clinico/moderno/natural/clasico) × 3 variantes cada uno, mecanismo `color-mix()` igual al de `temaTipoConsulta()` (reuso del patrón ya probado del calendario, no pares verificados a mano).
- `tipografias.ts` — 5 pares de Google Fonts, **compartidos entre temas** (no exclusivos — decisión tomada durante la planificación para no cargar hasta 15 pares de fuentes). `next/font/google` en un archivo aparte del layout raíz, listo para importarse en `/[slug]` y `/personalizar-pagina` cuando llegue la 4.5.
- `index.ts` — combina ambos, `TIPOGRAFIAS_POR_TEMA` (qué 2 tipografías ofrece cada tema).
- **Nada de esto está wireado a ninguna pantalla todavía** — es catálogo puro, a propósito (aplicarlo es la 4.5, junto con el renderizado dinámico de módulos).

**Backend Go (`apps/api/internal/http/temas_pagina_publica.go`, archivo nuevo):**
- `temasValidos`/`tipografiasValidas` — espejo exacto de los IDs del catálogo TS. **Si se toca uno, hay que tocar el otro en el mismo cambio** (dejado como comentario en ambos archivos).
- `temaEsValido(tema, variante)` — valida que la variante pertenezca al tema correcto (ej. `clinico-1` con `tema=calido` se rechaza).
- CHECK constraints agregados en `migrate.go` (`chk_pagina_publica_tema`, `_tema_variante`, `_tema_tipografia`) — cierran la promesa que dejó la 4.1 ("sin CHECK hasta que el catálogo exista").

---

## Qué se completó en la sesión del 2026-09-18 (lo que este documento listaba como PENDIENTE)

### 1. Tests que faltaban — hechos
- `clinicas_test.go`: `TestBuscarClinicas_PorNombreDeProfesionalNoOwner` (busca por nombre de un colega que no es owner) y `TestGetClinicaPublica_EspecialidadesUnenTodosLosProfesionalesActivos` (unión de especialidades de titular + colega). El colega se arma con `sumarColaboradorDePrueba` + un `db.ProfessionalProfile` creado a mano (`gdb.Create(...)`), tal como este documento ya anticipaba — `sumarColaboradorDePrueba` no crea perfil solo.
- `internal/db/migrate_tema_test.go` (archivo nuevo, `package db_test`): 5 tests del CHECK del catálogo de temas — rechaza `tema`/`tema_variante`/`tema_tipografia` fuera del catálogo, y el contrapeso (acepta valores reales y el default `""` sin elegir todavía). Ojo con un detalle que no era obvio: el CHECK valida cada columna contra SU PROPIO catálogo plano, no la relación cruzada tema↔variante (eso lo valida `temaEsValido` en Go, ya testeado en `pagina_publica_test.go`) — así que no hay (ni tiene sentido escribir) un test de "variante de otro tema" a nivel de base.
- Suite completa corrida contra el Postgres 16 efímero de la Fase 4.1 (puerto 5433, recreado — sobrevivió el cierre de Docker Desktop de la sesión anterior, contra lo que este documento asumía): `go test ./internal/...` — **todo OK**, incluidos los tests de aislamiento/visibilidad. Coverage total: 80.5% (gate 80%, al límite pero adentro).

### 2. Frontend de la 4.2 — hecho
- `packages/shared-types/src/index.ts`: `PaginaPublica` extendida con todos los campos nuevos + interfaz `PaginaPublicaModulo` (`config?: Record<string, unknown>`).
- `apps/web/src/lib/api.ts`: `apiActualizarPaginaPublica` (PATCH) y `apiSubirFotoPaginaPublica` (multipart, primero de todo el repo). Requirió un cambio chico en `requestRaw`: ya no fuerza `Content-Type: application/json` cuando el body es un `FormData` — si no, pisaba el boundary que `fetch` necesita generar solo.
- `apps/web/src/app/actions/pagina-publica.ts`: `actualizarPaginaPublicaAction`, calcando `putHorarioAtencionGeneralAction` — revalida `/personalizar-pagina` siempre y `/buscar` si `deployadaEn` viene seteado en la respuesta.
- `pagina-editor.tsx` **sigue sin tocar**, tal como pedía este documento — conectarlo es la Subfase 4.4. Sí hubo que tocar dos lugares que construían un `PaginaPublica` a mano con solo `{oculta, deployadaEn}` y dejaron de compilar al volverse la interfaz más grande: el fallback de `personalizar-pagina/page.tsx` y los fixtures de `pagina-editor.test.tsx` (ahora una única constante `paginaVacia` reusada en los 9 tests, en vez de repetir el objeto).
- `pnpm run typecheck:shared-types` y `pnpm run typecheck:web` — limpios.

### 3. Verificación final — hecha
- `go build ./... && go vet ./...` — limpio.
- `gofmt` sobre una copia sin CRLF (como pide `CLAUDE.md`) — sin diferencias.
- `golangci-lint` **sigue sin estar instalado en este entorno** — no se pudo correr, igual que en la sesión anterior; queda para CI.
- `pnpm run test:api` (contra el Postgres efímero) y `go test ./internal/... -coverprofile=... ` — 80.5% total.
- `pnpm run lint:web` — 0 errores (10 warnings preexistentes, no relacionados).
- `pnpm --filter @dental-mirage/web test` (suite completa) y `pnpm run test:coverage:web` — 101 archivos/1138 tests OK, cobertura total 81.44% statements / 80.54% branches / 80.64% functions / 82.7% lines (los cuatro por encima del gate de 80%). Los catálogos nuevos de `temas-pagina-publica/` (sin tests propios, son datos) no la hicieron caer.
- Migración real: `go run ./cmd/migrate` contra el Postgres 16 del contenedor efímero (no contra el `docker-compose.yml` del proyecto — su puerto 5432 sigue ocupado por `proyecto-pasantias-postgres-1`, otro proyecto, nunca tocar) — aplica limpio, sin pedir `DB_ALLOW_DESTRUCTIVE`.
- Prueba manual de punta a punta con `curl` contra el servidor real (`go run ./cmd/api`, puerto 8099 para no chocar con nada): registro → perfil → clínica → `POST /panel/pagina/fotos` con un PNG real → la URL devuelta sirvió el archivo (200, `content-type: image/png`) → `GET`/`PATCH /panel/pagina` devuelven y aceptan bio/tema/variante/módulos correctamente.

### 4. Lo único que falta: commit + PR a `dev`
Según lo pedido — recién cuando 4.1+4.2+4.3 estén completas y verificadas (ya lo están). Sigue sin commitear a propósito hasta que el usuario lo confirme explícitamente.

---

## Decisiones/gotchas técnicos para no redescubrir

- **GORM crea su propia FK automática** cuando declarás una relación `hasMany` con tag `foreignKey` en el struct — con un nombre propio, sin pasar por el `clavesForaneas()` manual del proyecto. Se soluciona con `constraint:-` en el tag (ya aplicado en `PaginaPublica.Modulos`). Si se agrega otra relación hasMany nueva en cualquier fase futura, ojo con esto.
- **Actualizar por `map[string]any` en GORM es terreno no probado en este repo** para campos con `serializer:json` (como `RedesSociales`) — se usó el patrón YA probado (`me.go`, `updateMeHandler`): struct + `.Select(campos...)` + `.Updates(structVal)`.
- **Puerto 5432 suele estar ocupado** por un contenedor de OTRO proyecto (`proyecto-pasantias-postgres-1`) en esta máquina — nunca tocarlo. Para testear, se usó un contenedor Postgres 16 efímero propio en el puerto 5433 (`docker run --name mirage-fase4-test-pg ...`), no el `docker-compose.yml` del proyecto. Al cerrar Docker Desktop ese contenedor efímero se pierde solo — hay que recrearlo si se retoma el trabajo (comando completo abajo).
- **`Config.StorageDir`/`StoragePublicURL`/los 4 campos R2 ya existían** en `config.go` y `.env.example`, reservados para "foto de perfil" y nunca usados — se reusaron tal cual para esta feature, no se inventaron variables nuevas.
- **`AuthDeps` tiene ahora `Storage` (interfaz) Y `StorageDir` (string) como dos campos separados** — el segundo es SOLO para que `router.go` pueda montar el file server de `/uploads/*` (la interfaz `Storage` no expone su propio directorio).

### Para recrear el Postgres efímero de testing
```bash
docker run -d --name mirage-fase4-test-pg -e POSTGRES_USER=dental_mirage -e POSTGRES_PASSWORD=dental_mirage -e POSTGRES_DB=dental_mirage -p 5433:5432 postgres:16
# esperar a que esté listo, después:
docker exec mirage-fase4-test-pg psql -U dental_mirage -d dental_mirage -c "CREATE DATABASE dental_mirage_test;"
# correr tests con:
# TEST_DATABASE_URL="postgres://dental_mirage:dental_mirage@localhost:5433/dental_mirage_test?sslmode=disable" go test ./internal/...
```
