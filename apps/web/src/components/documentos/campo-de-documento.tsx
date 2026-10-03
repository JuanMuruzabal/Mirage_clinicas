"use client";

import { useId } from "react";
import {
  PIEZAS_PERMANENTES,
  PIEZAS_TEMPORARIAS,
  type Campo,
  type RespuestaSiNo,
  type Valor,
} from "@dental-mirage/documentos-clinicos";
import { CampoOdontograma } from "./campo-odontograma";

// Un campo del documento en el sidebar del editor (Fase 5.1). Cada tipo de
// la plantilla tiene su control; el valor que devuelve es el que guarda la
// API (valores.ts del paquete): string, número, lista o {respuesta, detalle}.

const CLASE_CAMPO =
  "w-full rounded-field border border-linea bg-hueso px-3 py-2 text-[15px] text-grafito outline-none focus:border-salvia disabled:opacity-70";

const PILDORA = "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors";
const PILDORA_ELEGIDA = "border-salvia-oscuro bg-salvia-oscuro text-marfil";
const PILDORA_LIBRE = "border-linea bg-hueso text-grafito hover:border-salvia";

export function idDelCampo(campoId: string): string {
  return `campo-${campoId}`;
}

// --- Las piezas, en el orden del odontograma ---------------------------

function Arcada({
  arriba,
  abajo,
  elegidas,
  onAlternar,
  nombre,
}: {
  arriba: string[];
  abajo: string[];
  elegidas: Set<string>;
  onAlternar: (pieza: string) => void;
  nombre: string;
}) {
  const mitad = (fila: string[]) => [fila.slice(0, fila.length / 2), fila.slice(fila.length / 2)];
  const fila = (piezas: string[]) => (
    <div className="flex justify-center gap-2">
      {mitad(piezas).map((lado, i) => (
        <div key={i} className={`flex gap-1 ${i === 0 ? "border-r border-grafito/25 pr-2" : ""}`}>
          {lado.map((p) => {
            const elegida = elegidas.has(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={elegida}
                aria-label={`Pieza ${p}`}
                onClick={() => onAlternar(p)}
                className={`h-8 w-8 rounded-[6px] border font-[family-name:var(--font-mono)] text-[12px] tabular-nums transition-colors max-sm:h-7 max-sm:w-7 max-sm:text-[11px] ${
                  elegida ? "border-salvia-oscuro bg-salvia-oscuro text-marfil" : "border-linea bg-marfil text-grafito hover:border-salvia"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
  return (
    // min-w-0: un fieldset, por defecto, se estira al ancho de su contenido.
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1 text-xs font-medium tracking-wide text-grafito/75 uppercase">{nombre}</legend>
      {fila(arriba)}
      <div className="mx-auto w-full max-w-[26rem] border-t border-grafito/25" aria-hidden="true" />
      {fila(abajo)}
    </fieldset>
  );
}

export function SelectorDePiezas({
  denticion,
  valor,
  onCambio,
}: {
  denticion: "permanente" | "temporaria" | "ambas";
  valor: string[];
  onCambio: (piezas: string[]) => void;
}) {
  const elegidas = new Set(valor);
  function alternar(pieza: string) {
    onCambio(elegidas.has(pieza) ? valor.filter((p) => p !== pieza) : [...valor, pieza]);
  }
  const permanentes = [...PIEZAS_PERMANENTES];
  const temporarias = [...PIEZAS_TEMPORARIAS];
  // Dieciséis piezas por fila no entran en un celular: las arcadas se
  // desplazan de costado en su propia caja, y la sección no se ensancha
  // (pedido del cliente, 2026-09-28). Adentro, `w-max` + `mx-auto`: centradas
  // cuando entran y, cuando no, arrancando del borde — un `justify-center`
  // en el contenedor que scrollea dejaría las primeras piezas fuera de
  // alcance a la izquierda.
  return (
    <div data-scroll-piezas className="-mx-1 overflow-x-auto overscroll-x-contain pb-2">
      <div className="mx-auto flex w-max flex-col gap-4 px-1">
        {denticion !== "temporaria" && (
          <Arcada nombre="Permanentes" arriba={permanentes.slice(0, 16)} abajo={permanentes.slice(16)} elegidas={elegidas} onAlternar={alternar} />
        )}
        {denticion !== "permanente" && (
          <Arcada nombre="Temporarias" arriba={temporarias.slice(0, 10)} abajo={temporarias.slice(10)} elegidas={elegidas} onAlternar={alternar} />
        )}
      </div>
    </div>
  );
}

// --- Un campo ------------------------------------------------------------

function esRespuesta(v: unknown): v is RespuestaSiNo {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function Opciones({
  campo,
  elegidas,
  multiple,
  onElegir,
}: {
  campo: Extract<Campo, { tipo: "opcion_unica" | "opcion_multiple" }>;
  elegidas: string[];
  multiple: boolean;
  onElegir: (valor: string) => void;
}) {
  return (
    <div role={multiple ? "group" : "radiogroup"} aria-labelledby={`${idDelCampo(campo.id)}-etiqueta`} className="flex flex-wrap gap-2">
      {campo.opciones.map((o) => {
        const elegida = elegidas.includes(o.valor);
        return (
          <button
            key={o.valor}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={elegida}
            onClick={() => onElegir(o.valor)}
            className={`${PILDORA} ${elegida ? PILDORA_ELEGIDA : PILDORA_LIBRE}`}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

export function CampoDeDocumento({
  campo,
  valor,
  error,
  onCambio,
  odontogramaAbierto,
  onOdontogramaAbierto,
}: {
  campo: Campo;
  valor: unknown;
  error?: string;
  /** `undefined` borra el valor. */
  onCambio: (valor: Valor | undefined) => void;
  /** La pantalla emergente de un odontograma, cuando la maneja el editor. */
  odontogramaAbierto?: boolean;
  onOdontogramaAbierto?: (abierto: boolean) => void;
}) {
  const id = idDelCampo(campo.id);
  const idAyuda = useId();
  const describedBy = [campo.ayuda ? idAyuda : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const texto = typeof valor === "string" ? valor : "";
  const deshabilitado = campo.bloqueado === true;
  const comunes = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    disabled: deshabilitado,
  };

  function textoOVacio(v: string) {
    onCambio(v === "" ? undefined : v);
  }

  let control;
  switch (campo.tipo) {
    case "texto":
      control = <input {...comunes} type="text" value={texto} maxLength={500} onChange={(e) => textoOVacio(e.target.value)} className={CLASE_CAMPO} />;
      break;
    case "texto_largo":
      control = (
        <textarea {...comunes} rows={4} value={texto} maxLength={5000} onChange={(e) => textoOVacio(e.target.value)} className={`${CLASE_CAMPO} resize-y`} />
      );
      break;
    case "fecha":
      control = <input {...comunes} type="date" value={texto} onChange={(e) => textoOVacio(e.target.value)} className={CLASE_CAMPO} />;
      break;
    case "hora":
      control = <input {...comunes} type="time" value={texto} onChange={(e) => textoOVacio(e.target.value)} className={CLASE_CAMPO} />;
      break;
    case "numero":
      control = (
        <div className="flex items-center gap-2">
          <input
            {...comunes}
            type="number"
            inputMode="decimal"
            step={campo.decimales ? 1 / 10 ** campo.decimales : 1}
            min={campo.min}
            max={campo.max}
            value={typeof valor === "number" ? valor : ""}
            onChange={(e) => onCambio(e.target.value === "" ? undefined : Number(e.target.value))}
            className={CLASE_CAMPO}
          />
          {campo.unidad && <span className="text-sm text-grafito/75">{campo.unidad}</span>}
        </div>
      );
      break;
    case "si_no": {
      const respuesta = esRespuesta(valor) ? valor : undefined;
      const conDetalle = campo.detalle && respuesta?.respuesta === campo.detalle.cuando;
      control = (
        <div className="flex flex-col gap-2">
          <div role="radiogroup" aria-labelledby={`${id}-etiqueta`} className="flex gap-2">
            {(["si", "no"] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={respuesta?.respuesta === r}
                onClick={() =>
                  onCambio(respuesta?.respuesta === r ? undefined : { respuesta: r, ...(respuesta?.detalle ? { detalle: respuesta.detalle } : {}) })
                }
                className={`${PILDORA} ${respuesta?.respuesta === r ? PILDORA_ELEGIDA : PILDORA_LIBRE}`}
              >
                {r === "si" ? "Sí" : "No"}
              </button>
            ))}
          </div>
          {conDetalle && campo.detalle && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grafito/80">{campo.detalle.etiqueta}</span>
              <textarea
                rows={2}
                value={respuesta?.detalle ?? ""}
                maxLength={1000}
                onChange={(e) => {
                  if (!respuesta) return;
                  onCambio({ respuesta: respuesta.respuesta, ...(e.target.value ? { detalle: e.target.value } : {}) });
                }}
                className={`${CLASE_CAMPO} resize-y`}
              />
            </label>
          )}
        </div>
      );
      break;
    }
    case "opcion_unica":
      control = (
        <Opciones
          campo={campo}
          elegidas={texto ? [texto] : []}
          multiple={false}
          onElegir={(v) => onCambio(v === texto ? undefined : v)}
        />
      );
      break;
    case "opcion_multiple": {
      const lista = Array.isArray(valor) ? (valor as string[]) : [];
      control = (
        <Opciones
          campo={campo}
          elegidas={lista}
          multiple
          onElegir={(v) => {
            const nueva = lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
            onCambio(nueva.length ? nueva : undefined);
          }}
        />
      );
      break;
    }
    case "piezas": {
      const lista = Array.isArray(valor) ? (valor as string[]) : [];
      control = <SelectorDePiezas denticion={campo.denticion ?? "ambas"} valor={lista} onCambio={(p) => onCambio(p.length ? p : undefined)} />;
      break;
    }
    case "odontograma":
      control = (
        <CampoOdontograma
          campo={campo}
          valor={valor}
          onCambio={onCambio}
          id={id}
          etiquetaId={`${id}-etiqueta`}
          describedBy={describedBy}
          abierto={odontogramaAbierto}
          onAbierto={onOdontogramaAbierto}
        />
      );
      break;
  }

  const agrupado = ["si_no", "opcion_unica", "opcion_multiple", "piezas", "odontograma"].includes(campo.tipo);
  const Etiqueta = agrupado ? "p" : "label";

  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-campo={campo.id}>
      <Etiqueta
        id={`${id}-etiqueta`}
        {...(agrupado ? {} : { htmlFor: id })}
        className="text-sm font-medium text-grafito"
      >
        {campo.etiqueta}
        {campo.requerido && <span className="ml-1 text-xs font-normal text-grafito/70">· Obligatorio</span>}
        {deshabilitado && <span className="ml-1 text-xs font-normal text-grafito/70">· Sale de tu perfil</span>}
      </Etiqueta>
      {campo.ayuda && (
        <p id={idAyuda} className="text-xs text-grafito/75">
          {campo.ayuda}
        </p>
      )}
      {control}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-terracota-oscuro">
          {error}
        </p>
      )}
    </div>
  );
}
