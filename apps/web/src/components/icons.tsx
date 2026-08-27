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

export function IconSettings({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3 4.9 4.9" />
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
