"use client";

import { useRef, useState, type PointerEvent } from "react";
import { LIENZO_MAXIMO, LIENZO_MINIMO, MAXIMO_DE_PUNTOS, MAXIMO_DE_TRAZOS, type Punto, type ValorDibujo } from "@dental-mirage/documentos-clinicos";
import { BOTON_SECUNDARIO, BorrarTodo } from "./campo-odontograma";
import { caminoDelTrazo } from "./trazo-de-firma";

/** El ancho del lienzo en sus propias unidades: el mismo en cualquier
 *  pantalla, así un dibujo empezado en la computadora se sigue en el
 *  celular sin cambiar de escala. */
const ANCHO_DEL_LIENZO = 1000;

/** Cuánto lugar del alto de la pantalla puede ocupar el lienzo: el resto es
 *  del título, las herramientas y el pie del diálogo. En un celular acostado
 *  (pantalla baja) el diálogo ocupa la pantalla entera y compacta su
 *  cabecera y su pie (`Dialogo`, ancho "completo"): ahí el lienzo toma lo que
 *  queda, para que las herramientas y el pie entren sin desplazar nada. */
const ALTO_MAXIMO = "var(--alto-lienzo)";
/** El alto del lienzo, y en una pantalla baja la fila: el lienzo a la
 *  izquierda y las herramientas en una columna angosta a su derecha, así el
 *  lienzo usa todo el alto que queda entre la cabecera y el pie. */
const CLASE_DISPOSICION = [
  "[--alto-lienzo:60dvh] [--ancho-lienzo:100%]",
  "[@media(max-height:30rem)]:flex-row [@media(max-height:30rem)]:items-start",
  "[@media(max-height:30rem)]:[--alto-lienzo:calc(100dvh-10.5rem)] [@media(max-height:30rem)]:[--ancho-lienzo:calc(100%-11.5rem)]",
].join(" ");

/** Menos que esto (en unidades del lienzo) desde el punto anterior no suma
 *  nada al trazo: solo puntos. */
const PASO_MINIMO = 1;

/** El lienzo de un dibujo nuevo, con la proporción (ancho / alto) del
 *  recuadro del papel. */
export function lienzoPara(proporcion: number): Pick<ValorDibujo, "ancho" | "alto"> {
  const alto = Math.round(ANCHO_DEL_LIENZO / proporcion);
  return {
    ancho: ANCHO_DEL_LIENZO,
    alto: Math.min(LIENZO_MAXIMO, Math.max(LIENZO_MINIMO, alto)),
  };
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;
const acotar = (n: number, maximo: number) => redondear2(Math.min(Math.max(n, 0), maximo));
const totalDePuntos = (trazos: Punto[][]) => trazos.reduce((n, t) => n + t.length, 0);

// LienzoDeDibujo — donde se dibuja a mano alzada un campo dibujo, como el
// genograma (Fase 5.6b). Mismo criterio que el lienzo de la firma: vectores
// y no una foto, dibujados con SVG, y `touch-action: none` para que el dedo
// dibuje en vez de mover la página. Sin formas: solo trazos, con Deshacer y
// Borrar todo.
//
// Se monta con cada apertura del diálogo: lo que se dibuja vive acá y se
// avisa al levantar el dedo, con Deshacer y con Borrar todo; el campo lo
// guarda en ese momento, como el odontograma.
export function LienzoDeDibujo({
  inicial,
  onCambio,
  etiqueta,
}: {
  /** El dibujo con que se abre; su ancho y su alto son los del lienzo. */
  inicial: ValorDibujo;
  onCambio: (valor: ValorDibujo) => void;
  etiqueta: string;
}) {
  // El tamaño del lienzo se fija al abrir: el dibujo se guarda con cada
  // trazo y `inicial` cambia mientras está abierto, pero el lienzo no.
  const [{ ancho, alto }] = useState(() => ({ ancho: inicial.ancho, alto: inicial.alto }));
  const dibujando = useRef(false);
  // Los trazos viven en una referencia (lo que se avisa) y en el estado (lo
  // que se dibuja), como en LienzoDeFirma.
  const trazosRef = useRef<Punto[][]>(inicial.trazos);
  const [trazos, setTrazos] = useState<Punto[][]>(inicial.trazos);

  function cambiar(nuevos: Punto[][], avisar: boolean) {
    trazosRef.current = nuevos;
    setTrazos(nuevos);
    if (avisar) onCambio({ ancho, alto, trazos: nuevos });
  }

  function punto(e: PointerEvent<HTMLDivElement>): Punto {
    // El dibujo ocupa la caja sin el borde: se mide sobre ella, o el trazo
    // queda corrido del puntero lo que mide el borde.
    const caja = e.currentTarget;
    const rect = caja.getBoundingClientRect();
    const izquierda = rect.left + caja.clientLeft;
    const arriba = rect.top + caja.clientTop;
    const escalaX = caja.clientWidth > 0 ? ancho / caja.clientWidth : 1;
    const escalaY = caja.clientHeight > 0 ? alto / caja.clientHeight : 1;
    return [acotar((e.clientX - izquierda) * escalaX, ancho), acotar((e.clientY - arriba) * escalaY, alto)];
  }

  function empezar(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const actuales = trazosRef.current;
    // En el límite que acepta la API, no empieza otro trazo.
    if (actuales.length >= MAXIMO_DE_TRAZOS || totalDePuntos(actuales) >= MAXIMO_DE_PUNTOS) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dibujando.current = true;
    cambiar([...actuales, [punto(e)]], false);
  }

  function mover(e: PointerEvent<HTMLDivElement>) {
    if (!dibujando.current) return;
    const actuales = trazosRef.current;
    if (totalDePuntos(actuales) >= MAXIMO_DE_PUNTOS) return;
    const p = punto(e);
    const ultimo = actuales[actuales.length - 1] ?? [];
    const anterior = ultimo[ultimo.length - 1];
    if (anterior && Math.hypot(p[0] - anterior[0], p[1] - anterior[1]) < PASO_MINIMO) return;
    cambiar([...actuales.slice(0, -1), [...ultimo, p]], false);
  }

  function terminar() {
    if (!dibujando.current) return;
    dibujando.current = false;
    cambiar(trazosRef.current, true);
  }

  const vacio = trazos.length === 0;

  return (
    <div className={`flex flex-col gap-3 ${CLASE_DISPOSICION}`}>
      {/* En un celular parado el lienzo queda bajito: se sugiere girarlo,
          sin estado que dependa del ancho de la ventana (TR-172). */}
      <p className="hidden text-sm text-grafito/75 max-sm:portrait:block">Girá el teléfono para tener más lugar para dibujar.</p>
      <div
        role="application"
        aria-label={etiqueta}
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onPointerLeave={terminar}
        style={{
          aspectRatio: `${ancho} / ${alto}`,
          width: `min(var(--ancho-lienzo), calc(${ALTO_MAXIMO} * ${ancho / alto}))`,
          touchAction: "none",
        }}
        className="relative mx-auto shrink-0 cursor-crosshair select-none rounded-field border border-linea bg-hueso"
      >
        {vacio && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-grafito/75">
            Dibujá acá con el dedo o el mouse
          </span>
        )}
        <svg viewBox={`0 0 ${ancho} ${alto}`} className="pointer-events-none absolute inset-0 h-full w-full text-grafito" aria-hidden="true">
          {trazos.map((puntos, i) => (
            <path
              key={i}
              d={caminoDelTrazo(puntos)}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <div className="[@media(max-height:30rem)]:w-40 [@media(max-height:30rem)]:shrink-0">
        <BorrarTodo
          habilitado={!vacio}
          onBorrar={() => cambiar([], true)}
          pregunta="¿Borrar todo el dibujo?"
          antes={
            <button type="button" disabled={vacio} onClick={() => cambiar(trazosRef.current.slice(0, -1), true)} className={`${BOTON_SECUNDARIO} text-grafito`}>
              Deshacer
            </button>
          }
        />
      </div>
    </div>
  );
}
