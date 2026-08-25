# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

Dental Mirage: plataforma para odontólogos de Córdoba que combina gestión de clínica (turnero, agenda, pacientes) con una página pública propia deployable donde los pacientes piden turno, más un buscador público de clínicas. La especificación completa vive en `docs/dental-mirage-spec.md`; el plan de implementación fase por fase en `docs/implementation-plan.md`; las decisiones de arquitectura/alcance con sus alternativas descartadas en `docs/tradeoffs.md`; la spec del sistema de auth/onboarding (Google OAuth, verificación de mail, wizard de 3 pasos, clínicas individuales/organización) en `docs/feature-sumarte-login.md`. Leé esos cuatro antes de planificar o tocar un módulo nuevo — son la fuente de verdad, este archivo es solo el mapa rápido. `README.md` (raíz) tiene la puerta de entrada para levantar el proyecto de cero (setup, comandos, CI, deploy).

**Proyecto de referencia:** `../Marcuzzi_Madryn` — mismo stack y modo de trabajo, reutilizado sin cambios (spec §9). Ante cualquier duda de patrón (BFF, interfaces dev/prod, testing, flujo de ramas), ese repo es el ejemplo ya validado en producción de cómo aplicarlo.

## Stack (decidido, no "a evaluar" — spec §9.1)

- **Backend:** Go + [chi](https://github.com/go-chi/chi) + GORM, en `apps/api`.
- **Frontend:** Next.js + TypeScript + Tailwind, en `apps/web` — leer el `AGENTS.md` que genera cada versión de Next antes de escribir código, por posibles breaking changes.
- **DB:** PostgreSQL + extensión `btree_gist`.
- **Package manager JS:** `pnpm` (no `npm`).
- Requiere Docker corriendo (`docker compose up -d`) para Postgres local.

## Comandos

Desde la raíz del repo (`package.json` tiene los atajos; detalle completo en `README.md`):

- `pnpm run dev:web` / `pnpm run build:web` / `pnpm run lint:web` / `pnpm run typecheck:web`
- `pnpm run typecheck:shared-types`
- `pnpm run dev:api` (`go run ./cmd/api`) / `pnpm run build:api` (`go build ./...`) / `pnpm run vet:api`
- `pnpm run migrate:api` — aplica el esquema (AutoMigrate de GORM). Idempotente, se puede correr de nuevo sin romper nada.
- Lint de Go: `golangci-lint run ./...` dentro de `apps/api` (no tiene atajo en `package.json`).
- `pnpm run test:web` (Vitest) / `pnpm run test:api` (`go test ./internal/...`) — ver "Testing" abajo.
- `pnpm run test:coverage:web` / `pnpm run test:coverage:api` — mismo run + reporte de cobertura.
- Un test puntual: frontend `pnpm --filter @dental-mirage/web test <patrón del archivo o nombre>`; backend `cd apps/api && go test ./internal/<paquete>/... -run TestNombre`.
- `-race` (detector de condiciones de carrera en Go) no está en `test:api` porque alarga la corrida — para correrlo local: `cd apps/api && go test ./internal/... -race`.

Flujo de ramas activo desde antes de Sprint 4 — ver "Flujo de ramas" más abajo; no asumir que hay que crear una rama ni mergear a `main` sin que lo pidan explícitamente.

## El requisito no negociable: turnos sin solapamiento (spec §4.3)

Dos turnos de un mismo profesional no pueden solaparse en horario. Se garantiza con `EXCLUDE USING gist` sobre `(profesional_id, rango_horario)` en la tabla `turno`, **a nivel de base de datos**, no solo validación de app — mismo mecanismo que las reservas de alojamiento/vehículos en Marcuzzi_Madryn. El constraint solo aplica a turnos en estado `agendado` (los `pendiente`, recién llegados de la página pública, todavía no tienen hora fija — ver TR-006 en `docs/tradeoffs.md`). Cualquier intento de solapamiento debe fallar de forma controlada (error de validación en el modal), nunca como 500 crudo.

## Arquitectura del frontend: BFF con Server Actions — el navegador nunca llama a la API Go directo

Mismo patrón que Marcuzzi_Madryn: `apps/web/src/lib/api.ts` es `server-only`, sin prefijo `NEXT_PUBLIC_`. Todo el tráfico hacia `apps/api` pasa por Server Actions (`apps/web/src/app/actions/*.ts`, `"use server"`) o Route Handlers. La sesión (token opaco validado server-side contra `internal/auth.Session` en Go — ya no JWT stateless, ver TR-037 en `docs/tradeoffs.md`) va en cookie `httpOnly` (`lib/session.ts`), nunca en `localStorage`. Una pantalla nueva extiende `lib/api.ts` y se llama desde Server Component/Action — nunca un `fetch` nuevo desde Client Component.

## Interfaces con implementación dev/prod (spec §9.4)

Mismo patrón que Marcuzzi_Madryn para cada dependencia externa: interfaz en Go, implementación dev (no-op/log) e implementación prod activada por env var, inyectada desde `main.go`. El envío inicial del formulario público de turno **no** usa este patrón — es un link `wa.me` generado client-side (TR-003), no una integración de backend; el patrón dev/prod queda reservado para recordatorios automatizados futuros (Fase 2) y para las dependencias del auth nuevo, ya implementadas: `internal/mail` (Resend/`LogSender`), `internal/googleauth` (Google OAuth), `internal/turnstile` (CAPTCHA), `internal/security` (HaveIBeenPwned) — todas nil-safe/no-op sin la env var correspondiente configurada, ver `buildAuthDeps` en `cmd/api/main.go`. `internal/storage` (foto de perfil) solo tiene la implementación dev (disco local) hecha — R2/S3 prod queda pendiente, ver TR-046 en `docs/tradeoffs.md`.

## Timezone

Cualquier regla de fecha/hora "vigente" pasa por `internal/clock.Today()` fijado a `America/Argentina/Cordoba` (UTC-3), nunca `time.Now()` directo.

## Testing (gate real desde el día 1)

- Backend: tests contra Postgres real (no mocks), cada uno en su propia transacción revertida, `TEST_DATABASE_URL` debe terminar en `_test`.
- Frontend: Vitest + Testing Library + jsdom, todo mockeado a nivel `fetch`/Server Actions. El gate de cobertura excluye `src/app/**/page.tsx` (Server Components async, no testeables vía Testing Library/jsdom — quedan cubiertos por QA end-to-end manual, no por esta suite).
- **Gate: 80% de cobertura mínimo en ambos lados, activo desde Sprint 0** (a diferencia de Marcuzzi_Madryn, donde se agregó después — ver TR-007 en `docs/tradeoffs.md`), CI falla si no se cumple.

## Alcance del MVP vs. Fase 2

MVP (spec §2): alta de profesional individual + gestión de clínica completa (calendario, turnos, pacientes) + página pública con plantilla fija (sin editor visual) + buscador público. Login social (Google) y CAPTCHA (Turnstile) ya no están fuera de alcance — `docs/feature-sumarte-login.md` los pidió explícitamente, implementados. Cuentas de organización multi-profesional tampoco: el modelo de datos (`Clinic`/`ClinicMember`/roles) ya las soporta, aunque el envío/aceptación de invitaciones y el panel de gestión de miembros siguen sin implementar (fuera de alcance de esa misma feature, spec §9 — ver TR-044 en `docs/tradeoffs.md`). **Fuera de alcance salvo pedido explícito:** subdominios propios, editor visual drag & drop, perfil completo de "Sobre nosotros", historia clínica/presupuesto con funcionalidad real, recordatorios automatizados por WhatsApp/SMS, 2FA — no las implementes solo porque aparecen como preparación futura en la arquitectura (ver `docs/implementation-plan.md` sección 6).

## Flujo de ramas

Mismo criterio que Marcuzzi_Madryn: `main` (prod) ← solo merge cuando el usuario lo pide explícitamente ("mergeá") · `dev` (integración, push libre) ← `feature/`/`fix/` para trabajo grande, cambios chicos van directo a `dev`. Merge a `main` siempre vía `git merge --ff-only`.
