"use client";

import {
  campoPorId,
  camposDeZona,
  MARCA_DE_ZONA,
  seccionDelCampo,
  TAMANO_BASE,
  type Plantilla,
  type Zona,
  type ZonaCompuesta,
} from "@dental-mirage/documentos-clinicos";
import type { TrazoDeFirma } from "@dental-mirage/shared-types";
import { paginasDelOriginal, type PaginaOriginal } from "@/lib/documentos-originales";
import { FAMILIA_DE_LAMINA, fuenteDeLamina } from "@/lib/documentos-fuente";
import { caminoDelTrazo } from "./trazo-de-firma";

// LaminaDocumento — el documento como se completa, se firma y se sella: la
// página original del Colegio con lo cargado escrito sobre sus renglones
// (TR-187, pedido del cliente del 2026-09-28: "debe ser igual en todos los
// aspectos, porque este es el documento que se guardará y se generará el
// PDF").
//
// La página es la imagen del PDF; lo escrito es un SVG encima, en las
// mismas coordenadas del PDF (puntos). Lo que se dibuja es la COMPOSICIÓN
// del paquete de documentos: en un borrador, la que arma la pantalla en
// vivo; desde "a firmar", la que congeló la API. Nunca se recompone lo
// congelado.
//
// En un borrador, cada zona es un botón que lleva a su campo (el mismo
// criterio que el calco y que el editor de la página, TR-173): lo vacío se
// ve teñido; lo activo, marcado; lo que no entra, en terracota.

/** La tinta de lo escrito: casi negra, como un documento impreso. */
const TINTA = "#16181d";

export interface FirmaEnLamina {
  rol: string;
  nombre: string;
  trazo: TrazoDeFirma;
}

interface Editable {
  campoActivo: string | null;
  errores: Record<string, string>;
  onElegir: (campoId: string) => void;
}

/** Las páginas con las que se puede dibujar la lámina de una plantilla, o
 *  null si no tiene lámina o su original no está renderizado (entonces se
 *  muestra el calco). */
export function paginasDeLaLamina(plantilla: Plantilla | undefined): PaginaOriginal[] | null {
  if (!plantilla?.lamina) return null;
  const paginas = paginasDelOriginal(plantilla.id, plantilla.version);
  return paginas.length === plantilla.lamina.paginas.length ? paginas : null;
}

const PARTES: Record<string, string> = { dia: "día", mes: "mes", anio: "año", anio2: "año" };

/** Cómo se nombra una zona: su campo, o —si es una parte de una fecha
 *  ("___/___/___")— su sección y la parte ("Próxima consulta (mes)"). */
function etiquetaDeZona(plantilla: Plantilla, zona: Zona): string {
  const [marca] = [...zona.texto.matchAll(MARCA_DE_ZONA)].filter((m) => m[1] !== "sistema.fecha");
  const etiqueta = (marca && campoPorId(plantilla, marca[1])?.etiqueta) ?? zona.id;
  if (!marca?.[2]) return etiqueta;
  return `${seccionDelCampo(plantilla, marca[1])?.titulo ?? etiqueta} (${PARTES[marca[2]]})`;
}

/** El recuadro tocable de una zona, en puntos: de la altura de las
 *  mayúsculas a la línea del papel, sin tocar el renglón de arriba ni el
 *  de abajo (el papel deja 12 pt entre renglones). */
function cajaDeZona(zona: Zona) {
  const base = zona.tamano ?? TAMANO_BASE;
  const interlineado = zona.interlineado ?? base * 1.2;
  return { x: zona.x - 1, y: zona.y - base * 0.8, ancho: zona.ancho + 2, alto: ((zona.lineas ?? 1) - 1) * interlineado + base * 1.05 };
}

/** El recuadro del trazo de una firma, con un margen: la firma se ajusta a
 *  su línea del papel por lo que se dibujó, no por el lienzo vacío que la
 *  rodeaba. */
function recuadroDelTrazo(trazo: TrazoDeFirma) {
  const puntos = trazo.trazos.flat();
  if (puntos.length === 0) return { x: 0, y: 0, ancho: trazo.ancho, alto: trazo.alto };
  const xs = puntos.map((p) => p[0]);
  const ys = puntos.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const ancho = Math.max(Math.max(...xs) - x, 1);
  const alto = Math.max(Math.max(...ys) - y, 1);
  const margen = Math.max(ancho, alto) * 0.06 + 2;
  return { x: x - margen, y: y - margen, ancho: ancho + 2 * margen, alto: alto + 2 * margen };
}

/** El grosor de la línea de una firma, en puntos del papel: el de una
 *  birome. */
const GROSOR_DE_FIRMA = 0.9;

function porcentaje(valor: number, total: number): string {
  return `${(valor / total) * 100}%`;
}

export function LaminaDocumento({
  plantilla,
  paginas,
  zonas,
  editable,
  firmas = [],
  etiqueta,
  paraImprimir = false,
}: {
  plantilla: Plantilla;
  paginas: PaginaOriginal[];
  zonas: ZonaCompuesta[];
  editable?: Editable;
  firmas?: FirmaEnLamina[];
  /** Cómo se nombra la hoja ("Tu documento", "Documento sellado"). */
  etiqueta: string;
  /** Cada página a su tamaño de papel exacto, con la imagen de 300 dpi y
   *  un salto de página entre una y otra (ImpresionDelDocumento, TR-188). */
  paraImprimir?: boolean;
}) {
  const lamina = plantilla.lamina!;
  const compuestaDe = new Map(zonas.map((z) => [z.zona, z]));

  return (
    <div className={`${fuenteDeLamina.variable} flex flex-col ${paraImprimir ? "" : "gap-4"}`}>
      {lamina.paginas.map((medidas, i) => {
        const numero = i + 1;
        const imagen = paginas[i];
        const escritas = zonas.filter((z) => z.pagina === numero);
        const firmadas = lamina.firmas.filter((f) => f.pagina === numero);
        return (
          <figure
            key={numero}
            aria-label={`${etiqueta}${lamina.paginas.length > 1 ? `, página ${numero} de ${lamina.paginas.length}` : ""}`}
            className={
              paraImprimir
                ? "relative m-0 overflow-hidden bg-white"
                : "relative w-full overflow-hidden rounded-[4px] border border-linea bg-white shadow-soft"
            }
            style={
              paraImprimir
                ? {
                    // Las medidas de la lámina están en puntos del PDF: la hoja
                    // sale del tamaño del papel original, sin escalar.
                    width: `${medidas.ancho}pt`,
                    height: `${medidas.alto}pt`,
                    breakAfter: numero < lamina.paginas.length ? "page" : "auto",
                  }
                : { aspectRatio: `${medidas.ancho} / ${medidas.alto}` }
            }
          >
            {/* Un <img> y no next/image: archivos estáticos ya en su tamaño. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={paraImprimir ? imagen.srcImpresion : imagen.src}
              srcSet={paraImprimir ? undefined : imagen.srcSet}
              sizes={paraImprimir ? undefined : "(min-width: 1024px) 60vw, 100vw"}
              width={imagen.ancho}
              height={imagen.alto}
              loading={numero === 1 || paraImprimir ? "eager" : "lazy"}
              alt=""
              className="absolute inset-0 h-full w-full select-none"
              draggable={false}
            />
            <svg
              viewBox={`0 0 ${medidas.ancho} ${medidas.alto}`}
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{ fontFamily: FAMILIA_DE_LAMINA, fontKerning: "none" }}
            >
              {escritas.flatMap((z) =>
                z.lineas.map((l, j) => (
                  <text key={`${z.zona}-${j}`} x={l.x} y={l.y} fontSize={z.tamano} fill={TINTA} style={{ whiteSpace: "pre" }}>
                    {l.texto}
                  </text>
                )),
              )}
              {firmadas.map((lugar) => {
                const firma = firmas.find((f) => f.rol === lugar.rol);
                if (!firma) return null;
                const r = recuadroDelTrazo(firma.trazo);
                const escala = Math.min(lugar.ancho / r.ancho, lugar.alto / r.alto);
                return (
                  <svg
                    key={lugar.rol}
                    x={lugar.x}
                    y={lugar.y - lugar.alto}
                    width={lugar.ancho}
                    height={lugar.alto}
                    viewBox={`${r.x} ${r.y} ${r.ancho} ${r.alto}`}
                    preserveAspectRatio="xMidYMax meet"
                    role="img"
                    aria-label={`Firma de ${firma.nombre}`}
                  >
                    {firma.trazo.trazos.map((puntos, k) => (
                      <path
                        key={k}
                        d={caminoDelTrazo(puntos)}
                        fill="none"
                        stroke={TINTA}
                        strokeWidth={GROSOR_DE_FIRMA / escala}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </svg>
                );
              })}
            </svg>

            {editable &&
              lamina.zonas
                .filter((z) => z.pagina === numero)
                .map((zona) => {
                  const campos = camposDeZona(zona);
                  if (campos.length === 0) return null;
                  const compuesta = compuestaDe.get(zona.id);
                  const activo = editable.campoActivo !== null && campos.includes(editable.campoActivo);
                  const conError = Boolean(compuesta?.desborda) || campos.some((c) => editable.errores[c]);
                  const vacia = compuesta?.vacia ?? true;
                  const caja = cajaDeZona(zona);
                  const nombre = etiquetaDeZona(plantilla, zona);
                  return (
                    <button
                      key={zona.id}
                      type="button"
                      data-zona={zona.id}
                      aria-label={`Completar: ${nombre}`}
                      title={nombre}
                      onClick={() => editable.onElegir(campos[0])}
                      style={{
                        left: porcentaje(caja.x, medidas.ancho),
                        top: porcentaje(caja.y, medidas.alto),
                        width: porcentaje(caja.ancho, medidas.ancho),
                        height: porcentaje(caja.alto, medidas.alto),
                      }}
                      className={`absolute rounded-[2px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-salvia-oscuro ${
                        conError
                          ? "bg-terracota/15 ring-1 ring-terracota-oscuro"
                          : activo
                            ? "bg-salvia/20 ring-1 ring-salvia-oscuro"
                            : vacia
                              ? "bg-salvia/15 hover:bg-salvia/25"
                              : "hover:bg-salvia/10"
                      }`}
                    />
                  );
                })}
          </figure>
        );
      })}
    </div>
  );
}
