import Link from "next/link";
import type { ReactNode } from "react";
import { EscenaDeServicio, type DibujoDeTarjeta } from "./panel/escenas";
import { EscenasAnimadas } from "./panel/tarjeta-con-escenas";

// LA TARJETA CON DIBUJO: el armado común de las tarjetas de
// /seleccionar-servicio (`NavCard`) y de /clinicas (las clínicas, las
// invitaciones y "Crear mi clínica"). Pedido de la persona (2026-10-19): "la
// misma clase de diseño debe tener las mismas decisiones de diseño". Vive en
// un solo lugar para que las dos pantallas no diverjan.
//
// Es de VIDRIO como los encabezados de sección del panel
// (`.vidrio.encabezado-seccion`: el canto esmerilado y las esquinas de
// 14 px) y, como las tarjetas de General, parte vidrio y parte blanco: el
// contenido va en la carátula (`.vidrio-capa`, la segunda capa, más clara,
// con `--vidrio-margen` alrededor) y la escena queda sobre el vidrio. Para la
// curva concéntrica de la carátula, la tarjeta redefine `--radius-vidrio`
// (como `.vidrio-tabla`): 14 − 6 = 8 px.
//
//   - `disposicion="fila"` (la de servicios y la de "Mi clínica"): desde
//     `md`, la carátula a la izquierda y la escena a su lado; en el celular,
//     la carátula arriba y la escena en una franja debajo.
//   - `disposicion="columna"` (las de la grilla de "Otras clínicas", a dos
//     columnas): siempre la carátula arriba y la franja abajo.
//   - `blanca` ("Otras clínicas", ítem 15): la tarjeta es blanca y opaca,
//     sin vidrio ni carátula, con su dibujo en la franja.
//
// LA ESCENA es una de la paleta común (`EscenaDeServicio`, escenas.tsx),
// contra el borde derecho y con la mesa saliendo por él; nunca va detrás del
// texto. Sus colores van cambiando cada tanto, como en los encabezados
// (`EscenasAnimadas`), y recorren el arco dos veces (`vueltas`). Al pasar el
// mouse se corre apenas; con "reducir movimiento", ni eso.
//
// Con `href`, toda la tarjeta es el enlace; con `onClick`, un botón; sin
// ninguno de los dos, un <article> con sus propios botones adentro.

/** El título de la tarjeta, en petróleo. */
export const CLASE_TITULO_DE_TARJETA =
  "font-[family-name:var(--font-display)] text-2xl leading-tight font-semibold tracking-tight text-marca [overflow-wrap:anywhere]";
/** La descripción, en grafito. */
export const CLASE_DESCRIPCION_DE_TARJETA = "text-[15px] text-grafito";
/** El rótulo de arriba del título (el rol, el estado). */
export const CLASE_ANTETITULO_DE_TARJETA =
  "font-[family-name:var(--font-mono)] tabular-nums text-xs uppercase tracking-widest text-grafito/75";

const BOTON_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-marca bg-marfil px-5 text-sm font-semibold text-marca transition-colors";
/** El botón secundario delineado de la app, a 44 px y sin flecha. */
export const CLASE_BOTON_DE_TARJETA = `${BOTON_BASE} hover:bg-velo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-marfil`;
/** El mismo botón, dibujado en un <span> cuando la tarjeta entera es el
 *  enlace o el botón: se aclara con el hover de toda la tarjeta. */
export const CLASE_BOTON_DE_TARJETA_ENLAZADA = `${BOTON_BASE} group-hover:bg-velo`;

interface TarjetaConDibujoProps {
  /** Toda la tarjeta lleva acá. */
  href?: string;
  /** Toda la tarjeta es un botón. */
  onClick?: () => void;
  dibujo?: DibujoDeTarjeta;
  disposicion?: "fila" | "columna";
  blanca?: boolean;
  /** Lo que va en la carátula: el título, la descripción y el botón. */
  children: ReactNode;
}

export function TarjetaConDibujo({ href, onClick, dibujo, disposicion = "fila", blanca = false, children }: TarjetaConDibujoProps) {
  const fila = disposicion === "fila";
  const interactiva = Boolean(href || onClick);
  const clase = [
    "group flex h-full w-full flex-col overflow-hidden text-left",
    blanca
      ? "rounded-[var(--radius-encabezado)] border border-linea bg-marfil shadow-soft"
      : "vidrio encabezado-seccion [--radius-vidrio:var(--radius-encabezado)]",
    interactiva
      ? `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca ${blanca ? "transition-colors hover:bg-velo" : "vidrio-enlace"}`
      : "",
    fila ? "md:min-h-40 md:flex-row" : "",
  ].join(" ");

  const caratula = (
    <div
      className={`flex flex-1 flex-col px-5 py-4.5 ${blanca ? "" : "vidrio-capa"} ${
        fila ? "md:w-[28rem] md:flex-none md:shrink-0 md:px-6 md:py-5" : "sm:px-6 sm:py-5"
      }`}
    >
      <div className="despliegue-cuerpo flex flex-1 flex-col gap-1.5">{children}</div>
    </div>
  );

  const escena = dibujo && (
    <div aria-hidden="true" className={`relative h-20 shrink-0 min-w-0 overflow-hidden ${fila ? "md:h-auto md:flex-1" : "sm:h-24"}`}>
      <EscenasAnimadas
        className={`despliegue-dibujo pointer-events-none absolute right-0 bottom-0 h-20 transition-transform duration-500 ease-out motion-safe:group-hover:-translate-x-1.5 ${
          fila ? "lg:h-36" : "sm:h-24"
        }`}
      >
        <EscenaDeServicio servicio={dibujo} className="aspect-[7/3] h-full" />
      </EscenasAnimadas>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={clase}>
        {caratula}
        {escena}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={clase}>
        {caratula}
        {escena}
      </button>
    );
  }
  return (
    <article className={clase}>
      {caratula}
      {escena}
    </article>
  );
}
