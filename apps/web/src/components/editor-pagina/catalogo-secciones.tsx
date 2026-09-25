"use client";

import { useState } from "react";
import { Miniatura, miniaturaDeModulo, type DefinicionModulo, type PresetSeccion } from "@dental-mirage/prisma-engine";
import { Dialogo } from "@/components/dialogo";
import { definicionDeModulo, TOPE_FOTOS_SUELTAS } from "@/lib/pagina-publica/modulos";
import { GrupoDeOpciones } from "./grupo-de-opciones";
import { CLASE_AYUDA, CLASE_ETIQUETA, CLASE_PASTILLA, claseDeEleccion } from "./estilos";

export type DondeAgregar = "debajo" | "final";

export type EleccionDeSeccion = { tipo: string } | { preset: PresetSeccion };

interface CatalogoSeccionesProps {
  agregables: DefinicionModulo[];
  presets: PresetSeccion[];
  /** El nombre del módulo abierto, si hay uno: ofrece agregar debajo de él. */
  nombreDelAbierto: string | null;
  onElegir: (eleccion: EleccionDeSeccion, donde: DondeAgregar) => void;
  onCerrar: () => void;
}

const CLASE_OPCION =
  "flex h-full flex-col gap-1.5 rounded-field border-[0.5px] border-arena bg-marfil p-2 text-left text-xs text-grafito transition-colors hover:border-salvia-oscuro hover:bg-salvia-claro";

// CatalogoSecciones (PP-6, H20) — "Agregar sección" era un <select> con
// "Nombre — descripción" que siempre agregaba al final, y otro igual para las
// prearmadas. Ahora es un catálogo con la miniatura de cada sección (la de
// su primera variante, la de la prearmada, o la `miniatura` de su meta.ts)
// y, si hay un módulo abierto, la opción de ponerla debajo de él.
export function CatalogoSecciones({ agregables, presets, nombreDelAbierto, onElegir, onCerrar }: CatalogoSeccionesProps) {
  const [donde, setDonde] = useState<DondeAgregar>(nombreDelAbierto ? "debajo" : "final");

  return (
    <Dialogo titulo="Agregar una sección" descripcion="Elegí qué sumar a tu página. Después la podés mover, editar u ocultar." onCerrar={onCerrar} ancho="medio">
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        {nombreDelAbierto && (
          <GrupoDeOpciones
            etiqueta="Dónde"
            valor={donde}
            onCambio={(v) => setDonde(v as DondeAgregar)}
            opciones={[
              { valor: "debajo", contenido: `Debajo de “${nombreDelAbierto}”` },
              { valor: "final", contenido: "Al final" },
            ]}
            className="flex flex-wrap gap-2"
            claseOpcion={(elegida) => `${CLASE_PASTILLA} ${claseDeEleccion(elegida)}`}
          />
        )}

        <section aria-labelledby="catalogo-vacias" className="flex flex-col gap-2">
          <h3 id="catalogo-vacias" className={CLASE_ETIQUETA}>
            Secciones
          </h3>
          {agregables.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {agregables.map((d) => (
                <li key={d.tipo}>
                  <button type="button" onClick={() => onElegir({ tipo: d.tipo }, donde)} className={CLASE_OPCION}>
                    <Miniatura variante={miniaturaDeModulo(d)} />
                    <span className="text-sm font-medium">{d.nombre}</span>
                    <span className={CLASE_AYUDA}>{d.descripcion}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={CLASE_AYUDA}>Ya tenés todas las secciones disponibles en tu página.</p>
          )}
          <p className={CLASE_AYUDA}>Fotos sueltas: hasta {TOPE_FOTOS_SUELTAS} por página.</p>
        </section>

        {presets.length > 0 && (
          <section aria-labelledby="catalogo-prearmadas" className="flex flex-col gap-2">
            <h3 id="catalogo-prearmadas" className={CLASE_ETIQUETA}>
              Prearmadas
            </h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {presets.map((preset) => {
                const definicion = definicionDeModulo(preset.modulo.tipo);
                const variante = typeof preset.modulo.config.variante === "string" ? preset.modulo.config.variante : undefined;
                return (
                  <li key={preset.id}>
                    <button type="button" onClick={() => onElegir({ preset }, donde)} className={CLASE_OPCION}>
                      {definicion && <Miniatura variante={miniaturaDeModulo(definicion, variante)} />}
                      <span className="text-sm font-medium">{preset.nombre}</span>
                      <span className={CLASE_AYUDA}>{preset.descripcion}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Dialogo>
  );
}
