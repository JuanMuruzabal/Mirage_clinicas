"use client";

import { useMemo, useState } from "react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { normalizar } from "@dental-mirage/documentos-clinicos";
import { IconSearch } from "@/components/icons";
import { FiltrosAplicados, type FiltroAplicado } from "@/components/panel/filtros-aplicados";
import { FiltrosSheet } from "@/components/panel/filtros-sheet";
import { rangoRapidoFechas } from "@/lib/calendar-utils";
import { diaEnCordoba, fechaDelDocumento, nombreConTipo } from "@/lib/documentos";
import { etiquetaDeRango, RANGOS_RAPIDOS } from "@/lib/turnos-filtros";
import { TablaDeDocumentos } from "./tablas-de-documentos";

// RegistroDeDocumentos — los documentos clínicos de un paciente con sus
// filtros (pedido del cliente, 2026-09-29). El MISMO sistema que Turnos y
// los turnos de la ficha: un buscador a la vista y el resto en la hoja de
// "Filtros" (FiltrosSheet), con un borrador que se confirma con "Ver N
// documentos". El filtro de documento elige un MODELO puntual
// ("Consentimiento informado: Tratamiento de conducto"), no una categoría
// general: las opciones salen de los documentos que tiene el paciente.
//
// La lista de un paciente es corta y ya vino entera del servidor: filtra
// en la pantalla, sin volver a pedir nada.

const CAMPO = "rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-grafito outline-none focus:border-salvia";

interface Filtros {
  plantilla: string;
  desde: string;
  hasta: string;
}

const SIN_FILTROS: Filtros = { plantilla: "todos", desde: "", hasta: "" };

function pasaLosFiltros(d: DocumentoResumen, f: Filtros): boolean {
  if (f.plantilla !== "todos" && d.plantillaId !== f.plantilla) return false;
  const dia = diaEnCordoba(fechaDelDocumento(d));
  if (f.desde && dia < f.desde) return false;
  if (f.hasta && dia > f.hasta) return false;
  return true;
}

export function RegistroDeDocumentos({ documentos }: { documentos: DocumentoResumen[] }) {
  const [busqueda, setBusqueda] = useState("");
  // Confirmado: lo que filtra la tabla. Borrador: lo que se edita en la hoja.
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [borrador, setBorrador] = useState<Filtros>(SIN_FILTROS);

  // Un modelo por opción, aunque el paciente tenga varios documentos de él.
  const modelos = useMemo(() => {
    const porId = new Map<string, string>();
    for (const d of documentos) if (!porId.has(d.plantillaId)) porId.set(d.plantillaId, nombreConTipo(d));
    return [...porId.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [documentos]);

  const buscados = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return documentos;
    return documentos.filter((d) => {
      const texto = normalizar(`${nombreConTipo(d)} ${d.autorNombre} ${d.folio ?? ""} ${d.hashContenido ?? ""}`);
      return palabras.every((p) => texto.includes(p));
    });
  }, [documentos, busqueda]);

  const filtrados = useMemo(() => buscados.filter((d) => pasaLosFiltros(d, filtros)), [buscados, filtros]);
  const cuantosConElBorrador = useMemo(() => buscados.filter((d) => pasaLosFiltros(d, borrador)).length, [buscados, borrador]);

  // Un rango de fechas cuenta como UN filtro, igual que en Turnos.
  const activeCount = (filtros.plantilla !== "todos" ? 1 : 0) + (filtros.desde || filtros.hasta ? 1 : 0);
  const hayBorrador = borrador.plantilla !== "todos" || borrador.desde !== "" || borrador.hasta !== "";

  // Las etiquetas de lo ya aplicado, como en Turnos: cada una quita solo su
  // filtro (pedido del cliente, 2026-09-29). La búsqueda no lleva etiqueta:
  // ya se ve en su campo.
  const filtrosAplicados: FiltroAplicado[] = [];
  if (filtros.plantilla !== "todos") {
    filtrosAplicados.push({
      clave: "documento",
      etiqueta: modelos.find((m) => m.id === filtros.plantilla)?.nombre ?? "Documento",
      quitar: () => setFiltros({ ...filtros, plantilla: "todos" }),
    });
  }
  if (filtros.desde || filtros.hasta) {
    filtrosAplicados.push({
      clave: "rango",
      etiqueta: etiquetaDeRango(filtros.desde, filtros.hasta),
      quitar: () => setFiltros({ ...filtros, desde: "", hasta: "" }),
    });
  }

  if (documentos.length === 0) {
    return <TablaDeDocumentos documentos={[]} vacio="Todavía no hay documentos para este paciente." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-grafito/40" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por documento, profesional, folio o huella"
            aria-label="Buscar por documento, profesional, folio o huella"
            className="w-full rounded-field border-[0.5px] border-arena bg-marfil py-2 pr-3 pl-9 text-sm text-grafito outline-none focus:border-salvia"
          />
        </div>
        <FiltrosSheet
          activo={activeCount > 0}
          activeCount={activeCount}
          aplicarLabel={`Ver ${cuantosConElBorrador} documento${cuantosConElBorrador === 1 ? "" : "s"}`}
          onAplicar={() => setFiltros(borrador)}
          onLimpiar={hayBorrador ? () => setBorrador(SIN_FILTROS) : undefined}
          onAbrir={() => setBorrador(filtros)}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-grafito">Documento</span>
            <select value={borrador.plantilla} onChange={(e) => setBorrador({ ...borrador, plantilla: e.target.value })} className={CAMPO}>
              <option value="todos">Todos los documentos</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            {RANGOS_RAPIDOS.map((r) => {
              const calculado = rangoRapidoFechas(r.rango);
              const activo = borrador.desde === calculado.desde && borrador.hasta === calculado.hasta;
              return (
                <button
                  key={r.rango}
                  type="button"
                  onClick={() => setBorrador({ ...borrador, desde: calculado.desde, hasta: calculado.hasta })}
                  className={`rounded-full bg-salvia-oscuro px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-marfil hover:brightness-95 ${activo ? "ring-2 ring-salvia-oscuro ring-offset-1" : ""}`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className="font-medium text-grafito">Desde</span>
              <input
                type="date"
                value={borrador.desde}
                max={borrador.hasta || undefined}
                onChange={(e) => setBorrador({ ...borrador, desde: e.target.value })}
                className={CAMPO}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className="font-medium text-grafito">Hasta</span>
              <input
                type="date"
                value={borrador.hasta}
                min={borrador.desde || undefined}
                onChange={(e) => setBorrador({ ...borrador, hasta: e.target.value })}
                className={CAMPO}
              />
            </label>
          </div>
        </FiltrosSheet>
      </div>

      <FiltrosAplicados filtros={filtrosAplicados} />

      {filtrados.length === 0 ? (
        <TablaDeDocumentos documentos={[]} vacio="Ningún documento coincide con la búsqueda o los filtros." />
      ) : (
        <SeccionesDelRegistro documentos={documentos} filtrados={filtrados} />
      )}
    </div>
  );
}

const esConsentimiento = (d: DocumentoResumen) => d.tipo === "consentimiento";

// Las dos tablas del registro (5.6b): los consentimientos, y las historias
// clínicas con sus anexos debajo. Los filtros se aplican antes de
// separarlas, así que valen para las dos.
function SeccionesDelRegistro({ documentos, filtrados }: { documentos: DocumentoResumen[]; filtrados: DocumentoResumen[] }) {
  return (
    <>
      <SeccionDelRegistro
        titulo="Consentimientos informados"
        documentos={filtrados.filter(esConsentimiento)}
        hayAlguno={documentos.some(esConsentimiento)}
        vacio="consentimientos informados"
      />
      <SeccionDelRegistro
        titulo="Historias clínicas"
        documentos={filtrados.filter((d) => !esConsentimiento(d))}
        hayAlguno={documentos.some((d) => !esConsentimiento(d))}
        vacio="historias clínicas"
        anidada
      />
    </>
  );
}

function SeccionDelRegistro({
  titulo,
  documentos,
  hayAlguno,
  vacio,
  anidada = false,
}: {
  titulo: string;
  documentos: DocumentoResumen[];
  /** El paciente tiene alguno de estos, aunque los filtros lo escondan. */
  hayAlguno: boolean;
  vacio: string;
  anidada?: boolean;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={titulo}>
      <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">{titulo}</h2>
      <TablaDeDocumentos
        documentos={documentos}
        anidada={anidada}
        sinTipo
        vacio={hayAlguno ? "Ninguno coincide con la búsqueda o los filtros." : `Todavía no hay ${vacio} para este paciente.`}
      />
    </section>
  );
}
