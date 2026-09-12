# Prompt para Claude Code — pantalla "Día y horario" + scroll del modal

Pegar tal cual. Reemplaza la sección **[6] Día y horario** de `rediseno-flujo-turnos.md` y agrega el componente 3.8.

---

Tomá `rediseno-flujo-turnos.md` como especificación base del flujo de pedir turno. Necesito tres cambios sobre la pantalla [6] "Día y horario", más un componente nuevo que aplica a todos los modales del flujo. Usá los tokens ya definidos en la sección 2 de ese documento; si el proyecto ya tiene variables de color propias, usá esas.

## 1. Sacar el `<input type="date">` y reemplazarlo por un calendario propio

Hoy el botón "Elegir fecha" abre el date picker nativo del navegador: no se puede estilar, se monta encima del contenido y rompe la paleta con sus links azules. Reemplazalo por un panel de mes propio.

**Comportamiento:**

- El botón "Elegir fecha" es un toggle. Al abrirlo, el panel se despliega **debajo del navegador de día, dentro del flujo del modal**, empujando el contenido hacia abajo. No es un popover flotante ni un overlay.
- Mientras está abierto, el botón dice "Cerrar calendario" y lleva `aria-expanded="true"`.
- Al elegir un día, el panel se cierra solo, el navegador de día se actualiza y la selección de horario se resetea.

**Estructura del panel:**

- Contenedor: fondo `--t-field`, radio `--t-r-card`, padding `12px`.
- Cabecera: flecha mes anterior, nombre del mes y año en 14px peso 500, flecha mes siguiente. Las flechas son botones `32×32`, fondo `--t-modal`, radio 8px, con `aria-label`.
- Fila de iniciales de día en 11px `--t-ink-mute`, en minúscula: `do lu ma mi ju vi sa`. Semana empieza en domingo.
- Grilla de 7 columnas, gap `2px`, celdas de `38px` de alto.
- Pie del panel: leyenda `● con turnos` a la izquierda (punto de 5px en `--t-green`) y botón de texto `Volver a hoy` a la derecha, separados por una línea `1px solid #E2D6C7`.

**Estados de cada día:**

| Estado | Tratamiento |
|---|---|
| Con turnos | texto `--t-ink` + punto de 4px en `--t-green` abajo, centrado |
| Sin turnos o pasado | texto `#BDB3A5`, `disabled`, sin cursor pointer |
| Hoy (no seleccionado) | `box-shadow: inset 0 0 0 1.5px #C9BDAE` |
| Seleccionado | fondo `--t-green`, texto `--t-green-ink`, sin punto |

La disponibilidad se pinta **antes de que el usuario toque el día**. Eso implica que el backend tiene que devolver, junto con los slots, un array de días con turnos del mes visible (`GET /disponibilidad?mes=2026-09&tipo=<id>` → `{ dias: ["2026-09-07", ...] }`). Al cambiar de mes con las flechas, pedir el mes nuevo. No hagas una llamada por día.

Navegación por teclado: flechas mueven el foco entre días, Enter y Espacio seleccionan, Escape cierra el panel y devuelve el foco al botón "Elegir fecha".

## 2. Agrupar los horarios por franja

Con días de 60+ turnos, una sola tira horizontal es inusable: hay que apretar la flecha veinte veces.

- Arriba de la tira, un grupo de chips: `Mañana (12)`, `Tarde (28)`, `Noche (9)`. Chips de `32px` de alto, radio `999px`, padding lateral `14px`. Activo: fondo `--t-green`, texto `--t-green-ink`. Inactivo: fondo `--t-field`, texto `--t-ink-soft`.
- Cortes: mañana `< 12:00`, tarde `12:00–17:59`, noche `≥ 18:00`.
- **Una franja sin turnos no muestra su chip.** Si solo hay una franja con turnos, no mostrar los chips.
- La tira muestra solo la franja activa. Al cambiar de día, si la franja activa quedó vacía, saltar a la primera que tenga turnos.
- El contador de la derecha ("64 turnos") sigue mostrando el total del día, no el de la franja.

## 3. Scroll del modal

Con el calendario abierto la pantalla no entra en viewports chicos. Aplicá esto a **todos los modales del flujo**, no solo a este, porque el mismo problema aparece con la lista larga de fichas de [5b].

**Estructura de tres zonas:** cabecera fija, cuerpo con scroll, pie fijo. Nunca scrollea el modal entero: si el pie se va de pantalla, el usuario no encuentra "Confirmar turno".

```css
.modal {
  display: flex;
  flex-direction: column;
  max-height: min(85dvh, 720px);
  background: var(--t-modal);
  border-radius: var(--t-r-modal);
}
.modal__head { flex: 0 0 auto; padding: 24px 24px 0; }
.modal__body {
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 24px;
  scrollbar-width: thin;
  scrollbar-color: var(--t-line-strong) transparent;
}
.modal__body::-webkit-scrollbar { width: 6px; }
.modal__body::-webkit-scrollbar-track { background: transparent; }
.modal__body::-webkit-scrollbar-thumb {
  background: var(--t-line-strong);
  border-radius: 3px;
}
.modal__foot {
  flex: 0 0 auto;
  padding: 16px 24px 24px;
  border-top: 1px solid var(--t-line);
  background: var(--t-modal);
}
```

Detalles:

- Usá `dvh`, no `vh`: en móvil la barra del navegador rompe `vh`.
- El divisor del pie pasa a ser el `border-top` de `.modal__foot`. Sacá el divisor que hoy está dentro del contenido para que no queden dos líneas.
- Cuando el cuerpo tiene scroll disponible, agregá una sombra sutil bajo la cabecera (`box-shadow: 0 1px 0 var(--t-line)`) que aparezca solo si `scrollTop > 0`. Es la única señal de que hay contenido arriba.
- Al abrir el calendario, hacé `scrollIntoView({ block: 'nearest', behavior: 'smooth' })` sobre el panel, respetando `prefers-reduced-motion`.
- Bloqueá el scroll del `body` de la página mientras el modal está abierto, y mantené el foco atrapado dentro del modal.
- La tira horizontal de horarios lleva `overscroll-behavior-x: contain` para que el gesto lateral no arrastre el scroll vertical del cuerpo.

## Bug a corregir de paso

El select de tipo de consulta muestra "Consulta general — 1 min". La duración tiene que venir del backend por tipo de consulta, y afecta qué slots hay disponibles: al cambiar el tipo, recargá la tira de horarios.

## Criterios de aceptación

1. El botón "Elegir fecha" nunca abre el date picker nativo; en ningún navegador aparece un calendario con estilos del sistema.
2. Los días sin turnos se ven deshabilitados antes de tocarlos y no son seleccionables.
3. Un día con 60+ turnos se navega sin usar las flechas laterales más de tres o cuatro veces.
4. Con el calendario abierto en una pantalla de 640px de alto, el botón "Confirmar turno" sigue visible sin scrollear.
5. La barra de scroll del cuerpo usa los colores del sistema, no la del navegador.
6. Todo se puede completar con teclado, con foco visible en cada paso.
