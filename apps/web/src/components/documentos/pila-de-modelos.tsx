"use client";

import { useRef, useState, type PointerEvent } from "react";
import type { Plantilla } from "@dental-mirage/documentos-clinicos";
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
// - flota sola, con un vaivén lento;
// - con el mouse encima se levanta y se inclina hacia él, con la sombra
//   del lado contrario;
// - al llegar al frente rebota antes de asentarse.
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
// movimiento" las hojas cambian con un fundido y la de adelante queda
// quieta (mismo criterio que TR-180: un fundido no es movimiento).

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

// La primera página de un modelo, para las hojas de atrás. Sin original
// renderizado, una hoja en blanco del mismo tamaño: de atrás solo se ven
// los bordes.
function PrimeraPagina({ modelo }: { modelo: Modelo }) {
  if (esMuestra(modelo)) return <HojaDeMuestra modelo={modelo} decorativa />;
  const pagina = paginasDelOriginal(modelo.id, modelo.version)[0];
  if (!pagina) return <div className="aspect-[8.5/11] w-full rounded-[4px] border border-linea bg-white shadow-soft" />;
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
      className="h-auto w-full rounded-[4px] border border-linea bg-white shadow-soft"
    />
  );
}

// La hoja que se va: lo que se estaba viendo, tal cual (el calco si no hay
// original), para que el cambio no salte.
function HojaQueSale({ modelo, hoy }: { modelo: Modelo; hoy: string }) {
  if (!esMuestra(modelo) && paginasDelOriginal(modelo.id, modelo.version).length === 0) {
    return <CalcoEnVivo plantilla={modelo} valores={{}} hoy={hoy} />;
  }
  return <PrimeraPagina modelo={modelo} />;
}

/** Lo que se ve del documento elegido, en la pila o a pantalla completa. */
export function HojaDelModelo({ modelo, hoy }: { modelo: Modelo; hoy: string }) {
  if (esMuestra(modelo)) return <HojaDeMuestra modelo={modelo} />;
  return <OriginalDelColegio plantilla={modelo} hoy={hoy} />;
}

export function PilaDeModelos({ enOrden, elegida, hoy }: { enOrden: Modelo[]; elegida: Modelo; hoy: string }) {
  const [mostrada, setMostrada] = useState(elegida);
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const inclinable = useRef<HTMLDivElement>(null);
  const vecinos = vecinosDe(enOrden, elegida.id);

  // Cambió el documento: se ajusta durante el render, no en un efecto
  // (mismo patrón que useEstadoDelServidor): con un efecto habría un frame
  // con la hoja nueva quieta antes de empezar a moverse.
  if (mostrada.id !== elegida.id) {
    setCambio({
      saliente: mostrada,
      entraDesde: ladoDe(elegida.id, vecinosDe(enOrden, mostrada.id)),
      saleHacia: ladoDe(mostrada.id, vecinos),
      vez: (cambio?.vez ?? 0) + 1,
    });
    setMostrada(elegida);
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
  // Las hojas de atrás ocupan la misma caja que la de adelante; el margen
  // a los costados es el lugar donde asoman. Con pila, la hoja se achica
  // para que se vea la pila entera.
  const caja = "absolute top-0 right-[14%] left-[14%]";

  return (
    <div className={`relative overflow-x-clip ${hayPila ? "px-[14%] pt-2 pb-4" : ""}`} data-testid="pila-de-modelos">
      {vecinos.anterior && (
        <div key={`anterior-${vecinos.anterior.id}`} aria-hidden="true" className={`${caja} pila-hoja pila-hoja--izquierda`}>
          <PrimeraPagina modelo={vecinos.anterior} />
        </div>
      )}
      {vecinos.siguiente && (
        <div key={`siguiente-${vecinos.siguiente.id}`} aria-hidden="true" className={`${caja} pila-hoja pila-hoja--derecha`}>
          <PrimeraPagina modelo={vecinos.siguiente} />
        </div>
      )}
      {cambio && (
        <div key={`sale-${cambio.vez}`} aria-hidden="true" className={`${caja} pila-sale pila-sale--${cambio.saleHacia}`}>
          <HojaQueSale modelo={cambio.saliente} hoy={hoy} />
        </div>
      )}
      {/* Tres capas, cada una con su propio transform: la que llega al frente
          (y rebota), la que flota, y la que se inclina hacia el mouse. En
          un solo nodo se pisarían entre sí. */}
      <div
        key={elegida.id}
        className={`pila-frente relative ${cambio ? `pila-entra pila-entra--${cambio.entraDesde}` : ""}`}
        onAnimationEnd={(e) => {
          // Solo la animación de llegada: el vaivén de adentro nunca termina.
          if (e.target === e.currentTarget) setCambio(null);
        }}
      >
        <div className={hayPila ? "pila-flota" : undefined}>
          <div ref={inclinable} className="pila-inclina" onPointerMove={inclinar} onPointerLeave={soltar}>
            <HojaDelModelo modelo={elegida} hoy={hoy} />
          </div>
        </div>
      </div>
    </div>
  );
}
