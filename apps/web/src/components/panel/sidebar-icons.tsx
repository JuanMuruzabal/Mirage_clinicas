// Íconos de la sidebar de gestión — segunda versión (2026-09-26, pedido del
// cliente: "cambiar los íconos del sidebar, son demasiado genéricos; si es
// necesario diseñe unos personalizados").
//
// La primera versión eran los de cualquier tablero (cuatro rectángulos,
// una bandeja de entrada, dos personas). Estos son un juego propio:
//
//   - el mismo trazo en todos, con esquinas duras como la marca de
//     cuadrante de PRISMA (spec §9.7), para que se lean como una familia;
//   - cada uno dice algo del consultorio: el turno es un NÚMERO con talón
//     (como el que se saca en la recepción), el paciente es su FICHA, la
//     página es una ventana con su portada;
//   - una pieza "de acento" por ícono —un cuadrado, la cabeza de la ficha,
//     la portada— que se RELLENA en la sección activa y se insinúa al
//     pasar el mouse. Es la misma idea que los cuadrantes llenos de la
//     marca: lleno = acá estás.
//
// El acento responde al `group` del link que lo contiene (`group-hover`).

type IconProps = { className?: string; activo?: boolean };

const commonProps = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  "aria-hidden": true as const,
};

function acento(activo?: boolean): string {
  // `fill-opacity` aparte y no `fill-current/30`: Tailwind no genera la
  // variante con opacidad sobre `currentColor`, y el hover no mostraba nada.
  return activo
    ? "fill-current"
    : "fill-transparent transition-[fill] duration-200 group-hover:fill-current group-hover:[fill-opacity:0.3]";
}

// General — el tablero: tres bloques, como las tarjetas de la pantalla;
// el primero (el acento) es el de hoy.
export function IconGeneral({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <rect className={acento(activo)} x="2.75" y="2.75" width="6" height="6" />
      <rect x="11.25" y="2.75" width="6" height="6" />
      <rect x="2.75" y="11.25" width="14.5" height="6" />
    </svg>
  );
}

// Calendario — la hoja del mes con sus anillos y UN día marcado: el turno.
export function IconCalendario({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <rect x="2.75" y="4" width="14.5" height="13.25" />
      <path d="M2.75 8h14.5M6.5 2.5v3M13.5 2.5v3" />
      <path d="M5.5 11h1M8.5 11h1M5.5 14h1" />
      <rect className={acento(activo)} x="11" y="10.5" width="3.5" height="3.5" />
    </svg>
  );
}

// Turnos — el número que se saca en la recepción: un ticket con las
// muescas del troquel arriba y abajo, el talón separado por la línea
// punteada, y el número (el acento).
export function IconTurnos({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M2.75 4.75H5.5a1.5 1.5 0 0 0 3 0h8.75v10.5H8.5a1.5 1.5 0 0 0-3 0H2.75z" />
      <path d="M7 8.5v.5M7 11v.5" />
      <rect className={acento(activo)} x="10.75" y="8" width="4" height="4" />
    </svg>
  );
}

// Documentos — la hoja con la esquina doblada, dos renglones y la firma
// abajo (el acento): lo que se completa y se firma (Fase 5.1).
export function IconDocumentos({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M4.25 2.75h8l3.5 3.5v11H4.25z" />
      <path d="M12.25 2.75v3.5h3.5" />
      <path d="M6.75 8.5h5M6.75 11h6.5" />
      <rect className={acento(activo)} x="6.75" y="13.5" width="6.5" height="1.75" />
    </svg>
  );
}

// Pacientes — la ficha: foto (la cabeza es el acento), hombros y dos
// renglones de datos.
export function IconPacientes({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <rect x="2.75" y="3.5" width="14.5" height="13" />
      <circle className={acento(activo)} cx="7.25" cy="8.25" r="1.9" />
      <path d="M4.5 14c.35-1.7 1.4-2.6 2.75-2.6S9.65 12.3 10 14" strokeLinecap="round" />
      <path d="M12 7.5h3.25M12 10.5h2.25" />
    </svg>
  );
}

// Tu página — la ventana del navegador con la PORTADA de la página
// pública (el acento) y un renglón de texto.
export function IconPagina({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <rect x="2.75" y="3" width="14.5" height="14" />
      <path d="M2.75 6.5h14.5" />
      <path d="M4.75 4.75h.5M6.75 4.75h.5" />
      <rect className={acento(activo)} x="5" y="8.75" width="10" height="3.75" />
      <path d="M5 14.75h6" />
    </svg>
  );
}

// Tu perfil — una sola persona. No está en el sidebar desde 2026-09-19 (vive
// en el menú del header), pero queda para quien lo necesite.
export function IconPerfil({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <circle className={acento(activo)} cx="10" cy="6.75" r="3" />
      <path d="M3.5 17c.6-3.3 3.2-5.25 6.5-5.25s5.9 1.95 6.5 5.25" strokeLinecap="round" />
    </svg>
  );
}

// Seguridad — el escudo con una cerradura (el acento es el ojo de la
// llave): lo que el sistema bloqueó para cuidar el formulario.
export function IconSeguridad({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M10 2.5 16.5 5v5c0 4-2.8 7-6.5 8-3.7-1-6.5-4-6.5-8V5z" />
      <circle className={acento(activo)} cx="10" cy="8.75" r="1.6" />
      <path d="M10 10.5v2.75" />
    </svg>
  );
}
