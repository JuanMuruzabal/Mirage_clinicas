"use client";

import { createContext, useContext, useState, type MouseEvent, type ReactNode } from "react";
import { CLASE_TACTIL } from "@/components/editor-pagina/estilos";
import { CLASE_CELDA, CLASE_COLUMNA_ACCIONES, CLASE_FILA, CLASE_FILA_CLICABLE, CLASE_FONDO_ANIDADO } from "@/components/panel/tabla";

// Las filas de documentos con PDF se despliegan al tocarlas (correcciones
// generales, 2026-10-18, pedido de la persona: con Imprimir y Descargar debajo
// de cada nombre la fila quedaba muy cargada). Es el patrón de la tabla de
// Turnos: tocar la fila la despliega, el chevron de la última columna dice si
// está abierta y abajo aparece una fila con las acciones. Una sola abierta por
// tabla.
//
// Son dos piezas de cliente para que la tabla siga dibujándose en el servidor:
// el cuerpo guarda cuál está abierta y cada fila lo lee.

const Desplegada = createContext<{ abierta: string | null; alternar: (id: string) => void }>({ abierta: null, alternar: () => {} });

export function CuerpoDesplegable({ children }: { children: ReactNode }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const alternar = (id: string) => setAbierta((actual) => (actual === id ? null : id));
  return (
    <Desplegada.Provider value={{ abierta, alternar }}>
      <tbody>{children}</tbody>
    </Desplegada.Provider>
  );
}

// `sinBorde`: la fila sigue en un bloque (una historia y sus anexos), sin la
// línea de abajo. Abierta, la fila y lo desplegado se leen como una sola cosa:
// el mismo fondo, sin la línea entre las dos y sin el velo del hover en la
// fila (con el puntero encima, recién tocada, quedaba de otro tono que lo
// desplegado); la línea va debajo de lo desplegado.
export function FilaDesplegable({
  id,
  columnas,
  columnasAntes = 0,
  sangria = "pl-4",
  riel = null,
  sinBorde = false,
  acciones,
  children,
}: {
  id: string;
  /** Cuántas columnas tiene la tabla: las ocupa la fila desplegada. */
  columnas: number;
  /** Las columnas antes de la del nombre (el folio): lo desplegado arranca
   *  después, debajo del nombre. */
  columnasAntes?: number;
  /** El relleno izquierdo de lo desplegado, el mismo que el del nombre. */
  sangria?: string;
  /** El tramo del riel de los anexos que cruza lo desplegado. */
  riel?: ReactNode;
  sinBorde?: boolean;
  acciones: ReactNode;
  children: ReactNode;
}) {
  const { abierta, alternar } = useContext(Desplegada);
  const desplegada = abierta === id;

  function alTocar(e: MouseEvent<HTMLTableRowElement>) {
    // El nombre abre el documento, y el chevron alterna por su cuenta.
    if ((e.target as HTMLElement).closest("a, button")) return;
    alternar(id);
  }

  return (
    <>
      <tr
        onClick={alTocar}
        className={`${desplegada ? `${CLASE_FILA} cursor-pointer ${CLASE_FONDO_ANIDADO}` : CLASE_FILA_CLICABLE} ${desplegada || sinBorde ? "border-b-transparent" : ""}`}
      >
        {children}
        <td className={`${CLASE_CELDA} ${CLASE_COLUMNA_ACCIONES}`}>
          <button
            type="button"
            aria-expanded={desplegada}
            aria-label={desplegada ? "Ocultar acciones" : "Mostrar acciones"}
            onClick={() => alternar(id)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-grafito/75 transition-transform duration-200 hover:bg-velo hover:text-grafito motion-reduce:transition-none ${CLASE_TACTIL} ${desplegada ? "rotate-180" : ""}`}
          >
            ▾
          </button>
        </td>
      </tr>
      {desplegada && (
        <tr className={`${CLASE_FILA} ${CLASE_FONDO_ANIDADO} ${sinBorde ? "border-b-transparent" : ""}`}>
          {/* Lo desplegado arranca en la columna del nombre, con su misma
              sangría: así se lee como parte de la fila, y el riel de un anexo
              lo cruza a la izquierda sin pasar por debajo de los botones.
              Como en Turnos, la tabla puede estar scrolleada de costado: lo
              desplegado queda fijo a la izquierda y mide lo que se ve de la
              caja desde esa columna (`--ancho-caja` menos
              `--ancho-primera-columna`, de useAltoDeFilas en CajaDeTabla).
              `w-px` en la celda: que el colSpan no le pida ancho a la tabla. */}
          {columnasAntes > 0 && <td colSpan={columnasAntes} aria-hidden="true" className="p-0" />}
          <td colSpan={columnas - columnasAntes} className="relative w-px p-0">
            {riel}
            <div
              className={`sticky left-0 py-3 pr-3 whitespace-normal md:pr-2 2xl:pr-3 ${sangria} ${
                columnasAntes > 0 ? "w-[calc(var(--ancho-caja,100%)-var(--ancho-primera-columna,0px))]" : "w-[var(--ancho-caja,100%)]"
              }`}
            >
              {acciones}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
