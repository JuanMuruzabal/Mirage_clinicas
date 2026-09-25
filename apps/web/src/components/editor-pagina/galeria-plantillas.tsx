"use client";

import { useMemo, useState } from "react";
import {
  aplicarPlantilla,
  CATALOGO_PLANTILLAS,
  type PlantillaPagina,
} from "@dental-mirage/prisma-engine";
import type { PaginaPublica } from "@dental-mirage/shared-types";
import { contenidoDeBorrador, type Borrador } from "@/lib/pagina-publica/borrador";
import { Dialogo } from "@/components/dialogo";
import { VistaPrevia } from "./vista-previa";

export type ModoPlantilla = "diseno" | "reemplazar";

interface GaleriaPlantillasProps {
  slug: string;
  nombreClinica: string;
  telefono?: string | null;
  especialidades: string[];
  borrador: Borrador;
  pagina: Pick<PaginaPublica, "estadisticas" | "direccionClinica" | "equipoElegible" | "horariosClinica" | "serviciosDisponibles">;
  /** Recibe el borrador resultante y cómo se aplicó: el editor ofrece "Deshacer". */
  onAplicar: (borrador: Borrador, modo: ModoPlantilla, plantilla: PlantillaPagina) => void;
  onCerrar: () => void;
}

export function GaleriaPlantillas({
  slug,
  nombreClinica,
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

  // Sin confirmación (PP-3, H10/H19): las dos formas de aplicar cambian solo
  // el BORRADOR, y el editor ofrece "Deshacer" apenas se aplica. Un confirm
  // antes de cada acción se contesta sin leer; deshacer después cubre el
  // error real, que es aplicar algo y darse cuenta al verlo.
  function aplicar(modo: ModoPlantilla) {
    onAplicar(aplicarPlantilla(borrador, seleccionada, modo), modo, seleccionada);
    onCerrar();
  }

  return (
    <Dialogo
      titulo="Plantillas por especialidad"
      descripcion="Elegí una para ver la página real antes de aplicarla."
      onCerrar={onCerrar}
      ancho="ancho"
      etiquetaCerrar="Cerrar galería de plantillas"
    >
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
                <span className="block text-xs uppercase tracking-widest text-grafito/75">{plantilla.rubro} · {plantilla.estilo.replaceAll("-", " ")}</span>
                <span className="mt-1 block text-sm font-semibold text-grafito">{plantilla.nombre}</span>
                <span className="mt-1 block text-xs text-grafito/80">{plantilla.descripcion}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 rounded-card border-[0.5px] border-arena bg-marfil p-4">
            <button type="button" onClick={() => aplicar("diseno")} className="min-h-11 rounded-full bg-salvia-oscuro px-4 text-sm font-semibold text-marfil hover:brightness-95">
              Aplicar solo el diseño
            </button>
            <p className="text-xs text-grafito/80">Conserva tus textos y fotos; suma las secciones que falten.</p>
            <button type="button" onClick={() => aplicar("reemplazar")} className="min-h-11 rounded-full border-[0.5px] border-terracota px-4 text-sm font-medium text-terracota-oscuro hover:bg-terracota-claro">
              Reemplazar todo el borrador
            </button>
            <p className="text-xs text-grafito/80">Cambia también textos y secciones. Lo podés deshacer, y tu página publicada no cambia hasta que publiques.</p>
          </div>
        </div>

        <div className="min-h-[34rem] overflow-hidden rounded-card border-[0.5px] border-arena bg-marfil">
          <VistaPrevia
            slug={slug}
            nombreClinica={nombreClinica}
            telefono={telefono}
            especialidades={especialidades}
            contenido={contenido}
          />
        </div>
      </div>
    </Dialogo>
  );
}
