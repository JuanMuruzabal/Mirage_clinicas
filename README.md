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
    Dockerfile    # Imagen de producción (build en dos etapas)
  web/            # Frontend Next.js 16 (App Router)
    Dockerfile    # Imagen de producción (output: standalone)
packages/
  shared-types/   # Interfaces TS que reflejan a mano los structs de apps/api
docs/             # Spec, plan de implementación, tradeoffs
docker-compose.yml
render.yaml       # Blueprint de Render (Infrastructure as Code) — ver "Deploy"
```

## Cómo correr el proyecto

### Opción A — Docker Compose (recomendada para levantar todo de una)

Requisito: Docker Desktop corriendo. No hace falta tener Go, Node ni pnpm
instalados en la máquina — todo se buildea dentro de los contenedores.

```bash
docker compose up --build
```

Esto levanta, en orden, con las dependencias correctas entre servicios:

1. **`postgres`** — Postgres 16 (puerto `5432`).
2. **`migrate`** — aplica el esquema y termina. Es idempotente: corre en
   cada `docker compose up` sin romper nada, incluso si el esquema ya
   existe.
3. **`api`** — backend Go (puerto `8080`), arranca recién cuando
   `migrate` terminó bien.
4. **`web`** — frontend Next.js (puerto `3000`), le habla a `api` por la
   red interna de Docker (`http://api:8080`), no por `localhost`.

Con eso arriba: **http://localhost:3000** es el sitio,
**http://localhost:8080** es la API.

Variables opcionales (`JWT_SECRET`, `CONTACTO_EMAIL`): copiar
[`.env.example`](.env.example) a `.env` en la raíz antes de levantar el
stack si hace falta cambiar algún default de desarrollo.

Para bajar todo (y borrar el volumen de Postgres, si se quiere empezar de
cero):

```bash
docker compose down        # conserva el volumen (datos persistidos)
docker compose down -v     # borra también postgres_data
```

### Opción B — Cada app suelta (mejor para iterar rápido con hot-reload)

Requisitos: Go ≥ 1.25 (el `go.mod` fija la versión, `go` la descarga sola
si hace falta con `GOTOOLCHAIN=auto`, el default), Node ≥ 20, pnpm ≥ 9.

1. Levantar solo Postgres:
   ```bash
   docker compose up -d postgres
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

   `apps/api/.env.example` incluye además las variables del módulo de
   auth/onboarding (`docs/feature-sumarte-login.md`): Resend (mails),
   Google OAuth, Cloudflare Turnstile (CAPTCHA), HaveIBeenPwned y storage
   de foto de perfil. Ninguna es obligatoria en dev — sin configurar,
   cada dependencia queda deshabilitada (mails van al log, sin Google, sin
   CAPTCHA) en vez de romper el arranque; ver los comentarios del archivo
   para el detalle de cada una.
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

`.github/workflows/ci.yml` corre en cada push a `main` o `dev`, y en
cualquier pull request, con seis jobs:

- **`web`**: `eslint`, `next typegen && tsc --noEmit`, typecheck de
  `packages/shared-types`, `next build`.
- **`api`**: `go vet`, `golangci-lint`, `go build`.
- **`test-api`**: los tests de Go contra un Postgres real levantado como
  `services:` del job, con `-race` + coverage — falla el build si el
  total baja de 80%.
- **`test-web`**: la suite de Vitest con coverage — el propio
  `coverage.thresholds` de `apps/web/vitest.config.mts` hace fallar el
  comando por debajo de 80%.
- **`deploy-prod`**: solo en push directo a `main` (nunca en un
  pull_request) y solo si los cuatro jobs de arriba pasaron. Dispara los
  Deploy Hooks de `dental-mirage-api`/`dental-mirage-web` en Render.
- **`deploy-dev`**: mismo criterio, pero en push a `dev` — dispara los
  Deploy Hooks de `dental-mirage-api-dev`/`dental-mirage-web-dev`. Los dos
  entornos (ver "Deploy" abajo) se redeployan automáticamente, cada uno
  solo con el push a su propia rama.

Antes de abrir un PR, correr localmente el mismo pipeline que corre CI
(los comandos de arriba, en el mismo orden) evita sorpresas — en
particular, `pnpm run typecheck:web` genera los tipos de rutas de Next
(`next typegen`) antes de tipar, porque un checkout limpio (como el de
CI) no tiene un `.next/` con esos tipos generado todavía, a diferencia de
una máquina de desarrollo donde casi siempre queda uno de una corrida
anterior.

## Deploy

Un solo entorno por ahora corre en [Render](https://render.com) —
Postgres administrado + los dos `Dockerfile` ya existentes (mismas
imágenes que `docker-compose.yml`, sin una segunda definición de build
paralela). Toda la topología vive versionada en
[`render.yaml`](render.yaml) (Blueprint, Infrastructure as Code) en la
raíz del repo.

**Un solo entorno, tres recursos** (corrección 2026-08-24, ver TR-021 en
`docs/tradeoffs.md`): la idea original era prod + dev separados, cada uno
con su propia base — el plan free de Render solo permite **una** base
Postgres por cuenta, así que por ahora queda un solo trío:

| Recurso | Nombre en Render |
|---|---|
| Base de datos | `dental-mirage-db` |
| API | `dental-mirage-api` |
| Web | `dental-mirage-web` |

**El deploy es automático y dispara con push a `dev`, no a `main`**
(ver "Integración continua" arriba, job `deploy`) — mientras solo haya un
entorno, tiene más sentido que el que se redeploya solo sea el de
integración/prueba; `main` sigue corriendo el pipeline completo de
tests/build en cada push, pero no dispara ningún redeploy todavía.
Volver a separar un entorno de prod real (con su propia base, atado a
`main`) es agregar de nuevo el segundo trío de recursos a `render.yaml`
en cuanto se pague un plan que permita una segunda base — la nota grande
al principio de ese archivo deja el patrón anterior documentado para
retomarlo tal cual.

**Los valores de los secrets nunca están en el repo.** `render.yaml` solo
declara qué variables existen; cada una marcada `sync: false` se carga
una única vez desde el dashboard de Render al aplicar el blueprint (o
`generateValue: true` para `JWT_SECRET`, que Render genera y guarda solo,
sin que nadie lo vea en texto plano).

> ⚠️ **La base está en el plan `free` de Postgres a propósito**, mientras
> no haya profesionales reales cargados — **se borra sola a los 30 días
> de creada**, no es una degradación de performance. Subir a `starter`
> (o superior) en el dashboard de Render **antes del primer profesional
> real registrado**, no antes.

### Storage de fotos (pendiente — perfil de profesional y página pública)

Todavía no existe la feature de subir fotos (ni de perfil ni de la página
pública) — `render.yaml` ya reserva los env vars de Cloudflare R2
(`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
`R2_PUBLIC_URL`, `sync: false`) para no tener que volver a tocar el
blueprint cuando se construya. A diferencia de `Marcuzzi_Madryn` (una
sola aplicación, un dueño), acá va a haber **N profesionales**, cada uno
con sus propias fotos — la convención de key pensada para eso, namespaced
por profesional en vez de un bucket plano: `paginas/{profesionalId}/{filename}`
y `perfiles/{profesionalId}/{filename}`. Ver TR-020 en `docs/tradeoffs.md`.

### Antes de desplegar por primera vez

1. **Cuenta de Render** conectada al repo de GitHub (`New +` → `Blueprint`
   → elegir este repo → Render detecta `render.yaml` solo y muestra un
   preview de los 3 recursos antes de crear nada).
2. **Cargar los secrets** que el blueprint dejó pendientes (`sync: false`,
   pestaña *Environment* de cada servicio en el dashboard de Render):
   - `dental-mirage-web`: `CONTACTO_EMAIL` (el dato real del cliente,
     reemplaza el placeholder de desarrollo).
   - `dental-mirage-api`: `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (envío real
     de mails — ver "Activar el envío real de mail" más abajo),
     `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (login con Google) y
     `TURNSTILE_SECRET_KEY` (CAPTCHA). Todas nil-safe: sin cargarlas, esa
     dependencia puntual queda deshabilitada (mails solo se loguean, sin
     botón de Google, sin CAPTCHA) — nunca un 500, ver
     `docs/feature-sumarte-login-resumen.md`.
   - `dental-mirage-web`: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`/
     `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (mismo Google Client ID de arriba,
     y la site key pública de Turnstile) — sin esto, el botón de Google y
     el widget de CAPTCHA directamente no se renderizan. **Estas dos son
     build-time, no runtime** (Next.js las inyecta en el JS del cliente
     durante `next build`, ver `apps/web/Dockerfile`) — cargarlas en el
     dashboard con el servicio ya desplegado NO alcanza por sí solo,
     Render necesita un build nuevo para que entren; un "Manual Deploy"
     (sin "Clear build cache" hace falta) alcanza, porque agregarlas
     invalida el layer del Dockerfile que las usa.
3. **Deploy automático gateado por CI** (job `deploy` en `ci.yml`): en
   `dental-mirage-api` y `dental-mirage-web` por separado — **Settings**
   → **Deploy Hook**, copiar esa URL. Cargar cada una como secret del
   repo en GitHub: **Settings → Secrets and variables → Actions →
   pestaña "Secrets"** → nombres exactos `RENDER_DEPLOY_HOOK_API`,
   `RENDER_DEPLOY_HOOK_WEB`. Sin estos secrets, CI sigue pasando igual
   pero el job `deploy` falla — hay que seguir deployando a mano desde
   Render mientras tanto.
4. Deploy inicial. El primer request a `/health` puede tardar (plan free
   duerme los servicios sin tráfico — cold start) — no es un error.

Si algún día cambia el nombre de un servicio o se conecta un dominio
propio, `CORS_ALLOWED_ORIGINS`/`APP_BASE_URL` (en `dental-mirage-api`) y
`API_URL` (en `dental-mirage-web`) están hardcodeados en `render.yaml` a
las URLs `*.onrender.com` por defecto — actualizarlos a mano (Render no
permite interpolar la URL de un servicio dentro de otro en el blueprint).

### Activar el envío real de mail (Resend)

El código ya está completo (`internal/mail.ResendSender`, plantillas HTML
en `internal/mail/templates/`) — mientras `RESEND_API_KEY` no esté
cargada, las cuentas nativas nuevas quedan verificadas de entrada en vez
de esperar un mail que nunca se manda (`AutoVerifyEmail`, TR-051 en
`docs/tradeoffs.md`). Para activarlo de verdad:

1. Crear una cuenta en [resend.com](https://resend.com) (si todavía no
   existe).
2. **Verificar un dominio de envío** (pestaña *Domains*): agregar los
   registros DNS que pide Resend (SPF/DKIM) en el proveedor del dominio
   real del cliente. Sin un dominio propio verificado, Resend permite
   mandar desde `onboarding@resend.dev` para pruebas, pero con límites
   bajos — no pensado para uso real con pacientes/profesionales.
3. Generar una **API key** (pestaña *API Keys*).
4. En el dashboard de Render, `dental-mirage-api` → *Environment*, cargar:
   - `RESEND_API_KEY`: la key del paso 3.
   - `RESEND_FROM_EMAIL`: una dirección del dominio verificado en el
     paso 2 (ej. `no-reply@tudominio.com`) — **no** un mail cualquiera,
     Resend rechaza el envío si el dominio del remitente no está
     verificado en la cuenta.
5. Guardar → Render redeploya `dental-mirage-api` solo. Apenas el
   servicio arranca con `RESEND_API_KEY` no vacía, `AutoVerifyEmail` se
   apaga automáticamente — ningún otro cambio de código ni de config.
6. Verificar: registrar una cuenta de prueba real y confirmar que el mail
   de verificación llega (revisar spam la primera vez).

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
uno, en `docs/implementation-plan.md`. De Sprint 5 (pulido, QA end-to-end,
salida a producción), la infraestructura de CI/deploy (T5.5) ya está
armada — Dockerfiles, `render.yaml`, deploy automático por rama; falta
aplicar el blueprint en el dashboard de Render y cargar los secrets (ver
"Deploy" arriba). El resto de Sprint 5 (mobile-first, QA end-to-end) sigue
pendiente.
