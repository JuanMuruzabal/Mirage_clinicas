# El CI y la seguridad del repositorio

**PRISMA · Seguridad y optimización / CI** · 2026-10-25 · TR-199 en `docs/Arquitectura y base/tradeoffs.md`

Este documento explica **qué corre en GitHub cada vez que se toca el repo, por qué corre y qué hacer cuando falla**. Está en su propia carpeta porque el CI cruza las otras dos: revisa dependencias (`../Dependencias/`) y código propio (`../Codigo/`). La idea es que cuando un chequeo se ponga en rojo se entienda qué protege **antes** de saltearlo.

## 1. Mapa de archivos

### El CI de siempre, separado en piezas

Antes era un solo `ci.yml` de ~240 líneas. Ahora `ci.yml` es la puerta de entrada y cada parte vive en su archivo.

| Archivo | Qué hace | Cuándo corre |
|---|---|---|
| `ci.yml` | La entrada: define cuándo arranca y llama a los demás `ci-*`. Cancela las corridas viejas de un PR cuando se pushea de nuevo. Tiene el deploy a Render, que espera a que pasen web, api y los dos de tests. | Cada push a `dev` o `main` y cada PR. El deploy, solo en un push a `dev` |
| `ci-web.yml` | Regenera los esquemas de la página pública y de los documentos clínicos (y falla si no coinciden con lo commiteado), valida las plantillas y corre lint, typecheck, los tests de los paquetes y el build de Next. | Lo llama `ci.yml` |
| `ci-api.yml` | `go vet`, golangci-lint y el build de la API. | Lo llama `ci.yml` |
| `ci-tests-api.yml` | Los tests de Go contra un Postgres real, con `-race`. Falla si la cobertura baja de 80 %. | Lo llama `ci.yml` |
| `ci-tests-web.yml` | Los tests de la web (Vitest), con el mismo mínimo de 80 %. | Lo llama `ci.yml` |
| `ci-lighthouse.yml` | El presupuesto de rendimiento sobre las páginas públicas de demostración. | Lo llama `ci.yml` |

### Los de seguridad

| Archivo | Qué hace | Cuándo corre |
|---|---|---|
| `seguridad.yml` | Cuatro chequeos: govulncheck (Go, incluida la biblioteca estándar), pnpm audit (npm), la revisión de dependencias (frena un PR que agrega un paquete vulnerable) y zizmor (errores de seguridad en los propios workflows). | Cada push, cada PR y los lunes |
| `seguridad-imagenes.yml` | Construye las imágenes de Docker de la API y de la web y las escanea con Trivy (los paquetes del sistema operativo y lo que trae la imagen base). Sube los hallazgos a la pestaña de seguridad. | Cuando cambian los Dockerfiles o las dependencias, en cada push a `dev` y los lunes |
| `seguridad-scorecard.yml` | OpenSSF Scorecard: puntúa las prácticas de seguridad del repo y deja el resultado en la pestaña de seguridad. | Cada push a `dev` y una vez por semana |

### Los otros dos

- **`.github/actions/preparar-pnpm/`**: no es un workflow, es una pieza que usan los demás (pnpm, Node y, si hace falta, las dependencias). Así hay una sola copia en vez de cuatro.
- **`.github/dependabot.yml`**: qué revisa Dependabot (npm, Go, GitHub Actions, Docker y docker-compose). **Desde el 2026-10-25 solo abre PRs de seguridad** (`open-pull-requests-limit: 0`); las versiones se actualizan en rondas a mano (sección 2.1).

> **La nota que importa:** todo lo de `ci-*` y `seguridad.yml` frena el merge cuando están cargadas las reglas de rama. `seguridad-imagenes` y `seguridad-scorecard` avisan y quedan registrados, pero **no pueden ser obligatorios**, porque no corren en todos los PRs (ver la sección 4).

## 2. Cada pieza: qué cubre, por qué y qué hacer cuando falla

Hay una idea común detrás de todas: **ningún chequeo solo alcanza**. Dependabot no ve la biblioteca estándar de Go (en la ronda de dependencias eran ~20 avisos, TR-197); `pnpm audit` avisó de Zod antes que Dependabot (TR-198); Trivy ve el sistema operativo de las imágenes, que ningún otro mira; zizmor ve los workflows, que ningún otro mira. Cada uno tapa un hueco de los demás.

### 2.1 Dependabot (solo seguridad)

- **Riesgo que cubre:** una dependencia con un aviso de seguridad ya publicado que nadie se entera de que tiene arreglo.
- **Qué hace:** `.github/dependabot.yml` declara los cinco ecosistemas del repo (npm, `gomod`, `github-actions`, `docker` con los dos Dockerfiles y `docker-compose` con el Postgres) con `open-pull-requests-limit: 0`. **El límite 0 bloquea solo las actualizaciones de versión**: las de seguridad (que están prendidas aparte) siguen saliendo, una por aviso con arreglo, contra la rama por defecto (`dev`) y sin esperar al lunes. El archivo se queda a propósito: Scorecard puntúa 10 en Dependency-Update-Tool por tenerlo.
- **Por qué solo seguridad:** el primer lunes después del merge del #95 abrió 11 PRs de versión (#96 a #106), casi todos de mayores: TypeScript 7, ESLint 10, Node 25 (no es LTS), `@types/node` 26 (con Node 22 en runtime), `@vitest/coverage-v8` 5 (sin vitest 5) y 5 actions. El equipo prefiere actualizar en rondas hechas a mano (TR-197, TR-198). Los 11 se cerraron con un comentario del motivo.
- **Qué se descartó:** agrupar las de versión una vez por mes (seguían llegando PRs de mayores, unos 5 por mes) y apagarlo todo borrando el archivo (se perdían los PRs de seguridad y Scorecard bajaba ~0,8).
- **Qué se sacrifica:** nada avisa de una versión mayor nueva salvo que traiga un aviso de seguridad; hay que acordarse de hacer la ronda. La configuración de grupos (menores y parches juntos, mayores solas) y `cooldown: 7` (la misma regla que `minimumReleaseAge` de pnpm, TR-197) queda dormida, lista para cuando se suba el límite.
- **Cómo volver a prender las de versión:** subir `open-pull-requests-limit` (por ejemplo a 5) en el ecosistema que se quiera. No hace falta tocar nada más.
- **Visto después del merge:** Dependabot soporta pnpm 11 y el `cooldown` en `docker` y `docker-compose` (todas las corridas del lunes dieron `success`). Las dos security updates que fallaron el 24/10 a las 23:07 (vite y `@vitest/mocker`) quedan por mirar en *Insights → Dependency graph → Dependabot*.
- **Cuando falla:** si esa pestaña muestra un error, lo más probable es el formato (`labels` que no existen en el repo, por eso no se usan). Si un PR de seguridad rompe el build, no se mergea: se mira el changelog y se arregla en la misma rama.

### 2.2 govulncheck: "Vulnerabilidades (Go)"

- **Riesgo que cubre:** vulnerabilidades de la **biblioteca estándar de Go** y de los módulos, que Dependabot no ve (la stdlib no es una dependencia del `go.mod`).
- **Qué hace:** `go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 ./...` en `apps/api`, **con `GOTOOLCHAIN: local`**. Sin eso Go se cambia solo a la toolchain más nueva y analiza *esa* biblioteca estándar: pasó en la ronda de TR-197 (dijo "0 vulnerabilidades" mientras el CI corría la 1.26.0). `setup-go` lee la versión de `apps/api/go.mod`, así que se analiza exactamente lo que corre en producción.
- **Por qué se eligió:** es la herramienta oficial del equipo de Go, y distingue las funciones vulnerables que el código llama de las que solo están en una dependencia.
- **Qué se descartó:** confiar solo en Dependabot, que no ve la biblioteca estándar.
- **Cuánto cuesta:** del orden de un minuto (estimado, sin medir en GitHub todavía).
- **Cuando falla:** leer el aviso (`GO-xxxx-xxxx`) y a qué versión se arregla. Si es la biblioteca estándar, subir la directiva `go` de `go.mod` al último parche (tiene que ser el último, no la `.0`). Si es un módulo, subirlo (mirando antes la fecha de la versión: en Go no hay espera automática). Si el paquete vulnerable no lo importamos y no hay arreglo (como `x/crypto/openpgp`), se documenta, no se silencia.

### 2.3 pnpm audit: "Vulnerabilidades (npm)"

- **Riesgo que cubre:** avisos de seguridad en las dependencias de npm, incluidas las transitivas.
- **Qué hace:** `pnpm audit --audit-level=high`. Lee el lockfile, así que no instala nada (`preparar-pnpm` con `instalar: "false"`).
- **Por qué se eligió:** ya viene con pnpm y encontró Zod 3 antes que Dependabot.
- **Qué se descartó:** que solo avise: la persona pidió que las vulnerabilidades nuevas bloqueen ("los chequeos que solo avisan" se descartaron: es fácil no verlos). El umbral es `high`.
- **Cuánto cuesta:** segundos (estimado).
- **Cuando falla:** subir la dependencia (directa o la que arrastra la transitiva). Si el arreglo tiene menos de 7 días, se exceptúa con `minimumReleaseAgeExclude` en `pnpm-workspace.yaml` y un comentario de qué aviso arregla (TR-197). Un aviso retirado por GitHub (como `braces`) se descarta a mano en la pestaña de Dependabot con su motivo.

### 2.4 Revisión de dependencias

- **Riesgo que cubre:** que un PR **sume** una dependencia con un aviso alto o crítico, aunque el lockfile de la rama base esté limpio.
- **Qué hace:** `actions/dependency-review-action` con `fail-on-severity: high`, solo en `pull_request` (compara la rama con su base; en un push no hay contra qué comparar y el job queda *skipped*, que para el ruleset cuenta como aprobado).
- **Por qué se eligió:** es lo único que mira el *diff* de dependencias en lugar del estado total. `pnpm audit` ya cubre el estado total.
- **Qué se descartó:** nada; no solapa con los otros.
- **Cuánto cuesta:** segundos (estimado).
- **Cuando falla:** buscar otra versión o paquete. Si el aviso es de una dependencia que ya estaba, no debería saltar acá sino en `pnpm audit`.

### 2.5 zizmor: "Seguridad de los workflows"

- **Riesgo que cubre:** los propios workflows como superficie de ataque: inyecciones de plantilla (`${{ github.event... }}` metido en un `run:`), permisos de más, actions sin fijar, credenciales que quedan en disco después del checkout.
- **Qué hace:** `pipx run zizmor==1.31.1 .` sobre todo el repo (incluye `.github/actions/`), con el token para sus chequeos en línea (que el SHA pertenezca de verdad a la action, versiones con avisos conocidos). Falla con cualquier hallazgo.
- **Por qué se eligió:** es específico para GitHub Actions; las actions son código que corre con acceso a secretos y a un token del repo, y nadie más lo revisa.
- **Qué se descartó:** no revisar los workflows, que es lo que pasaba hasta ahora. actionlint (sintaxis y tipos, no seguridad) se usa en local como complemento, no en el CI; ver 3.4.
- **Cuánto cuesta:** decenas de segundos (estimado).
- **Cuando falla:** se arregla el workflow. Un `# zizmor: ignore[regla]` en la línea es el último recurso y lleva su motivo. Hoy hay **9 `ignore[self-repository]`** (ver 3.3) y 4 hallazgos suprimidos con motivo en los workflows.

### 2.6 Trivy: `seguridad-imagenes.yml`

- **Riesgo que cubre:** vulnerabilidades en lo que trae la **imagen** y no en nuestras dependencias: los paquetes de Alpine (openssl, musl…) y el Node de la imagen base con su npm.
- **Qué hace:** construye la imagen de la API y la de la web con los mismos Dockerfiles y contexto de `docker-compose.yml`, sin pushear a ningún registro, y las escanea con `--severity HIGH,CRITICAL --ignore-unfixed`. Hace **dos pasadas** sobre la misma base de avisos: una arma el SARIF que se sube a la pestaña de seguridad (una `category` por imagen) y otra falla con tabla legible en el log.
- **Cómo se corre Trivy, y por qué no con `aquasecurity/trivy-action`:** se usa la imagen oficial `aquasec/trivy:0.76.0@sha256:…` por versión **y digest**. La action tuvo el aviso **GHSA-69fq-xp46-6x23**: sus etiquetas se movieron a código malicioso. Una action comprometida corre dentro del job con acceso al token; una imagen fijada por digest no puede cambiar bajo nuestros pies.
- **Lo que encontró, y el arreglo del Dockerfile de la web:** la primera corrida local marcó el openssl de Alpine atrasado respecto de sus parches, y un crítico más varios altos en el npm que trae la imagen de Node (tar, sigstore, pacote…). La etapa de runtime de `apps/web/Dockerfile` ahora hace `apk upgrade --no-cache` y **borra npm, npx, corepack y yarn**. Se puede porque el servidor corre con `node server.js` solo: ni `docker-compose.yml` ni `render.yaml` usan un gestor de paquetes en runtime. Verificado en contenedores: la web corre como `uid=1000(node)`, en `/usr/local/bin` quedan solo `node`, `nodejs` y el entrypoint, y siguen saliendo la CSP con nonce, HSTS, nosniff, Referrer-Policy y Permissions-Policy. **La regla que queda: si algo necesita un gestor de paquetes en runtime, el diseño está mal.**
- **Por qué `--ignore-unfixed`:** frenar el CI por algo que no tiene arreglo no deja nada que hacer salvo esperar.
- **Qué se descartó:** `aquasecurity/trivy-action` (ver arriba) y pushear la imagen a un registro para escanearla (no hay registro: Render construye solo).
- **Cuánto cuesta:** varios minutos, porque hay que construir las dos imágenes (estimado). Por eso corre en un PR solo cuando cambia algo que entra en la imagen.
- **Cuando falla:** mirar qué paquete y a qué versión se arregla. Si es del sistema (`apk`), alcanza con un rebuild con `apk upgrade`, o esperar la imagen base nueva. Si es de la imagen base de Node, sacar lo que no se usa (como se hizo con npm) o subir la etiqueta de `FROM`.

### 2.7 OpenSSF Scorecard: `seguridad-scorecard.yml`

- **Riesgo que cubre:** la **postura** del repo, no una falla puntual: ramas sin proteger, actions sin fijar, tokens con permisos de más, falta de política de seguridad.
- **Qué hace:** corre la plantilla oficial de `ossf/scorecard-action`, publica el resultado (`publish_results: true`, por eso el job no puede tener pasos `run`) y sube el SARIF a code scanning. Solo corre en la rama por defecto (`dev`).
- **`repo_token` y `SECURITY.md`:** el chequeo *Branch-Protection* no puede leer los rulesets con el `GITHUB_TOKEN` y puntúa de menos; por eso el workflow acepta un token opcional, ver 5.1. Y Scorecard pide una política de seguridad: ese es el `SECURITY.md` de la raíz, junto con el reporte privado de vulnerabilidades.
- **Por qué se eligió:** mide la postura del repo, que ningún otro chequeo mira, con criterios que no inventamos nosotros.
- **Qué se descartó:** obligar el check (ver 4).
- **Cuánto cuesta:** un par de minutos por corrida, una por push a `dev` y una por semana (estimado).
- **Cuando falla o baja el puntaje:** no frena nada. Se mira el desglose en `scorecard.dev` y se decide qué vale la pena.

### 2.8 CodeQL `extended`

- **Riesgo que cubre:** fallas en **nuestro** código (inyección de logs, conversiones de enteros, sanitización incompleta).
- **Qué hace:** el análisis por defecto de GitHub, ahora con el conjunto `security-extended` (ajuste de la configuración por defecto del repo, hecho por API). Suma las reglas de `actions/unpinned-tag` y `go/log-injection`, entre otras.
- **Por qué:** el conjunto estándar no vio nada de lo que `extended` marcó, y las 13 alertas nuevas eran todas arreglables a bajo costo.
- **Qué se descartó:** el conjunto estándar solo (menos ruido, menos cobertura).
- **Cuánto cuesta:** algo más de ruido; lo corre GitHub, no suma al tiempo del CI.
- **Cuando falla:** en `Security → Code scanning`. Las 17 alertas de esta ronda están explicadas una por una en `../Codigo/CodeQL/alertas-de-codeql-2026-10-25.md`.

### 2.9 Las actions fijadas por SHA

- **Riesgo que cubre:** que una etiqueta se mueva. `uses: foo/bar@v4` apunta a lo que el autor decida hoy; en 2025 la action `tj-actions` comprometida filtró secretos de miles de repos exactamente así, y la de Trivy repitió el patrón (2.6).
- **Qué hace:** todo `uses:` externo va con el SHA completo del commit y un comentario con la versión (`# v4.4.0`). La versión es la más nueva de la mayor que ya usábamos con **7 días o más** de publicada, la misma espera que pnpm. Dependabot actualiza los SHA solo.
- **Qué se descartó:** fijar por etiqueta mayor (`@v4`), que se mueve; y confiar en que las "oficiales" (`actions/*`) no se comprometen.
- **Cuánto cuesta:** hay que leer un comentario para saber qué versión es; Dependabot lo mantiene.
- **Cuando falla:** si zizmor marca una action sin fijar, buscar su SHA con `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` (si la etiqueta es anotada, resolver hasta el commit) y poner el comentario con la versión.

### 2.10 `persist-credentials: false`

- **Riesgo que cubre:** `actions/checkout` deja el token en `.git/config`, y cualquier paso posterior (una action comprometida, un `npm install` con un script malicioso) puede leerlo y pushear.
- **Qué hace:** todo checkout lo lleva en `false`. Ningún job pushea, así que no se pierde nada.
- **Cuando falla:** si un job nuevo necesita pushear, es una decisión de diseño que se discute, no un flag que se pone.

### 2.11 golangci-lint con versión fija

- **Riesgo que cubre:** con `version: latest`, una release nueva del linter podía poner en rojo un PR que no tocó nada, o cambiar silenciosamente qué se revisa.
- **Qué hace:** `ci-api.yml` fija **v2.15.0** (localmente se usa la 2.13.2 sin diferencias). Misma regla para toda herramienta que se instala en el CI: versión fija, con 7 días o más.
- **Cuando falla:** si el linter cambia de versión, se sube en un PR propio y se corrigen los hallazgos nuevos ahí.

### 2.12 `concurrency`

- **Qué hace:** en `ci.yml`, `seguridad.yml` y `seguridad-imagenes.yml`, un push nuevo a un PR **cancela la corrida vieja del mismo PR**: ya no le importa a nadie. **Nunca cancela un push a `dev` o `main`**, porque el de `dev` dispara el deploy y cancelarlo dejaría un deploy sin verificar.
- **Detalle que no se puede romper:** el bloque va **solo en la entrada** (`ci.yml`). Un `concurrency` con el mismo grupo dentro de un workflow llamado se bloquea esperándose a sí mismo.
- **Qué hay que mirar en GitHub:** la concurrencia con los reutilizables no se puede probar en local. Si un PR queda con checks cancelados que nadie canceló, empezar por acá.

### 2.13 Los rulesets (cargados el 2026-10-25)

- **Riesgo que cubre:** que nada impida pushear sin CI a una rama que despliega, ni reescribir `main`.
- **Estado:** ya cargados por API el 2026-10-25, con `enforcement: active` y `bypass_actors` vacío. `25810962` "dev: solo por PR y con el CI en verde (TR-199)" (deletion, non_fast_forward, required_status_checks y pull_request con 0 aprobaciones; merge, squash y rebase permitidos) y `25810963` "main: con el CI en verde, sin force push ni borrado (TR-199)" (las mismas reglas sin pull_request). Los checks llevan `integration_id: 15368` (GitHub Actions), para que ninguna otra integración los pueda satisfacer con un status; `strict_required_status_checks_policy: false`. Se ven con `gh api repos/JuanMuruzabal/Mirage_clinicas/rulesets`.
- **Qué hacen:** en `dev` y en `main`, sin force push, sin borrado y con los checks de la sección 4 obligatorios. **Sin excepciones, ni para la cuenta administradora** (lo eligió la persona). Efecto práctico: **a `dev` solo se entra por PR**. A `main`, el `git merge --ff-only` desde `dev` sigue funcionando, porque esos commits ya pasaron el CI en `dev`.
- **Qué se descartó:** una excepción para la cuenta admin (queda el hueco que se quería cerrar), solo prohibir force push y borrado (se puede pushear sin CI a una rama que despliega), y los chequeos que solo avisan (es fácil no verlos).
- **Cuánto cuesta:** se acabó el push directo a `dev` para un cambio chico. Un aviso alto o crítico recién publicado pone en rojo **todos** los PRs hasta que se arregle.
- **Cuando se traba:** si un aviso sin arreglo bloquea todo, la salida es un PR que lo exceptúe con motivo (por ejemplo `minimumReleaseAgeExclude`), no desactivar el ruleset.

## 3. La organización del CI

### 3.1 Por qué se separó `ci.yml`

Un archivo de ~240 líneas con cinco jobs era difícil de leer y de tocar sin romper otro. Cada parte ahora es un workflow reutilizable (`on: workflow_call`) con su cabecera que dice qué verifica y por qué. **Los pasos, los comandos y los nombres de job son los mismos de antes**: se movieron, no se reescribieron (un script comparó clave por clave y paso por paso, antes y después, con 0 diferencias).

### 3.2 Por qué `ci.yml` sigue siendo la entrada, y tiene el deploy

El deploy tiene que esperar a `web`, `api`, `test-api` y `test-web`, y **`needs` no cruza workflows**. Con reutilizables, `ci.yml` los llama como jobs (`uses: ./.github/workflows/ci-web.yml`), y el job `deploy` hace `needs` sobre ellos como siempre. Lighthouse sigue fuera de `needs` a propósito: un runner puede medir peor un día sin que el código cambie, y eso no tiene que frenar un arreglo urgente.

Alternativas descartadas:

- **Workflows independientes con deploy por `workflow_run`:** hay que verificar a mano que pasaron todos para el *mismo* SHA. Es frágil.
- **Que Render despliegue solo con los checks en verde ("After CI checks pass"):** cambia la configuración de Render, que la persona dio por buena.
- **Filtros de paths por área** (el CI de la web solo si cambió la web): un check con filtro no puede ser obligatorio, porque en un PR que no lo dispara nunca aparece y el PR queda esperándolo para siempre.

### 3.3 Por qué hay prefijos y no subcarpetas

La persona pidió una carpeta para que los workflows no quedaran desparramados. **GitHub solo ejecuta lo que está directamente en `.github/workflows/`:** no lee subcarpetas, tampoco para los reutilizables. Meterlos en una carpeta hubiera dejado al CI sin correr. El agrupamiento visual se logra con prefijos: `ci-*` y `seguridad-*`.

La **action compuesta** (`preparar-pnpm`) sí admite subcarpetas, y por eso vive en `.github/actions/preparar-pnpm/`. Reemplaza la preparación que se repetía en cuatro jobs: `pnpm/action-setup` (pnpm 11), `actions/setup-node` (Node 22, con caché de pnpm) y `pnpm install --frozen-lockfile`. Un input `instalar` la deja en `"false"` para `pnpm audit`, que no instala. El checkout no va adentro: la action local se lee del repo ya clonado, así que cada job lo hace antes.

### 3.4 Por qué `./` y no `$/`

zizmor 1.31.1 pide la sintaxis nueva `$/` (self-repository, de julio de 2026) para llamar a un workflow o action del mismo repo. **actionlint 1.7.12, la última, no la reconoce:** con `$/` daba 9 errores y dejaba de validar las llamadas. Con `./`, actionlint atrapa un reutilizable inexistente o un input mal escrito (se probó). El riesgo que señala zizmor no aplica: un reutilizable con `./` se resuelve en el mismo commit, y la action local se lee justo después del checkout.

Por eso cada una de las 9 líneas lleva `# zizmor: ignore[self-repository]`, y el porqué está en un comentario de `ci.yml`. Se descartó apagar la regla en una configuración de zizmor, porque queda escondida para cualquier uso futuro. **Se sacrifica** mantener 9 `ignore` en línea; cuando actionlint soporte `$/`, se pasa.

## 4. Los checks obligatorios del ruleset

Los nombres son los que muestra GitHub para un reutilizable (`<id del job que llama> / <nombre del job llamado>`). Los nombres reales se confirmaron después del merge del #95 y coinciden con estos ocho; se leen con `gh pr checks`.

| Check | Viene de |
|---|---|
| `web / web (lint + typecheck + build)` | `ci.yml` → `ci-web.yml` |
| `api / api (vet + lint + build)` | `ci.yml` → `ci-api.yml` |
| `test-api / Run tests and quality gates (api)` | `ci.yml` → `ci-tests-api.yml` |
| `test-web / Run tests and quality gates (web)` | `ci.yml` → `ci-tests-web.yml` |
| `Vulnerabilidades (Go)` | `seguridad.yml` |
| `Vulnerabilidades (npm)` | `seguridad.yml` |
| `Revisión de dependencias` | `seguridad.yml` (en un push queda *skipped*, que cuenta como aprobado) |
| `Seguridad de los workflows` | `seguridad.yml` |

**Por qué Trivy y Scorecard no lo son:** `seguridad-imagenes.yml` corre en un PR solo si cambió algo que entra en la imagen, y un check obligatorio que no aparece deja el PR esperando para siempre. `seguridad-scorecard.yml` ni siquiera corre en PRs (solo en `dev`). Los dos se cubren con el push a `dev` y la corrida semanal, y sus hallazgos quedan en la pestaña de seguridad.

**`lighthouse` tampoco:** mismo motivo que su ausencia en `needs` del deploy (3.2). Además de estos ocho y de `lighthouse / Presupuesto de rendimiento (Lighthouse)`, `Trivy (api)` y `Trivy (web)`, en un PR aparecen `Analyze (actions|go|javascript-typescript|python)` y `CodeQL`, que tampoco son obligatorios (`Analyze (python)` lo sumó sola la configuración por defecto de CodeQL).

## 5. Configuración externa

### 5.1 El token opcional de Scorecard (`SCORECARD_TOKEN`)

**No hace falta.** El workflow cae a `github.token` (`repo_token: ${{ secrets.SCORECARD_TOKEN || github.token }}`) y, con los rulesets cargados, *Branch-Protection* los leyó igual: pasó de 0 a 3 y vio "PRs are required", el status check y las protecciones contra borrado y force push. Se creyó que sin el token puntuaría de menos y no fue así. Queda como opcional, por si Scorecard llega a necesitar leer más; el respaldo del workflow se queda. Pasos:

1. GitHub → **Settings** (de la cuenta) → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → *Generate new token*.
2. **Repository access:** *Only select repositories* y elegir solo este repo.
3. **Repository permissions** → **Administration: Read-only** (nada más).
4. **Expiration:** un año. Anotar el vencimiento y poner un recordatorio de renovación.
5. En el repo: **Settings → Secrets and variables → Actions → New repository secret**, con nombre `SCORECARD_TOKEN` y el token como valor.

Se descartó un token clásico (da más alcance del necesario) y exigir el secreto (el workflow fallaría hasta que alguien lo cargue). Se sacrifica la renovación anual; si vence, el workflow sigue con `github.token` y no se rompe nada.

### 5.2 SonarCloud (a futuro)

No está. Si se agrega: crear el proyecto en sonarcloud.io, cargar el secreto `SONAR_TOKEN` y apuntarlo a los reportes de cobertura que el CI ya genera. Como workflow nuevo directo en `.github/workflows/`, con su prefijo (`ci-`), no en una subcarpeta.

### 5.3 Ya hecho en GitHub, por API (2026-10-24/25)

- La **rama por defecto pasó a `dev`**, para que Dependabot y CodeQL miren lo que se integra. `main` sigue siendo producción.
- **Prendidas:** las actualizaciones de seguridad de Dependabot, CodeQL en `extended` y el reporte privado de vulnerabilidades.
- **Descartadas, cada una con su motivo:** la alerta de code scanning #7 (el SHA-1 de HaveIBeenPwned, falso positivo por k-anonimato) y la de Dependabot #32 (`braces`, aviso retirado por GitHub).

## 6. Lo que solo se ve en GitHub, y hay que mirar después del merge

**Ya visto (2026-10-25, después del merge del #95):**

- **Dependabot:** soporta pnpm 11 y `cooldown` en `docker` y `docker-compose` (2.1).
- **Los nombres reales de los checks:** coinciden con la sección 4.
- **El SARIF de Scorecard** subió y el puntaje está publicado (sección 8).
- **Los rulesets** están cargados (2.13).

**Pendiente de mirar:**

- **Las dos security updates de Dependabot que fallaron el 24/10 a las 23:07** (vite y `@vitest/mocker`).
- **El SARIF de Trivy** (`trivy-api`, `trivy-web`) en *Security → Code scanning*.
- **La concurrencia con los reutilizables** (2.12) y **la caché de pnpm a través de la action compuesta**, incluido el `cache: ''` del job `pnpm audit`.
- **Que se cierren las alertas de CodeQL de `dev`.**

## 7. Verificado antes del PR

actionlint v1.7.12: 0 errores. zizmor 1.31.1: 0 hallazgos (9 `ignore` por `./` y 4 suprimidos con motivo, más 2 pedantes que no fallan). govulncheck con `GOTOOLCHAIN=go1.26.10`: 0. `pnpm audit --audit-level=high`: 0. Trivy 0.76.0 sobre las dos imágenes, tras el arreglo del Dockerfile: 0. Go con `-race` entero en verde, cobertura 83,6 %; web 2367 tests. Contenedores: script de QA 21/0, la web como `node` sin npm/npx/yarn/corepack y con todos sus headers, el `X-Request-Id` del cliente ignorado en el log de la API y los avisos `[mail:dev]` legibles con `slog`.

## 8. El puntaje de Scorecard

Publicado en `api.securityscorecards.dev` (también en `scorecard.dev/viewer/?uri=github.com/JuanMuruzabal/Mirage_clinicas`): **5,7 en el merge del #95 y 6,0 después de cargar los rulesets** y relanzar el workflow. El detalle:

| Chequeo | Puntaje | Nota |
|---|---|---|
| Dangerous-Workflow, Token-Permissions, Binary-Artifacts, Security-Policy, Dependency-Update-Tool, CI-Tests | 10 | Dependency-Update-Tool se mantiene por tener el archivo de Dependabot, aunque abra solo PRs de seguridad |
| Vulnerabilities | 9 | GO-2026-5932 (`x/crypto/openpgp`): sin arreglo y sin usar |
| SAST | 7 | 21 de 30 commits con CodeQL; sube a medida que entran commits nuevos |
| Pinned-Dependencies | 4 | Los `FROM` de los Dockerfiles van por etiqueta, no por digest |
| Branch-Protection | 3 | Con 0 aprobaciones por PR |
| Contributors | 3 | |
| Maintained, Code-Review, Fuzzing, License, CII-Best-Practices | 0 | Maintained: el repo tiene menos de 90 días (es del 24/08). Code-Review: 0 de 6 PRs aprobados |
| Packaging, Signed-Releases | -1 | No cuentan |

**Cómo subirlo** (las cifras son una estimación con los pesos de Scorecard; lo único verificado en local, con el CLI v5.6.0, es lo del `osv-scanner.toml`):

- **Solo, con el tiempo:** Maintained pasa de 0 a 10 el 22/11 y SAST de 7 a 10 a medida que entran commits con CodeQL. Con eso, ~7.
- **Con un PR técnico pendiente:** fijar por digest los `FROM` de los Dockerfiles (Pinned de 4 a 10); tests de fuzzing de Go sobre los parsers de datos de afuera (Fuzzing de 0 a 10); un `apps/api/osv-scanner.toml` que ignore GO-2026-5932 con su motivo (Vulnerabilities de 9 a 10, verificado en local: Scorecard lo respeta). Con eso, ~8.
- **Decisiones de la persona, todavía sin tomar:** exigir 1 aprobación por PR (Branch-Protection y Code-Review), el badge de OpenSSF Best Practices y una licencia (el repo es público y no tiene). Con todo eso, ~9,5.
