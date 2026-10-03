"use client";

import {
  campoPorId,
  camposDeZona,
  COLORES_DE_FIGURA,
  estaVacio,
  MARCA_DE_ZONA,
  seccionDelCampo,
  TAMANO_BASE,
  type Figura,
  type OdontogramaDeLamina,
  type Plantilla,
  type Valores,
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
  /** Lo cargado: dice si un odontograma está vacío (sus figuras no
   *  dicen de qué campo son). */
  valores?: Valores;
}

/** Los guiones de una prótesis removible, en puntos: los mismos del PDF
 *  (`guionesDeRemovible`, Go). Una línea continua lleva los extremos
 *  redondos como allá; la discontinua no, o taparían los huecos. */
const GUIONES_DE_REMOVIBLE = "3 2";

const puntosSvg = (puntos: [number, number][]) => puntos.map((p) => p.join(",")).join(" ");

/** Una figura del odontograma, en puntos del papel, tal cual llega: la
 *  composición es del paquete (armarFiguras) o la congelada de la API. */
function FiguraSvg({ figura: f }: { figura: Figura }) {
  switch (f.tipo) {
    case "poligono":
      return <polygon points={puntosSvg(f.puntos)} fill={COLORES_DE_FIGURA[f.relleno]} />;
    case "contorno":
      return <polygon points={puntosSvg(f.puntos)} fill="none" stroke={COLORES_DE_FIGURA[f.color]} strokeWidth={f.grosor} />;
    case "linea":
      return (
        <line
          x1={f.desde[0]}
          y1={f.desde[1]}
          x2={f.hasta[0]}
          y2={f.hasta[1]}
          stroke={COLORES_DE_FIGURA[f.color]}
          strokeWidth={f.grosor}
          strokeLinecap={f.discontinua ? undefined : "round"}
          strokeDasharray={f.discontinua ? GUIONES_DE_REMOVIBLE : undefined}
        />
      );
    case "circulo":
      return <circle cx={f.centro[0]} cy={f.centro[1]} r={f.radio} fill="none" stroke={COLORES_DE_FIGURA[f.color]} strokeWidth={f.grosor} />;
    case "texto":
      return (
        <text x={f.x} y={f.y} fontSize={f.tamano} fill={COLORES_DE_FIGURA[f.color]} style={{ whiteSpace: "pre" }}>
          {f.texto}
        </text>
      );
  }
}

/** La caja que envuelve los recuadros de un odontograma, en puntos. */
function cajaDeOdontograma(o: OdontogramaDeLamina) {
  const x = Math.min(...o.piezas.map((p) => p.x));
  const y = Math.min(...o.piezas.map((p) => p.y));
  const ancho = Math.max(...o.piezas.map((p) => p.x + p.lado)) - x;
  const alto = Math.max(...o.piezas.map((p) => p.y + p.lado)) - y;
  return { x, y, ancho, alto };
}

/** La caja de "Cantidad de dientes existentes": como una zona de un
 *  renglón, desde la altura de las cifras hasta la línea de base. */
function cajaDeExistentes(e: NonNullable<OdontogramaDeLamina["existentes"]>) {
  const tamano = e.tamano ?? TAMANO_BASE;
  return { x: e.x - 1, y: e.y - tamano * 0.8, ancho: e.ancho + 2, alto: tamano * 1.05 };
}

/** Las páginas con las que se puede dibujar la lámina de una plantilla, o
 *  null si no tiene lámina o su original no está renderizado (entonces se
 *  muestra el calco). */
export function paginasDeLaLamina(plantilla: Plantilla | undefined): PaginaOriginal[] | null {
  if (!plantilla?.lamina) return null;
  const paginas = paginasDelOriginal(plantilla.id, plantilla.version);
  return paginas.length === plantilla.lamina.paginas.length ? paginas : null;
}

const PARTES: Record<string, string> = { dia: "día", mes: "mes", mes_nombre: "mes", anio: "año", anio2: "año" };

const SI_NO: Record<string, string> = { si: "Sí", no: "No" };

/** Cómo se nombra una zona: su campo; si es una parte de una fecha
 *  ("___/___/___"), su sección y la parte ("Próxima consulta (mes)"); y si
 *  es la casilla de una opción, el campo y la opción ("Consentimiento:
 *  No consiento"). */
function etiquetaDeZona(plantilla: Plantilla, zona: Zona): string {
  const [marca] = [...zona.texto.matchAll(MARCA_DE_ZONA)].filter((m) => m[1] !== "sistema.fecha");
  const campo = marca ? campoPorId(plantilla, marca[1]) : undefined;
  const etiqueta = campo?.etiqueta ?? zona.id;
  if (marca?.[3]) {
    const opcion = campo && "opciones" in campo ? campo.opciones.find((o) => o.valor === marca[3])?.etiqueta : SI_NO[marca[3]];
    return `${etiqueta}: ${opcion ?? marca[3]}`;
  }
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

const sinExistentes = (v: unknown) => typeof v !== "object" || v === null || !("existentes" in v);

interface Caja {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Un dato de la hoja que lleva a su campo: lo vacío se ve teñido; lo
 *  activo, marcado; lo que no entra o está mal, en terracota. */
function BotonDeZona({
  datos,
  nombre,
  caja,
  medidas,
  estado,
  onElegir,
}: {
  datos: Record<`data-${string}`, string>;
  nombre: string;
  caja: Caja;
  medidas: { ancho: number; alto: number };
  estado: { conError: boolean; activo: boolean; vacia: boolean };
  onElegir: () => void;
}) {
  return (
    <button
      {...datos}
      type="button"
      aria-label={`Completar: ${nombre}`}
      title={nombre}
      onClick={onElegir}
      style={{
        left: porcentaje(caja.x, medidas.ancho),
        top: porcentaje(caja.y, medidas.alto),
        width: porcentaje(caja.ancho, medidas.ancho),
        height: porcentaje(caja.alto, medidas.alto),
      }}
      className={`absolute rounded-[2px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-salvia-oscuro ${
        estado.conError
          ? "bg-terracota/15 ring-1 ring-terracota-oscuro"
          : estado.activo
            ? "bg-salvia/20 ring-1 ring-salvia-oscuro"
            : estado.vacia
              ? "bg-salvia/15 hover:bg-salvia/25"
              : "hover:bg-salvia/10"
      }`}
    />
  );
}

export function LaminaDocumento({
  plantilla,
  paginas,
  zonas,
  figuras = [],
  editable,
  firmas = [],
  etiqueta,
  paraImprimir = false,
}: {
  plantilla: Plantilla;
  paginas: PaginaOriginal[];
  zonas: ZonaCompuesta[];
  /** Lo dibujado en el odontograma: en un borrador, lo que arma la
   *  pantalla en vivo; desde "a firmar", lo congelado. */
  figuras?: Figura[];
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
              {figuras
                .filter((f) => f.pagina === numero)
                .map((f, j) => (
                  <FiguraSvg key={`figura-${j}`} figura={f} />
                ))}
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
                  const nombre = etiquetaDeZona(plantilla, zona);
                  return (
                    <BotonDeZona
                      key={zona.id}
                      datos={{ "data-zona": zona.id }}
                      nombre={nombre}
                      caja={cajaDeZona(zona)}
                      medidas={medidas}
                      estado={{
                        conError: Boolean(compuesta?.desborda) || campos.some((c) => editable.errores[c]),
                        activo: editable.campoActivo !== null && campos.includes(editable.campoActivo),
                        vacia: compuesta?.vacia ?? true,
                      }}
                      onElegir={() => editable.onElegir(campos[0])}
                    />
                  );
                })}
            {editable &&
              (lamina.odontogramas ?? [])
                .filter((o) => o.pagina === numero)
                .flatMap((o) => {
                  const campo = campoPorId(plantilla, o.campo);
                  const nombre = campo?.etiqueta ?? o.campo;
                  const estado = {
                    conError: Boolean(editable.errores[o.campo]),
                    activo: editable.campoActivo === o.campo,
                    vacia: campo && editable.valores ? estaVacio(campo, editable.valores[o.campo]) : false,
                  };
                  const elegir = () => editable.onElegir(o.campo);
                  const botones = [
                    <BotonDeZona
                      key={o.campo}
                      datos={{ "data-odontograma": o.campo }}
                      nombre={nombre}
                      caja={cajaDeOdontograma(o)}
                      medidas={medidas}
                      estado={estado}
                      onElegir={elegir}
                    />,
                  ];
                  if (o.existentes) {
                    botones.push(
                      <BotonDeZona
                        key={`${o.campo}-existentes`}
                        datos={{ "data-odontograma": `${o.campo}-existentes` }}
                        nombre={`${nombre}: cantidad de dientes existentes`}
                        caja={cajaDeExistentes(o.existentes)}
                        medidas={medidas}
                        estado={{ ...estado, vacia: editable.valores ? sinExistentes(editable.valores[o.campo]) : false }}
                        onElegir={elegir}
                      />,
                    );
                  }
                  return botones;
                })}
          </figure>
        );
      })}
    </div>
  );
}
