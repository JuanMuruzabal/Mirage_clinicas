# Dental Mirage

Plataforma para odontólogos de Córdoba que combina gestión de clínica
(turnero, agenda, pacientes) con una página pública propia donde los
pacientes piden turno, más un buscador público de clínicas.

La especificación completa vive en
[`docs/dental-mirage-spec.md`](docs/dental-mirage-spec.md), el plan de
implementación fase por fase en
[`docs/implementation-plan.md`](docs/implementation-plan.md), y las
decisiones de arquitectura/alcance (con sus alternativas descartadas) en
[`docs/tradeoffs.md`](docs/tradeoffs.md). Antes de tocar un módulo nuevo,
esos tres son la fuente de verdad — este README es solo la puerta de
entrada. `CLAUDE.md` (raíz del repo) tiene el mapa rápido de convenciones
para trabajar acá con ayuda de un agente de IA.

**Proyecto de referencia:** [`../Marcuzzi_Madryn`](../Marcuzzi_Madryn) —
mismo stack y modo de trabajo, ya validado en producción. Ante cualquier
duda de patrón (BFF, interfaces dev/prod, testing, flujo de ramas), ese
repo es el ejemplo de cómo aplicarlo.

## Stack

| Capa          | Tecnología                                                                 |
|---------------|-----------------------------------------------------------------------------|
| Backend       | Go + [chi](https://github.com/go-chi/chi) (router) + GORM (acceso a datos) |
| Frontend      | Next.js 16 + TypeScript + Tailwind CSS                                      |
| Base de datos | PostgreSQL 16, extensión `btree_gist` + exclusion constraints              |
| Monorepo      | pnpm workspaces (`apps/web`, `packages/shared-types`) + módulo Go independiente (`apps/api`) |

Decisiones y alternativas descartadas de cada elección: `docs/tradeoffs.md`
(TR-001 a TR-012 responden las preguntas abiertas de la spec — tipos de
consulta, validaciones, WhatsApp, especialidades, auth, coverage, CAPTCHA,
alcance de organización, identidad visual; TR-013 en adelante son ajustes
de ejecución posteriores).

El requisito no obvio más importante del proyecto: dos turnos de un mismo
profesional **no** se validan solo en la aplicación — `turno.rango_horario`
tiene un `EXCLUDE USING gist` a nivel de Postgres que impide solapamientos
incluso ante bugs de concurrencia en el backend, acotado a turnos en estado
`agendado` (ver TR-006 en `docs/tradeoffs.md`). Ver `apps/api/internal/db`
y la sección homónima en `CLAUDE.md`.

## Estructura del repo

```
apps/
  api/            # Backend Go (módulo independiente, no es un workspace pnpm)
    cmd/api/      # Entry point del servidor HTTP
    cmd/migrate/  # Entry point que aplica el esquema (idempotente)
    internal/     # Handlers, modelos, clock, testdb, etc.
  web/            # Frontend Next.js 16 (App Router)
packages/
  shared-types/   # Interfaces TS que reflejan a mano los structs de apps/api
docs/             # Spec, plan de implementación, tradeoffs
docker-compose.yml
```

## Cómo correr el proyecto

Todavía no hay `Dockerfile` para `apps/api`/`apps/web` (eso es Sprint 5,
T5.5 — deploy, pendiente), así que por ahora **Docker solo levanta
Postgres**; el backend y el frontend corren directo en la máquina.

Requisitos: Docker Desktop corriendo (para Postgres), Go ≥ 1.25 (el
`go.mod` fija la versión, `go` la descarga sola si hace falta con
`GOTOOLCHAIN=auto`, el default), Node ≥ 20, pnpm ≥ 9.

1. Levantar Postgres:
   ```bash
   docker compose up -d
   ```
2. Instalar dependencias del monorepo JS (desde la raíz):
   ```bash
   pnpm install
   ```
3. Copiar los `.env.example` de cada app:
   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```
   Ninguno de los dos es estrictamente necesario para arrancar — ambos
   tienen defaults seguros en el código (`localhost:5432`/`8080` — ver
   `internal/config` y `lib/api.ts`) — pero documentan qué variables
   existen y hacen falta si algo corre en un puerto/host distinto.
4. Aplicar el esquema (idempotente, se puede correr de nuevo sin romper
   nada):
   ```bash
   pnpm run migrate:api
   ```
5. Levantar backend y frontend en dos terminales:
   ```bash
   pnpm run dev:api   # go run ./cmd/api — http://localhost:8080
   pnpm run dev:web   # next dev         — http://localhost:3000
   ```

Con eso arriba: **http://localhost:3000** es el sitio,
**http://localhost:8080** es la API (`GET /health` confirma que también
llega a Postgres).

Para bajar Postgres (y borrar el volumen si se quiere empezar de cero):

```bash
docker compose down        # conserva el volumen (datos persistidos)
docker compose down -v     # borra también postgres_data
```

### Comandos útiles (desde la raíz del repo)

```bash
pnpm run dev:web              # next dev
pnpm run build:web            # next build
pnpm run lint:web             # eslint
pnpm run typecheck:web        # next typegen && tsc --noEmit
pnpm run typecheck:shared-types
pnpm run test:web             # vitest run — ver sección "Tests" más abajo
pnpm run test:coverage:web

pnpm run dev:api              # go run ./cmd/api
pnpm run build:api            # go build ./...
pnpm run vet:api              # go vet ./...
pnpm run migrate:api          # go run ./cmd/migrate (idempotente)
pnpm run test:api             # go test ./internal/... — ver sección "Tests"
pnpm run test:coverage:api
```

Lint de Go (no tiene atajo en `package.json`, correr dentro de
`apps/api`): `golangci-lint run ./...`.

## Tests

Suite de tests unitarios para ambos lados, con un piso de **80% de code
coverage** que CI hace cumplir desde el primer PR de código de negocio,
no agregado como iniciativa tardía (TR-007 en `docs/tradeoffs.md`) — ver
"Integración continua" más abajo.

### Backend (Go)

Los tests de `apps/api` usan **Postgres real, no mocks** — GORM genera
queries que un mock hay que sincronizar a mano, y el exclusion constraint
de turnos (ver arriba) no se puede simular con sentido de otra forma.
`internal/testdb` conecta a una base separada de la de desarrollo; cada
test corre en su propia transacción que se revierte al terminar, así que
no hace falta limpiar nada a mano entre corridas.

1. Postgres tiene que estar corriendo (`docker compose up -d` alcanza).
2. La base de test se resuelve de `TEST_DATABASE_URL`, en el mismo
   `apps/api/.env` que `DATABASE_URL` — el default ya apunta a
   `dental_mirage_test` en el mismo Postgres de `docker-compose.yml`.
   **El nombre tiene que terminar en `_test`** — `internal/testdb` lo
   valida y aborta si no, para que nunca sea posible correr la suite
   contra la base de desarrollo por accidente.
3. Correr desde la raíz:
   ```bash
   pnpm run test:api            # go test ./internal/...
   pnpm run test:coverage:api   # + coverage, imprime el % total al final
   ```
   CI corre además con `-race` (detector de condiciones de carrera); para
   correrlo local: `cd apps/api && go test ./internal/... -race`.

### Frontend (Next.js/TypeScript)

Vitest + Testing Library + jsdom, sin Postgres ni backend de por medio —
todo mockeado a nivel de `fetch`/Server Actions. No hace falta nada
levantado de antemano.

```bash
pnpm run test:web             # vitest run
pnpm run test:coverage:web    # + coverage (falla si algún indicador < 80%)
```

El gate de coverage excluye `src/app/**/page.tsx` (Server Components
async, no unit-testeables vía Testing Library/jsdom) — quedan cubiertos
por QA end-to-end manual (`docs/implementation-plan.md`, T5.4), no por
esta suite.

Para iterar rápido en un archivo puntual: `pnpm --filter @dental-mirage/web
test <patrón del archivo>`.

## Integración continua

`.github/workflows/ci.yml` corre en cada push a `main` y en cualquier pull
request, con cuatro jobs:

- **`web`**: `eslint`, `next typegen && tsc --noEmit`, typecheck de
  `packages/shared-types`, `next build`.
- **`api`**: `go vet`, `golangci-lint`, `go build`.
- **`test-api`**: los tests de Go contra un Postgres real levantado como
  `services:` del job, con `-race` + coverage — falla el build si el
  total baja de 80%.
- **`test-web`**: la suite de Vitest con coverage — el propio
  `coverage.thresholds` de `apps/web/vitest.config.mts` hace fallar el
  comando por debajo de 80%.

Todavía no hay un job `deploy` — Sprint 5 (T5.5) no arrancó, no hay
target de deploy confirmado ni `Dockerfile` por app. Se suma cuando esa
fase arranque, mismo patrón que `Marcuzzi_Madryn` (CI gatea el deploy,
nunca un push directo).

Antes de abrir un PR, correr localmente el mismo pipeline que corre CI
(los comandos de arriba, en el mismo orden) evita sorpresas — en
particular, `pnpm run typecheck:web` genera los tipos de rutas de Next
(`next typegen`) antes de tipar, porque un checkout limpio (como el de
CI) no tiene un `.next/` con esos tipos generado todavía, a diferencia de
una máquina de desarrollo donde casi siempre queda uno de una corrida
anterior.

## Flujo de ramas

- **`main`** — lo que está en producción (rol de "prod"). Solo recibe
  merge desde `dev` cuando el cliente lo pide explícitamente ("mergeá"),
  siempre vía `git merge --ff-only`.
- **`dev`** — rama de integración, push libre. Todo el trabajo en curso
  converge acá antes de pasar a `main`.
- **`feature/<nombre-corto>`** / **`fix/<nombre-corto>`** — reservadas
  para trabajo grande (funcionalidades/bugs generales), salen de `dev` y
  vuelven a `dev`.
- **Cambios chicos** (ajustes de UI, un tweak puntual, bugs menores) —
  commit directo a `dev`, sin abrir rama.

## Estado del proyecto

Sprints 0 a 4 completados y verificados (onboarding, gestión de clínica,
turnos entrantes + pacientes + formulario público, página pública + deploy
+ búsqueda) — detalle sprint por sprint, con las verificaciones de cada
uno, en `docs/implementation-plan.md`. Sprint 5 (pulido, QA end-to-end,
salida a producción) es lo que queda.
