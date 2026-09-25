# Pulido de la página pública y del editor (PP-1 a PP-6)

**Estado:** plan aprobado, en implementación · **Fecha:** 2026-09-25 · **Alcance:** `/personalizar-pagina`, `ClinicaPublicaTemplate` y `packages/prisma-engine`. Nada del panel de gestión ni del wizard de turno (salvo el botón que lo abre).

Sale de un relevamiento del 2026-09-25 que miró el Prisma Engine terminado (PE-1 a PE-9 + 4.6) desde cuatro ángulos: accesibilidad, mobile, facilidad de uso y calidad de diseño. La página pública se miró **en un navegador real** (páginas de demostración `PRISMA_DEMO_PLANTILLAS=1`, Chrome headless con emulación mobile a 390 px y desktop a 1366 px, auditoría con axe-core 4.13 sobre 4 de las 6 plantillas). **El editor se revisó solo leyendo el código**: necesita API + Postgres, que no estaban levantados. Todo lo marcado "(código)" abajo es una lectura, no una prueba.

Numeración: los hallazgos conservan el número del relevamiento (H1 a H27) para poder cruzarlos con la conversación y con los commits.

---

## Hallazgos

### Roto

| # | Qué | Dónde | Cómo se vio |
|---|---|---|---|
| H1 | Con `prefers-reduced-motion: reduce` el contenido con efecto de entrada queda **para siempre** en opacidad 0,94 + `blur(1px)` | `efectos/entrada.tsx` | medido: todos los `[data-pp-efecto]` con `filter: blur(1px)` |
| H2 | El historial de versiones y "restaurar" (PE-8) no tienen UI: las actions existen y nadie las llama | `app/actions/pagina-publica.ts` | (código) |
| H3 | "Publicar" está habilitado con cambios sin guardar y publica la versión GUARDADA, no la que se ve; el sello "Publicada" aparece igual | `pagina-editor.tsx` | (código) |
| H4 | El módulo Horarios guarda con su propio botón y sale al público al instante: no pasa por borrador ni por Publicar | `modulos/horarios/editor.tsx`, `horariosClinicaPublicos` | (código) |
| H5 | La vista previa del editor es la página real: "Pedir turno" abre el wizard de verdad; con la galería de plantillas abierta hay dos páginas en el mismo documento (ids `#turno`, `#horarios`… duplicados, dos `h1`) | `vista-previa.tsx`, `galeria-plantillas.tsx` | (código) |
| H6 | "Mantener mi copia" ante un conflicto de revisión no reintenta el guardado, aunque el comentario dice que sí | `pagina-editor.tsx` | (código) |

### Accesibilidad

| # | Qué | Cómo se vio |
|---|---|---|
| H7 | Los efectos envuelven cada `<li>` en un `<div>` (`motion.div`): `list`/`listitem` de axe en las 4 plantillas auditadas (Equipo, Horarios, Servicios) | axe |
| H8 | El carrusel de Equipo no se puede recorrer con teclado | axe `scrollable-region-focusable` |
| H9 | Los `radiogroup` del editor (tema, color, tokens, variantes, fondo) son botones sueltos: sin flechas, cada opción es un Tab (~40 en Diseño); `legend` + `aria-label` repiten el nombre | (código) |
| H10 | La galería de plantillas no cierra con Escape, no atrapa ni devuelve el foco; Publicar y "Reemplazar todo" usan `window.confirm` | (código) |
| H11 | Contraste del editor: ayudas/etiquetas `text-grafito/60` a 12 px ≈ 3,7:1; "Guardar horario" (blanco sobre `salvia`) ≈ 3,6:1; textos a `grafito/50` ≈ 3:1 — AA pide 4,5:1 | cálculo sobre la paleta |
| H12 | Pestañas Módulos/Diseño/Buscadores: `role="tab"` sin `tabpanel`, `aria-controls` ni flechas | (código) |
| H13 | Alt de fotos genérico ("Foto 3 de …"), no editable | (código) |

### Mobile

| # | Qué | Cómo se vio |
|---|---|---|
| H14 | Objetivos táctiles chicos: "Mis turnos" 20 px de alto, "Cómo llegar" 15 px, el teléfono 17 px, los links del menú "subrayado" 20 px; en el editor el asa, ↑↓ y las pastillas ≈ 28 px | medido |
| H15 | Editor en celular: vista previa (mín. 640 px) arriba y panel abajo; botón "→" de retraer sin sentido; barra de ~7 acciones partida en filas; `px-8` | (código) |
| H16 | Menú "barra" sticky + `scroll-mt-6`: al tocar un link, el título de la sección queda debajo de la barra | (código) |
| H17 | Vista previa "Móvil" (390 px) no entra en un celular real: scroll horizontal dentro del editor | (código) |

### Facilidad de uso

| # | Qué |
|---|---|
| H18 | Sobrecarga de opciones: variante, título, fondo, alineación y efecto+intensidad **por elemento** en cada módulo; Diseño arranca por "Movimiento" y los presets quedan al final |
| H19 | "Quitar" borra al instante sin deshacer; "Aplicar solo el diseño" no confirma |
| H20 | Agregar módulo es un `<select>` con "Nombre — descripción" que siempre agrega al final |
| H21 | Vista previa y lista no se hablan: tocar una sección no la abre; abrir un módulo no la muestra |
| H22 | Las fotos se suben al elegirlas: si se descarta el borrador quedan huérfanas en el storage |
| H23 | Microcopy: pestaña "Buscadores", "Guardando…" en Ocultar, vista de Google con `/slug` sin dominio |

### Diseño de la página pública

| # | Qué |
|---|---|
| H24 | Estadísticas en cero: una clínica nueva publica "0 pacientes atendidos"; el número sale sin formato ("1234") hasta que la animación lo reemplaza |
| H25 | Desktop: columna de 768 px en 1366, todo tarjeta centrada; Equipo alineado a la izquierda y Horarios con tabla a la izquierda bajo un título centrado |
| H26 | Teléfono crudo ("+5493510000000"), "Contactanos" repite el CTA de turno, sin footer, portada sin foto es solo texto |
| H27 | La portada nombra UN profesional aunque la clínica tenga N (Fase 3.2) |

---

## PRs

Criterio (el mismo del plan Prisma Engine, ver la memoria de trabajo del 2026-09-22): tests **solo donde protegen una regla** (reduced-motion, semántica, contraste AA, flujo de publicación), sin snapshot por variante; suite completa una vez por PR; ramas `fix/pp-N-…` o `feature/pp-N-…` a `dev`, merge commit. Decisiones de arquitectura en `tradeoffs.md` a partir de **TR-168** (TR-167 es de la 4.6, PR #61, todavía abierto).

| PR | Rama | Qué cubre | Estado |
|---|---|---|---|
| PP-1 | `fix/pp-1-pagina-publica` | Página pública: H1, H7, H8, H14 (público), H16, H24 — TR-168 | implementado, sin PR |
| PP-2 | `fix/pp-2-flujo-de-publicacion` | Flujo del editor: H3, H5, H6, H4 (ver decisión) | pendiente |
| PP-3 | `feature/pp-3-historial-y-dialogos` | H2 (historial + restaurar), H10 y H19 con un diálogo propio, deshacer "Quitar" | pendiente |
| PP-4 | `fix/pp-4-accesibilidad-editor` | H9, H11, H12, H14 (editor), H13 | pendiente |
| PP-5 | `feature/pp-5-editor-mobile` | H15, H17 y el orden de pantallas en celular | pendiente |
| PP-6 | `feature/pp-6-editor-simple` | H18, H20, H21, H23 | pendiente |
| — | sin PR | H22 (limpieza de fotos huérfanas: pide un job en el backend), H25–H27 (piden decisiones de diseño con Juan/el cliente) | a definir |

### PP-1 — la página pública que ve el paciente

Va primero porque es lo único que ya afecta a pacientes reales.

- **H1** — `EfectoEntrada` no decide el estado inicial con `useReducedMotion()` (vale `null` en el primer render y el `initial` de Motion no se vuelve a aplicar cuando cambia). Con movimiento reducido el componente queda en el estado FINAL desde el montaje, y la regla se cubre con un test que falla con el código viejo.
- **H7** — un efecto sobre un elemento de lista no puede insertar un `<div>` entre `<ul>` y `<li>`. El slot anima al propio hijo (el `motion` se monta sobre el mismo tag) o, donde no se puede, el wrapper lleva `display: contents` y el `<li>` sigue siendo hijo directo. Test: `ul > li` directo en los módulos con listas y efectos.
- **H8** — el carrusel de Equipo lleva `tabIndex={0}`, `role="region"` y `aria-label`, como ya hace la galería.
- **H14** — "Mis turnos", "Cómo llegar", el teléfono y los links del menú llegan a 24 px de alto como mínimo (WCAG 2.2 2.5.8), sin cambiar su peso visual (padding, no tamaño de letra).
- **H16** — el margen de scroll de las secciones tiene en cuenta la barra sticky cuando el menú es "barra".
- **H24** — una estadística en cero no se muestra; si todas son cero, el módulo no se dibuja (mismo criterio que un módulo vacío: no deja hueco). El número sale formateado `es-AR` también sin animación.

### PP-2 — que Publicar publique lo que se ve

- **H3** — con cambios sin guardar, el botón pasa a **"Guardar y publicar"** (guarda, y si el guardado sale bien, publica). El sello "Publicada" solo aparece si no hay cambios sin guardar ni sin publicar.
- **H6** — "Mantener mi copia" reintenta el guardado con la revisión nueva.
- **H5** — la plantilla recibe un modo `vistaPrevia`: el botón de turno y "Mis turnos" no abren nada (se ven igual, con un aviso "desactivado en la vista previa"), los links del menú hacen scroll dentro de la vista previa, y los ids de sección llevan un prefijo por instancia para que dos vistas previas no choquen. La plantilla deja de emitir `h1` en modo vista previa.
- **H4** — **decisión a confirmar:** el horario es un dato del edificio (v2.2 del plan Prisma Engine), no del diseño de la página, y lo leen también otras pantallas; meterlo en el borrador lo duplicaría. Propuesta: queda como está, pero el editor lo dice ("Se aplica al instante en tu página, no espera a Publicar") y el botón deja de parecer parte del borrador.

### PP-3 — historial, diálogos y deshacer

- **H2** — panel "Historial" con las versiones publicadas (número, autor, fecha) y "Restaurar en el borrador" (nunca publica directo, respeta el candado de revisión).
- **H10/H19** — un `Dialogo` propio (foco atrapado, Escape, devuelve el foco, `aria-modal`) reemplaza a `window.confirm` y lo usa también la galería de plantillas.
- **H19** — "Quitar" un módulo deja un aviso con **Deshacer** durante unos segundos, en vez de confirmar (menos fricción, mismo resguardo).

### PP-4 — accesibilidad del editor

- **H9** — un `GrupoDeOpciones` con el patrón de radio de WAI-ARIA (roving tabindex, flechas, Home/End) reemplaza los seis radiogroups hechos a mano; sin `aria-label` duplicado.
- **H12** — pestañas con `tabpanel`, `aria-controls` y flechas.
- **H11** — ayudas y etiquetas a un tono que dé 4,5:1 sobre marfil; "Guardar horario" a `salvia-oscuro`. Test de contraste sobre los pares usados.
- **H14 (editor)** — asa, ↑↓ y pastillas a 44 px de área táctil en pantallas táctiles (`pointer: coarse`).
- **H13** — campo opcional "Descripción de la foto" en portada, foto suelta y galería; vacío = el alt de hoy. Toca el esquema de los módulos → `engine:generar`.

### PP-5 — el editor en un celular

- Debajo de `lg`: una barra inferior fija con **Editar / Vista previa** (una cosa a la vez, a pantalla completa) en lugar de apilar las dos; sin el botón de retraer.
- La barra de acciones se reduce a **Guardar** + **Publicar** + un menú "Más" (Plantillas, Ver página, Ocultar, Historial).
- La vista previa en celular es siempre el ancho real del dispositivo (sin selector de 390/768/escritorio, que ahí no tiene sentido).
- `px-4` en mobile.

### PP-6 — un editor más simple

- **H18** — en cada módulo se ve contenido + diseño de la sección; fondo, alineación y efectos van bajo **"Más opciones"** (cerrado por defecto). Diseño arranca por presets de estilo, después colores, tipografía, forma y, al final, movimiento.
- **H20** — "Agregar sección" abre un catálogo con miniaturas (las mismas `Miniatura` de las variantes) y se puede insertar debajo del módulo abierto.
- **H21** — tocar una sección en la vista previa abre su editor; abrir un módulo hace scroll hasta él en la vista previa.
- **H23** — "Buscadores" → "Google y redes"; Ocultar muestra "Ocultando…/Mostrando…"; la vista de Google usa el dominio real (`urlDelSitio`).

---

## Registro

- **2026-09-25** — relevamiento y plan.
- **2026-09-25** — PP-1 implementado (TR-168). Verificado en Chrome sobre las 4 plantillas de demostración: axe sin violaciones (antes `list`, `listitem` y `scrollable-region-focusable`), ningún objetivo táctil de menos de 24 px (antes 3 a 9 por plantilla), 0 de 36 efectos fuera de su estado final con movimiento reducido (antes 36 de 36). De paso: la grilla de Equipo y la de Servicios usaban breakpoints de ventana (`sm:`/`lg:`), así que la vista previa "Móvil" del editor mostraba varias columnas; pasaron a container queries. Y el conteo animado no cancelaba su `requestAnimationFrame` al desmontar.
