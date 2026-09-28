"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ETIQUETA_DE_TIPO, type Plantilla } from "@dental-mirage/documentos-clinicos";
import { crearDocumentoAction } from "@/app/actions/documentos";
import { CalcoEnVivo } from "./calco";
import { ElegirPaciente } from "./elegir-paciente";
import { SelectorDePlantillas } from "./selector-de-plantillas";

// ModuloDocumentos — la pantalla de entrada del módulo (Fase 5.1, R3 y R8
// del brief): el selector de documentos, la vista precargada del elegido y,
// debajo del selector, lo que se pasa como children (la tabla de
// pacientes). En escritorio la vista va al costado; en el celular, abajo.
export function ModuloDocumentos({
  plantillas,
  plantillaInicial,
  paciente,
  hoy,
  children,
}: {
  plantillas: Plantilla[];
  plantillaInicial?: string;
  /** Si se llegó desde la ficha de un paciente: el documento es para él. */
  paciente?: { id: string; nombre: string; apellido: string };
  hoy: string;
  children?: ReactNode;
}) {
  const [elegida, setElegida] = useState<Plantilla>(() => plantillas.find((p) => p.id === plantillaInicial) ?? plantillas[0]);
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
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <SelectorDePlantillas plantillas={plantillas} elegida={elegida} onElegir={setElegida} />

        <div className="flex flex-col gap-3">
          <p className="text-sm text-grafito/80">{elegida.descripcion}</p>
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
              Ver el modelo del Colegio ↗
            </a>
          </div>
          {error && (
            <p role="alert" className="text-sm text-terracota-oscuro">
              {error}
            </p>
          )}
        </div>

        {children}
      </div>

      <section aria-label={`Vista de ${elegida.nombre}`} className="min-w-0">
        <p className="mb-3 font-[family-name:var(--font-mono)] text-xs font-semibold tracking-[0.16em] text-salvia-oscuro uppercase">
          Así es el documento · {ETIQUETA_DE_TIPO[elegida.tipo]}
        </p>
        <CalcoEnVivo plantilla={elegida} valores={{}} hoy={hoy} />
      </section>

      {eligiendoPaciente && (
        <ElegirPaciente plantillaId={elegida.id} plantillaNombre={elegida.nombre} onCerrar={() => setEligiendoPaciente(false)} />
      )}
    </div>
  );
}
