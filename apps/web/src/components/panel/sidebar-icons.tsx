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

// Tu página — ventana de navegador con una barra de encabezado y dos
// líneas de contenido: la página pública de la clínica (rama fix/mobile,
// 2026-08-24, pedido explícito del cliente: "agregá 'Tu página' y 'Tu
// perfil' dentro del sidebar, cada uno con su icono, igual que el
// resto").
export function IconPagina({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <rect x="2.5" y="3" width="15" height="14" rx="1.5" />
      <line x1="2.5" y1="7" x2="17.5" y2="7" />
      <line x1="5.5" y1="10.5" x2="14.5" y2="10.5" />
      <line x1="5.5" y1="13.5" x2="11.5" y2="13.5" />
    </svg>
  );
}

// Tu perfil — una sola persona (versión simplificada de IconPacientes,
// acá no hace falta distinguir dos fichas).
export function IconPerfil({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <circle cx="10" cy="6.5" r="3.25" />
      <path d="M3 17c0-3.6 3.13-6 7-6s7 2.4 7 6" />
    </svg>
  );
}

// Seguridad (corrección de seguridad, Fase 2.4.1) — escudo: mails/IPs
// bloqueados por el formulario público y la auditoría de qué se borró.
export function IconSeguridad({ className }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M10 2.5 16.5 5v5c0 4-2.8 7-6.5 8-3.7-1-6.5-4-6.5-8V5z" />
      <path d="M7.3 9.7 9.2 11.6 12.8 8" />
    </svg>
  );
}
