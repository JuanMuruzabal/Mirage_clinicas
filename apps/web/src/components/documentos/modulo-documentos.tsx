"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { Plantilla } from "@dental-mirage/documentos-clinicos";
import { crearDocumentoAction } from "@/app/actions/documentos";
import { ElegirPaciente } from "./elegir-paciente";
import { OriginalDelColegio } from "./original-del-colegio";
import { PantallaCompleta } from "./pantalla-completa";
import { agruparPlantillas, SelectorDePlantillas } from "./selector-de-plantillas";

// ModuloDocumentos — la pantalla de entrada del módulo (Fase 5.1, R3 y R8
// del brief). El carrusel de documentos (que despliega la lista agrupada),
// el botón para completarlo y, debajo, lo que quedó en curso (`enCurso`);
// al lado en escritorio, el modelo original del elegido. Al fondo, después
// del modelo, `abajo`: los pacientes con documentos (pedido del cliente,
// 2026-09-28).
export function ModuloDocumentos({
  plantillas,
  plantillaInicial,
  paciente,
  hoy,
  enCurso,
  abajo,
}: {
  plantillas: Plantilla[];
  plantillaInicial?: string;
  /** Si se llegó desde la ficha de un paciente: el documento es para él. */
  paciente?: { id: string; nombre: string; apellido: string };
  hoy: string;
  enCurso?: ReactNode;
  abajo?: ReactNode;
}) {
  // Sin una elegida de entrada, la primera del menú (el primer consentimiento).
  const [elegida, setElegida] = useState<Plantilla>(
    () => plantillas.find((p) => p.id === plantillaInicial) ?? agruparPlantillas(plantillas)[0].plantillas[0],
  );
  const [eligiendoPaciente, setEligiendoPaciente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creando, empezarACrear] = useTransition();

  function completar() {
    if (!paciente) {
      setEligiendoPaciente(true);
      return;
    }
    setError(null);
    empezarACrear(async () => {
      const res = await crearDocumentoAction(elegida.id, paciente.id);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <SelectorDePlantillas plantillas={plantillas} elegida={elegida} onElegir={setElegida} />

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={completar}
                disabled={creando}
                className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
              >
                {creando ? "Creando…" : paciente ? `Completar para ${paciente.nombre} ${paciente.apellido}` : "Completar este documento"}
              </button>
              <a
                href={elegida.fuente.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-salvia-oscuro underline-offset-4 hover:underline"
              >
                Web del Colegio ↗
              </a>
            </div>
            {error && (
              <p role="alert" className="text-sm text-terracota-oscuro">
                {error}
              </p>
            )}
          </div>

          {enCurso}
        </div>

        <section aria-label={`Vista de ${elegida.nombre}`} className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-[family-name:var(--font-mono)] text-xs font-semibold tracking-[0.16em] text-salvia-oscuro uppercase">
              Modelo
            </p>
            {/* En el celular la hoja entra al ancho de la pantalla y la letra
                queda chica (pedido del cliente, 2026-09-28). */}
            <PantallaCompleta titulo={elegida.nombre} className="lg:hidden">
              <OriginalDelColegio plantilla={elegida} hoy={hoy} />
            </PantallaCompleta>
          </div>
          <OriginalDelColegio plantilla={elegida} hoy={hoy} />
        </section>
      </div>

      {abajo}

      {eligiendoPaciente && (
        <ElegirPaciente plantillaId={elegida.id} plantillaNombre={elegida.nombre} onCerrar={() => setEligiendoPaciente(false)} />
      )}
    </div>
  );
}
