# PRISMA

Plataforma para odontólogos de Córdoba que combina gestión de clínica
(turnero, agenda, pacientes) con una página pública propia donde los
pacientes piden turno, más un buscador público de clínicas.

La especificación completa vive en
[`docs/Arquitectura y base/dental-mirage-spec.md`](docs/Arquitectura y base/dental-mirage-spec.md), el plan de
implementación fase por fase en
[`docs/Arquitectura y base/implementation-plan.md`](docs/Arquitectura y base/implementation-plan.md), y las
decisiones de arquitectura/alcance (con sus alternativas descartadas) en
[`docs/Arquitectura y base/tradeoffs.md`](docs/Arquitectura y base/tradeoffs.md). Antes de tocar un módulo nuevo,
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
| Monorepo      | pnpm workspaces (`apps/web`, `packages/shared-types`, `packages/prisma-engine`) + módulo Go independiente (`apps/api`) |
| Infra         | Render (un entorno) con los dos `Dockerfile` (Alpine 3.24, procesos sin root), Postgres administrado y Cloudflare R2 para las fotos |

Decisiones y alternativas descartadas de cada elección: `docs/Arquitectura y base/tradeoffs.md`
(TR-001 a TR-012 responden las preguntas abiertas de la spec — tipos de
consulta, validaciones, WhatsApp, especialidades, auth, coverage, CAPTCHA,
alcance de organización, identidad visual; TR-013 en adelante son ajustes
de ejecución posteriores).

El requisito no obvio más importante del proyecto: dos turnos de un mismo
profesional **no** se validan solo en la aplicación — la tabla `turnos`
tiene un `EXCLUDE USING gist` sobre `(atendido_por_user_id, rango_horario)`
a nivel de Postgres que impide solapamientos incluso ante bugs de
concurrencia en el backend, acotado a turnos en estado `agendado` (TR-006,
y TR-137 para el cambio de columna con el multi-tenant: la garantía es por
**profesional**, también entre dos clínicas distintas, no por clínica). Ver
`apps/api/internal/db` y la sección homónima en `CLAUDE.md`.

## Estructura del repo

```
apps/
  api/            # Backend Go (módulo independiente, no es un workspace pnpm)
    cmd/api/      # Entry point del servidor HTTP
    cmd/migrate/  # Entry point que aplica el esquema (idempotente)
    cmd/vapid/    # Genera las claves de los avisos al celular (Web Push)
    internal/     # Handlers, modelos, clock, testdb, etc.
    Dockerfile    # Imagen de producción (build en dos etapas)
  web/            # Frontend Next.js 16 (App Router)
    Dockerfile    # Imagen de producción (output: standalone)
packages/
  shared-types/   # Interfaces TS que reflejan a mano los structs de apps/api
  prisma-engine/  # Registro único de los módulos de la página pública: esquemas,
                  # temas, efectos y plantillas (se exportan a Go con engine:generar)
docs/             # Spec, plan, tradeoffs, fases, seguridad y optimización
scripts/          # qa-entorno-dev.sh: QA de punta a punta contra los contenedores
docker-compose.yml
render.yaml       # Blueprint de Render (Infrastructure as Code) — ver "Deploy"
lighthouserc.json # Presupuesto de rendimiento de la página pública (job de CI)
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
   existe. Desde 2026-09-09 aplica además las foreign keys del esquema y,
   si encuentra datos huérfanos, **se niega y los lista** en vez de fallar
   con un error opaco de Postgres (ver "Migraciones que borran datos").
3. **`api`** — backend Go (puerto `8080`), arranca recién cuando
   `migrate` terminó bien.
4. **`web`** — frontend Next.js (puerto `3000`), le habla a `api` por la
   red interna de Docker (`http://api:8080`), no por `localhost`.

Con eso arriba: **http://localhost:3000** es el sitio,
**http://localhost:8080** es la API.

Variables opcionales en desarrollo (`JWT_SECRET`, `CONTACTO_EMAIL`,
`BFF_SHARED_SECRET`, `DEV_TOOLS`, y `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
`VAPID_SUBJECT` para probar los avisos al celular en local):
copiar [`.env.example`](.env.example) a `.env` en la raíz antes de
levantar el stack si hace falta cambiar algún default.

> **`JWT_SECRET` es opcional SOLO en localhost.** Si `APP_BASE_URL` es
> una URL pública, el proceso **se niega a arrancar** si su valor resuelto
> es el de ejemplo del repo — incluida la variable puesta pero vacía o con
> solo espacios, que es el error humano más plausible (borrar el contenido
> del campo en el dashboard en vez de borrar la fila). Ver TR-125 y TR-176:
> hasta la segunda radiografía este control miraba `APP_ENV`, que en Render
> vale `development` a propósito, así que nunca corría en producción.
>
> Pese al nombre, **acá no hay ningún JWT**: la sesión es un token opaco
> validado contra la tabla `sessions` (TR-037). Esa variable firma con
> HMAC-SHA256 el parámetro `state` del login con Google, y nada más. El
> nombre quedó de una versión anterior y no se renombra para no romper
> deploys ya configurados; del lado de Go el campo se llama
> `Config.OAuthStateSecret`.

> **`DEV_TOOLS=true` prende las comodidades de desarrollo** que exponen
> datos: el código de verificación de 6 dígitos viaja en la respuesta HTTP
> (para no ir a buscarlo a los logs) y los detectores de abuso del wizard
> avisan sin bloquear mail/IP (para no limpiar la base a mano mientras se
> prueba). `docker compose` ya la trae puesta, así que no hay que hacer
> nada para el flujo normal.
>
> **Prenderla no alcanza para exponer nada:** el backend además exige que
> `APP_BASE_URL` apunte a localhost. Con un dominio público la variable se
> ignora y queda un `WARN` en el log de arranque diciéndolo — a propósito
> no se usa `APP_ENV` como señal, porque en este proyecto vale
> `development` incluso en Render (ver el deploy más abajo). Ver TR-135.

### Migraciones que borran datos

Una migración que destruye datos (borrar filas, dropear una columna o una
tabla) **no corre fuera de `development` sin autorización explícita**. Si
encuentra algo que destruir, el contenedor `migrate` frena con un mensaje
que dice qué migración es, cuántos elementos afectaría y qué hacer:

```
migración destructiva "limpiar_filas_legacy_sin_clinica" FRENADA en el
entorno "production": destruiría 38 elemento(s) — ...
Hacé un backup de la base ANTES de seguir. Con el backup hecho, volvé a
correr este contenedor con DB_ALLOW_DESTRUCTIVE=true para autorizarla
solo en esta corrida.
```

El permiso se pide **solo si de verdad hay algo que perder**: sobre una
base nueva —producción incluida— ninguna de estas migraciones pide nada y
el deploy pasa de largo. `DB_ALLOW_DESTRUCTIVE` no debe quedar prendida de
forma permanente: la protección es justamente el paso manual. Ver TR-132 y
`docs/Seguridad y optimizacion/radiografia-tecnica_1.md` §16.

Para bajar todo (y borrar el volumen de Postgres, si se quiere empezar de
cero):

```bash
docker compose down        # conserva el volumen (datos persistidos)
docker compose down -v     # borra también postgres_data y uploads_data (las fotos de la página pública)
```

### Opción B — Cada app suelta (mejor para iterar rápido con hot-reload)

Requisitos: Go ≥ 1.26 (el `go.mod` fija la versión, `go` la descarga sola
si hace falta con `GOTOOLCHAIN=auto`, el default), Node ≥ 20 (CI usa 22), pnpm ≥ 9.

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

   `apps/api/.env.example` incluye además las variables de las
   dependencias externas: Resend (mails), Google OAuth, Cloudflare
   Turnstile (CAPTCHA), HaveIBeenPwned, el storage de las fotos de la
   página pública (disco en local, Cloudflare R2 en producción) y las
   claves de los avisos al celular (VAPID). Ninguna es obligatoria en
   localhost — sin configurar, cada dependencia queda deshabilitada (mails
   al log, sin Google, sin CAPTCHA, fotos en disco, sin avisos al celular)
   en vez de romper el arranque; ver los comentarios del archivo para el
   detalle de cada una.
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

pnpm run typecheck:prisma-engine
pnpm run test:prisma-engine
pnpm run engine:generar       # exporta esquemas y catálogo de temas a apps/api (CI verifica que no cambie)
pnpm run validar:plantillas   # valida plantillas y presets contra los esquemas de los módulos

pnpm run dev:api              # go run ./cmd/api
pnpm run build:api            # go build ./...
pnpm run vet:api              # go vet ./...
pnpm run migrate:api          # go run ./cmd/migrate (idempotente)
pnpm run test:api             # go test ./internal/... — ver sección "Tests"
pnpm run test:coverage:api
```

Lint de Go (no tiene atajo en `package.json`, correr dentro de
`apps/api`): `golangci-lint run ./...`.

Otros que no tienen atajo:

- **Claves de los avisos al celular:** `cd apps/api && go run ./cmd/vapid`
  imprime `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`.
- **Presupuesto de rendimiento** (lo mismo que el job `lighthouse` de CI),
  desde la raíz y con `pnpm run build:web` hecho:
  `PRISMA_DEMO_PLANTILLAS=1 pnpm dlx @lhci/cli@0.15.1 autorun`.
- **QA del entorno real:** `scripts/qa-entorno-dev.sh`, contra los
  contenedores levantados con `docker compose up -d --build`.

## Tests

Suite de tests unitarios para ambos lados, con un piso de **80% de code
coverage** que CI hace cumplir desde el primer PR de código de negocio,
no agregado como iniciativa tardía (TR-007 en `docs/Arquitectura y base/tradeoffs.md`) — ver
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
por QA end-to-end manual (`docs/Arquitectura y base/implementation-plan.md`, T5.4), no por
esta suite.

Para iterar rápido en un archivo puntual: `pnpm --filter @dental-mirage/web
test <patrón del archivo>`.

## Integración continua

`.github/workflows/ci.yml` corre en cada push a `main` o `dev`, y en
cualquier pull request, con seis jobs y permisos de solo lectura sobre el
repo (`permissions: contents: read`, TR-178):

- **`web`**: regenera el catálogo de Prisma Engine y falla si difiere de
  lo commiteado (`engine:generar`), valida plantillas y presets, `eslint`,
  `next typegen && tsc --noEmit`, typecheck de `packages/shared-types` y
  `packages/prisma-engine`, los tests de `prisma-engine` y `next build`
  (con un reintento: el build descarga las fuentes de Google y a veces
  esa descarga falla sola).
- **`api`**: `go vet`, `golangci-lint`, `go build`.
- **`test-api`**: los tests de Go contra un Postgres real levantado como
  `services:` del job, con `-race` + coverage — falla el build si el
  total baja de 80%.
- **`test-web`**: la suite de Vitest con coverage — el propio
  `coverage.thresholds` de `apps/web/vitest.config.mts` hace fallar el
  comando por debajo de 80%.
- **`lighthouse`**: el presupuesto de rendimiento de la página pública
  (PE-9, TR-165), sobre páginas de demostración (`lighthouserc.json`).
- **`deploy`**: solo en push a `dev` (nunca en un pull request) y solo si
  `web`, `api`, `test-api` y `test-web` pasaron. Dispara los Deploy Hooks
  de `dental-mirage-api`/`dental-mirage-web` en Render. Un push a `main`
  corre todo lo demás pero no despliega (ver "Deploy").

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
`docs/Arquitectura y base/tradeoffs.md`): la idea original era prod + dev separados, cada uno
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
`generateValue: true` para `JWT_SECRET` y `BFF_SHARED_SECRET`, que Render
genera y guarda solos, sin que nadie los vea en texto plano — `JWT_SECRET`
además **no puede quedar vacía**: el backend se niega a arrancar si el
valor resuelto es el de ejemplo del repo).

`BFF_SHARED_SECRET` es el único que vive en **dos** servicios, con el MISMO
valor en los dos. En el blueprint lo genera la API y el web lo lee vía
`fromService` — pero eso solo se aplica si los servicios están conectados al
blueprint y se lo sincroniza; **si se crearon sueltos, la variable no
aparece sola** (pasó: se descubrió porque el wizard seguía registrando la IP
de salida del servicio web en vez de la del visitante). Para ese caso hay que cargarlo a
mano en los dos servicios, **generando el valor y pegándolo**, nunca
tipeándolo: ahí es justo donde se rompe — un carácter distinto entre
servicios y la API descarta la cabecera en silencio, sin error y sin log,
indistinguible de "no está configurado". Es lo que le permite al frontend
decirle a la API cuál es la IP real del visitante — sin él, la API ve la IP
del proceso web y el rate-limiting por IP más los detectores de abuso del
wizard cuentan a todos los visitantes como uno solo (TR-134). Si falta, el
backend avisa con un WARN al arrancar pero no se cae.

> ⚠️ **La base está en el plan `free` de Postgres a propósito**, mientras
> no haya profesionales reales cargados — **se borra sola a los 30 días
> de creada**, no es una degradación de performance. Subir a `starter`
> (o superior) en el dashboard de Render **antes del primer profesional
> real registrado**, no antes.

### Storage de fotos (Cloudflare R2)

Las fotos de la página pública viven en un bucket **privado** de
Cloudflare R2 (Fase 4.6, TR-167 en `docs/Arquitectura y base/tradeoffs.md`).
El navegador nunca le habla al bucket: la web sirve `/uploads/*` desde su
propio origen pidiéndole el archivo a la API, que lo lee de R2. En local
se usa el disco (`STORAGE_DIR`). Sin las variables de R2 cargadas en
Render, la subida responde 501 a propósito: el disco del contenedor se
pierde en cada deploy. Ver "Activar el storage de fotos" más abajo.

### Antes de desplegar por primera vez

1. **Cuenta de Render** conectada al repo de GitHub (`New +` → `Blueprint`
   → elegir este repo → Render detecta `render.yaml` solo y muestra un
   preview de los 3 recursos antes de crear nada).
2. **Cargar los secrets** que el blueprint dejó pendientes (`sync: false`,
   pestaña *Environment* de cada servicio en el dashboard de Render):
   - `dental-mirage-web`: `CONTACTO_EMAIL` (el dato real del cliente,
     reemplaza el placeholder de desarrollo).
   - `dental-mirage-api`: `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (envío real
     de mails — ver "Activar el envío real de mail" más abajo).
     **Obligatorias:** con una `APP_BASE_URL` pública la API no arranca
     sin `RESEND_API_KEY` (TR-176).
   - `dental-mirage-api`: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (login
     con Google) y `TURNSTILE_SECRET_KEY` (CAPTCHA). Estas sí son
     opcionales: sin cargarlas, esa dependencia queda deshabilitada (sin
     botón de Google, sin CAPTCHA) — nunca un 500, ver
     `docs/Login/feature-sumarte-login-resumen.md`.
   - `dental-mirage-api`: `STORAGE_R2_BUCKET`/`STORAGE_R2_ENDPOINT`/
     `STORAGE_R2_ACCESS_KEY`/`STORAGE_R2_SECRET_KEY` (fotos de la página
     pública — ver "Activar el storage de fotos" más abajo). Sin ellas la
     subida de fotos responde 501; con el bucket cargado y alguna de las
     otras vacía, la API **no arranca** (el log dice cuál falta).
   - `dental-mirage-api`: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
     `VAPID_SUBJECT` (avisos al celular, TR-179). Se generan una vez con
     `cd apps/api && go run ./cmd/vapid`; `VAPID_SUBJECT` es un `mailto:`
     de contacto (sin él se usa `APP_BASE_URL`, si es https). No están en
     `render.yaml`: se cargan a mano en el dashboard. Sin ellas la campana
     funciona igual pero no se ofrece activar avisos; con una sola de las
     dos claves, la API **no arranca**. Conviene no cambiarlas: cada
     dispositivo ya activado deja de recibir avisos hasta que su dueño
     vuelve a abrir la bandeja, donde la suscripción se rehace sola.
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
en `internal/mail/templates/`). **En un deploy público es obligatorio**:
con una `APP_BASE_URL` pública, la API no arranca sin `RESEND_API_KEY`
(TR-176). La verificación automática de cuentas sin mail
(`AutoVerifyEmail`, TR-051) quedó solo para localhost: en un entorno
público dejaba registrarse con el mail de una persona invitada y aceptar
la invitación en su lugar (segunda radiografía, B3). Para activarlo:

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
5. Guardar → Render redeploya `dental-mirage-api` solo.
6. Verificar: registrar una cuenta de prueba real y confirmar que el mail
   de verificación llega (revisar spam la primera vez).

### Activar el storage de fotos (Cloudflare R2)

El código ya está completo (`internal/storage.R2Storage`, TR-167). Para
activarlo:

1. En el dashboard de Cloudflare, **R2 Object Storage → Create bucket**.
   Dejarlo **privado**: sin acceso público, sin dominio propio y sin la
   URL `r2.dev`. Las fotos se sirven a través de la API.
2. **R2 → Manage API tokens → Create API token**, con permiso *Object
   Read & Write* y acotado a ese bucket. Cloudflare muestra una sola vez
   el *Access Key ID* y el *Secret Access Key*, junto con el endpoint S3
   de la cuenta (`https://<account_id>.r2.cloudflarestorage.com`).
3. En Render, `dental-mirage-api` → *Environment*, cargar:
   - `STORAGE_R2_BUCKET`: el nombre del bucket del paso 1.
   - `STORAGE_R2_ENDPOINT`: el endpoint del paso 2, sin el nombre del
     bucket al final.
   - `STORAGE_R2_ACCESS_KEY` / `STORAGE_R2_SECRET_KEY`: las claves del
     paso 2.
   - `STORAGE_R2_REGION` no hace falta (vacía = `auto`).
4. Guardar → Render redeploya `dental-mirage-api` solo.
5. Verificar: subir una foto desde `/personalizar-pagina`, ver que el
   objeto aparece en el bucket y que la foto se sigue viendo después de
   un "Manual Deploy" de la API.

Las fotos subidas en producción antes de activar R2 se perdieron con el
disco del contenedor: hay que volver a subirlas.

## Flujo de ramas

- **`main`** — lo que está en producción (rol de "prod"). Solo recibe
  merge desde `dev` cuando el cliente lo pide explícitamente ("mergeá"),
  siempre vía `git merge --ff-only`.
- **`dev`** — rama de integración, push libre. Todo el trabajo en curso
  converge acá antes de pasar a `main`.
- **`feature/<nombre-corto>`** / **`fix/<nombre-corto>`** — reservadas
  para trabajo grande (funcionalidades/bugs generales), salen de `dev` y
  vuelven a `dev` por pull request, que se mergea con merge commit. CI
  tiene que pasar antes de mergear; conviene borrar la rama después (el
  repo no lo hace solo).
- **Cambios chicos** (ajustes de UI, un tweak puntual, bugs menores) —
  commit directo a `dev`, sin abrir rama.

## Estado del proyecto

Resumen por etapa. El detalle fase por fase está en
`docs/Arquitectura y base/implementation-plan.md`, el funcional en
`dental-mirage-spec.md` y cada decisión, con sus alternativas descartadas,
en `tradeoffs.md`.

### MVP (Sprints 0 a 5)

Sprints 0 a 4 completados y verificados (onboarding, gestión de clínica,
turnos entrantes + pacientes + formulario público, página pública + deploy
+ búsqueda). De Sprint 5 quedó armada la infraestructura de CI y deploy:
el sistema corre en Render, un solo entorno que se redeploya con cada push
a `dev` que pasa CI (ver "Deploy").

### Fase 2 — completa (2026-09-07)

Calendario avanzado y autogestión de turnos: los 5 ítems del brief
(calendario mobile, ajustes de horario de atención/tipos de consulta/
horarios reservados, selección de horario por el paciente, compartir
calendario por link efímero), los 5 extra pedidos después del QA (dashboard
rediseñado, autoreservar turnos, formulario público reescrito con
verificación por código, DNI único por clínica, filtros rápidos) y los de
identidad y seguridad (paciente verificado y "ya he venido antes",
detección de conflictos de identidad, 3 detectores anti-abuso, "sacar turno
para otro" con tutor). Plan en §11, decisiones TR-078 a TR-120.

### Fase 3 — multi-tenant, completa (2026-09-12 a 2026-09-26)

N profesionales por clínica y N clínicas por profesional, con recepción.
Brief y bitácoras en `docs/Fases post MVP/Fase 3/`; modelo de datos con los
diagramas ER de antes y después en `docs/Arquitectura y base/modelo de datos/`;
plan por subfases en `implementation-plan.md` §13; decisiones TR-133 a
TR-162 y TR-166.

| Subfase | Estado |
|---|---|
| 3.1 — cambios al wizard público (1 turno activo por DNI **y tipo de consulta**, "ya he venido antes" con turno activo, repetir turno de otro tipo) | ✅ 2026-09-12 (TR-133) |
| 3.1.1 / 3.1.2 — la IP real del visitante, y la topología de proxies que no era la que decía la documentación | ✅ 2026-09-13 (TR-134, TR-136) |
| 3.2.1 — esquema y migración: el modelo soporta N↔N sin que cambie una sola pantalla | ✅ 2026-09-13 (TR-137) |
| 3.2.2 — roles y permisos en el backend, y el aislamiento entre colegas | ✅ 2026-09-13 (TR-138) |
| 3.2.3 — onboarding y "¿dónde trabajás hoy?": la clínica activa se elige y vive en la sesión; el perfil deja de asumir que todos atienden pacientes | ✅ 2026-09-13 (TR-139) |
| 3.2.4 — colaboradores: invitar por código o mail, confirmar del otro lado, roles con exclusión | ✅ 2026-09-14 (TR-140) |
| 3.2.5 — panel del profesional: selector de clínica, colaboradores con presencia real, tipos de consulta de colegas, el historial del paciente con su dueño | ✅ 2026-09-14/15 (TR-142 a TR-145) |
| 3.2.7 — el wizard público elige tipo y después profesional, el enlace compartido decide con quién y para quién, y dos rondas de ajustes | ✅ 2026-09-15/19 (TR-146 a TR-149, TR-156 a TR-159) |
| 3.2.6 — vista del recepcionista: un **profesional en foco** guardado en la sesión. Sin foco, la vista general de la clínica; con foco, las mismas pantallas comportándose como ese profesional | ✅ 2026-09-20/21 (TR-160) |
| 3.2.8 — latencia y cierre. La presencia en tiempo real ya se había resuelto en la 3.2.5 (sale de `sessions`, sin sockets); la latencia, con la ronda de optimización post-Fase 3; y el cierre, con la segunda radiografía técnica (ver abajo) | ✅ 2026-09-22/26 (TR-161, TR-162) |

Después del cierre entró un ajuste pedido por el cliente: **un paciente
tiene un mail y un teléfono principales, y el resto son alternativos
editables** (TR-166, PR #60).

Tres cosas de esta fase valen para cualquiera que toque el código: **la
columna que apunta a la clínica se llama `clinic_id`** en todo el esquema
(antes `profesional_id`, que ya guardaba un `clinics.id`); **el aislamiento
entre colegas vive en un scope**, `soloMisTurnos`/`soloMisPacientes`, no en
cada query, y dos tests (`TestAislamiento_*`) fallan si una consulta nueva
se lo saltea; y **quién es "yo" puede no ser quien apretó el botón** —
recepción trabaja parada en la vista de un profesional, así que lo que
guarda "de quién es esta fila" sale del foco y no de la sesión. Ver
`CLAUDE.md`.

### Fase 4 y Prisma Engine — la página pública personalizable

La página pública dejó de ser una plantilla fija. Definición en
`docs/Fases post MVP/Fase 4/`, plan del motor en
`docs/Fases post MVP/Prisma Engine/plan-prisma-engine.md`, plan en
`implementation-plan.md` §14 y resumen en `dental-mirage-spec.md` §14.

- **Fase 4.1 a 4.5** (PR #43 y #44, TR-150 a TR-155): bio, temas con
  variantes de color y tipografías, portada, redes, mapa, fotos, módulos
  que se muestran, ocultan y reordenan, y un editor en
  `/personalizar-pagina` (solo el rol `admin`) con vista previa en móvil,
  tablet y escritorio.
- **Prisma Engine** (PR #50 a #52, #54, #55 y #57 a #59): un registro único de módulos en
  `packages/prisma-engine`, que el backend valida en Go; **borrador y
  Publicar** con historial de versiones y candado ante dos personas
  editando a la vez (PE-8); tokens de diseño y variantes por módulo
  (TR-163); efectos y fondos animados, apagados por defecto (TR-164);
  módulos del rubro (equipo, horarios, servicios) y plantillas por
  especialidad; y SEO, imagen para compartir, fotos en WebP a tres anchos
  y un presupuesto de Lighthouse en CI (TR-165).
- **Fase 4.6 — storage en producción** (PR #61, TR-167): las fotos viven
  en un bucket privado de Cloudflare R2 y se sirven desde el mismo origen
  de la web. Se activa cargando `STORAGE_R2_*` en Render.
- **Plan de pulido** (PR #62 a #68, TR-168 a TR-174): 27 hallazgos del
  editor y de la página pública vistos en un navegador real y con axe —
  accesibilidad, el editor en el celular, deshacer en vez de confirmar,
  anchos de lectura y limpieza automática de fotos huérfanas—, todos
  resueltos.

Pendiente sin fecha: el link de vista previa firmado del borrador,
deshacer/rehacer en el editor, el resumen "qué cambió" antes de Publicar y
el versionado de la forma de cada módulo (`schema_version`).

### Notificaciones por cuenta y avisos al celular (2026-09-26/27)

Pedido directo del cliente (PR #71, TR-179; plan §15, spec §15).

- **Una campana en el header**, en toda pantalla con sesión, con el número
  de avisos sin leer de la cuenta (de todas sus clínicas). Abre un panel
  desde la derecha con dos pestañas, **Nuevas** y **Leídas**.
- **Qué avisa:** los turnos que entran solos (por la página pública o por
  un link compartido) y una bienvenida. Lo reciben el profesional que
  atiende y la recepción de esa clínica, cuya copia dice para qué
  profesional es. Cada cuenta ve solo su bandeja.
- **Cada aviso de turno** muestra fecha, horario, paciente, tipo de
  consulta y clínica. Expandirlo lo marca como leído, y "Ver turno" lleva
  al turno en el calendario, cambiando de clínica y de vista si hace falta.
- **Avisos al celular (Web Push)**, por dispositivo, que llegan con la app
  cerrada. PRISMA se puede instalar en la pantalla de inicio; en iPhone es
  obligatorio para recibirlos (regla de Apple, iOS 16.4+). Implementado
  con la biblioteca estándar de Go (VAPID + cifrado `aes128gcm`, verificado
  contra el vector del RFC 8291), sin dependencias nuevas.
- **Para activar los avisos al celular en producción** hay que cargar las
  claves VAPID en Render (ver "Deploy"). Sin ellas, la campana y la
  bandeja funcionan igual; solo no se ofrece activar los avisos.

### Pulido visual del panel y la home (2026-09-26/27)

- **Panel** (PR #72, TR-180): las tarjetas de "General" se despliegan al
  entrar en la pantalla, con dibujos propios; el sidebar tiene íconos
  propios que marcan la sección donde se está; y "Ver perfil" funciona en
  el celular.
- **Home** (PR #73 y #74, TR-181): simple y al pie, con dibujos propios
  —el mate, el celular, el calendario—, la historia de Lucía en tres
  escenas (el WhatsApp de noche, el link, la calma), cuatro ventajas y la
  entrada para pacientes. Una primera versión con siete secciones se
  descartó por cargada.

### Seguridad y optimización

No es un trabajo de una vez: es una **línea de trabajo recurrente**, con
una ronda por etapa. Los documentos, en `docs/Seguridad y optimizacion/`:

| Documento | Qué es |
|---|---|
| [`radiografia-tecnica_2.md`](<docs/Seguridad y optimizacion/radiografia-tecnica_2.md>) | **El diagnóstico vigente** (2026-09-26): la segunda pasada general, sobre todo el proyecto después de la Fase 3, la Fase 4 y Prisma Engine. Hallazgos, cómo se cerró cada fase y los tests que reproducen cada problema |
| [`snapshot-2026-09-09.md`](<docs/Seguridad y optimizacion/snapshot-2026-09-09.md>) | El inventario de qué hace seguro y eficiente al sistema —sesiones, CAPTCHA, códigos de verificación, detectores de abuso, aislamiento, integridad de la base, headers, BFF— tomado al cerrar la primera radiografía |
| [`radiografia-tecnica_1.md`](<docs/Seguridad y optimizacion/radiografia-tecnica_1.md>) | La primera radiografía (2026-09-08/09), módulo por módulo, y el registro de cada ronda de arreglos |
| [`optimizacion-post-fase3.md`](<docs/Seguridad y optimizacion/optimizacion-post-fase3.md>) | La ronda de optimización post-Fase 3 (2026-09-22/23): qué se midió y cómo, qué se aplicó de caché, goroutines y colas, y qué se descartó, con los números |
| [`como-se-arreglo-cada-cosa.md`](<docs/Seguridad y optimizacion/como-se-arreglo-cada-cosa.md>) | El **porqué** de cada decisión, la alternativa descartada en cada caso, y los bugs que introdujo el propio trabajo de las auditorías |
| [`scripts/qa-entorno-dev.sh`](scripts/qa-entorno-dev.sh) | QA del entorno real de punta a punta, para correr antes de cada ronda |

**Primera radiografía** (2026-09-08/09, TR-121 a TR-132, plan §12):
el modelo de confianza de la IP del cliente, techos al body y a los
timeouts, arranque seguro, paginación de los listados del panel, índices
que faltaban, logging estructurado sin la query string, **foreign keys
reales** (de 4 constraints a 33), el guardián de migraciones que borran
datos, migraciones de datos separadas de las de esquema, tests de
aislamiento entre clínicas y Go 1.26.

**Optimización post-Fase 3** (2026-09-22/23, TR-161 y TR-162): el índice
que faltaba para la consulta más común del panel (de un escaneo de la tabla
entera a 0,077 ms), `/me` pedido una vez por página en vez de tres, los
contadores del tablero en una sola pasada, el endpoint que se sondea cada 2
segundos cortando antes de cargar nada, y el "próximo horario disponible"
del wizard de 172 a 13 ms. En la revisión apareció una **fuga de
privacidad del wizard** —con solo conocer un DNI se veía el turno de otra
persona— que quedó cerrada (addendum de TR-147). Redis, memcache y las
goroutines dentro de un request se evaluaron y se descartaron, con la
condición que las activaría.

**Segunda radiografía** (2026-09-26, TR-175 a TR-178): Fases A, B y C
cerradas el mismo día.

- **Next.js 16.3.3**, que corrige dos vulnerabilidades críticas de
  ejecución remota publicadas para la versión en uso.
- **Un enlace compartido prueba la identidad solo de la ficha a la que
  apunta** (TR-175): con cualquier enlace vigente se podían listar los
  pacientes de otra familia y reservarles turno (reproducido).
- **Los controles de arranque miran la URL pública, no `APP_ENV`**
  (TR-176): en Render `APP_ENV` vale `development`, así que el freno del
  secreto de ejemplo nunca corría. Con una URL pública la API no arranca
  sin Resend, y la verificación automática de mails quedó solo para
  localhost.
- **Endpoints públicos con consultas fijas** (TR-177): el buscador pasó de
  201 a 5 consultas con 25 clínicas, y ya no crece con ellas. Y **como mucho
  4 hashes de contraseña a la vez**: sin tope, unos 25 logins simultáneos
  llenaban la memoria de la instancia.
- **Tope de 120 lecturas públicas por minuto por IP**, la página pública
  responde 404 solo si la clínica no existe, **contenedores sin root**
  sobre Alpine 3.24, CI con permisos de solo lectura, el mail de Google
  normalizado y una CSP más cerrada (TR-178).

**Lo que queda abierto, y qué lo activa.** De la segunda radiografía, la
caché de la página pública entre requests y paginar el buscador, cada uno
con su condición escrita. De la primera, migrar el rate-limiter por IP a
Redis y ajustar el pool de conexiones, que necesitan más de una instancia
del backend (hoy hay una), y partir los archivos más grandes, postergado
porque es lo único que puede introducir regresiones sin arreglar nada
(TR-130).

> ⚠️ **Lo único urgente: no hay sistema de backups.** La base está en el
> plan `free` de Render a propósito mientras no haya clínicas reales — y
> ese plan **se borra solo a los 30 días**. Subir de plan y armar backups
> antes del primer profesional real no es opcional. Ver el snapshot,
> sección "Lo que NO está, y por qué".
