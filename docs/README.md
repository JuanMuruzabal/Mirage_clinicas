# Índice de `docs/`

Mapa rápido de qué es cada documento y dónde vive, y si sigue vigente. `CLAUDE.md` (raíz del repo) sigue siendo el punto de entrada real para trabajar en el proyecto — esto es solo para no perderse dentro de `docs/`.

## `Arquitectura y base/` — documentos vivos, se actualizan a medida que el proyecto avanza

| Archivo | Qué es |
|---|---|
| [`dental-mirage-spec.md`](<Arquitectura y base/dental-mirage-spec.md>) | Especificación funcional completa del producto. |
| [`implementation-plan.md`](<Arquitectura y base/implementation-plan.md>) | Plan de implementación fase por fase, sprint por sprint, con criterios de aceptación. |
| [`tradeoffs.md`](<Arquitectura y base/tradeoffs.md>) | Decisión por decisión: qué se eligió, qué alternativas se descartaron y por qué (TR-001 en adelante). El documento más largo y el que hay que leer para entender el "por qué" de cualquier cosa no obvia en el código. |
| [`por-que-cada-decision-tecnica.md`](<Arquitectura y base/por-que-cada-decision-tecnica.md>) | El fundamento del **stack**, que la spec da por decidido sin explicar: por qué PostgreSQL y no MySQL/InnoDB, Go y no Node/Python, Render y no Cloudflare/Kubernetes, sesiones en base y no JWT ni Redis. Cada una con la alternativa contra la que se comparó, qué se sacrifica, y **la condición concreta que la haría cambiar**. `tradeoffs.md` cubre las decisiones de producto; este, las de plataforma, que están debajo de todas ellas. |

## `Fase 2/` — briefs originales del cliente y su especificación técnica

Los `.md`/`.docx` sueltos son fuente primaria (transcripciones o entregas directas del cliente) — se mantienen tal cual llegaron, sin editar. Las decisiones tomadas a partir de ellos están en `tradeoffs.md`, no acá.

- [`fase2-dental-mirage.md`](<Fase 2/fase2-dental-mirage.md>) — brief original de Fase 2 (calendario avanzado).
- [`fase2.3-extra-dental-mirage.md`](<Fase 2/fase2.3-extra-dental-mirage.md>) — brief de los 5 ítems extra post-QA de F2.3.
- [`FASE 2.4 - detallada y bien especificada.docx`](<Fase 2/FASE 2.4 - detallada y bien especificada.docx>) — brief de Fase 2.4 (verificación de identidad, "sacar turno para otro").

**`Fase 2/turnero_pagina/`** — documentos vivos de arquitectura/UX del wizard público, no briefs del cliente:

- [`ArquitecturaPeticionesTurno.md`](<Fase 2/turnero_pagina/ArquitecturaPeticionesTurno.md>) — detalle técnico del mecanismo de verificación de identidad y anti-abuso del formulario público.
- [`rediseno-flujo-turnos.md`](<Fase 2/turnero_pagina/rediseno-flujo-turnos.md>) — especificación de UX del wizard de "pedir turno" — el código lo cita activamente por número de sección (`§3.5`, `§5`, etc.).

## `Login/` — auth/onboarding, caso particular

- [`feature-sumarte-login.md`](<Login/feature-sumarte-login.md>) — nació como el prompt original de esa feature, pero en la práctica **41 archivos de código Go la citan activamente por número de sección** (`§7`, `§2`, etc.) como si fuera la especificación viva de todo el módulo de auth. A pesar de lo que dice `CLAUDE.md` ("puede quedar desactualizado"), tratarla como histórica rompería esas referencias — se movió de carpeta, pero no se tocó ni se fusionó su contenido.
- [`feature-sumarte-login-resumen.md`](<Login/feature-sumarte-login-resumen.md>) — el resumen de cierre de esa feature (qué se implementó, variables de entorno, repaso de seguridad). Este sí es el documento vivo de referencia para "qué quedó hecho".

## `Seguridad y optimizacion/`

Auditoría periódica de ingeniería (complejidad, seguridad, rendimiento) — cada ronda queda como su propio archivo, numerado, en vez de sobreescribir la anterior:

- [`radiografia-tecnica_1.md`](<Seguridad y optimizacion/radiografia-tecnica_1.md>) — primer diagnóstico completo, 2026-09-08. Arranca con los hallazgos crudos y el plan de acción en Fases A/B/C; cada ronda de arreglos se le suma como una sección más al final (§13 paginación, §14 deadlock en migraciones, §15 revisión de la Fase A). **Fases A y B cerradas, y los dos ítems accionables de la Fase C, el 2026-09-09** (§16: foreign keys reales y guardián de migraciones destructivas). Los tres ítems restantes de la Fase C están bloqueados por su propia condición de activación, escrita.
- [`como-se-arreglo-cada-cosa.md`](<Seguridad y optimizacion/como-se-arreglo-cada-cosa.md>) — guía de estudio que acompaña al diagnóstico: el porqué de cada decisión, la alternativa descartada en cada caso, y los bugs que introdujo el propio trabajo de la auditoría. Si querés entender el razonamiento y no solo el resultado, este es el que hay que leer.
- [`snapshot-2026-09-09.md`](<Seguridad y optimizacion/snapshot-2026-09-09.md>) — **el documento que hay que leer para saber "cómo estamos hoy"**, sin releer el diagnóstico crudo. No es solo lo que arregló la auditoría: es el inventario COMPLETO de lo que hace seguro y eficiente al sistema —sesiones, CAPTCHA, códigos de verificación, barrido de basura, detectores de abuso, aislamiento entre clínicas, integridad de la base, headers, BFF, rendimiento, testing— marcando qué ya existía y qué se agregó. Cierra con lo que NO está y qué lo activa, y con una lista concreta de qué volver a medir en el próximo snapshot para poder compararlos.

## `mockups MVP/` — capturas de referencia visual del cliente

Las 5 imágenes (`01-home.png` a `05-editor-pagina.png`) que ilustran las pantallas de referencia citadas en `dental-mirage-spec.md`/`implementation-plan.md`.

## `archivo/` — consumido, ya no hace falta consultarlo para trabajar

Documentos de un solo uso: instrucciones puntuales que ya se implementaron y quedaron cerradas (con su decisión documentada en `tradeoffs.md`). Se conservan como registro histórico de "así se pidió, así se resolvió", no como referencia activa.

- `referencia-para-claude-code.html` — HTML de referencia que mandó el cliente para el bug de scroll mobile (TR-028), ya resuelto.
- `prompt-claude-code-fecha-horario.md` — prompt para implementar el panel de calendario mensual y el selector de horario del wizard público, ya implementado.

## No versionados / de trabajo

`.claude/` es configuración local de Claude Code, no documentación del proyecto.

---

**Nota sobre las rutas citadas en el código:** cientos de comentarios en `apps/api` y `apps/web` citan estos documentos por su ruta completa (ej. `docs/Arquitectura y base/tradeoffs.md TR-050`). Si volvés a mover o renombrar algo acá, esas referencias quedan desactualizadas — no rompen la compilación (son solo texto en comentarios), pero conviene actualizarlas en el mismo cambio para que la documentación no "mienta" sobre dónde están las cosas.
