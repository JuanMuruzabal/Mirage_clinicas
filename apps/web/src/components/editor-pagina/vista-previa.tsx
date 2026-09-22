"use client";

import { useState } from "react";
import type { ContenidoPagina } from "@/lib/pagina-publica/contenido";
import { ClinicaPublicaTemplate } from "@/components/public/clinica-publica-template";

const DISPOSITIVOS = [
  { id: "movil", etiqueta: "Móvil", ancho: 390 },
  { id: "tablet", etiqueta: "Tablet", ancho: 768 },
  { id: "escritorio", etiqueta: "Escritorio", ancho: null },
] as const;

type IdDispositivo = (typeof DISPOSITIVOS)[number]["id"];

interface VistaPreviaProps {
  slug: string;
  nombreClinica: string;
  profesionalNombre: string;
  telefono?: string | null;
  especialidades: string[];
  contenido: ContenidoPagina;
}

// VistaPrevia (Fase 4.4) — la página tal como la ve un visitante, en tres
// anchos. No es un iframe: la plantilla reordena su grilla según el ANCHO
// DE SU CONTENEDOR (container queries, ver ClinicaPublicaTemplate), así que
// acotar el ancho de este wrapper alcanza para que muestre el layout de
// mobile o de tablet — con media queries de viewport, "Móvil" se vería igual
// que "Escritorio" en cualquier pantalla ancha.
export function VistaPrevia({ slug, nombreClinica, profesionalNombre, telefono, especialidades, contenido }: VistaPreviaProps) {
  const [dispositivo, setDispositivo] = useState<IdDispositivo>("escritorio");
  const [reproduccion, setReproduccion] = useState(0);
  const ancho = DISPOSITIVOS.find((d) => d.id === dispositivo)?.ancho ?? null;

  return (
    <div className="min-h-[640px] flex-1 overflow-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-[0.5px] border-arena bg-marfil px-4 py-2">
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">Previsualización en vivo</p>
        <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setReproduccion((r) => r + 1)} className="rounded-full border-[0.5px] border-arena px-3 py-1 text-xs font-medium text-grafito hover:border-salvia">
          Reproducir efectos
        </button>
        <div role="radiogroup" aria-label="Tamaño de la previsualización" className="flex gap-1">
          {DISPOSITIVOS.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={dispositivo === d.id}
              onClick={() => setDispositivo(d.id)}
              className={`rounded-full border-[0.5px] px-3 py-1 text-xs font-medium ${
                dispositivo === d.id
                  ? "border-salvia-oscuro bg-salvia-claro text-salvia-oscuro"
                  : "border-arena bg-marfil text-grafito hover:border-salvia"
              }`}
            >
              {d.etiqueta}
            </button>
          ))}
        </div>
        </div>
      </div>
      {/* Sin fondo propio acá — ClinicaPublicaTemplate trae el suyo. El
          wrapper con ancho fijo es lo único que cambia entre dispositivos. */}
      <div data-testid="vista-previa-marco" className="mx-auto transition-[max-width] duration-300" style={{ maxWidth: ancho ?? "100%" }}>
        <ClinicaPublicaTemplate
          key={reproduccion}
          slug={slug}
          nombreClinica={nombreClinica}
          profesionalNombre={profesionalNombre}
          telefono={telefono}
          especialidades={especialidades}
          contenido={contenido}
        />
      </div>
    </div>
  );
}
