# Fase 4.4 y 4.5 — Estado de la implementación (para retomar)

**Actualizado 2026-09-18: implementadas y verificadas por suite + build + HTML server-side. Sin commitear. Falta QA en un navegador real.**

**Rama:** `feature/fase4.4-4.5-editor-y-render` (sale de `dev` después del merge del PR #43). Todo son cambios sin stagear. `CLAUDE.md` también tiene cambios sin commitear (correcciones de comandos, previas a esta fase).

Decisiones y su porqué: `docs/Arquitectura y base/tradeoffs.md` **TR-150 a TR-153**. Definición funcional: `fase4-personalizar-pagina.md`. Lo de 4.1 a 4.3: `fase4.1-a-4.3-estado-implementacion.md` (mergeado; ese documento decía "nada commiteado" y quedó desactualizado en ese punto).

## Qué se hizo

### Backend (`apps/api/internal/http`)
- `pagina_publica.go`: el `PATCH` acepta `fotoPortadaUrl`; valida URLs de foto, redes sociales y largos de texto; un texto vacío se guarda como NULL; `respuestaDePagina` centraliza la respuesta e incluye `direccionClinica`.
- **Bug corregido:** ocultar un módulo se guardaba como visible (GORM + `default:true`). Se escribe aparte con `Update("visible", false)`.
- `clinicas.go`: `GET /clinicas/{slug}` devuelve `personalizada` (hay módulos guardados aunque estén ocultos).
- Tests nuevos: `pagina_publica_editor_test.go` (9). Suite completa verde, 80.8 % de cobertura (gate 80).

### Frontend (`apps/web`)
- **Lógica pura** en `src/lib/pagina-publica/`: `modulos.ts` (catálogo, defaults, reordenamiento, payload), `borrador.ts`, `contenido.ts`, `enlaces.ts` (links seguros). `src/lib/temas-pagina-publica/aplicar.ts` traduce un tema a custom properties + tipografía.
- **Plantilla** (`components/public/clinica-publica-template.tsx` + `modulos-publicos.tsx`): dibuja portada, menú, turno y los módulos en orden, en una grilla de 1 columna (2 desde tablet, por container query).
- **Editor** (`components/pagina-editor.tsx` + `components/editor-pagina/`): borrador, guardar/descartar, pestañas Módulos/Diseño, lista reordenable (`@dnd-kit` + flechas), editor por tipo de módulo, subida de fotos, vista previa móvil/tablet/escritorio.
- `actions/pagina-publica.ts`: `subirFotoPaginaPublicaAction` (501 → mensaje explicativo).
- `next.config.ts`: `serverActions.bodySizeLimit: "6mb"` (default 1 MB; las fotos llegan a 5 MiB).
- `vitest.setup.ts`: stub de `next/font/google` (las 8 fuentes de `tipografias.ts`; si se suma una, agregarla ahí).
- **Dependencias nuevas:** `@dnd-kit/core`, `sortable`, `utilities`. Lockfile regenerado con pnpm 11.
- Verificación: `typecheck` web y shared-types limpios, lint sin errores nuevos (10 warnings preexistentes), 106 archivos / 1269 tests, cobertura 82.9/81.5/81.8/84.1 (gate 80); backend 80.9 %, `next build` OK.

## Qué NO está verificado (hacerlo antes del PR)

La extensión de Chrome no estaba conectada, así que **nadie vio la pantalla**. Verificado con el stack real (API + web + Postgres) por HTTP: subida y servido de una foto, guardado de contenido completo, y que el HTML de `/{slug}` trae tema, tipografía, portada, módulos en orden, links, mapa y NO trae el módulo oculto. **Falta mirar en un navegador:**

1. **El modal del wizard de turno** dentro de la plantilla nueva. El `@container` está solo alrededor de la grilla justamente para no romperlo (TR-151), pero es la regresión más cara si se equivocó.
2. **La grilla** en móvil / tablet / escritorio, dentro y fuera del editor (el marco de la vista previa).
3. **Las fuentes** de cada tema cargando de verdad (que el `.variable` del `next/font` llegue al subárbol).
4. **El arrastre con mouse y teclado** (los tests solo cubren las flechas).
5. **Subir una foto real** desde `/personalizar-pagina` (límite de 6 MB del Server Action).
6. `/personalizar-pagina` con un usuario que no es `admin` (redirige, ya estaba).

## Cómo levantar el entorno de prueba

Igual que en `fase4.1-a-4.3-estado-implementacion.md` (Postgres efímero `mirage-fase4-test-pg` en el 5433 — **nunca** tocar los contenedores de otros proyectos). Con Docker Desktop arriba: `docker start mirage-fase4-test-pg`, después

```bash
cd apps/api
export PORT=8099 APP_ENV=development DATABASE_URL="postgres://dental_mirage:dental_mirage@localhost:5433/dental_mirage?sslmode=disable" \
  JWT_SECRET=dev-secret-cambiar-en-produccion CORS_ALLOWED_ORIGINS=http://localhost:3000 BFF_SHARED_SECRET=dev-bff-secret \
  DEV_TOOLS=true APP_BASE_URL=http://localhost:3000 STORAGE_DIR=./tmp/storage STORAGE_PUBLIC_URL=http://localhost:8099/uploads
go run ./cmd/migrate && go run ./cmd/api
# en otra terminal
cd apps/web && API_URL=http://localhost:8099 BFF_SHARED_SECRET=dev-bff-secret pnpm exec next dev -p 3000
```

La base ya tiene un usuario de prueba (`editor-qa@example.com` / `UnaClaveLarga123!`, clínica `cl-nica-sonrisas`) con una página de ejemplo guardada; si se perdió, se recrea con el mismo flujo de `scripts/qa-entorno-dev.sh` (registro → `UPDATE users SET email_verified_at…` → `PATCH /onboarding/perfil` → `PATCH /onboarding/clinica`).

## Gotchas para no redescubrir

- **El working tree está en CRLF** y varios archivos de `apps/api` lo confirman. Un reemplazo de texto multilínea hecho sin normalizar falla **en silencio** (no encuentra el bloque y no avisa): pasó con `clinicas.go`. Verificar con `grep` después de editar, o normalizar a LF, reemplazar y volver a CRLF.
- **El `@container` no se mueve más arriba** (TR-151).
- **`horarios` no está en el editor** a propósito (TR-151).
- **En producción las fotos no se pueden subir hasta la 4.6.**
- **Nombre propio de módulo y nombre sobre la portada** (TR-155): el nombre de un módulo es una etiqueta del EDITOR (`config.nombre`), no un título público; el color del nombre es un set curado con su velo (`lib/pagina-publica/portada.ts`, espejo del backend y del CHECK). Los inputs controlados no deben pasar su valor por `trim()`: se come el espacio al tipear.
- **Las fotos locales se sirven por `/uploads/*` de la WEB** (TR-154), no directo de la API: la CSP bloquea imágenes de otro origen o de http. Si tocás la CSP (`middleware.ts`), `middleware.test.ts` fija que `img-src` no acepte http y que `frame-src` contenga el embed de Maps.
- **Al levantar un stack de prueba, mirá qué hay en el puerto 3000** (`docker ps`): si el usuario tiene su `docker compose` andando, `next dev` falla con EADDRINUSE y las pruebas le pegan a la versión vieja sin avisar.
