# apps/web — Next.js dentro de un monorepo pnpm (depende de
# packages/shared-types vía "workspace:*"), así que el build NECESITA
# contexto de la raíz del repo, no solo apps/web.
#
# Build context: raíz del monorepo (ver docker-compose.yml,
# build.context: . / build.dockerfile: apps/web/Dockerfile, y
# render.yaml, dockerContext: .).
#
# A diferencia de Marcuzzi_Madryn, acá no hace falta ningún ARG/--build-arg
# para variables NEXT_PUBLIC_* — Dental Mirage no tiene ninguna (spec
# §9.3, BFF sin excepciones: API_URL y CONTACTO_EMAIL son server-only, se
# leen recién en runtime, nunca se inlinean en el JS del cliente).
#
# Sigue el patrón oficial de Next.js para "output: standalone" en
# monorepos: https://nextjs.org/docs/app/api-reference/config/next-config-js/output

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11 --activate

# --- deps: instala node_modules de todo el workspace, cacheable por
# separado de los cambios de código fuente ---
FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

# --- build: código fuente + `next build` (genera .next/standalone) ---
FROM base AS build
WORKDIR /repo
COPY --from=deps /repo ./
COPY apps/web apps/web
COPY packages/shared-types packages/shared-types
RUN pnpm --filter @dental-mirage/web build

# --- runtime: solo lo que server.js standalone necesita para correr ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# 0.0.0.0: el server standalone escucha en localhost por defecto, lo que
# lo dejaría inalcanzable desde fuera del contenedor.
ENV HOSTNAME=0.0.0.0

COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
