"use client";

import type { Borrador } from "@/lib/pagina-publica/borrador";
import { COLORES_NOMBRE, COLOR_NOMBRE_POR_DEFECTO } from "@/lib/pagina-publica/portada";
import { CLASE_AYUDA, CLASE_ETIQUETA } from "./estilos";
import { SubirFoto } from "./subir-foto";

interface EditorDePortadaProps {
  borrador: Borrador;
  onBorrador: (parcial: Partial<Borrador>) => void;
}

// EditorDePortada (Fase 4.4) — la foto de portada y, si hay foto, poner el
// nombre de la clínica encima con un color a elección. El color es de ESE
// nombre y de ningún otro texto de la página; y solo rige mientras el nombre
// está sobre la foto (debajo de ella, sobre el fondo del tema, un color
// pensado para una foto —blanco, por ejemplo— podría no leerse).
export function EditorDePortada({ borrador, onBorrador }: EditorDePortadaProps) {
  const hayFoto = borrador.fotoPortadaUrl !== "";
  const sobreLaFoto = hayFoto && borrador.nombreSobrePortada;
  const colorElegido = borrador.nombreColor || COLOR_NOMBRE_POR_DEFECTO;

  return (
    <div className="flex flex-col gap-4">
      <SubirFoto
        etiqueta="foto de portada"
        url={borrador.fotoPortadaUrl}
        onSubida={(url) => onBorrador({ fotoPortadaUrl: url })}
        onQuitar={() => onBorrador({ fotoPortadaUrl: "" })}
      />

      <label className="flex items-start gap-2 text-sm text-grafito">
        <input
          type="checkbox"
          className="mt-1"
          checked={sobreLaFoto}
          disabled={!hayFoto}
          onChange={(e) => onBorrador({ nombreSobrePortada: e.target.checked })}
        />
        <span>
          Poner el nombre de la clínica sobre la foto
          <span className={`${CLASE_AYUDA} block`}>
            {hayFoto ? "Se agrega un degradé para que se lea con cualquier foto." : "Subí una foto de portada para usar esta opción."}
          </span>
        </span>
      </label>

      <fieldset disabled={!sobreLaFoto} className="flex flex-col gap-2 disabled:opacity-50">
        <legend className={CLASE_ETIQUETA}>Color del nombre</legend>
        <div role="radiogroup" aria-label="Color del nombre" className="flex flex-wrap gap-2">
          {COLORES_NOMBRE.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === colorElegido}
              aria-label={c.nombre}
              title={c.nombre}
              disabled={!sobreLaFoto}
              onClick={() => onBorrador({ nombreColor: c.id })}
              className={`flex items-center gap-2 rounded-full border-[0.5px] px-3 py-1.5 text-xs ${
                c.id === colorElegido ? "border-salvia-oscuro bg-salvia-claro" : "border-arena bg-marfil hover:border-salvia"
              }`}
            >
              <span aria-hidden="true" className="h-4 w-4 rounded-full border-[0.5px] border-grafito/30" style={{ background: c.hex }} />
              {c.nombre}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
