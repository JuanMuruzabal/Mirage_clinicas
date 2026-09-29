"use client";

import { useMemo, useState } from "react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { normalizar } from "@dental-mirage/documentos-clinicos";
import { diaEnCordoba } from "@/lib/documentos";
import { TablaDeDocumentos } from "./tablas-de-documentos";

// RegistroDeDocumentos — los documentos clínicos de un paciente con sus
// filtros (pedido del cliente, 2026-09-29): buscar por documento,
// profesional o folio; por tipo; y por fecha. La lista de un paciente es
// corta y ya vino entera del servidor: filtra en la pantalla, sin volver a
// pedir nada.

const TIPOS = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "consentimiento", etiqueta: "Consentimientos" },
  { valor: "historia_clinica", etiqueta: "Historias clínicas" },
  { valor: "otros", etiqueta: "Otros" },
] as const;
type FiltroDeTipo = (typeof TIPOS)[number]["valor"];

const CAMPO = "w-full rounded-field border border-linea bg-hueso px-3 py-2 text-sm text-grafito outline-none focus:border-salvia";
const ETIQUETA = "flex flex-col gap-1 text-xs font-medium text-grafito/80";

function delTipo(d: DocumentoResumen, tipo: FiltroDeTipo): boolean {
  if (tipo === "todos") return true;
  if (tipo === "otros") return d.tipo !== "consentimiento" && d.tipo !== "historia_clinica";
  return d.tipo === tipo;
}

export function RegistroDeDocumentos({ documentos }: { documentos: DocumentoResumen[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState<FiltroDeTipo>("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const conFiltros = busqueda.trim() !== "" || tipo !== "todos" || desde !== "" || hasta !== "";

  const filtrados = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    return documentos.filter((d) => {
      if (!delTipo(d, tipo)) return false;
      const texto = normalizar(`${d.plantillaNombre} ${d.autorNombre} ${d.folio ?? ""}`);
      if (!palabras.every((p) => texto.includes(p))) return false;
      const dia = diaEnCordoba(d.selladoEn ?? d.terminadoEn ?? d.actualizadoEn);
      if (desde && dia < desde) return false;
      if (hasta && dia > hasta) return false;
      return true;
    });
  }, [documentos, busqueda, tipo, desde, hasta]);

  function limpiar() {
    setBusqueda("");
    setTipo("todos");
    setDesde("");
    setHasta("");
  }

  return (
    <div className="flex flex-col gap-4">
      {documentos.length > 0 && (
        <div role="search" aria-label="Filtrar documentos" className="flex flex-wrap items-end gap-3 rounded-card border border-linea bg-marfil p-4 shadow-soft">
          <label className={`${ETIQUETA} min-w-[14rem] flex-1`}>
            Buscar
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Documento, profesional o folio"
              className={CAMPO}
            />
          </label>
          <label className={`${ETIQUETA} min-w-[10rem]`}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as FiltroDeTipo)} className={CAMPO}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className={`${ETIQUETA} min-w-[9rem]`}>
            Desde
            <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className={CAMPO} />
          </label>
          <label className={`${ETIQUETA} min-w-[9rem]`}>
            Hasta
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className={CAMPO} />
          </label>
          {conFiltros && (
            <button type="button" onClick={limpiar} className="rounded-full px-3 py-2 text-sm font-medium text-salvia-oscuro hover:bg-arena">
              Limpiar
            </button>
          )}
        </div>
      )}

      <TablaDeDocumentos
        documentos={filtrados}
        vacio={documentos.length === 0 ? "Todavía no hay documentos para este paciente." : "Ningún documento coincide con los filtros."}
      />
    </div>
  );
}
