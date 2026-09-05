interface IconProps {
  className?: string;
}

// Set mínimo de íconos de línea para el header (pedido explícito del
// cliente, 2026-08-26: "poner simbolos para" el botón de configuración y
// cada accesos del menú de herramientas). `currentColor` para heredar el
// color de texto del header en cualquiera de sus dos estados (sólido/
// transparente) sin necesitar una variante por tema — mismo criterio que
// `QuadrantMark`.
const svgProps = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// IconSettings — engranaje real (dientes redondeados), no rayos rectos
// desde un círculo: la versión anterior (líneas radiales) se confundía
// con un ícono de sol/tema claro-oscuro (pedido explícito del cliente,
// 2026-08-26 — "el icono de herramientas del header se parece un sol",
// y luego, tras el revert general de TR-064: "el cambio del ícono...
// estaba bien, vuelva a implementarlo"). Viewbox propio (24, no 20 como
// el resto del set) porque es el glyph estándar de "configuración"
// (Feather Icons, MIT) — mismo criterio de trazo (`currentColor`, sin
// relleno) que el resto del archivo.
export function IconSettings({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// IconFilter — embudo (glyph estándar de "filtro", Feather Icons, MIT),
// mismo viewBox/trazo que IconSettings — pedido textual del cliente
// (2026-09-06): "al botón de filtros ponerle un icono de filtros".
export function IconFilter({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function IconUser({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <circle cx="10" cy="6.8" r="3.3" />
      <path d="M3.8 17c.9-3.3 3.5-5 6.2-5s5.3 1.7 6.2 5" />
    </svg>
  );
}

export function IconClinic({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <rect x="3" y="4.2" width="14" height="12.6" rx="1.4" />
      <path d="M3 8h14M7 4.2V2.6M13 4.2V2.6" />
      <path d="M10 10.6v3.4M8.3 12.3h3.4" />
    </svg>
  );
}

export function IconPersonalize({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M12.6 3.2 16.8 7.4 7 17.2H2.8V13Z" />
      <path d="M11 4.8 15.2 9" />
    </svg>
  );
}

// IconLogout — puerta con flecha de salida (TR-075 en docs/tradeoffs.md,
// 2026-08-27, pedido explícito del cliente: "Cerrar sesión" pasa a vivir
// en el menú de la tuerquita, antes solo estaba en /perfil).
export function IconLogout({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M8 3H4.5A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17H8" />
      <path d="M13 14l4-4-4-4" />
      <path d="M17 10H7.5" />
    </svg>
  );
}

// IconMenu — 3 rayitas horizontales, para abrir el sidebar de gestión de
// clínica en mobile (TR-075 en docs/tradeoffs.md, 2026-08-27, pedido
// explícito del cliente: "poner el icono de las 3 rayitas para
// desplegar el sidebar"). Corrección de QA (2026-09-05, textual):
// "cuando tengo desplegado el sidebar cambiar las tres rayitas con una
// x cuando esta abierto, y cuando se cierra vuelven las rayitas" — el
// botón que usa este ícono (site-header-chrome.tsx) pasa a alternar con
// IconX según `panelSidebar.open`; la nota vieja de "deliberadamente NO
// animado a una X" quedó revertida por este pedido puntual.
export function IconMenu({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

// IconX — reemplaza a IconMenu mientras el drawer del sidebar está
// abierto (ver el comentario de IconMenu de arriba).
export function IconX({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
    </svg>
  );
}
