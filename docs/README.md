# Índice de `docs/`

Mapa rápido de qué es cada documento y si sigue vigente. `CLAUDE.md` (raíz del repo) sigue siendo el punto de entrada real para trabajar en el proyecto — esto es solo para no perderse dentro de `docs/`.

## Documentos vivos — se actualizan a medida que el proyecto avanza

| Archivo | Qué es |
|---|---|
| [`dental-mirage-spec.md`](dental-mirage-spec.md) | Especificación funcional completa del producto. |
| [`implementation-plan.md`](implementation-plan.md) | Plan de implementación fase por fase, sprint por sprint, con criterios de aceptación. |
| [`tradeoffs.md`](tradeoffs.md) | Decisión por decisión: qué se eligió, qué alternativas se descartaron y por qué (TR-001 en adelante). El documento más largo y el que hay que leer para entender el "por qué" de cualquier cosa no obvia en el código. |
| [`ArquitecturaPeticionesTurno.md`](ArquitecturaPeticionesTurno.md) | Detalle técnico del mecanismo de verificación de identidad y anti-abuso del formulario público — qué hace cada detector, qué testear. |
| [`rediseno-flujo-turnos.md`](rediseno-flujo-turnos.md) | Especificación de UX del wizard de "pedir turno" — el código lo cita activamente por número de sección (`§3.5`, `§5`, etc.). |
| [`radiografia-tecnica.md`](radiografia-tecnica.md) | Auditoría de ingeniería (complejidad, seguridad, rendimiento) — 2026-09-08. Se puede volver a correr y actualizar cuando haga falta un nuevo chequeo. |

## Briefs originales del cliente — fuente primaria, no se editan

Transcripciones o entregas directas del cliente. Se mantienen tal cual llegaron, como referencia histórica de qué se pidió — las decisiones que se tomaron a partir de ellos están en `tradeoffs.md`, no acá.

- [`fase2-dental-mirage.md`](fase2-dental-mirage.md) — brief original de Fase 2 (calendario avanzado).
- [`fase2.3-extra-dental-mirage.md`](fase2.3-extra-dental-mirage.md) — brief de los 5 ítems extra post-QA de F2.3.
- [`FASE 2.4 - detallada y bien especificada.docx`](<FASE 2.4 - detallada y bien especificada.docx>) — brief de Fase 2.4 (verificación de identidad, "sacar turno para otro").

## Auth/onboarding — caso particular

- [`feature-sumarte-login.md`](feature-sumarte-login.md) — nació como el prompt original de esa feature, pero en la práctica **41 archivos de código Go la citan activamente por número de sección** (`§7`, `§2`, etc.) como si fuera la especificación viva de todo el módulo de auth. No se movió ni se tocó por eso — a pesar de lo que dice `CLAUDE.md` ("puede quedar desactualizado"), tratarla como histórica rompería esas referencias.
- [`feature-sumarte-login-resumen.md`](feature-sumarte-login-resumen.md) — el resumen de cierre de esa feature (qué se implementó, variables de entorno, repaso de seguridad). Este sí es el documento vivo de referencia para "qué quedó hecho".

## `mockups/` — capturas de referencia visual del cliente

Las 5 imágenes (`01-home.png` a `05-editor-pagina.png`) que ilustran las pantallas de referencia citadas en `dental-mirage-spec.md`/`implementation-plan.md`.

## `archivo/` — consumido, ya no hace falta consultarlo para trabajar

Documentos de un solo uso: instrucciones puntuales que ya se implementaron y quedaron cerradas (con su decisión documentada en `tradeoffs.md`). Se conservan como registro histórico de "así se pidió, así se resolvió", no como referencia activa.

- `referencia-para-claude-code.html` — HTML de referencia que mandó el cliente para el bug de scroll mobile (TR-028), ya resuelto.
- `prompt-claude-code-fecha-horario.md` — prompt para implementar el panel de calendario mensual y el selector de horario del wizard público, ya implementado.

## No versionados / de trabajo

`.claude/` es configuración local de Claude Code, no documentación del proyecto.
