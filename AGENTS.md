# Instrucciones para agentes

## Antes de trabajar

- Lee `CLAUDE.md` en la raíz: contiene las convenciones del proyecto, decisiones de arquitectura y estado de las fases. Para cambios de producto o arquitectura, consulta también `docs/Arquitectura y base/dental-mirage-spec.md`, `docs/Arquitectura y base/implementation-plan.md` y `docs/Arquitectura y base/tradeoffs.md`.
- Si trabajas en `apps/web`, sigue además `apps/web/AGENTS.md` y lee la documentación de Next.js instalada en `apps/web/node_modules/next/dist/docs/` que corresponda al cambio. `apps/web/CLAUDE.md` remite a esa guía.
- Conserva los cambios preexistentes del usuario. No crees ramas, hagas commits, pushes ni merges salvo que te lo pidan.

## Mapa del proyecto

- Monorepo pnpm: `apps/web` (Next.js 16, TypeScript y Tailwind), `packages/shared-types` (tipos mantenidos a mano que reflejan respuestas Go) y `packages/prisma-engine` (registro compartido de módulos y temas de la página pública).
- `apps/api` es un módulo Go independiente; la API usa chi, GORM y PostgreSQL.
- `docs/` contiene la especificación, el plan, las decisiones y los planes de fases activos. README.md describe setup, ejecución y despliegue.

## Reglas que afectan el diseño

- El navegador no llama directamente a la API Go: el frontend usa Server Actions o Route Handlers y `apps/web/src/lib/api.ts` del lado servidor. La sesión vive en cookie `httpOnly`.
- La base de datos garantiza que los turnos agendados de un profesional no se solapen. Conserva también el aislamiento multi-tenant y los scopes existentes al cambiar consultas o endpoints.
- Las reglas de fecha vigente usan `internal/clock.Today()` en zona `America/Argentina/Cordoba`.
- Los tipos de `packages/shared-types` se actualizan a mano cuando cambia la forma JSON de la API.
- Si se cambian schemas o el catálogo de `packages/prisma-engine`, ejecuta `pnpm run engine:generar` para actualizar los artefactos Go versionados.

## Zona Prisma Engine en curso

La advertencia inicial de `CLAUDE.md` enumera las áreas cubiertas por el plan Prisma Engine. Antes de editar, borrar o mover archivos de esas áreas, informa al usuario del posible conflicto y espera su respuesta, salvo que la rama actual sea `feature/pe-*` o `docs/prisma-engine*`, o el usuario ya haya indicado que trabaja en ese plan. La tabla de estado y el documento `docs/Fases post MVP/Prisma Engine/plan-prisma-engine.md` indican qué partes siguen abiertas. No agregues módulos, variantes, temas o tipografías fuera del registro y catálogo compartidos.

## Comandos habituales

- Frontend: `pnpm run dev:web`, `pnpm run build:web`, `pnpm run lint:web`, `pnpm run typecheck:web`, `pnpm run test:web`.
- Paquetes: `pnpm run typecheck:shared-types`, `pnpm run typecheck:prisma-engine`, `pnpm run test:prisma-engine`.
- API: `pnpm run build:api`, `pnpm run vet:api`, `pnpm run test:api`; requieren Go y, para tests, PostgreSQL según `CLAUDE.md`.
- Usa pnpm para workspaces JS. Ejecuta verificaciones solo cuando el usuario las solicite o la tarea requiera explícitamente verificar el resultado.
