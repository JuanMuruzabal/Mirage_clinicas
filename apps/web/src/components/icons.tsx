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
// 2026-08-26 — "el icono de herramientas del header se parece un sol").
// Viewbox propio (24, no 20 como el resto del set) porque es el glyph
// estándar de "configuración" (Feather Icons, MIT) — mismo criterio de
// trazo (`currentColor`, sin relleno) que el resto del archivo.
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
