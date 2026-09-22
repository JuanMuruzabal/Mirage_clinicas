"use client";

import { VARIANTES_PORTADA, resolverTokens, type TokensTema } from "@dental-mirage/prisma-engine";
import type { Borrador } from "@/lib/pagina-publica/borrador";
import { COLORES_NOMBRE, COLOR_NOMBRE_POR_DEFECTO } from "@/lib/pagina-publica/portada";
import { CLASE_AYUDA, CLASE_ETIQUETA } from "./estilos";
import { SelectorDeVariante } from "./selector-de-variante";
import { SubirFoto } from "./subir-foto";

interface EditorDePortadaProps {
  borrador: Borrador;
  onBorrador: (parcial: Partial<Borrador>) => void;
}

// EditorDePortada (Fase 4.4; variantes desde PE-3) — la foto de portada, su
// variante de layout y, si hay foto, el nombre de la clínica encima con un
// color a elección. El color es de ESE nombre y de ningún otro texto de la
// página; y solo rige mientras el nombre está sobre la foto (debajo de ella,
// sobre el fondo del tema, un color pensado para una foto —blanco, por
// ejemplo— podría no leerse).
//
// La variante vive en `temaTokens.portada` (ver tokens.ts en el paquete) y,
// a diferencia del resto de los tokens, rige también sin tema elegido.
export function EditorDePortada({ borrador, onBorrador }: EditorDePortadaProps) {
  const hayFoto = borrador.fotoPortadaUrl !== "";
  const variante = resolverTokens(undefined, borrador.temaTokens).portada;
  // En "fondo" el nombre va SIEMPRE sobre la foto; en "centrada", solo si se
  // pide. "dividida" y "mínima" nunca lo ponen encima.
  const sobreLaFoto = hayFoto && (variante === "fondo" || (variante === "centrada" && borrador.nombreSobrePortada));
  const colorElegido = borrador.nombreColor || COLOR_NOMBRE_POR_DEFECTO;

  function elegirVariante(id: string) {
    const tokens: TokensTema = { ...borrador.temaTokens };
    if (id === "centrada") delete tokens.portada;
    else tokens.portada = id as TokensTema["portada"];
    onBorrador({ temaTokens: tokens });
  }

  return (
    <div className="flex flex-col gap-4">
      <SubirFoto
        etiqueta="foto de portada"
        url={borrador.fotoPortadaUrl}
        onSubida={(url) => onBorrador({ fotoPortadaUrl: url })}
        onQuitar={() => onBorrador({ fotoPortadaUrl: "" })}
      />

      <SelectorDeVariante etiqueta="Diseño de la portada" variantes={VARIANTES_PORTADA} elegida={variante} onElegir={elegirVariante} />
      {!hayFoto && (variante === "dividida" || variante === "fondo") && (
        <p className={CLASE_AYUDA}>Este diseño usa la foto de portada: mientras no haya una, la portada se ve centrada.</p>
      )}

      {variante === "centrada" && (
        <label className="flex items-start gap-2 text-sm text-grafito">
          <input
            type="checkbox"
            className="mt-1"
            checked={hayFoto && borrador.nombreSobrePortada}
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
      )}

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
