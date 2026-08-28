# apps/web — Next.js dentro de un monorepo pnpm (depende de
# packages/shared-types vía "workspace:*"), así que el build NECESITA
# contexto de la raíz del repo, no solo apps/web.
#
# Build context: raíz del monorepo (ver docker-compose.yml,
# build.context: . / build.dockerfile: apps/web/Dockerfile, y
# render.yaml, dockerContext: .).
#
# API_URL y CONTACTO_EMAIL son server-only, se leen recién en runtime,
# nunca se inlinean en el JS del cliente — esas SÍ pueden ir directo como
# ENV del contenedor final, sin pasar por acá.
#
# NEXT_PUBLIC_GOOGLE_CLIENT_ID/NEXT_PUBLIC_TURNSTILE_SITE_KEY (sumadas
# con el login social, después del comentario de arriba) son la
# excepción: Next.js las inyecta en el JS del cliente EN BUILD TIME
# (`next build`, más abajo), no en runtime — sin declararlas acá como
# ARG y pasarlas a ENV antes de ese paso, quedan `undefined` HORNEADAS
# en el bundle para siempre, sin importar qué valor se cargue después en
# el contenedor ya corriendo (bug real, 2026-08-28: "cargué las
# variables de Google pero el botón sigue sin aparecer" — Render
# reenvía automáticamente cada env var del servicio como build-arg con
# el mismo nombre, pero si el Dockerfile no la declara con `ARG` no hay
# nada que la reciba, https://render.com/docs/docker-secrets).
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
# ARG → ENV: ninguno es secreto (viajan al navegador de por sí, ver el
# comentario grande de arriba) — sin este puente, `next build` los ve
# como `undefined` aunque Render/docker-compose los pasen bien como
# build-arg, porque un ARG solo, sin promoverlo a ENV, no queda visible
# para el proceso que corre el RUN de abajo.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
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
