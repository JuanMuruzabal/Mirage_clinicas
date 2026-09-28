import type { ReactNode } from "react";
import type { FirmaDeDocumento } from "@dental-mirage/shared-types";
import {
  campoPorId,
  segmentar,
  valorComoTexto,
  type BloqueArmado,
  type FirmaDePlantilla,
  type Plantilla,
  type Valores,
} from "@dental-mirage/documentos-clinicos";
import { fechaYHora } from "@/lib/documentos";
import { TrazoDeFirmaSvg } from "./trazo-de-firma";

// El calco de un documento: la hoja, como se va a leer (Fase 5.1, R6 del
// brief). Dos versiones con el mismo dibujo:
//
//   - CalcoEnVivo: un borrador. Se arma en la pantalla con la plantilla y
//     lo cargado, y cada dato es tocable (abre su campo en el sidebar). Lo
//     que falta se ve como un hueco con el nombre del dato.
//   - CalcoCongelado: desde "a firmar". Lee el texto que congeló la API
//     —el que se firma— y no vuelve a armar nada.

// Las familias del modelo del Colegio: Tahoma en el cuerpo y Times New
// Roman en los títulos. Son fuentes del sistema (Tahoma tiene licencia de
// Microsoft y no está en Google Fonts), así que van con reemplazos de
// métricas parecidas donde no estén instaladas. El calco se lee como el
// mismo documento; el original exacto está en "Así es el documento".
const FUENTE_DEL_MODELO = 'Tahoma, Verdana, "DejaVu Sans", "Segoe UI", sans-serif';
const FUENTE_TITULO_DEL_MODELO = '"Times New Roman", Times, "Liberation Serif", serif';

export function HojaDeDocumento({ children, pie }: { children: ReactNode; pie?: ReactNode }) {
  return (
    <article
      style={{ fontFamily: FUENTE_DEL_MODELO }}
      className="mx-auto w-full max-w-[46rem] rounded-card border border-linea bg-marfil px-[clamp(1.25rem,5vw,3.5rem)] py-[clamp(1.5rem,5vw,3rem)] text-[14.5px] leading-relaxed text-grafito shadow-soft"
    >
      {children}
      {pie && <div className="mt-8 border-t border-dashed border-linea pt-4 text-xs text-grafito/75">{pie}</div>}
    </article>
  );
}

function Titulo({ t, texto }: { t: "titulo" | "subtitulo"; texto: string }) {
  return t === "titulo" ? (
    <h2 style={{ fontFamily: FUENTE_TITULO_DEL_MODELO }} className="text-center text-[clamp(1.15rem,3.4vw,1.4rem)] font-bold text-grafito uppercase italic text-balance">
      {texto}
    </h2>
  ) : (
    <p style={{ fontFamily: FUENTE_TITULO_DEL_MODELO }} className="mb-2 text-center text-[clamp(1.15rem,3.4vw,1.4rem)] font-bold text-grafito uppercase italic">
      {texto}
    </p>
  );
}

// --- Las firmas ---------------------------------------------------------

function LineaDeFirma({ definicion, firma }: { definicion: FirmaDePlantilla; firma?: FirmaDeDocumento }) {
  return (
    <div className="flex flex-col">
      <div className="flex h-24 items-end justify-center">
        {firma ? (
          <TrazoDeFirmaSvg trazo={firma.trazo} titulo={`Firma de ${firma.nombre}`} className="h-full max-h-24 w-full text-grafito" />
        ) : (
          <span className="mb-2 text-xs text-grafito/60">Pendiente</span>
        )}
      </div>
      <div className="border-t border-grafito/70 pt-1.5 text-center text-[13px]">
        <p className="font-medium">{definicion.etiqueta}</p>
        {firma && (
          <p className="text-grafito/80">
            {firma.nombre}
            {firma.dni ? ` · DNI ${firma.dni}` : ""}
            {firma.enRepresentacion && firma.vinculo ? ` · en representación (${firma.vinculo})` : ""}
          </p>
        )}
        {firma && <p className="text-xs text-grafito/70">{fechaYHora(firma.firmadoEn)}</p>}
      </div>
    </div>
  );
}

export function BloqueDeFirmas({ definiciones, firmas = [] }: { definiciones: FirmaDePlantilla[]; firmas?: FirmaDeDocumento[] }) {
  return (
    <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
      {definiciones.map((d) => (
        <LineaDeFirma key={d.rol} definicion={d} firma={firmas.find((f) => f.rol === d.rol)} />
      ))}
    </div>
  );
}

// --- En vivo ------------------------------------------------------------

function DatoTocable({
  campoId,
  texto,
  vacio,
  etiqueta,
  activo,
  onElegir,
}: {
  campoId: string;
  texto: string;
  vacio: boolean;
  etiqueta: string;
  activo: boolean;
  onElegir?: (campoId: string) => void;
}) {
  const anillo = activo ? "ring-2 ring-salvia" : "";
  const clase = vacio
    ? `mx-0.5 inline rounded-sm border border-dashed border-terracota/70 bg-terracota-claro/40 px-1 text-[13px] text-terracota-oscuro ${anillo}`
    : `inline rounded-sm bg-salvia-claro/70 px-0.5 font-medium text-salvia-oscuro underline decoration-salvia/50 underline-offset-4 ${anillo}`;
  const contenido = vacio ? etiqueta : texto;
  if (!onElegir) return <span className={clase}>{contenido}</span>;
  return (
    <button
      type="button"
      onClick={() => onElegir(campoId)}
      aria-label={vacio ? `Completar: ${etiqueta}` : `${etiqueta}: ${texto}. Editar`}
      className={`${clase} cursor-pointer text-left align-baseline transition-colors hover:brightness-95`}
    >
      {contenido}
    </button>
  );
}

function TextoEnVivo({
  texto,
  plantilla,
  valores,
  hoy,
  campoActivo,
  onElegir,
}: {
  texto: string;
  plantilla: Plantilla;
  valores: Valores;
  hoy: string;
  campoActivo?: string | null;
  onElegir?: (campoId: string) => void;
}) {
  return (
    <>
      {segmentar(texto, plantilla, valores, { fecha: hoy }).map((s, i) => {
        if (s.tipo === "texto") return <span key={i}>{s.texto}</span>;
        if (s.campoId === "sistema.fecha") return <span key={i}>{s.texto}</span>;
        const campo = campoPorId(plantilla, s.campoId);
        return (
          <DatoTocable
            key={i}
            campoId={s.campoId}
            texto={s.texto}
            vacio={s.vacio}
            etiqueta={campo?.etiqueta ?? s.campoId}
            activo={campoActivo === s.campoId}
            onElegir={onElegir}
          />
        );
      })}
    </>
  );
}

export function CalcoEnVivo({
  plantilla,
  valores,
  hoy,
  campoActivo,
  onElegir,
}: {
  plantilla: Plantilla;
  valores: Valores;
  /** AAAA-MM-DD: lo que dice "Lugar y fecha" mientras es un borrador. */
  hoy: string;
  campoActivo?: string | null;
  onElegir?: (campoId: string) => void;
}) {
  return (
    <HojaDeDocumento pie={<>Modelo: {plantilla.fuente.nombre}.</>}>
      {plantilla.cuerpo.map((bloque, i) => {
        switch (bloque.t) {
          case "titulo":
          case "subtitulo":
            return <Titulo key={i} t={bloque.t} texto={bloque.texto} />;
          case "parrafo":
            return (
              <p key={i} className="mt-4 text-pretty">
                <TextoEnVivo texto={bloque.texto} plantilla={plantilla} valores={valores} hoy={hoy} campoActivo={campoActivo} onElegir={onElegir} />
              </p>
            );
          case "lista":
            return (
              <ul key={i} className="mt-3 list-disc space-y-1.5 pl-5 text-pretty">
                {bloque.items.map((item, j) => (
                  <li key={j}>
                    <TextoEnVivo texto={item} plantilla={plantilla} valores={valores} hoy={hoy} campoActivo={campoActivo} onElegir={onElegir} />
                  </li>
                ))}
              </ul>
            );
          case "campo": {
            const campo = campoPorId(plantilla, bloque.campo);
            if (!campo) return null;
            const texto = valorComoTexto(campo, valores[campo.id]);
            return (
              <div key={i} className="mt-4">
                <p className="font-bold underline underline-offset-2">{campo.etiqueta}:</p>
                <p className="mt-1 whitespace-pre-line">
                  <DatoTocable
                    campoId={campo.id}
                    texto={texto}
                    vacio={texto === ""}
                    etiqueta={campo.etiqueta}
                    activo={campoActivo === campo.id}
                    onElegir={onElegir}
                  />
                </p>
              </div>
            );
          }
          case "firmas":
            return <BloqueDeFirmas key={i} definiciones={plantilla.firmas} />;
        }
      })}
    </HojaDeDocumento>
  );
}

// --- Congelado ----------------------------------------------------------

export function CalcoCongelado({
  cuerpo,
  definiciones,
  firmas,
  pie,
}: {
  cuerpo: BloqueArmado[];
  definiciones: FirmaDePlantilla[];
  firmas: FirmaDeDocumento[];
  pie?: ReactNode;
}) {
  return (
    <HojaDeDocumento pie={pie}>
      {cuerpo.map((bloque, i) => {
        switch (bloque.t) {
          case "titulo":
          case "subtitulo":
            return <Titulo key={i} t={bloque.t} texto={bloque.texto} />;
          case "parrafo":
            return (
              <p key={i} className="mt-4 text-pretty">
                {bloque.texto}
              </p>
            );
          case "lista":
            return (
              <ul key={i} className="mt-3 list-disc space-y-1.5 pl-5 text-pretty">
                {bloque.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          case "campo":
            return (
              <div key={i} className="mt-4">
                <p className="font-bold underline underline-offset-2">{bloque.etiqueta}:</p>
                <p className="mt-1 whitespace-pre-line">{bloque.texto}</p>
              </div>
            );
          case "firmas":
            return <BloqueDeFirmas key={i} definiciones={definiciones} firmas={firmas} />;
        }
      })}
    </HojaDeDocumento>
  );
}
