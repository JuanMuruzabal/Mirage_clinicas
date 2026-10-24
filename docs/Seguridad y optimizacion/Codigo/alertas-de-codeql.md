# Alertas de code scanning (CodeQL) abiertas en `dev`

**PRISMA · Seguridad y optimización / Código**

Relevadas el 2026-10-24, cuando la rama por defecto de GitHub pasó a `dev` y CodeQL empezó a mirar lo que se integra (ver `../Dependencias/actualizacion-de-dependencias-2026-10.md`, sección 2). Son alertas sobre **nuestro código**, no sobre dependencias. Ninguna es explotable; se resuelven en el ítem 4 del plan (mejorar el CI), arreglando o descartando cada una con su motivo.

| Alerta | Dónde | Qué es |
|---|---|---|
| `go/incorrect-integer-conversion` | `apps/api/internal/security/password.go:184` | el `uint8` de `Parallelism` sale de un hash nuestro, no de un usuario |
| `go/incorrect-integer-conversion` | `apps/api/internal/documentos/lamina.go:47` | `rune` de las métricas fijas de Helvetica |
| `go/weak-sensitive-data-hashing` | `apps/api/internal/security/pwned.go:41` | el SHA-1 que exige HaveIBeenPwned (k-anonimato): falso positivo |
| `js/incomplete-sanitization` | `apps/web/src/lib/api-documentos.test.ts:38` | código de tests |
| `js/incomplete-url-substring-sanitization` | `apps/web/src/lib/pagina-publica/tarjeta-compartir.test.ts:40` | código de tests |

Las alertas de `missing-workflow-permissions` de `ci.yml` estaban en `main`, no en `dev`: ya las arregló TR-178.
