// Íconos de la sidebar de gestión (T2.1, pedido explícito: "cada
// herramienta debería tener un ícono al lado haciendo referencia a lo que
// es") — trazo simple (stroke, sin relleno), mismo grosor en los 4, para
// que lean como un set y no como íconos sueltos de librerías distintas.
// A propósito NO son la marca de cuadrante (esa es la firma de la marca,
// spec §9.7 — acá hace falta wayfinding funcional real, un trabajo
// distinto).

type IconProps = { className?: string };

const commonProps = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

// General — dashboard: cuatro paneles, el resumen de un vistazo.
export function IconGeneral({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" />
      <rect x="11" y="2.5" width="6.5" height="4" />
      <rect x="11" y="8.5" width="6.5" height="9" />
      <rect x="2.5" y="11" width="6.5" height="6.5" />
    </svg>
  );
}

// Calendario — grilla con encabezado, como la referencia (03-calendario.png).
export function IconCalendario({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <rect x="2.5" y="3.5" width="15" height="14" />
      <line x1="2.5" y1="7.5" x2="17.5" y2="7.5" />
      <line x1="6" y1="2" x2="6" y2="5" />
      <line x1="14" y1="2" x2="14" y2="5" />
    </svg>
  );
}

// Turnos — bandeja de entrada: lo que llega desde la página pública.
export function IconTurnos({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M2.5 11.5h4l1.5 2.5h4l1.5-2.5h4" />
      <path d="M4 11.5 5.8 4h8.4L16 11.5" />
      <rect x="2.5" y="11.5" width="15" height="5.5" />
    </svg>
  );
}

// Pacientes — dos personas: la ficha de cada uno.
export function IconPacientes({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <circle cx="7.5" cy="6.5" r="2.75" />
      <path d="M2.5 17c0-3 2.24-5 5-5s5 2 5 5" />
      <circle cx="14.5" cy="7.5" r="2" />
      <path d="M13 10.2c2.2.2 3.9 1.9 4.5 4.3" />
    </svg>
  );
}
