"use client";

import type { ReactNode } from "react";
import { ETIQUETAS_TOKENS, OPCIONES_TOKENS, resolverTokens, type ClaveToken, type TokensTema } from "@dental-mirage/prisma-engine";
import { PALETAS_PAGINA_PUBLICA, TIPOGRAFIAS_POR_TEMA, paletaPorId, tipografiaPorId } from "@/lib/temas-pagina-publica";
import { CLASE_AYUDA, CLASE_BOTON, CLASE_ETIQUETA } from "./estilos";

export interface EleccionDeTema {
  tema: string;
  temaVariante: string;
  temaTipografia: string;
  temaTokens: TokensTema;
}

interface SelectorDeTemaProps extends EleccionDeTema {
  onCambio: (eleccion: Partial<EleccionDeTema>) => void;
}

const CLASE_OPCION = "rounded-card border-[0.5px] p-3 text-left text-sm transition-colors";
const CLASE_ELEGIDA = "border-salvia-oscuro bg-salvia-claro";
const CLASE_NO_ELEGIDA = "border-arena bg-marfil hover:border-salvia";
const CLASE_PASTILLA = "rounded-full border-[0.5px] px-3 py-1.5 text-xs";

// Los tokens de estilo que se editan acá, por grupo (PE-2). `portada` no: es
// de layout y se elige en la fila "Portada" de la pestaña Módulos.
const FORMA_Y_ESPACIO: ClaveToken[] = ["forma", "densidad", "superficie", "boton", "botonEstilo", "menu"];

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t-[0.5px] border-arena pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-grafito">{titulo}</h3>
      {children}
    </section>
  );
}

// SelectorDeTema (Fase 4.4; tokens desde PE-2) — el tema es un paquete
// cerrado (paleta + tipografías + tokens por defecto) y adentro solo se elige
// entre opciones ya resueltas: nunca un color libre, una fuente propia ni un
// número (decisión #5 del documento de definición). "Original" es la piel
// celeste de siempre — quien no elige un tema no ve cambiar su página, y por
// eso sin tema no se ofrecen tokens.
export function SelectorDeTema({ tema, temaVariante, temaTipografia, temaTokens, onCambio }: SelectorDeTemaProps) {
  const paleta = paletaPorId(tema);
  const tipografiasDelTema = paleta ? TIPOGRAFIAS_POR_TEMA[paleta.id] : [];
  const vigentes = resolverTokens(paleta?.tokens, temaTokens);
  const hayOverrides = FORMA_Y_ESPACIO.some((k) => temaTokens[k] !== undefined) || temaTokens.fondo !== undefined;

  // Un tema nuevo arranca con su primera variante, su primera tipografía y
  // SUS tokens: los overrides del tema anterior se descartan (fueron elegidos
  // para otro tema). La portada se conserva: es layout, no estilo.
  function soloPortada(): TokensTema {
    return {
      ...(temaTokens.portada ? { portada: temaTokens.portada } : {}),
      ...(temaTokens.movimiento ? { movimiento: temaTokens.movimiento } : {}),
      ...(temaTokens.fondoAnimado ? { fondoAnimado: temaTokens.fondoAnimado } : {}),
    };
  }

  function elegirTema(id: string) {
    const nueva = paletaPorId(id);
    if (!nueva) {
      onCambio({ tema: "", temaVariante: "", temaTipografia: "", temaTokens: soloPortada() });
      return;
    }
    onCambio({ tema: nueva.id, temaVariante: nueva.variantes[0].id, temaTipografia: TIPOGRAFIAS_POR_TEMA[nueva.id][0], temaTokens: soloPortada() });
  }

  function elegirToken(clave: ClaveToken, valor: string) {
    const siguiente: Record<string, string> = { ...(temaTokens as Record<string, string>) };
    // Elegir el valor que ya trae el tema saca el override: así, si después
    // el tema cambia su default, esta página lo sigue.
    if (paleta && resolverTokens(paleta.tokens, {})[clave] === valor) delete siguiente[clave];
    else siguiente[clave] = valor;
    onCambio({ temaTokens: siguiente as TokensTema });
  }

  // Una función que devuelve JSX y no un componente anidado: un componente
  // definido dentro del render se recrea en cada render y React lo remonta.
  function selectorDeToken(clave: ClaveToken) {
    const { titulo, opciones } = ETIQUETAS_TOKENS[clave];
    return (
      <fieldset key={clave} className="flex flex-col gap-2">
        <legend className={CLASE_ETIQUETA}>{titulo}</legend>
        <div role="radiogroup" aria-label={titulo} className="flex flex-wrap gap-2">
          {OPCIONES_TOKENS[clave].map((valor) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={vigentes[clave] === valor}
              onClick={() => elegirToken(clave, valor)}
              className={`${CLASE_PASTILLA} ${vigentes[clave] === valor ? CLASE_ELEGIDA : CLASE_NO_ELEGIDA}`}
            >
              {(opciones as Record<string, string>)[valor]}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Grupo titulo="Movimiento">
        {selectorDeToken("movimiento")}
        {selectorDeToken("fondoAnimado")}
        <p className={CLASE_AYUDA}>Las animaciones se detienen si el visitante prefiere movimiento reducido.</p>
      </Grupo>
      <Grupo titulo="Colores">
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
                    <span className="h-3 w-3 rounded-full border-[0.5px] border-grafito/20" style={{ background: p.fondoBase }} />
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
                  onClick={() => onCambio({ temaVariante: v.id })}
                  className={`flex items-center gap-2 ${CLASE_PASTILLA} ${v.id === temaVariante ? CLASE_ELEGIDA : CLASE_NO_ELEGIDA}`}
                >
                  <span aria-hidden="true" className="h-4 w-4 rounded-full border-[0.5px] border-grafito/20" style={{ background: v.hex }} />
                  {v.nombre}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </Grupo>

      {paleta && (
        <>
          <Grupo titulo="Tipografía">
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
                    onClick={() => onCambio({ temaTipografia: id })}
                    className={`${CLASE_OPCION} ${id === temaTipografia ? CLASE_ELEGIDA : CLASE_NO_ELEGIDA}`}
                  >
                    <span className="block font-medium text-grafito">{t.nombre}</span>
                    <span className={CLASE_AYUDA}>{t.descripcion}</span>
                  </button>
                );
              })}
            </div>
          </Grupo>

          <Grupo titulo="Forma y espacio">
            {FORMA_Y_ESPACIO.map((clave) => selectorDeToken(clave))}
          </Grupo>

          <Grupo titulo="Fondo">
            {selectorDeToken("fondo")}
          </Grupo>

          {hayOverrides && (
            <button type="button" onClick={() => onCambio({ temaTokens: soloPortada() })} className={`${CLASE_BOTON} self-start`}>
              Volver a los valores del tema
            </button>
          )}
        </>
      )}
    </div>
  );
}
