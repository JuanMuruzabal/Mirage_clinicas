interface IconoDecorativoProps {
  className?: string;
}

// Íconos decorativos de cabecera del Turnero (F2.3 extra ítem 1,
// corrección de QA 2026-09-06: "añadir diseños a los encabezados de cada
// tarjeta", ver diseño1.png/diseño2.png en docs/) — puramente
// ornamentales (`aria-hidden`), uno por tarjeta, con un motivo pensado
// para lo que esa tarjeta representa: reloj (turnos de hoy), avance
// (turnos próximos), casilleros bloqueados (horarios reservados), tilde
// (turnos resueltos), sello (turnos confirmados). Mismo criterio de
// trazo que icons.tsx (`currentColor`, sin relleno salvo donde el propio
// mockup lo pide) — el color/opacidad los pone quien los usa, ver
// TarjetaConLista/TarjetaSimple.

export function IconoReloj({ className = "" }: IconoDecorativoProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3" className={className}>
      <circle cx="50" cy="50" r="42" />
      <path d="M50 22v6M78 50h-6M50 78v-6M22 50h6" strokeLinecap="round" />
      <path d="M50 50V26M50 50l20 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconoAvance({ className = "" }: IconoDecorativoProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 130 100" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 18 L38 50 L10 82" />
      <path d="M48 18 L76 50 L48 82" opacity="0.65" />
      <path d="M86 18 L114 50 L86 82" opacity="0.4" />
    </svg>
  );
}

export function IconoCasilleros({ className = "" }: IconoDecorativoProps) {
  // Grilla 3×3 de casilleros — algunos "bloqueados" (relleno sólido),
  // otros libres (solo borde), como un mini horario semanal.
  const filas: boolean[][] = [
    [true, false, true],
    [false, true, false],
    [true, false, false],
  ];
  return (
    <svg aria-hidden="true" viewBox="0 0 116 116" fill="none" stroke="currentColor" strokeWidth="2.5" className={className}>
      {filas.map((fila, i) =>
        fila.map((bloqueado, j) => (
          <rect
            key={`${i}-${j}`}
            x={j * 40 + 2}
            y={i * 40 + 2}
            width="32"
            height="20"
            rx="5"
            fill={bloqueado ? "currentColor" : "none"}
            fillOpacity={bloqueado ? 0.55 : 0}
          />
        )),
      )}
    </svg>
  );
}

export function IconoTilde({ className = "" }: IconoDecorativoProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" fill="none" stroke="currentColor" className={className}>
      <circle cx="50" cy="50" r="45" strokeWidth="3" />
      <path d="M30 52 L44 66 L74 34" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconoSello({ className = "" }: IconoDecorativoProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3" className={className}>
      <circle cx="50" cy="50" r="40" strokeDasharray="7 7" />
      <path d="M50 32v36M32 50h36" strokeLinecap="round" />
    </svg>
  );
}

// IconoEstadistica — barras de comparación (asistió vs ausente), para la
// tarjeta "Estadística".
export function IconoEstadistica({ className = "" }: IconoDecorativoProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={className}>
      <path d="M20 80V50" />
      <path d="M42 80V30" />
      <path d="M64 80V56" />
      <path d="M86 80V16" />
    </svg>
  );
}
