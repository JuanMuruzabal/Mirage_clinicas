# Seguridad y optimización

Tres líneas de trabajo, cada una en su subcarpeta: lo que **no escribimos nosotros**, lo que sí y el CI que vigila las dos.

## `Dependencias/`

Las rondas de actualización de dependencias y la cadena de suministro.

- `actualizacion-de-dependencias-2026-10.md`: la ronda de octubre de 2026 (TR-197 y TR-198): Next 16.4.2, Go 1.26.10, las transitivas, Zod 4, la espera de 7 días y cómo repetir el chequeo.

## `CI/`

Qué corre en GitHub cada vez que se toca el repo, por qué y qué hacer cuando falla. Cruza las otras dos carpetas: revisa dependencias y código.

- `ci-de-seguridad.md`: el mapa de los workflows (`ci-*` y `seguridad-*`), el porqué de Dependabot, govulncheck, pnpm audit, dependency-review, zizmor, Trivy, Scorecard, CodeQL `extended`, las actions por SHA y los rulesets, los checks obligatorios y la configuración externa (TR-199).

## `Codigo/`

Las auditorías de nuestro código, las optimizaciones y, en `CodeQL/`, las alertas de code scanning.

- `radiografia-tecnica_1.md`: la primera radiografía (2026-09-08/09), módulo por módulo, y el registro de cada ronda de arreglos.
- `radiografia-tecnica_2.md`: la segunda (2026-09-26), el diagnóstico vigente.
- `como-se-arreglo-cada-cosa.md`: el porqué de cada decisión y la alternativa descartada.
- `snapshot-2026-09-09.md`: el inventario de qué hace seguro y eficiente al sistema.
- `optimizacion-post-fase3.md`: la ronda de optimización post-Fase 3 (2026-09-22/23).
- `CodeQL/alertas-de-codeql-2026-10-25.md`: las alertas de code scanning de la ronda del 2026-10-25 (17 arregladas y las descartadas), una por una. Una ronda futura va en un archivo nuevo con su fecha, en esta misma subcarpeta.

## Cómo se hace la próxima ronda: archivo por archivo

Los próximos análisis de seguridad y optimización se hacen **archivo por archivo, tomándose el tiempo que haga falta con cada uno**. Lo pidió la persona, y tiene un porqué: las rondas anteriores leyeron por módulo y por muestreo, y las cosas se escapan en los huecos entre archivos (el `X-Request-Id` que dejaba elegir el id del request, las cabeceras de la IP, una consulta sin acotar por clínica). Leer un archivo entero, con quién lo llama y qué recibe, es más lento y es lo que las encuentra.
