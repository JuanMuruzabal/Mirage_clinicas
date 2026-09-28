"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buscarPlantillas, ETIQUETA_DE_TIPO, type Plantilla } from "@dental-mirage/documentos-clinicos";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";

// SelectorDePlantillas — qué documento completar (Fase 5.1, R3 del brief):
// el nombre entre dos flechas, como el carrusel de profesionales, más un
// buscador para ir directo a uno. Es una rueda: desde el último, la
// flecha lleva al primero.
export function SelectorDePlantillas({
  plantillas,
  elegida,
  onElegir,
}: {
  plantillas: Plantilla[];
  elegida: Plantilla;
  onElegir: (plantilla: Plantilla) => void;
}) {
  const [consulta, setConsulta] = useState("");
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const idLista = useId();
  const indice = Math.max(0, plantillas.findIndex((p) => p.id === elegida.id));
  const resultados = buscarPlantillas(consulta, plantillas);

  useEffect(() => {
    if (!abierto) return;
    function afuera(e: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", afuera);
    return () => document.removeEventListener("mousedown", afuera);
  }, [abierto]);

  function mover(paso: 1 | -1) {
    onElegir(plantillas[(indice + paso + plantillas.length) % plantillas.length]);
  }

  function elegir(p: Plantilla) {
    onElegir(p);
    setConsulta("");
    setAbierto(false);
  }

  return (
    <div ref={contenedor} className="flex w-full flex-col gap-3">
      <p className="font-[family-name:var(--font-mono)] text-xs font-semibold tracking-[0.16em] text-salvia-oscuro uppercase">Documento</p>
      {/* El buscador va debajo del carrusel, a lo ancho: al lado, en la
          columna del módulo, quedaba tan angosto que se cortaba su texto. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col">
          <div className="flex items-stretch overflow-hidden rounded-card border border-linea bg-marfil">
            <button
              type="button"
              aria-label="Documento anterior"
              disabled={plantillas.length < 2}
              onClick={() => mover(-1)}
              className="flex items-center px-3 text-grafito/70 transition-colors hover:bg-hueso hover:text-grafito disabled:opacity-40"
            >
              <IconChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col border-x border-linea px-4 py-2.5">
              <span className="truncate font-[family-name:var(--font-display)] text-[19px] leading-tight font-semibold tracking-wide text-grafito">
                {elegida.nombre}
              </span>
              <span className="mt-0.5 truncate text-[12.5px] text-grafito/75">{ETIQUETA_DE_TIPO[elegida.tipo]}</span>
            </div>
            <button
              type="button"
              aria-label="Documento siguiente"
              disabled={plantillas.length < 2}
              onClick={() => mover(1)}
              className="flex items-center px-3 text-grafito/70 transition-colors hover:bg-hueso hover:text-grafito disabled:opacity-40"
            >
              <IconChevronRight className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-2 text-[13px] font-medium text-salvia-oscuro">
            {indice + 1} de {plantillas.length}
          </p>
        </div>

        <div className="relative">
          <label htmlFor={`${idLista}-buscar`} className="sr-only">
            Buscar un documento
          </label>
          <input
            id={`${idLista}-buscar`}
            type="search"
            role="combobox"
            aria-expanded={abierto}
            aria-controls={idLista}
            aria-autocomplete="list"
            placeholder="Buscar un documento…"
            value={consulta}
            onFocus={() => setAbierto(true)}
            onChange={(e) => {
              setConsulta(e.target.value);
              setAbierto(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAbierto(false);
              if (e.key === "Enter" && resultados[0]) {
                e.preventDefault();
                elegir(resultados[0]);
              }
            }}
            className="w-full rounded-field border border-linea bg-hueso px-4 py-2.5 text-sm text-grafito outline-none focus:border-salvia"
          />
          {abierto && (
            <ul
              id={idLista}
              role="listbox"
              aria-label="Documentos"
              className="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-20 flex max-h-80 flex-col overflow-y-auto rounded-card border border-linea bg-marfil p-2 shadow-soft"
            >
              {resultados.length === 0 && <li className="px-3 py-2 text-sm text-grafito/75">No hay ningún documento con ese nombre.</li>}
              {resultados.map((p) => (
                <li key={p.id} role="option" aria-selected={p.id === elegida.id}>
                  <button
                    type="button"
                    onClick={() => elegir(p)}
                    className={`flex w-full flex-col rounded-field px-3 py-2 text-left ${p.id === elegida.id ? "bg-salvia-claro" : "hover:bg-hueso"}`}
                  >
                    <span className="text-[15px] font-medium text-grafito">{p.nombre}</span>
                    <span className="text-xs text-grafito/75">{ETIQUETA_DE_TIPO[p.tipo]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
