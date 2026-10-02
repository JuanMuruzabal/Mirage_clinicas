"use client";

import { useRef, useState, type PointerEvent } from "react";
import type { Plantilla } from "@dental-mirage/documentos-clinicos";
import { CLASE_TACTIL } from "@/components/editor-pagina/estilos";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { esMuestra, type ModeloDeMuestra } from "@/lib/documentos-de-muestra";
import { paginasDelOriginal } from "@/lib/documentos-originales";
import { CalcoEnVivo } from "./calco";
import { HojaDeMuestra } from "./hoja-de-muestra";
import { OriginalDelColegio } from "./original-del-colegio";

// PilaDeModelos — los modelos del Colegio apilados (pedido del cliente,
// 2026-09-29):
// - adelante, el documento elegido;
// - detrás, más apagados y asomando a los costados, el anterior (a la
//   izquierda) y el siguiente (a la derecha), en el orden de las flechas.
//
// La hoja de adelante se mueve como una carta de Balatro (la referencia
// del cliente):
// - con el mouse encima se levanta y se inclina hacia él, con la sombra
//   del lado contrario;
// - al llegar al frente rebota antes de asentarse.
// Quieta el resto del tiempo: el vaivén que la movía sola se sacó a pedido
// del cliente (2026-10-02).
//
// Muestra UNA página por vez (2026-10-02): un modelo de varias páginas
// (sedoanalgesia tiene cuatro) era una hoja altísima. Arriba, un control
// para pasar de página; al cambiar de documento vuelve a la 1. La pantalla
// completa del celular sigue mostrando todas, una debajo de la otra.
//
// Al cambiar, las hojas se barajan: la de adelante va a su lugar en la pila
// y la nueva viene al frente desde el suyo, así se ve de dónde viene cada una.
//
// Las hojas de atrás son decoración (`aria-hidden`, sin texto alternativo):
// el documento elegido lo nombra el carrusel, y la hoja de adelante lleva
// su propia descripción. Con un solo documento no hay pila (y mientras
// falten modelos, la completan las hojas de muestra).
//
// Todo el movimiento es CSS (`.pila-*` en globals.css). Con "reducir
// movimiento" las hojas cambian con un fundido y la de adelante no se
// inclina (mismo criterio que TR-180: un fundido no es movimiento).

type Modelo = Plantilla | ModeloDeMuestra;

/** De dónde viene la hoja que entra, o adónde va la que sale. "lejos" es
 *  un salto con el menú a un documento que no estaba asomando. */
type Lado = "izquierda" | "derecha" | "lejos";

interface Vecinos {
  anterior?: Modelo;
  siguiente?: Modelo;
}

interface Cambio {
  saliente: Modelo;
  /** La página que se estaba viendo de la que se va. */
  paginaSaliente: number;
  entraDesde: Lado;
  saleHacia: Lado;
  /** Cambia en cada cambio: un click rápido reinicia la animación. */
  vez: number;
}

// Las flechas son una rueda, así que con dos documentos el anterior y el
// siguiente son el mismo: asoma una sola hoja, a la derecha.
function vecinosDe(enOrden: Modelo[], id: string): Vecinos {
  const n = enOrden.length;
  const i = Math.max(0, enOrden.findIndex((p) => p.id === id));
  return {
    anterior: n > 2 ? enOrden[(i - 1 + n) % n] : undefined,
    siguiente: n > 1 ? enOrden[(i + 1) % n] : undefined,
  };
}

function ladoDe(id: string, vecinos: Vecinos): Lado {
  if (vecinos.siguiente?.id === id) return "derecha";
  if (vecinos.anterior?.id === id) return "izquierda";
  return "lejos";
}

// Una página de un modelo (la primera, para las hojas de atrás). Sin
// original renderizado, una hoja en blanco del mismo tamaño: de atrás solo
// se ven los bordes.
//
// `llenar` — la hoja toma el tamaño de su caja en vez del de su propia
// página: las hojas de atrás tienen el tamaño de la de ADELANTE, no el
// suyo (2026-10-02). Los modelos vienen en dos papeles —carta, 8,5 × 11, y
// A4, más alto—, y con el suyo cada hoja de atrás medía según su modelo:
// detrás de una carta asomaba una A4 más larga de un lado y una carta del
// otro. La imagen se recorta (`object-cover`, centrada arriba) en vez de
// estirarse: de atrás solo se ven los bordes.
function PaginaDeAtras({ modelo, numero = 1, llenar = false }: { modelo: Modelo; numero?: number; llenar?: boolean }) {
  if (esMuestra(modelo)) return <HojaDeMuestra modelo={modelo} decorativa llenar={llenar} />;
  const paginas = paginasDelOriginal(modelo.id, modelo.version);
  const pagina = paginas[Math.min(Math.max(numero, 1), paginas.length) - 1];
  if (!pagina) {
    return <div className={`${llenar ? "h-full" : "aspect-[8.5/11]"} w-full rounded-[4px] border border-linea bg-white shadow-soft`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pagina.src}
      srcSet={pagina.srcSet}
      sizes="(min-width: 1280px) 40vw, 75vw"
      width={pagina.ancho}
      height={pagina.alto}
      alt=""
      loading="lazy"
      className={`${llenar ? "h-full object-cover object-top" : "h-auto"} w-full rounded-[4px] border border-linea bg-white shadow-soft`}
    />
  );
}

// La hoja que se va: lo que se estaba viendo, tal cual (la misma página, o
// el calco si no hay original), para que el cambio no salte.
function HojaQueSale({ modelo, pagina, hoy }: { modelo: Modelo; pagina: number; hoy: string }) {
  if (!esMuestra(modelo) && paginasDelOriginal(modelo.id, modelo.version).length === 0) {
    return <CalcoEnVivo plantilla={modelo} valores={{}} hoy={hoy} />;
  }
  return <PaginaDeAtras modelo={modelo} numero={pagina} />;
}

/** Cuántas páginas se pueden recorrer en la hoja de adelante: las del
 *  original. Sin original, el calco se ve entero y no hay nada que pasar. */
function paginasDelModelo(modelo: Modelo): number {
  if (esMuestra(modelo)) return 1;
  return Math.max(1, paginasDelOriginal(modelo.id, modelo.version).length);
}

/** Lo que se ve del documento elegido: en la pila, solo la página `pagina`;
 *  a pantalla completa (sin `pagina`), todas. */
export function HojaDelModelo({ modelo, hoy, pagina }: { modelo: Modelo; hoy: string; pagina?: number }) {
  if (esMuestra(modelo)) return <HojaDeMuestra modelo={modelo} />;
  return <OriginalDelColegio plantilla={modelo} hoy={hoy} pagina={pagina} />;
}

// El control para pasar de página, arriba de la hoja: mismo dibujo que el
// carrusel de documentos (marfil, borde de línea, flechas apagadas en los
// extremos).
function PasarPagina({ pagina, total, onCambiar }: { pagina: number; total: number; onCambiar: (n: number) => void }) {
  const flecha = `flex min-h-10 min-w-10 items-center justify-center px-2 text-grafito/70 transition-colors hover:bg-hueso hover:text-grafito disabled:opacity-40 disabled:hover:bg-transparent ${CLASE_TACTIL}`;
  return (
    <div className="mb-3 flex justify-center">
      <div role="group" aria-label="Páginas del modelo" className="flex items-stretch overflow-hidden rounded-card border border-linea bg-marfil shadow-soft">
        <button type="button" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)} className={flecha}>
          <IconChevronLeft className="h-5 w-5" />
        </button>
        <p aria-live="polite" className="flex items-center border-x border-linea px-4 text-[13px] font-medium text-grafito tabular-nums">
          Página {pagina} de {total}
        </p>
        <button type="button" aria-label="Página siguiente" disabled={pagina >= total} onClick={() => onCambiar(pagina + 1)} className={flecha}>
          <IconChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function PilaDeModelos({ enOrden, elegida, hoy }: { enOrden: Modelo[]; elegida: Modelo; hoy: string }) {
  const [mostrada, setMostrada] = useState(elegida);
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [pagina, setPagina] = useState(1);
  const inclinable = useRef<HTMLDivElement>(null);
  const vecinos = vecinosDe(enOrden, elegida.id);
  const paginas = paginasDelModelo(elegida);

  // Cambió el documento: se ajusta durante el render, no en un efecto
  // (mismo patrón que useEstadoDelServidor): con un efecto habría un frame
  // con la hoja nueva quieta antes de empezar a moverse.
  if (mostrada.id !== elegida.id) {
    setCambio({
      saliente: mostrada,
      paginaSaliente: pagina,
      entraDesde: ladoDe(elegida.id, vecinosDe(enOrden, mostrada.id)),
      saleHacia: ladoDe(mostrada.id, vecinos),
      vez: (cambio?.vez ?? 0) + 1,
    });
    setMostrada(elegida);
    setPagina(1);
  }

  // La inclinación hacia el mouse va por variables CSS escritas a mano en
  // el nodo, no por estado: un render por cada movimiento del mouse sería
  // tirar trabajo. Solo con mouse: en una pantalla táctil, arrastrar el
  // dedo es hacer scroll.
  function inclinar(e: PointerEvent<HTMLDivElement>) {
    const nodo = inclinable.current;
    if (!nodo || e.pointerType !== "mouse") return;
    const caja = nodo.getBoundingClientRect();
    const x = (e.clientX - caja.left) / caja.width;
    const y = (e.clientY - caja.top) / caja.height;
    nodo.style.setProperty("--pila-ry", `${((x - 0.5) * 12).toFixed(2)}deg`);
    nodo.style.setProperty("--pila-rx", `${((0.5 - y) * 9).toFixed(2)}deg`);
    // La sombra cae del lado contrario al mouse: la hoja se levanta hacia él.
    nodo.style.setProperty("--pila-sombra-x", `${((0.5 - x) * 18).toFixed(1)}px`);
    nodo.style.setProperty("--pila-sombra-y", `${(12 + (0.5 - y) * 8).toFixed(1)}px`);
    nodo.dataset.inclinada = "true";
  }

  function soltar() {
    const nodo = inclinable.current;
    if (!nodo) return;
    nodo.style.removeProperty("--pila-ry");
    nodo.style.removeProperty("--pila-rx");
    delete nodo.dataset.inclinada;
  }

  const hayPila = enOrden.length > 1;
  // Las hojas de atrás ocupan EXACTAMENTE la caja de la de adelante: los
  // mismos márgenes que el relleno de la pila (14 % a los costados, `pt-2`
  // arriba, `pb-4` abajo), así miden lo mismo que ella —el alto lo pone la
  // hoja de adelante, no el papel del modelo vecino— y, achicadas desde su
  // centro, asoman parejo a cada lado. El margen a los costados es el lugar
  // donde asoman. Con pila, la hoja se achica para que se vea la pila entera.
  const cajaDeAtras = "absolute top-2 right-[14%] bottom-4 left-[14%]";
  // La que se va conserva su tamaño (era la de adelante): solo el ancho y el
  // borde de arriba, el mismo de la de adelante, para que no salte al salir.
  const cajaQueSale = "absolute top-2 right-[14%] left-[14%]";

  return (
    <div>
      {paginas > 1 && <PasarPagina pagina={pagina} total={paginas} onCambiar={setPagina} />}
      <div className={`relative overflow-x-clip ${hayPila ? "px-[14%] pt-2 pb-4" : ""}`} data-testid="pila-de-modelos">
        {vecinos.anterior && (
          <div key={`anterior-${vecinos.anterior.id}`} aria-hidden="true" className={`${cajaDeAtras} pila-hoja pila-hoja--izquierda`}>
            <PaginaDeAtras modelo={vecinos.anterior} llenar />
          </div>
        )}
        {vecinos.siguiente && (
          <div key={`siguiente-${vecinos.siguiente.id}`} aria-hidden="true" className={`${cajaDeAtras} pila-hoja pila-hoja--derecha`}>
            <PaginaDeAtras modelo={vecinos.siguiente} llenar />
          </div>
        )}
        {cambio && (
          <div key={`sale-${cambio.vez}`} aria-hidden="true" className={`${cajaQueSale} pila-sale pila-sale--${cambio.saleHacia}`}>
            <HojaQueSale modelo={cambio.saliente} pagina={cambio.paginaSaliente} hoy={hoy} />
          </div>
        )}
        {/* Dos capas, cada una con su propio transform: la que llega al frente
            (y rebota) y la que se inclina hacia el mouse. En un solo nodo se
            pisarían entre sí. */}
        <div
          key={elegida.id}
          className={`pila-frente relative ${cambio ? `pila-entra pila-entra--${cambio.entraDesde}` : ""}`}
          onAnimationEnd={(e) => {
            // Solo la animación de llegada, no una que burbujee de adentro.
            if (e.target === e.currentTarget) setCambio(null);
          }}
        >
          <div ref={inclinable} className="pila-inclina" onPointerMove={inclinar} onPointerLeave={soltar}>
            <HojaDelModelo modelo={elegida} hoy={hoy} pagina={pagina} />
          </div>
        </div>
      </div>
    </div>
  );
}
