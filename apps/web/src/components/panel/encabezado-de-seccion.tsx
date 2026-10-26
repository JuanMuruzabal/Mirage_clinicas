import type { ReactNode } from "react";
import { CLASE_TITULO_DE_PANTALLA } from "../titulo-de-pantalla";

// ENCABEZADO DE SECCIÓN DEL PANEL: SOLO EL TÍTULO (pedido de la persona,
// ítem 8, 26/10: "no me convencen los dibujos de las tarjetas de los
// módulos, vamos a quitarlos completamente, solo quedará el título"). Se
// fueron la tarjeta de vidrio, el objeto de cada sección y el título en
// mayúsculas con el degradé prismático: queda el `h1` de los cinco módulos
// (`CLASE_TITULO_DE_PANTALLA`), en petróleo.
//
// En este orden, de arriba abajo:
//
//   1. El título: dónde estoy.
//   2. `antes`: de quién es lo que sigue (el selector de profesional de
//      recepción, QA de la 3.2.6). Debajo del título y no arriba como
//      cuando había tarjeta: primero el lugar, después el alcance. Va por
//      encima de los controles en el apilado (`z-20` contra `z-10`): su menú
//      se despliega sobre ellos.
//   3. Los controles (el calendario), en UNA tarjeta de vidrio transparente
//      (`.vidrio.encabezado-seccion`): `navegacion` (‹ Hoy ›), `children`
//      (la fecha que se mira y su resumen) y `opciones` (Día/Semana/Mes).
//
// Las acciones principales de una pantalla NO van acá: van debajo (el
// calendario, con "Reservar horario" y "+ Agregar turno").
//
// RECORRIDO (ítem 17, pendiente): el encabezado lleva `data-recorrido`.
// Cuando exista el recorrido explicativo, tocarlo lo abre; hoy no hace nada,
// a propósito.
//
// Sin "use client": se dibuja igual en una página de servidor que dentro del
// calendario (cliente).

export type SeccionDelPanel = "general" | "turnos" | "pacientes" | "documentos" | "calendario";

interface EncabezadoDeSeccionProps {
  seccion: SeccionDelPanel;
  titulo: string;
  antes?: ReactNode;
  /** ‹ Hoy ›: a la izquierda de la fila en la computadora. */
  navegacion?: ReactNode;
  /** Las opciones de la vista (Día/Semana/Mes): a la derecha. */
  opciones?: ReactNode;
  /** Lo que se está mirando (la fecha y su resumen), entre los dos. */
  children?: ReactNode;
}

/**
 * El contenedor de las pantallas con encabezado de sección (General, Turnos,
 * Pacientes, Documentos y Calendario): el relleno de siempre y UNA sola
 * distancia entre el encabezado y lo que sigue, y entre los bloques de abajo
 * (`gap-6`, la misma que separa las tarjetas de General). Correcciones
 * generales, ítem 3 (2026-10-11): cada pantalla tenía la suya (32, 24 o
 * 16 px). Un bloque que se pliega a cero no tiene que sumar un segundo
 * `gap`: ver el aviso de conflictos de Pacientes.
 */
export const CLASE_PANTALLA_CON_ENCABEZADO =
  "flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]";

export function EncabezadoDeSeccion({ seccion, titulo, antes, navegacion, opciones, children }: EncabezadoDeSeccionProps) {
  const conControles = Boolean(navegacion || opciones || children);
  return (
    <header data-seccion={seccion} data-recorrido={seccion} className="flex flex-col gap-3">
      <h1 className={CLASE_TITULO_DE_PANTALLA}>{titulo}</h1>
      {antes && <div className="relative z-20">{antes}</div>}
      {conControles && (
        <Controles navegacion={navegacion} opciones={opciones}>
          {children}
        </Controles>
      )}
    </header>
  );
}

// LA FILA DE CONTROLES, como la de Google Calendar (ítem 8, 26/10: "reacomodar
// la tarjeta transparente, dejando los botones bien acomodados").
//
//   - DESDE `@3xl` (container query: la tarjeta depende también del
//     sidebar), una sola fila: ‹ Hoy › a su ancho, la fecha en el resto y
//     las opciones a la derecha, con un ancho fijo. Con menos, la fecha
//     larga de Semana ("20 – 26 de octubre de 2026") no entra entre los dos.
//   - MÁS ANGOSTO, primero la fecha y debajo ‹ Hoy › con las opciones. Van
//     en la misma fila si entran; si no, se apilan y cada uno toma todo el
//     ancho (el celular). Desde `@md` (la tarjeta de 448 px, donde ya entran
//     juntos) ‹ Hoy › queda a su ancho a la izquierda y las opciones a la
//     derecha, hasta los mismos 16 rem de la computadora: estiradas a todo
//     lo que sobraba medían 510 px a 1024 (paso de diseño del ítem 8, 26/10;
//     HIG, Segmented controls: segmentos parejos, no una barra que llena la
//     fila).
//
// El orden del DOM es el de la lectura en el celular (la fecha antes que los
// botones); en la computadora la grilla los ubica por columna, y el orden de
// tabulación sigue siendo ‹ Hoy › y después las opciones.
function Controles({
  navegacion,
  opciones,
  children,
}: {
  navegacion?: ReactNode;
  opciones?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="vidrio encabezado-seccion relative z-10 @container">
      <div className="grid grid-cols-1 gap-3 p-4 @3xl:grid-cols-[auto_minmax(0,1fr)_auto] @3xl:items-center @3xl:gap-x-6 @3xl:px-4 @3xl:py-3">
        {children && <div className="min-w-0 @3xl:col-start-2 @3xl:row-start-1">{children}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 @3xl:contents">
          {navegacion && (
            <div className="flex-[1_1_auto] @md:flex-none @3xl:col-start-1 @3xl:row-start-1">{navegacion}</div>
          )}
          {opciones && (
            <div className="flex-[999_1_13rem] @md:max-w-64 @3xl:col-start-3 @3xl:row-start-1 @3xl:w-64">{opciones}</div>
          )}
        </div>
      </div>
    </div>
  );
}
