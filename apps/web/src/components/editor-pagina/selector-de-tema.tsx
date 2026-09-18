"use client";

import { PALETAS_PAGINA_PUBLICA, TIPOGRAFIAS_POR_TEMA, paletaPorId, tipografiaPorId } from "@/lib/temas-pagina-publica";
import { CLASE_AYUDA, CLASE_ETIQUETA } from "./estilos";

export interface EleccionDeTema {
  tema: string;
  temaVariante: string;
  temaTipografia: string;
}

interface SelectorDeTemaProps extends EleccionDeTema {
  onCambio: (eleccion: EleccionDeTema) => void;
}

const CLASE_OPCION = "rounded-card border-[0.5px] p-3 text-left text-sm transition-colors";
const CLASE_ELEGIDA = "border-salvia-oscuro bg-salvia-claro";
const CLASE_NO_ELEGIDA = "border-arena bg-marfil hover:border-salvia";

// SelectorDeTema (Fase 4.4) — el tema es un paquete cerrado (paleta +
// tipografías) y adentro solo se elige entre opciones ya resueltas: nunca un
// color libre ni una fuente propia (decisión #5 del documento de definición).
// "Original" es la piel celeste de siempre — quien no elige un tema no ve
// cambiar su página.
export function SelectorDeTema({ tema, temaVariante, temaTipografia, onCambio }: SelectorDeTemaProps) {
  const paleta = paletaPorId(tema);
  const tipografiasDelTema = paleta ? TIPOGRAFIAS_POR_TEMA[paleta.id] : [];

  function elegirTema(id: string) {
    const nueva = paletaPorId(id);
    if (!nueva) {
      onCambio({ tema: "", temaVariante: "", temaTipografia: "" });
      return;
    }
    // Un tema nuevo arranca con su primera variante y su primera tipografía:
    // la variante del tema anterior no existe en el nuevo.
    onCambio({ tema: nueva.id, temaVariante: nueva.variantes[0].id, temaTipografia: TIPOGRAFIAS_POR_TEMA[nueva.id][0] });
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className={CLASE_ETIQUETA}>Tema</legend>
        <div role="radiogroup" aria-label="Tema de la página" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            role="radio"
            aria-checked={!paleta}
            onClick={() => elegirTema("")}
            className={`${CLASE_OPCION} ${!paleta ? CLASE_ELEGIDA : CLASE_NO_ELEGIDA}`}
          >
            <span className="block font-medium text-grafito">Original</span>
            <span className={CLASE_AYUDA}>El celeste de siempre.</span>
          </button>
          {PALETAS_PAGINA_PUBLICA.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === tema}
              onClick={() => elegirTema(p.id)}
              className={`${CLASE_OPCION} ${p.id === tema ? CLASE_ELEGIDA : CLASE_NO_ELEGIDA}`}
            >
              <span className="flex items-center gap-1.5">
                <span className="font-medium text-grafito">{p.nombre}</span>
                <span aria-hidden="true" className="ml-auto flex gap-1">
                  {p.variantes.map((v) => (
                    <span key={v.id} className="h-3 w-3 rounded-full border-[0.5px] border-grafito/20" style={{ background: v.hex }} />
                  ))}
                </span>
              </span>
              <span className={`${CLASE_AYUDA} mt-1 block`}>{p.descripcion}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {paleta && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className={CLASE_ETIQUETA}>Color</legend>
            <div role="radiogroup" aria-label="Variante de color" className="flex flex-wrap gap-2">
              {paleta.variantes.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={v.id === temaVariante}
                  aria-label={v.nombre}
                  title={v.nombre}
                  onClick={() => onCambio({ tema, temaVariante: v.id, temaTipografia })}
                  className={`flex items-center gap-2 rounded-full border-[0.5px] px-3 py-1.5 text-xs ${
                    v.id === temaVariante ? CLASE_ELEGIDA : CLASE_NO_ELEGIDA
                  }`}
                >
                  <span aria-hidden="true" className="h-4 w-4 rounded-full border-[0.5px] border-grafito/20" style={{ background: v.hex }} />
                  {v.nombre}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className={CLASE_ETIQUETA}>Tipografía</legend>
            <div role="radiogroup" aria-label="Tipografía" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {tipografiasDelTema.map((id) => {
                const t = tipografiaPorId(id);
                if (!t) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={id === temaTipografia}
                    onClick={() => onCambio({ tema, temaVariante, temaTipografia: id })}
                    className={`${CLASE_OPCION} ${id === temaTipografia ? CLASE_ELEGIDA : CLASE_NO_ELEGIDA}`}
                  >
                    <span className="block font-medium text-grafito">{t.nombre}</span>
                    <span className={CLASE_AYUDA}>{t.descripcion}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </>
      )}
    </div>
  );
}
