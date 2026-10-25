---
paths:
  - ".github/**"
  - "**/Dockerfile"
  - "docker-compose.yml"
  - "render.yaml"
  - "pnpm-workspace.yaml"
  - "**/package.json"
  - "apps/api/go.mod"
  - "apps/api/osv-scanner.toml"
---

# CI, contenedores y dependencias

Se carga cuando la sesión lee o edita un workflow, un `Dockerfile`, el `docker-compose.yml`, un `package.json`, `pnpm-workspace.yaml`, `apps/api/go.mod` u `apps/api/osv-scanner.toml`.

- **Una dependencia de npm no se instala hasta que tenga 7 días** (`minimumReleaseAge: 10080` en `pnpm-workspace.yaml`, TR-197): una versión recién publicada puede estar comprometida. Un arreglo urgente con menos de 7 días se exceptúa con `minimumReleaseAgeExclude` y un comentario de qué alerta arregla. Go no tiene equivalente: mirá la fecha en `proxy.golang.org/<módulo>/@v/<versión>.info` antes de subir un módulo.
- **`govulncheck` se corre con `GOTOOLCHAIN=go<la versión del go.mod>`** (TR-197). Con el default (`auto`) se cambia solo a la toolchain más nueva, analiza esa biblioteca estándar y dice "0 vulnerabilidades" mientras el CI usa la del `go.mod`. Y la directiva `go` de `go.mod` es la versión que prueba el CI: tiene que ser el último parche, no la `.0`.
- **Los contenedores corren sin root** (TR-178): la API como `app`, la web como `node`. Lo que el proceso escribe tiene que ser de ese usuario (`/data/uploads` del storage local, `.next` de Next). Si agregás un directorio donde escriba, crealo en el Dockerfile a nombre de ese usuario, y probalo con `docker compose up --build`, no con el build solo: los permisos fallan al correr, no al compilar.
- **Una action de GitHub va fijada por el SHA completo del commit, con un comentario de la versión** (`uses: actions/checkout@<sha40> # v4.4.0`), y todo `actions/checkout` lleva `persist-credentials: false` (TR-199). Una etiqueta se puede mover a código malicioso (pasó con `tj-actions` y con `trivy-action`); el SHA no. Toda herramienta que se instala en el CI lleva versión fija, con 7 días o más: nada de `latest`. Dependabot mantiene los SHA.
- **Un `FROM` nuevo va con `tag@sha256:<digest del índice multi-arquitectura>`** (`docker buildx imagetools inspect <imagen>:<tag>`), y los digests se renuevan a mano en las rondas de dependencias porque Dependabot ya no abre PRs (TR-200). Lo mitigan `apk upgrade` en cada build y el Trivy de los lunes.
- **Una vulnerabilidad sin arreglo que no nos afecta va en `apps/api/osv-scanner.toml`**, con el motivo y un `ignoreUntil` (6 meses); al vencer hay que volver a mirarla (TR-200). No la ignores en otro lado.
- **Un arreglo de CodeQL en un archivo que el PR no toca se confirma en el análisis de `dev`**, no en el del PR (solo informa las líneas que cambian). Mirá en el SARIF cuál es la fuente y cuál el destino: la #15 de `go/log-injection` era por la IP de `logging.go`, no por el `request_id` (TR-200).
- **Un workflow nuevo va directo en `.github/workflows/`, con prefijo (`ci-` o `seguridad-`), nunca en una subcarpeta** (TR-199): GitHub solo ejecuta lo que está ahí, también los reutilizables, y una subcarpeta deja al CI sin correr. Lo que se repite entre jobs va en una action compuesta de `.github/actions/` (ahí sí valen las subcarpetas), como `preparar-pnpm`. `ci.yml` es la entrada y tiene el deploy: `needs` no cruza workflows, así que un job nuevo que el deploy deba esperar se llama desde `ci.yml`. El `concurrency` va solo ahí. Las llamadas locales usan `./` con `# zizmor: ignore[self-repository]` (actionlint todavía no entiende `$/`).
- **La imagen de la web no tiene npm, npx, corepack ni yarn** (TR-199): el servidor corre con `node` solo, y Trivy marcaba avisos altos en el npm de la imagen base. Si algo necesita un gestor de paquetes en runtime, el diseño está mal. La imagen hace `apk upgrade` al construirse; el escaneo con Trivy corre en `seguridad-imagenes.yml`.
