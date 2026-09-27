// Íconos de la home. Van aparte de components/icons.tsx a propósito: son
// ilustraciones de esta página (la campana del aviso, el chat, el
// escudo), con el trazo duro de la marca, y no controles de la app.

type Props = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  "aria-hidden": true as const,
};

export function IconoCampana({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5h4" />
    </svg>
  );
}

export function IconoChat({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </svg>
  );
}

export function IconoEscudo({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3 19 6v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

export function IconoCodigo({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="6" width="18" height="12" />
      <path d="M7 12h.01M11 12h.01M15 12h2" strokeWidth="2.6" />
    </svg>
  );
}

export function IconoEquipo({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="4" width="7" height="7" />
      <rect x="14" y="4" width="7" height="7" />
      <path d="M3 20c.4-3 2-4.5 3.5-4.5S9.6 17 10 20M14 20c.4-3 2-4.5 3.5-4.5S20.6 17 21 20" />
    </svg>
  );
}

export function IconoReloj({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
