"use client";

import { useEffect, useState } from "react";
import type { TipoConsulta, TipoConsultaDeColega } from "@dental-mirage/shared-types";
import {
  incluirTipoConsultaDeColegaAction,
  listTiposConsultaDeColegasAction,
} from "@/app/actions/calendario-config";
import { ModalPortal } from "./modal-portal";

// IncluirTipoDeColegaModal — los tipos de consulta de los colegas de la
// clínica, para sumarlos a los propios (Fase 3.2.5).
//
// LO QUE HACE "Incluir" ES COPIAR, y el modal lo dice con todas las
// letras. No es una sutileza de implementación: si alguien creyera que
// comparte la fila, esperaría que cambiarle la duración se la cambiara
// también al colega — y espera lo contrario de lo que pasa. Un tipo de
// consulta lleva duración, color y preferencia horaria, que son
// configuración de agenda propia de cada profesional.
export function IncluirTipoDeColegaModal({
  onCerrar,
  onIncluido,
}: {
  onCerrar: () => void;
  onIncluido: (tipo: TipoConsulta) => void;
}) {
  const [tipos, setTipos] = useState<TipoConsultaDeColega[] | null>(null);
  const [incluyendo, setIncluyendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void listTiposConsultaDeColegasAction().then((lista) => {
      if (vivo) setTipos(lista);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function incluir(tipo: TipoConsultaDeColega) {
    setIncluyendo(tipo.id);
    setError(null);
    const resultado = await incluirTipoConsultaDeColegaAction(tipo.id);
    setIncluyendo(null);
    if ("error" in resultado) {
      setError(resultado.error);
      return;
    }
    onIncluido(resultado.tipoConsulta);
    // Se saca de la lista: ya es tuyo, ofrecerlo de nuevo solo lo
    // duplicaría.
    setTipos((actuales) => actuales?.filter((t) => t.id !== tipo.id) ?? null);
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/40 p-4" onClick={onCerrar}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tipos de consulta de tus colegas"
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-card border border-linea bg-marfil shadow-soft"
        >
          <div className="border-b border-linea px-6 py-5">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">
              Tipos de tus colegas
            </h2>
            <p className="mt-1 text-sm text-grafito/60">
              Incluir uno crea una copia tuya. Después ajustás duración y tiempos sin tocarle la agenda a nadie.
            </p>
          </div>

          <div className="scrollbar-fina flex-1 overflow-y-auto px-6 py-4">
            {tipos === null && <p className="text-sm text-grafito/50">Buscando…</p>}
            {tipos?.length === 0 && (
              <p className="text-sm text-grafito/50">
                Todavía no hay tipos de otros profesionales en esta clínica.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {tipos?.map((tipo) => (
                <li
                  key={tipo.id}
                  className="flex items-center gap-3 rounded-field border border-linea bg-hueso px-4 py-3"
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: tipo.color }}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-grafito">{tipo.nombre}</span>
                    <span className="truncate text-xs text-grafito/50">
                      {tipo.duracionMinutos} min · de {tipo.deNombre}
                    </span>
                    {/* Avisa, no bloquea: tener "Conducto" y "Conductos"
                        es redundante pero no ilegal, y quien decide es la
                        persona. */}
                    {tipo.yaTenesUnoParecido && (
                      <span className="mt-0.5 text-xs text-terracota-oscuro">Ya tenés uno parecido</span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={incluyendo !== null}
                    onClick={() => void incluir(tipo)}
                    className="ml-auto flex-shrink-0 rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
                  >
                    {incluyendo === tipo.id ? "Incluyendo…" : "Incluir"}
                  </button>
                </li>
              ))}
            </ul>
            {error && (
              <p role="alert" className="mt-3 text-sm text-terracota-oscuro">
                {error}
              </p>
            )}
          </div>

          <div className="border-t border-linea px-6 py-4">
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-full border border-linea bg-marfil px-5 py-2.5 text-sm font-semibold text-grafito hover:border-salvia"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
