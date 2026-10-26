import Link from "next/link";
import type { ReactNode } from "react";
import { EscenaDeServicio, type DibujoDeTarjeta } from "./panel/escenas";

// LA TARJETA CON DIBUJO: el armado común de las tarjetas de
// /seleccionar-servicio (`NavCard`) y de /clinicas (las clínicas, las
// invitaciones y "Crear mi clínica"). Pedido de la persona (2026-10-19): "la
// misma clase de diseño debe tener las mismas decisiones de diseño". Vive en
// un solo lugar para que las dos pantallas no diverjan.
//
// Es del vidrio más transparente de la app (`.vidrio.encabezado-seccion`:
// el canto esmerilado y las esquinas a 14 px, que la carátula sigue a 8) y,
// como las tarjetas de General, parte vidrio y parte blanco: el contenido va
// en la carátula (`.vidrio-capa`, la segunda capa, más clara, con
// `--vidrio-margen` alrededor) y la escena queda sobre el vidrio.
//
// Todas van en fila (desde el ítem 8, 2026-10-25, también las de "Otras
// clínicas", que eran blancas y en columna): desde `md`, la carátula a la
// izquierda y la escena a su lado; en el celular, la carátula arriba y la
// escena en una franja debajo.
//
// LA ESCENA es UN objeto (`EscenaDeServicio`, escenas.tsx), y desde el ítem 8
// (26/10, pedido de la persona: "con un foco más agrandado y con opacidad,
// similar a como hicimos en mobile, porque ahora están como colgados muy al
// medio") va AGRANDADO y APOYADO EN LA ESQUINA DE ABAJO A LA DERECHA (paso de
// diseño del ítem 8, 26/10): la caja va contra el borde derecho y el de abajo
// (`right-0 bottom-0`; en el celular, 20 px más abajo de la franja) y cada
// objeto sale de la tarjeta 12 px por la derecha y unos 20 por abajo (eso lo
// fija su `viewBox`, en escenas.tsx), con lo que lo identifica a la vista.
// Apoyado ARRIBA, en una tarjeta más alta que el objeto quedaba flotando con
// aire abajo ("colgado") y el recorte cambiaba de una tarjeta a otra (de 9 a
// 51 px); apoyado abajo, todos se cortan igual y el alto de la tarjeta solo
// cambia cuánto aire queda arriba. Se funde hacia la carátula por el lado
// izquierdo de su caja (`mask-image`) y va tenue (0,55, en el lienzo y no en
// el envoltorio, que anima su propia `opacity` al entrar). La escala es fija
// (224 px de caja en la computadora, la mitad en el celular), así ninguno
// crece con el texto de su tarjeta; el ancho de la caja también (`w-80`): al
// 85 % de la columna, a 768 px los objetos se achicaban a lo que entraba y
// quedaban enteros, sin recorte. Nunca se mete debajo de la carátula: la
// columna que lo recorta termina donde ella empieza. Quieto también al pasar
// el mouse (paso de diseño del ítem 8, 26/10): el hover lo marcan el velo de
// la tarjeta y el del botón, como en el resto de la app.
//
// Con `href`, toda la tarjeta es el enlace; con `onClick`, un botón; sin
// ninguno de los dos, un <article> con sus propios botones adentro.

/** El título de la tarjeta, en petróleo. A 20 px (paso de diseño del ítem 8,
 *  26/10; eran 24): un paso por debajo de los títulos de sección de
 *  /clinicas (24) y dos por debajo del h1 de la pantalla (30/36). */
export const CLASE_TITULO_DE_TARJETA =
  "font-[family-name:var(--font-display)] text-xl leading-tight font-semibold tracking-tight text-marca [overflow-wrap:anywhere]";
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
  /** Lo que va en la carátula: el título, la descripción y el botón. */
  children: ReactNode;
}

export function TarjetaConDibujo({ href, onClick, dibujo, children }: TarjetaConDibujoProps) {
  const interactiva = Boolean(href || onClick);
  const clase = [
    "group vidrio encabezado-seccion flex h-full w-full flex-col overflow-hidden text-left md:min-h-40 md:flex-row",
    interactiva ? "vidrio-enlace focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" : "",
  ].join(" ");

  const caratula = (
    <div className="vidrio-capa flex flex-1 flex-col px-5 py-4.5 md:w-[28rem] md:flex-none md:shrink-0 md:px-6 md:py-5">
      <div className="despliegue-cuerpo flex flex-1 flex-col gap-1.5">{children}</div>
    </div>
  );

  const escena = dibujo && (
    <div
      aria-hidden="true"
      className="relative h-20 min-w-0 shrink-0 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_45%)] md:h-auto md:flex-1 md:[mask-image:linear-gradient(to_right,transparent,black_40%)]"
    >
      <div className="despliegue-dibujo pointer-events-none absolute right-0 -bottom-5 h-28 w-[70%] md:bottom-0 md:h-56 md:w-80">
        <EscenaDeServicio servicio={dibujo} className="h-full w-full opacity-55" />
      </div>
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
