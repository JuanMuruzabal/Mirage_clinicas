"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import type { Plantilla } from "@dental-mirage/documentos-clinicos";
import { crearDocumentoAction, historiasDelPacienteAction } from "@/app/actions/documentos";
import { esMuestra, type ModeloDeMuestra } from "@/lib/documentos-de-muestra";
import { ElegirHistoria } from "./elegir-historia";
import { ElegirPaciente } from "./elegir-paciente";
import { PantallaCompleta } from "./pantalla-completa";
import { HojaDelModelo, PilaDeModelos } from "./pila-de-modelos";
import { agruparPlantillas, SelectorDePlantillas } from "./selector-de-plantillas";

// ModuloDocumentos — la pantalla de entrada del módulo (Fase 5.1, R3 y R8
// del brief). El carrusel de documentos (que despliega la lista agrupada),
// el botón para completarlo y, debajo, lo que quedó en curso (`enCurso`);
// al lado en escritorio, el modelo original del elegido, adelante de la pila
// de los demás (`PilaDeModelos`, 2026-09-29). Al fondo, después
// del modelo, `abajo`: los pacientes con documentos (pedido del cliente,
// 2026-09-28).
//
// `muestras`: las hojas de muestra que completan la pila mientras falten
// modelos (lib/documentos-de-muestra.ts). Se recorren como un documento
// más, pero no se completan.
export function ModuloDocumentos({
  plantillas,
  muestras = [],
  plantillaInicial,
  paciente,
  hoy,
  enCurso,
  abajo,
}: {
  plantillas: Plantilla[];
  muestras?: ModeloDeMuestra[];
  plantillaInicial?: string;
  /** Si se llegó desde la ficha de un paciente: el documento es para él. */
  paciente?: { id: string; nombre: string; apellido: string };
  hoy: string;
  enCurso?: ReactNode;
  abajo?: ReactNode;
}) {
  // El orden del menú, que es también el de las flechas y el de la pila.
  const modelos: (Plantilla | ModeloDeMuestra)[] = [...plantillas, ...muestras];
  const enOrden = agruparPlantillas(modelos).flatMap((g) => g.plantillas);
  // Sin una elegida de entrada, la primera del menú (el primer consentimiento).
  const [elegida, setElegida] = useState<Plantilla | ModeloDeMuestra>(
    () => plantillas.find((p) => p.id === plantillaInicial) ?? enOrden[0],
  );
  const deMuestra = esMuestra(elegida);
  const esAnexo = elegida.tipo === "anexo";
  const [eligiendoPaciente, setEligiendoPaciente] = useState(false);
  // Un anexo para el paciente de la ficha (5.6b): sus historias, para
  // elegir a cuál pertenece.
  const [historias, setHistorias] = useState<DocumentoResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, empezarACrear] = useTransition();

  function completar() {
    if (deMuestra) return;
    if (!paciente) {
      setEligiendoPaciente(true);
      return;
    }
    setError(null);
    empezarACrear(async () => {
      if (!esAnexo) {
        const res = await crearDocumentoAction(elegida.id, paciente.id);
        if (res?.error) setError(res.error);
        return;
      }
      const res = await historiasDelPacienteAction(paciente.id);
      if (res.ok) setHistorias(res.historias);
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <SelectorDePlantillas plantillas={modelos} elegida={elegida} onElegir={setElegida} />

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={completar}
                disabled={creando || deMuestra}
                className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
              >
                {creando ? (esAnexo ? "Buscando sus historias…" : "Creando…") : paciente ? `Completar para ${paciente.nombre} ${paciente.apellido}` : "Completar este documento"}
              </button>
              {!deMuestra && (
                <a
                  href={elegida.fuente.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-salvia-oscuro underline-offset-4 hover:underline"
                >
                  Web del Colegio ↗
                </a>
              )}
            </div>
            {deMuestra && (
              <p className="text-sm text-grafito/75">Es una hoja de muestra para ver la pila de modelos: no se puede completar.</p>
            )}
            {error && (
              <p role="alert" className="text-sm text-terracota-oscuro first-letter:uppercase">
                {error}
              </p>
            )}
          </div>

          {enCurso}
        </div>

        {/* Sin rótulo arriba de la hoja (pedido del cliente, 2026-09-29):
            el documento lo nombra el carrusel de al lado. */}
        <section aria-label={`Vista de ${elegida.nombre}`} className="min-w-0">
          {/* En el celular la hoja entra al ancho de la pantalla y la letra
              queda chica (pedido del cliente, 2026-09-28): la pantalla
              completa, en la misma barra que el control de páginas
              (2026-10-02). La pila la muestra solo por debajo de lg. */}
          <PilaDeModelos
            enOrden={enOrden}
            elegida={elegida}
            hoy={hoy}
            accionesDelCelular={
              <PantallaCompleta titulo={elegida.nombre} etiqueta="Pantalla completa" variante="en-barra">
                <HojaDelModelo modelo={elegida} hoy={hoy} />
              </PantallaCompleta>
            }
          />
        </section>
      </div>

      {abajo}

      {eligiendoPaciente && !deMuestra && (
        <ElegirPaciente
          plantillaId={elegida.id}
          plantillaNombre={elegida.nombre}
          esAnexo={esAnexo}
          onCerrar={() => setEligiendoPaciente(false)}
        />
      )}
      {paciente && historias && (
        <ElegirHistoria
          plantillaId={elegida.id}
          plantillaNombre={elegida.nombre}
          paciente={paciente}
          historias={historias}
          onCerrar={() => setHistorias(null)}
        />
      )}
    </div>
  );
}
