"use client";

import { useEffect, useRef, useState } from "react";
import { ETIQUETA_DE_TIPO, type Plantilla } from "@dental-mirage/documentos-clinicos";
import { IconChevronDown, IconChevronLeft, IconChevronRight } from "@/components/icons";

// Los grupos del menú, en el orden que pidió el cliente (2026-09-28):
// primero los consentimientos, después las historias clínicas y al final
// lo demás (los anexos y cualquier tipo que se sume).
const GRUPOS: { titulo: string; incluye: (p: Plantilla) => boolean }[] = [
  { titulo: "Consentimientos informados", incluye: (p) => p.tipo === "consentimiento" },
  { titulo: "Historias clínicas", incluye: (p) => p.tipo === "historia_clinica" },
  { titulo: "Anexos y otros", incluye: (p) => p.tipo !== "consentimiento" && p.tipo !== "historia_clinica" },
];

/** Las plantillas agrupadas, en el orden del menú (y de las flechas). */
export function agruparPlantillas(plantillas: Plantilla[]): { titulo: string; plantillas: Plantilla[] }[] {
  return GRUPOS.map((g) => ({ titulo: g.titulo, plantillas: plantillas.filter(g.incluye) })).filter((g) => g.plantillas.length > 0);
}

// SelectorDePlantillas — qué documento completar (Fase 5.1, R3 del brief):
// el nombre entre dos flechas, como el carrusel de profesionales. Tocar el
// nombre despliega todos los documentos, separados en consentimientos,
// historias clínicas y el resto (pedido del cliente, 2026-09-28: reemplaza
// al buscador que había arriba). Las flechas recorren la misma lista, en el
// mismo orden, como una rueda.
export function SelectorDePlantillas({
  plantillas,
  elegida,
  onElegir,
}: {
  plantillas: Plantilla[];
  elegida: Plantilla;
  onElegir: (plantilla: Plantilla) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const grupos = agruparPlantillas(plantillas);
  const enOrden = grupos.flatMap((g) => g.plantillas);
  const indice = Math.max(0, enOrden.findIndex((p) => p.id === elegida.id));

  useEffect(() => {
    if (!abierto) return;
    function afuera(e: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  function mover(paso: 1 | -1) {
    onElegir(enOrden[(indice + paso + enOrden.length) % enOrden.length]);
  }

  function elegir(p: Plantilla) {
    setAbierto(false);
    onElegir(p);
  }

  return (
    <div ref={contenedor} className="flex w-full flex-col">
      <p className="mb-2 font-[family-name:var(--font-mono)] text-xs font-semibold tracking-[0.16em] text-salvia-oscuro uppercase">
        Documento
      </p>
      <div className="relative">
        <div className="flex items-stretch overflow-hidden rounded-card border border-linea bg-marfil shadow-soft">
          <button
            type="button"
            aria-label="Documento anterior"
            disabled={enOrden.length < 2}
            onClick={() => mover(-1)}
            className="flex items-center px-3 text-grafito/70 transition-colors hover:bg-hueso hover:text-grafito disabled:opacity-40"
          >
            <IconChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-expanded={abierto}
            aria-haspopup="true"
            aria-label={`Elegir documento: ${elegida.nombre}`}
            onClick={() => setAbierto((a) => !a)}
            className={`flex min-w-0 flex-1 items-center justify-between gap-3 border-x border-linea px-4 py-2.5 text-left transition-colors ${
              abierto ? "bg-salvia-claro" : "hover:bg-hueso"
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate font-[family-name:var(--font-display)] text-[19px] leading-tight font-semibold tracking-wide text-grafito">
                {elegida.nombre}
              </span>
              <span className="mt-0.5 block truncate text-[12.5px] text-grafito/75">{ETIQUETA_DE_TIPO[elegida.tipo]}</span>
            </span>
            <IconChevronDown className={`h-4 w-4 flex-none text-grafito/70 transition-transform ${abierto ? "rotate-180" : ""}`} />
          </button>
          <button
            type="button"
            aria-label="Documento siguiente"
            disabled={enOrden.length < 2}
            onClick={() => mover(1)}
            className="flex items-center px-3 text-grafito/70 transition-colors hover:bg-hueso hover:text-grafito disabled:opacity-40"
          >
            <IconChevronRight className="h-5 w-5" />
          </button>
        </div>


        {abierto && (
          <div className="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-20 flex max-h-[26rem] flex-col overflow-y-auto rounded-card border border-linea bg-marfil p-2 shadow-soft">
            {grupos.map((grupo, i) => (
              <div key={grupo.titulo} role="group" aria-label={grupo.titulo} className={i > 0 ? "mt-2 border-t border-linea pt-2" : ""}>
                <p className="px-3 py-2 font-[family-name:var(--font-mono)] text-[11.5px] tracking-[0.16em] text-grafito/70 uppercase">
                  {grupo.titulo}
                </p>
                {grupo.plantillas.map((p) => {
                  const esLaElegida = p.id === elegida.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => elegir(p)}
                      aria-current={esLaElegida ? "true" : undefined}
                      className={`flex w-full items-center rounded-field px-3 py-2.5 text-left text-[15px] text-grafito transition-colors ${
                        esLaElegida ? "bg-salvia-claro font-medium" : "hover:bg-hueso"
                      }`}
                    >
                      {p.nombre}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-[13px] font-medium text-salvia-oscuro">
        {indice + 1} de {enOrden.length}
      </p>
    </div>
  );
}
