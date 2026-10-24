// Íconos del sidebar de gestión (correcciones generales, ítem 10, 2026-10-18:
// "íconos simples y personalizados, bien representativos").
//
//   - Grilla de 24 con línea redondeada (puntas y uniones redondas, esquinas
//     con un radio chico), como las escenas, Figtree y los controles de
//     10 px. El trazo de 1,8 se ve de 1,5 px a 20 px (`h-5 w-5`), parejo con
//     el texto del link. Todos ocupan la misma caja óptica, centrada en 12.
//   - Cada uno dibuja el objeto de la escena de su sección (`escenas.tsx`):
//     las barras de General, la notita del calendario, el ticket del turno,
//     la ficha del fichero y la hoja firmada.
//   - Una pieza "de acento" por ícono (`acento`): se rellena con
//     `currentColor` en la sección activa (el verde de marca del link) y se
//     insinúa al 30 % con el hover o el foco del link (`group`).
//   - Con el hover, un gesto chico de la escena, una vez y en menos de un
//     tercio de segundo (clases `ico-*`, en globals.css). Con "reducir
//     movimiento" no hay gesto; el relleno sí.
//
// Lo que se mueve va en un elemento SIN atributo `transform` (el `transform`
// del CSS pisa el del SVG): la inclinación de la notita va en un `<g>` de
// afuera. Y el gesto nunca va en la pieza de acento misma, sino en un `<g>`
// que la envuelve, para no pisar su transición del relleno.

type IconProps = { className?: string; activo?: boolean };

const commonProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

function acento(activo?: boolean): string {
  // `fill-opacity` aparte y no `fill-current/30`: Tailwind no genera la
  // variante con opacidad sobre `currentColor`, y el hover no mostraba nada.
  return activo
    ? "fill-current"
    : "fill-transparent transition-[fill] duration-200 group-hover:fill-current group-hover:[fill-opacity:0.3] group-focus-visible:fill-current group-focus-visible:[fill-opacity:0.3]";
}

// General — el gráfico de la escena: tres barras que suben sobre su base.
// El acento es la más alta; con el hover vuelven a crecer desde la base.
export function IconGeneral({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M2 19.5h20" />
      <path className="ico-barra" d="M3.25 19.5V15a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4.5" />
      <path className="ico-barra ico-barra-2" d="M10 19.5v-9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9" />
      <g className="ico-barra ico-barra-3">
        <path className={acento(activo)} d="M16.75 19.5v-14a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v14" />
      </g>
    </svg>
  );
}

// Calendario — la hoja del mes con sus anillos y una notita pegada encima,
// inclinada y con la esquina doblada (como los turnos del calendario). El
// acento es la notita; con el hover se inclina un poco más.
export function IconCalendario({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      {/* La hoja se corta donde pasa por debajo de la notita. */}
      <path d="M19.5 9V6.5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h5.5" />
      <path d="M3 9h16.5M7.5 2.75v3.5M15 2.75v3.5" />
      <path d="M6.5 13h0M9.5 13h0M6.5 16.5h0" />
      <g transform="translate(16.5 16.5) rotate(-8)">
        <g className="ico-notita">
          <path className={acento(activo)} d="M-2.75-3.75h5.5a1 1 0 0 1 1 1V.75l-3 3h-3.5a1 1 0 0 1-1-1v-5.5a1 1 0 0 1 1-1z" />
          {/* El doblez: en marfil sobre la notita llena, para que se siga viendo. */}
          <path className={activo ? "stroke-marfil" : undefined} d="M3.75.75h-2a1 1 0 0 0-1 1v2" />
        </g>
      </g>
    </svg>
  );
}

// Turnos — el ticket del turno, con las muescas del troquel y la hora en el
// reloj. El acento es el talón; con el hover se separa, como al cortarlo.
export function IconTurnos({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <g className="ico-talon">
        <path className={acento(activo)} d="M8 6.5A1.5 1.5 0 0 1 6.5 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2.5A1.5 1.5 0 0 1 8 17.5" />
      </g>
      <path d="M8 6.5A1.5 1.5 0 0 0 9.5 5H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9.5A1.5 1.5 0 0 0 8 17.5" />
      <path d="M8 10h0M8 14h0" />
      <circle cx="15" cy="12" r="4" />
      <path d="M15 9.75V12h1.75" />
    </svg>
  );
}

// Pacientes — la ficha del fichero, con su pestaña, y otra asomando detrás;
// en la de adelante, la persona y un renglón. El acento es la cabeza; con el
// hover la ficha de adelante sube, como la que se saca del fichero.
export function IconPacientes({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M11.5 4h9A1.5 1.5 0 0 1 22 5.5v9a1.5 1.5 0 0 1-1.5 1.5" />
      <g className="ico-ficha">
        <path d="M2 9.5A1.5 1.5 0 0 1 3.5 8H4V6a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1v2h8A1.5 1.5 0 0 1 18 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 18.5z" />
        <circle className={acento(activo)} cx="6.75" cy="12.6" r="1.6" />
        <path d="M3.75 20v-.5a3 3 0 0 1 6 0v.5M12 13.5h3.5" />
      </g>
    </svg>
  );
}

// Documentos — la hoja con la esquina doblada, dos renglones y la firma,
// un garabato de un solo trazo. El acento es la esquina; con el hover la
// firma se vuelve a escribir.
export function IconDocumentos({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M14.5 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path className={acento(activo)} d="M14.5 2.5v4A1.5 1.5 0 0 0 16 8h4z" />
      <path d="M7.5 9.5h4M7.5 12.5h7" />
      <path
        className="ico-trazo"
        pathLength={1}
        d="M7.5 18.25c.9-1.9 1.9-3.2 2.4-2.6.5.6-.9 2.6-.2 2.8.6.2 1.4-1.8 2.1-1.6.6.2.1 1.4.7 1.5.6.1 1.3-.7 2.4-.7"
      />
    </svg>
  );
}

// Tu página — la ventana del navegador con la portada de la página pública
// (el acento) y un renglón, que con el hover se vuelve a escribir.
export function IconPagina({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <rect x="2.5" y="4" width="19" height="16" rx="2" />
      <path d="M2.5 8h19M5.5 6h0M8 6h0" />
      <rect className={acento(activo)} x="5.5" y="10.75" width="13" height="4" rx="1" />
      <path className="ico-trazo" pathLength={1} d="M5.5 17.25h7" />
    </svg>
  );
}

// Seguridad — el escudo con la cerradura; el acento es el ojo de la llave.
// Sin gesto: no hay uno que sea de esta sección.
export function IconSeguridad({ className, activo }: IconProps) {
  return (
    <svg {...commonProps} className={className}>
      <path d="M12 2.5 19.25 5.25V11c0 4.6-3.1 8.25-7.25 9.9-4.15-1.65-7.25-5.3-7.25-9.9V5.25z" />
      <circle className={acento(activo)} cx="12" cy="10.25" r="1.75" />
      <path d="M12 12v3" />
    </svg>
  );
}
