"use client";

import { useMemo, useState } from "react";
import {
  aplicarPlantilla,
  CATALOGO_PLANTILLAS,
  type PlantillaPagina,
} from "@dental-mirage/prisma-engine";
import type { PaginaPublica } from "@dental-mirage/shared-types";
import { contenidoDeBorrador, type Borrador } from "@/lib/pagina-publica/borrador";
import { VistaPrevia } from "./vista-previa";

interface GaleriaPlantillasProps {
  slug: string;
  nombreClinica: string;
  profesionalNombre: string;
  telefono?: string | null;
  especialidades: string[];
  borrador: Borrador;
  pagina: Pick<PaginaPublica, "estadisticas" | "direccionClinica" | "equipoElegible" | "horariosClinica" | "serviciosDisponibles">;
  onAplicar: (borrador: Borrador) => void;
  onCerrar: () => void;
}

export function GaleriaPlantillas({
  slug,
  nombreClinica,
  profesionalNombre,
  telefono,
  especialidades,
  borrador,
  pagina,
  onAplicar,
  onCerrar,
}: GaleriaPlantillasProps) {
  const [seleccionada, setSeleccionada] = useState<PlantillaPagina>(CATALOGO_PLANTILLAS[0]);
  const vista = useMemo(
    () => aplicarPlantilla(borrador, seleccionada, "reemplazar"),
    [borrador, seleccionada],
  );
  const contenido = useMemo(() => contenidoDeBorrador(vista, pagina), [vista, pagina]);

  function aplicar(modo: "diseno" | "reemplazar") {
    if (modo === "reemplazar" && !window.confirm("Esto reemplaza todo el contenido del borrador. La página publicada no cambia hasta que guardes y publiques. ¿Querés continuar?")) {
      return;
    }
    onAplicar(aplicarPlantilla(borrador, seleccionada, modo));
    onCerrar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-grafito/50 p-3 py-6 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onCerrar(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="galeria-plantillas-titulo" className="w-full max-w-7xl rounded-card border-[0.5px] border-arena bg-hueso shadow-soft">
        <header className="flex items-start justify-between gap-4 border-b-[0.5px] border-arena p-4 sm:p-6">
          <div>
            <h2 id="galeria-plantillas-titulo" className="font-[family-name:var(--font-display)] text-2xl font-medium text-grafito">Plantillas por especialidad</h2>
            <p className="mt-1 text-sm text-grafito/70">Elegí una para ver la página real antes de aplicarla.</p>
          </div>
          <button type="button" aria-label="Cerrar galería de plantillas" onClick={onCerrar} className="rounded-full border-[0.5px] border-arena px-3 py-1 text-sm text-grafito hover:border-salvia">Cerrar</button>
        </header>

        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {CATALOGO_PLANTILLAS.map((plantilla) => (
                <button
                  key={plantilla.id}
                  type="button"
                  aria-pressed={seleccionada.id === plantilla.id}
                  onClick={() => setSeleccionada(plantilla)}
                  className={`rounded-card border-[0.5px] p-3 text-left transition-colors ${seleccionada.id === plantilla.id ? "border-salvia-oscuro bg-salvia-claro" : "border-arena bg-marfil hover:border-salvia"}`}
                >
                  <span className="block text-xs uppercase tracking-widest text-grafito/55">{plantilla.rubro} · {plantilla.estilo.replaceAll("-", " ")}</span>
                  <span className="mt-1 block text-sm font-semibold text-grafito">{plantilla.nombre}</span>
                  <span className="mt-1 block text-xs text-grafito/70">{plantilla.descripcion}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 rounded-card border-[0.5px] border-arena bg-marfil p-4">
              <button type="button" onClick={() => aplicar("diseno")} className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95">
                Aplicar solo el diseño
              </button>
              <p className="text-xs text-grafito/65">Conserva tus textos y fotos; suma las secciones que falten.</p>
              <button type="button" onClick={() => aplicar("reemplazar")} className="rounded-full border-[0.5px] border-terracota px-4 py-2 text-sm font-medium text-terracota-oscuro hover:bg-terracota-claro">
                Reemplazar todo el borrador
              </button>
            </div>
          </div>

          <div className="min-h-[34rem] overflow-hidden rounded-card border-[0.5px] border-arena bg-marfil">
            <VistaPrevia
              slug={slug}
              nombreClinica={nombreClinica}
              profesionalNombre={profesionalNombre}
              telefono={telefono}
              especialidades={especialidades}
              contenido={contenido}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
