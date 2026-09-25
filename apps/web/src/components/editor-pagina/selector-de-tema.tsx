"use client";

import type { ReactNode } from "react";
import { ETIQUETAS_TOKENS, OPCIONES_TOKENS, resolverTokens, type ClaveToken, type TokensTema } from "@dental-mirage/prisma-engine";
import { PALETAS_PAGINA_PUBLICA, TIPOGRAFIAS_POR_TEMA, paletaPorId, tipografiaPorId } from "@/lib/temas-pagina-publica";
import { CLASE_AYUDA, CLASE_BOTON, CLASE_PASTILLA, CLASE_TARJETA_OPCION, claseDeEleccion } from "./estilos";
import { GrupoDeOpciones } from "./grupo-de-opciones";

export interface EleccionDeTema {
  tema: string;
  temaVariante: string;
  temaTipografia: string;
  temaTokens: TokensTema;
}

interface SelectorDeTemaProps extends EleccionDeTema {
  onCambio: (eleccion: Partial<EleccionDeTema>) => void;
}

const clasePastilla = (elegida: boolean) => `${CLASE_PASTILLA} ${claseDeEleccion(elegida)}`;
const claseTarjeta = (elegida: boolean) => `${CLASE_TARJETA_OPCION} ${claseDeEleccion(elegida)}`;

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
      <GrupoDeOpciones
        key={clave}
        etiqueta={titulo}
        valor={vigentes[clave] ?? ""}
        onCambio={(valor) => elegirToken(clave, valor)}
        opciones={OPCIONES_TOKENS[clave].map((valor) => ({ valor, contenido: (opciones as Record<string, string>)[valor] }))}
        className="flex flex-wrap gap-2"
        claseOpcion={clasePastilla}
      />
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
        <GrupoDeOpciones
          etiqueta="Tema"
          valor={paleta ? paleta.id : ""}
          onCambio={elegirTema}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          claseOpcion={claseTarjeta}
          opciones={[
            {
              valor: "",
              contenido: (
                <>
                  <span className="block font-medium text-grafito">Original</span>
                  <span className={CLASE_AYUDA}>El celeste de siempre.</span>
                </>
              ),
            },
            ...PALETAS_PAGINA_PUBLICA.map((p) => ({
              valor: p.id,
              contenido: (
                <>
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
                </>
              ),
            })),
          ]}
        />

        {paleta && (
          <GrupoDeOpciones
            etiqueta="Color"
            valor={temaVariante}
            onCambio={(id) => onCambio({ temaVariante: id })}
            className="flex flex-wrap gap-2"
            claseOpcion={(elegida) => `flex items-center gap-2 ${clasePastilla(elegida)}`}
            opciones={paleta.variantes.map((v) => ({
              valor: v.id,
              contenido: (
                <>
                  <span aria-hidden="true" className="h-4 w-4 rounded-full border-[0.5px] border-grafito/20" style={{ background: v.hex }} />
                  {v.nombre}
                </>
              ),
            }))}
          />
        )}
      </Grupo>

      {paleta && (
        <>
          <Grupo titulo="Tipografía">
            <GrupoDeOpciones
              etiqueta="Tipografía"
              etiquetaOculta
              valor={temaTipografia}
              onCambio={(id) => onCambio({ temaTipografia: id })}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              claseOpcion={claseTarjeta}
              opciones={tipografiasDelTema.flatMap((id) => {
                const t = tipografiaPorId(id);
                if (!t) return [];
                return [
                  {
                    valor: id,
                    contenido: (
                      <>
                        <span className="block font-medium text-grafito">{t.nombre}</span>
                        <span className={CLASE_AYUDA}>{t.descripcion}</span>
                      </>
                    ),
                  },
                ];
              })}
            />
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
