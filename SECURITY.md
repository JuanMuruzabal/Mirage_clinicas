# Política de seguridad

PRISMA guarda datos de salud de pacientes, así que una vulnerabilidad se trata con cuidado.

## Cómo reportar una vulnerabilidad

**Por el reporte privado de GitHub, nunca en un issue público.** Entrá a la pestaña **Security** del repositorio, tocá **Report a vulnerability** o andá directo a:

<https://github.com/JuanMuruzabal/Mirage_clinicas/security/advisories/new>

Un issue, un comentario o un PR público muestra la falla a cualquiera antes de que esté arreglada. El reporte privado la deja entre quien la encontró y el equipo.

Contá lo que puedas: qué pasa, cómo reproducirlo, qué datos o funciones alcanza y, si lo sabés, desde qué versión ocurre. No hace falta un exploit completo.

## Qué versiones se soportan

| Rama | Qué es | Se soporta |
|---|---|---|
| `main` | Producción | Sí |
| `dev` | Integración: lo que se va a producir | Sí |

No hay versiones numeradas ni ramas de mantenimiento: un arreglo entra a `dev` por PR y de ahí llega a `main`.

## Qué esperar

- **Acuse de recibo** del reporte.
- **Seguimiento por el mismo reporte privado:** te contamos si lo confirmamos, qué alcance tiene y cuándo queda arreglado.
- **Crédito** en el aviso, si querés que figure tu nombre.

Es un proyecto chico, mantenido por pocas personas: no hay un plazo contractual de respuesta, pero un reporte de seguridad pasa por delante del resto del trabajo.

## Cómo se cuida el repositorio

Dependabot, `govulncheck`, `pnpm audit`, Trivy, CodeQL, zizmor y OpenSSF Scorecard corren sobre el código y las dependencias. Qué hace cada uno, por qué y qué hacer cuando falla está en [`docs/Seguridad y optimizacion/CI/ci-de-seguridad.md`](docs/Seguridad%20y%20optimizacion/CI/ci-de-seguridad.md).
