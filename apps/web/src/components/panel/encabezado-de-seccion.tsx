import type { ReactNode } from "react";
import { EscenaCalendario, EscenaDeSeccion, type SeccionDelPanel } from "./escenas";
import { TarjetaConEscenas } from "./tarjeta-con-escenas";

// ENCABEZADO DE SECCIÓN DEL PANEL (correcciones generales, ítem 2). Una
// tarjeta de VIDRIO (`.vidrio` con `.encabezado-seccion`: el vidrio de las
// tablas y de General, con el canto esmerilado y las esquinas de 14 px), con
// el título en mayúsculas y en el degradé prismático (`.titulo-prismatico`),
// y adentro la escena ilustrada de la sección (`escenas.tsx`), que ocupa la
// mayor parte. Del rediseño del 18/10 quedaron el vidrio y el título; la
// composición y los dibujos son los de antes (decisión del 19/10).
//
// Dos composiciones:
//
//   - SECCIONES (General, Turnos, Pacientes, Documentos): baja (a pedido de
//     la persona, para que el contenido suba), con el título en una columna
//     al centro y una viñeta a cada lado. La columna del título es propia,
//     así la escena nunca pasa por debajo de las letras. La viñeta derecha
//     llega hasta el borde, a la derecha y abajo: la mesa y la manga de la
//     mano salen por el canto de la tarjeta. Cuando la tarjeta es angosta
//     (container query, no el ancho de la ventana: la tarjeta depende también
//     del sidebar), el título va a la izquierda y la viñeta derecha, chica, a
//     su lado: la tarjeta queda como una franja baja y no como un bloque
//     (pedido de la persona, 19/10: "no dejan de ser un título", no pueden
//     ser más grandes que lo que importa de la pantalla).
//   - CON CONTROLES (el calendario): conserva su alto. Todo a la izquierda,
//     en este orden: el título, `debajo` (‹ Hoy ›) y `children` (el día, el
//     resumen y Día/Semana/Mes); la escena ocupa el resto, a la derecha.
//     Angosta, la escena va arriba de todo como una franja, enfocada en la
//     mano que clava la notita, y los controles debajo, con aire.
//
// `antes`: lo que dice DE QUIÉN es lo que sigue (el selector de profesional
// de recepción, QA de la 3.2.6). Va ARRIBA de la tarjeta, afuera y a su
// mismo ancho (correcciones generales, 2026-10-11, pedido de la persona), y
// por encima de ella en el apilado (`z-20` contra el `z-10` de la tarjeta):
// su menú se despliega sobre la tarjeta.
//
// Las acciones principales de una pantalla NO van acá: van debajo de la
// tarjeta (el calendario, con "Reservar horario" y "+ Agregar turno").
//
// RECORRIDO (ítem 17, pendiente): la tarjeta lleva `data-recorrido`. Cuando
// exista el recorrido explicativo, tocarla lo abre; hoy no hace nada, a
// propósito.
//
// Sin "use client": se dibuja igual en una página de servidor que dentro del
// calendario (cliente). La tarjeta es `TarjetaConEscenas` (cliente), que
// decide cuándo se mueve cada escena: una acción corta y un descanso largo.
// Nada se esconde hasta hidratar (TR-180).

interface EncabezadoDeSeccionProps {
  seccion: SeccionDelPanel;
  titulo: string;
  antes?: ReactNode;
  /** La fila que sigue al título (con controles). */
  debajo?: ReactNode;
  /** El resto de los controles. Con esto, la composición es "con controles". */
  children?: ReactNode;
}

/**
 * El contenedor de las pantallas con encabezado de sección (General, Turnos,
 * Pacientes, Documentos y Calendario): el relleno de siempre y UNA sola
 * distancia entre la tarjeta del encabezado y lo que sigue, y entre los
 * bloques de abajo (`gap-6`, la misma que separa las tarjetas de General).
 * Correcciones generales, ítem 3 (2026-10-11): cada pantalla tenía la suya
 * (32, 24 o 16 px). Un bloque que se pliega a cero no tiene que sumar un
 * segundo `gap`: ver el aviso de conflictos de Pacientes.
 */
export const CLASE_PANTALLA_CON_ENCABEZADO =
  "flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]";

// El título: un `h1` de texto en mayúsculas (`uppercase`: el texto y su
// nombre accesible siguen como están), con el espaciado que piden las
// mayúsculas. Nunca baja de 24 px. El degradé (`.titulo-prismatico`,
// globals.css: el apagado de los dibujos, que no llega a 3:1, elegido así
// por la persona) va en un `<span>` en línea: así se estira a lo largo del texto y
// no de la caja, y en dos renglones sigue de uno al otro. El tamaño lo pone
// cada composición.
const CLASE_TITULO =
  "font-[family-name:var(--font-display)] leading-[1.1] font-semibold uppercase";

function Titulo({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <h1 className={`${CLASE_TITULO} ${className}`}>
      <span className="titulo-prismatico">{texto}</span>
    </h1>
  );
}

export function EncabezadoDeSeccion({ seccion, titulo, antes, debajo, children }: EncabezadoDeSeccionProps) {
  const tarjeta = (
    <TarjetaConEscenas
      data-seccion={seccion}
      data-recorrido={seccion}
      className="vidrio encabezado-seccion relative z-10"
    >
      {seccion === "calendario" || children ? (
        <ConControles titulo={titulo} debajo={debajo}>
          {children}
        </ConControles>
      ) : (
        <Centrado seccion={seccion} titulo={titulo} />
      )}
    </TarjetaConEscenas>
  );
  if (!antes) return tarjeta;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative z-20">{antes}</div>
      {tarjeta}
    </div>
  );
}

function Centrado({ seccion, titulo }: { seccion: Exclude<SeccionDelPanel, "calendario">; titulo: string }) {
  // La esquina se recorta con el radio de adentro de la tarjeta, así la mesa
  // no se sale por la curva. Angosta, dos columnas: el título y la viñeta
  // derecha a 40 px de alto (con su proporción, 380 × 120); el título a 24
  // px, que entra al lado ("DOCUMENTOS CLÍNICOS" en dos renglones) y sigue
  // siendo texto grande. Ancha, una grilla 1fr · auto · 1fr con el título
  // en el medio, centrado en la tarjeta, y una viñeta a 64 px contra cada
  // borde. Las dos viñetas de una sección miden lo mismo y llevan el mismo
  // aire hacia su borde (`RECORTE` en escenas.tsx), así la distancia de cada
  // una al título sale igual sola, con el sidebar abierto, retraído u oculto.
  // Las dos mesas salen por su borde: las dos esquinas de abajo se recortan.
  return (
    <div className="@container">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 pt-1.5 @4xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @4xl:gap-6 @4xl:pt-2">
        <Titulo
          texto={titulo}
          className="self-center py-2 pl-4 text-2xl tracking-wide text-balance @4xl:order-2 @4xl:tracking-wider @4xl:px-2 @4xl:py-0 @4xl:text-center @4xl:text-3xl"
        />
        <div aria-hidden="true" className="hidden overflow-hidden rounded-bl-[calc(var(--radius-encabezado)-1px)] @4xl:order-1 @4xl:block @4xl:justify-self-start">
          <EscenaDeSeccion seccion={seccion} encuadre="izquierda" className="h-16" />
        </div>
        <div aria-hidden="true" className="hidden overflow-hidden rounded-br-[calc(var(--radius-encabezado)-1px)] @4xl:order-3 @4xl:block @4xl:justify-self-end">
          <EscenaDeSeccion seccion={seccion} encuadre="derecha" className="h-16" />
        </div>
        <div aria-hidden="true" className="aspect-[19/6] h-10 overflow-hidden rounded-br-[calc(var(--radius-encabezado)-1px)] @4xl:hidden">
          <EscenaDeSeccion seccion={seccion} encuadre="angosto" className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}

function ConControles({ titulo, debajo, children }: { titulo: string; debajo?: ReactNode; children?: ReactNode }) {
  return (
    <div className="@container">
      {/* Angosta: la escena arriba, pegada al borde (arriba y a los
          costados, con el radio de adentro de la tarjeta). */}
      <div aria-hidden="true" className="h-[min(10rem,39cqw)] overflow-hidden rounded-t-[calc(var(--radius-encabezado)-1px)] @3xl:hidden">
        <EscenaCalendario angosto className="h-full w-full" />
      </div>
      {/* En la computadora, sin relleno a la derecha: el dibujo llega hasta el
          borde y la manga de la mano sale por el canto de la tarjeta. */}
      <div className="grid grid-cols-1 gap-4 px-5 pt-4 pb-5 @3xl:grid-cols-[auto_minmax(0,1fr)] @3xl:gap-x-8 @3xl:gap-y-3 @3xl:py-5 @3xl:pr-0 @3xl:pl-7">
        <div className="flex min-h-11 items-center @3xl:col-start-1 @3xl:row-start-1">
          <Titulo texto={titulo} className="text-3xl tracking-wider max-md:text-[clamp(1.5rem,7vw,1.875rem)]" />
        </div>
        {debajo && <div className="flex items-center @3xl:col-start-1 @3xl:row-start-2">{debajo}</div>}
        <div className="flex flex-col gap-4 @3xl:col-start-1 @3xl:row-start-3 @3xl:min-w-[19rem] @3xl:gap-3">{children}</div>
        <div aria-hidden="true" className="hidden min-h-0 min-w-0 @3xl:col-start-2 @3xl:row-span-3 @3xl:row-start-1 @3xl:block">
          <EscenaCalendario className="h-full min-h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
