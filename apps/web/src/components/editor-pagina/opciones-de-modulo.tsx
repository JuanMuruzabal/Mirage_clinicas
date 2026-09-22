"use client";

import {
  MAX_LARGO_TITULO_PUBLICO,
  definicionDeModulo,
  textoDeConfig,
  varianteDeConfig,
  type FondoSeccion,
  type ModuloBorrador,
} from "@dental-mirage/prisma-engine";
import { SelectorDeVariante } from "./selector-de-variante";
import { SubirFoto } from "./subir-foto";
import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ETIQUETA } from "./estilos";

interface OpcionesDeModuloProps {
  modulo: ModuloBorrador;
  onConfig: (config: Record<string, unknown>) => void;
}

const FONDOS: { id: FondoSeccion; nombre: string }[] = [
  { id: "normal", nombre: "Normal" },
  { id: "acento", nombre: "Color suave" },
  { id: "contraste", nombre: "Contraste" },
];

const CLASE_PASTILLA = "rounded-full border-[0.5px] px-3 py-1.5 text-xs";
const CLASE_ELEGIDA = "border-salvia-oscuro bg-salvia-claro";
const CLASE_NO_ELEGIDA = "border-arena bg-marfil hover:border-salvia";

/** Escribe una clave de la config; un valor vacío (o el default) la saca, así la config no acumula claves sin efecto. */
function conClave(config: Record<string, unknown>, clave: string, valor: string, porDefecto = ""): Record<string, unknown> {
  const resto = { ...config };
  delete resto[clave];
  return valor === porDefecto ? resto : { ...resto, [clave]: valor };
}

// OpcionesDeModulo (PE-3) — lo que TODO módulo puede tener además de su
// contenido: variante de layout, título público, fondo de sección y
// alineación. Qué se ofrece lo decide el meta.ts de cada módulo; este
// componente no conoce módulos por nombre.
export function OpcionesDeModulo({ modulo, onConfig }: OpcionesDeModuloProps) {
  const definicion = definicionDeModulo(modulo.tipo);
  if (!definicion) return null;
  const { variantes, opcionesDeSeccion: opciones } = definicion;
  if (variantes.length < 2 && !opciones.titulo && !opciones.fondo && !opciones.alineacion) return null;

  const ids = variantes.map((v) => v.id);
  const variante = ids.length > 0 ? varianteDeConfig(modulo.config, ids) : "";
  const fondo = (textoDeConfig(modulo.config, "fondoSeccion") || "normal") as FondoSeccion;
  const izquierda = textoDeConfig(modulo.config, "alineacion") === "izquierda";

  return (
    <div className="flex flex-col gap-4 border-t-[0.5px] border-arena pt-3">
      {variantes.length > 1 && (
        <SelectorDeVariante
          etiqueta="Diseño de la sección"
          variantes={variantes}
          elegida={variante}
          // La primera variante es el default: elegirla saca la clave.
          onElegir={(id) => onConfig(conClave(modulo.config, "variante", id, ids[0]))}
        />
      )}

      {variante === "con-foto" && (
        <SubirFoto
          etiqueta="foto de la sección"
          url={textoDeConfig(modulo.config, "fotoUrl")}
          onSubida={(url) => onConfig({ ...modulo.config, fotoUrl: url })}
          onQuitar={() => onConfig(conClave(modulo.config, "fotoUrl", ""))}
        />
      )}

      {opciones.titulo && (
        <label className="flex flex-col gap-1.5">
          <span className={CLASE_ETIQUETA}>Título en la página</span>
          <input
            type="text"
            maxLength={MAX_LARGO_TITULO_PUBLICO}
            // Crudo, no recortado (mismo motivo que "Nombre en la lista").
            value={textoDeConfig(modulo.config, "tituloPublico")}
            onChange={(e) => onConfig(conClave(modulo.config, "tituloPublico", e.target.value))}
            placeholder={definicion.nombre}
            className={CLASE_CAMPO}
          />
          <span className={CLASE_AYUDA}>Lo ven los visitantes, y es el texto del link en el menú.</span>
        </label>
      )}

      {opciones.fondo && (
        <fieldset className="flex flex-col gap-2">
          <legend className={CLASE_ETIQUETA}>Fondo de la sección</legend>
          <div role="radiogroup" aria-label="Fondo de la sección" className="flex flex-wrap gap-2">
            {FONDOS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={f.id === fondo}
                onClick={() => onConfig(conClave(modulo.config, "fondoSeccion", f.id, "normal"))}
                className={`${CLASE_PASTILLA} ${f.id === fondo ? CLASE_ELEGIDA : CLASE_NO_ELEGIDA}`}
              >
                {f.nombre}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {opciones.alineacion && (
        <label className="flex items-center gap-2 text-sm text-grafito">
          <input
            type="checkbox"
            checked={izquierda}
            onChange={(e) => onConfig(conClave(modulo.config, "alineacion", e.target.checked ? "izquierda" : ""))}
          />
          Alinear el texto a la izquierda
        </label>
      )}
    </div>
  );
}
