# Actualización de dependencias de seguridad — octubre de 2026

**PRISMA · Ronda puntual, fuera de las radiografías**

Las dos radiografías miraron el código propio. Esta ronda mira lo que **no escribimos nosotros**: Next.js, Go y las bibliotecas de npm y de Go. Se hizo en un PR propio y urgente (`fix/seguridad-dependencias`, TR-197) porque producción corría un Next con ejecución remota de código publicada, una de ellas sin sesión.

- **Fecha:** 2026-10-24, sobre `dev` en `f2f83c5` (PR #92).
- **Método:** las alertas de Dependabot, `pnpm audit`, `govulncheck` (con la salvedad de la sección 6) y las alertas de code scanning (CodeQL) de GitHub. Cada versión nueva se eligió mirando su fecha de publicación (sección 4).
- **No reemplaza:** una radiografía. No se leyó código propio; se actualizó y se verificó que siga andando.

## Índice

1. [Veredicto](#1-veredicto)
2. [Cómo se detectó](#2-cómo-se-detectó)
3. [Los hallazgos y cómo se arreglaron](#3-los-hallazgos-y-cómo-se-arreglaron)
4. [La cadena de suministro: la espera de 7 días](#4-la-cadena-de-suministro-la-espera-de-7-días)
5. [El truco de las transitivas](#5-el-truco-de-las-transitivas)
6. [La lección de govulncheck](#6-la-lección-de-govulncheck)
7. [Cómo se verificó](#7-cómo-se-verificó)
8. [Lo que queda, y dónde va cada cosa](#8-lo-que-queda-y-dónde-va-cada-cosa)
9. [Cómo repetir este chequeo](#9-cómo-repetir-este-chequeo)

---

## 1. Veredicto

**Producción estaba expuesta a tres ejecuciones remotas de código en Next.js 16.3.3, y una de ellas no pedía sesión.** Quedó arreglada con Next 16.4.2. Además, el CI y las máquinas de desarrollo probaban con Go 1.26.0, cuya biblioteca estándar tenía unas 20 vulnerabilidades corregidas entre la 1.26.6 y la 1.26.10; producción no estaba afectada porque Docker compila con `golang:1.26-alpine`, que ya traía la más nueva, pero lo que se probaba no era lo que se desplegaba.

Después de la ronda, `pnpm audit` deja una sola alerta (Zod 3, riesgo bajo, con su PR propio) y `govulncheck` da 0 en el código propio.

## 2. Cómo se detectó

- **Dependabot** tenía 49 alertas abiertas, todas de npm y 6 críticas (todas de Next). Se calculaban sobre `main`, la rama por defecto, que es una versión vieja de la app.
- **El 24/10 la rama por defecto pasó a `dev`**, para que Dependabot y CodeQL miren lo que se integra. `main` sigue siendo producción y recibe los merges como antes.
- **`pnpm audit`** sobre la rama daba 42 (3 críticas, 14 altas, 20 moderadas, 5 bajas): menos que Dependabot porque `main` arrastraba versiones más viejas.
- **`govulncheck`** dio 0 en el código, pero con una trampa que se cuenta en la sección 6.

## 3. Los hallazgos y cómo se arreglaron

### 3.1 Next.js 16.3.3 → 16.4.2

Tres críticas de ejecución remota:

| Aviso | Dónde | ¿Nos alcanzaba? |
|---|---|---|
| GHSA-2464-fhr4-w9xw | optimizador de imágenes (`/_next/image`), **sin sesión** | **Sí.** Está prendido por defecto aunque no usemos `next/image` |
| GHSA-vcvr-r3jv-pc5j | `next/og` `ImageResponse` | **Sí.** `apps/web/src/app/[slug]/opengraph-image.tsx` la usa con datos que carga cualquiera que se cree una clínica |
| GHSA-673q-mjm6-r5xr | `use cache` | No: no lo usamos |

Además: una SSRF en el optimizador (GHSA-cjq9-62q9-8jv4), un DoS de las Server Actions (GHSA-p3m5-59mp-jv5r) y varias de caché y de divulgación de información (moderadas y bajas).

**Se subió a 16.4.2 y no a la 16.4.3** (publicada el 23/10): la 16.4.2 es del 15/10, pasa la espera de 7 días de la sección 4 y arregla lo mismo. `eslint-config-next` subió a la par. **No hubo que cambiar código**: `experimental.serverActions.bodySizeLimit` sigue siendo válido.

### 3.2 Go 1.26.0 → 1.26.10

- La directiva de `apps/api/go.mod` pasa de `go 1.26.0` a `go 1.26.10`.
- Con 1.26.0, la biblioteca estándar tenía unas 20 vulnerabilidades, arregladas entre la 1.26.6 y la 1.26.10: `net/http` (varias), `crypto/x509`, `crypto/tls`, `html/template`, `net/url` y `net/textproto`.
- **Por qué importa si Docker ya compilaba con lo último:** el CI usa `setup-go` con `go-version-file` y las máquinas locales siguen el `go.mod`. Con 1.26.0, los tests corrían contra una biblioteca distinta de la que se desplegaba.
- **Módulos directos**, subidos solo en versiones menores o de parche y con 7 días o más de publicados: chi 5.3.1 → 5.5.0; pgx 5.10 → 5.11; aws-sdk-go-v2 1.47.0 → 1.47.3, credentials 1.20.5 → 1.20.9 y s3 1.113.3 → 1.114.3; x/crypto 0.58, x/image 0.47, x/text 0.43; el driver de GORM para Postgres 1.6.3. **Ninguno tenía vulnerabilidades**: fue por higiene. Las versiones de AWS del 21 y 22/10 no pasaban la espera y se dejaron afuera.

### 3.3 Las transitivas de npm

| Paquete | Antes → ahora | Qué arregla |
|---|---|---|
| undici | 8.10.0 → 8.12.2 | DoS, validación TLS, envenenamiento de caché |
| sharp | 0.35.4 → 0.35.5 | librsvg; **corre en producción** por el optimizador de Next |
| vite | 8.2.2 → 8.3.4 | launch-editor; solo desarrollo |
| @vitest/mocker | 4.1.11 → 4.1.12 | `vitest` y `@vitest/coverage-v8` pasan a `^4.1.12` en los tres paquetes |
| brace-expansion | 1.1.18 → 1.1.21 y 5.0.9 → 5.0.12 | DoS |
| source-map-js | 1.2.1 → 1.2.2 | |
| js-yaml | 4.3.2 | ya estaba |

## 4. La cadena de suministro: la espera de 7 días

Una versión recién publicada puede estar comprometida (cuentas de mantenedores robadas, paquetes envenenados): el daño ocurre en las horas o días antes de que alguien lo detecte. Por eso:

- **`minimumReleaseAge: 10080`** (7 días, en minutos) en `pnpm-workspace.yaml`: pnpm no instala versiones publicadas hace menos que eso.
- **Un arreglo urgente con menos de 7 días** se exceptúa a mano con `minimumReleaseAgeExclude`, con un comentario de qué alerta arregla. Hoy no hay ninguna excepción.
- **Go no tiene un equivalente.** La fecha se mira a mano en el proxy: `https://proxy.golang.org/<módulo>/@v/<versión>.info` devuelve el campo `Time`.

Por eso se eligió Next 16.4.2 (15/10) sobre la 16.4.3 (23/10) y se dejaron las versiones de AWS del 21 y 22/10.

## 5. El truco de las transitivas

`vite` y `brace-expansion` 5 no los movía `pnpm update -r --depth Infinity`, aunque los rangos de sus padres los admiten (el lockfile los tenía fijados). La salida:

1. Agregar un `overrides` temporal en `pnpm-workspace.yaml` con la versión nueva, y correr `pnpm install`.
2. Sacar el override y volver a correr `pnpm install`.

El lockfile conserva las versiones nuevas porque entran dentro de los rangos de siempre, y **no queda ningún `overrides` permanente que mantener**. Se descartó dejarlo: es una lista más que revisar cada vez, y se oxida (fuerza una versión aunque el padre ya pida otra).

## 6. La lección de govulncheck

`go run golang.org/x/vuln/cmd/govulncheck@latest` exige go ≥ 1.26 y, con `GOTOOLCHAIN=auto` (el default), **se cambió solo a go1.26.10**. Con eso analizó la biblioteca estándar de la 1.26.10 y dijo "0 vulnerabilidades", mientras el CI usaba la 1.26.0. Un escaneo que dice "todo limpio" sobre una toolchain distinta de la que se usa es peor que no escanear.

**Para ver la verdad hay que correrlo con `GOTOOLCHAIN=go<la versión del go.mod>`** (sección 9). Y una directiva de `go.mod` desactualizada no la detecta ningún test: solo este escaneo bien hecho.

## 7. Cómo se verificó

- **Suites:** web 2367 tests, `prisma-engine` 70 y `documentos-clinicos` 401; Go con `-race`; typecheck de los cuatro paquetes; lint con 0 errores; `golangci-lint` en 0; `validar:plantillas` y los generadores (`engine:generar`, `documentos:generar`) sin diferencias; build de Next 16.4.2.
- **Contenedores** (reconstruidos con Next 16.4.2 y Go 1.26.10): el build sin errores de `minimumReleaseAge`; el script de QA en 21 pasadas y 0 fallas; la imagen OG de `next/og` responde 200 `image/png` (42 KB); `/_next/image` da 200 con un ícono local y 400 con una URL externa, sin descargarla; el recorrido con sesión (`/clinicas`, `/panel`, Turnos, Pacientes, Documentos) sin errores de consola ni respuestas ≥ 400; y la subida de una foto con su WebP servido por `/uploads` (`x/image` funciona en el contenedor). Lo que se creó para la prueba se borró.

## 8. Lo que queda, y dónde va cada cosa

| Qué | Por qué queda | Dónde va |
|---|---|---|
| **Zod 3, GHSA-mrhx-c7xc-m3w5** (alta: agota memoria con colecciones enormes) | Zod 4 cambia el exporte a JSON Schema que usa Go (`zod-to-json-schema` no lo soporta) y pide `@hookform/resolvers` v5. Riesgo bajo hoy: solo valida lo que carga quien edita su página, con el cuerpo acotado a 6 MB | PR propio (tanda B) |
| **`braces`, GHSA-vfj7-8cjw-p6xm** | Aviso retirado por GitHub, sin arreglo; llega solo por `eslint-config-next` | Descartarlo a mano en GitHub como inexacto |
| **`x/crypto/openpgp`, GO-2026-5932** | Paquete sin mantenimiento, que no importamos, sin arreglo | Nada (aparece en `govulncheck -show verbose`) |
| **Cinco alertas de code scanning (CodeQL) en `dev`**, ninguna explotable | Ver abajo | Ítem de CI |
| **Actualizaciones de seguridad de Dependabot** | Están apagadas en el repo | Ítem de CI |
| **`middleware` → `proxy`** (deprecación de Next 16.0; `proxy` corre siempre en Node) | Es lo que pone la CSP con nonce y los headers de seguridad: cambia de runtime | Se suma al PR de cambios del frontend |

Las cinco alertas de CodeQL:

| Alerta | Dónde | Qué es |
|---|---|---|
| `go/incorrect-integer-conversion` | `apps/api/internal/security/password.go:184` | el `uint8` de `Parallelism` sale de un hash nuestro, no de un usuario |
| `go/incorrect-integer-conversion` | `apps/api/internal/documentos/lamina.go:47` | `rune` de las métricas fijas de Helvetica |
| `go/weak-sensitive-data-hashing` | `apps/api/internal/security/pwned.go:41` | el SHA-1 que exige HaveIBeenPwned (k-anonimato): falso positivo |
| `js/incomplete-sanitization` | `apps/web/src/lib/api-documentos.test.ts:38` | código de tests |
| `js/incomplete-url-substring-sanitization` | `apps/web/src/lib/pagina-publica/tarjeta-compartir.test.ts:40` | código de tests |

Las alertas de `missing-workflow-permissions` de `ci.yml` estaban en `main`, no en `dev`: ya las arregló TR-178.

## 9. Cómo repetir este chequeo

Desde la raíz del repo, en este orden:

```bash
# 1. npm: qué queda
pnpm audit

# 2. Go: con la MISMA toolchain que declara go.mod (ver sección 6)
cd apps/api
GOTOOLCHAIN=go$(sed -n 's/^go //p' go.mod) go run golang.org/x/vuln/cmd/govulncheck@latest ./...
# con -show verbose aparecen también las que el código no alcanza (openpgp)

# 3. Una versión nueva de Go: mirar su fecha antes de subirla
curl -s https://proxy.golang.org/<modulo>/@v/<version>.info     # campo "Time"

# 4. Una versión nueva de npm: la espera la aplica pnpm sola
pnpm update -r --depth Infinity        # o 'pnpm up <paquete>@<versión>'
```

Si una transitiva no se mueve aunque el rango del padre la admita, el truco de la sección 5. Después, las suites completas y `docker compose up -d --build` con el script de QA: un cambio de Next o de Go falla al **correr** (el optimizador de imágenes, `next/og`, la subida de fotos), no al compilar.
