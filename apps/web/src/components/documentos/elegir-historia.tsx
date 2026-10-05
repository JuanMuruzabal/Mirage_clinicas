"use client";

import { useState } from "react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { crearAnexoConHistoriaGeneralAction, crearDocumentoAction } from "@/app/actions/documentos";
import { Dialogo } from "@/components/dialogo";
import { CLASE_TACTIL } from "@/components/editor-pagina/estilos";
import { fechaDelDocumento, fechaYHora } from "@/lib/documentos";
import { EstadoEnTabla } from "./tablas-de-documentos";

// ElegirHistoria — el paso de un anexo después del paciente (5.6b): a qué
// historia clínica pertenece. Se ofrecen las que ve quien crea (GET
// /documentos/historias: las suyas en cualquier estado y las terminadas de
// los colegas). Sin ninguna, ofrece crear la General y colgarle el anexo de
// una. Elegir crea el anexo y lleva al editor.
export function ElegirHistoria({
  plantillaId,
  plantillaNombre,
  paciente,
  historias,
  onCerrar,
}: {
  plantillaId: string;
  plantillaNombre: string;
  paciente: { id: string; nombre: string; apellido: string };
  historias: DocumentoResumen[];
  onCerrar: () => void;
}) {
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(accion: () => Promise<{ error: string }>) {
    if (creando) return;
    setCreando(true);
    setError(null);
    const res = await accion();
    // Si salió bien, la acción redirige y esto no vuelve.
    setCreando(false);
    if (res?.error) setError(res.error);
  }

  return (
    <Dialogo
      titulo="¿A qué historia clínica pertenece?"
      descripcion={`${plantillaNombre} · ${paciente.nombre} ${paciente.apellido}`}
      onCerrar={onCerrar}
      ancho="chico"
      superficie="marfil"
      centrado
    >
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        {/* Arriba de la lista: con muchas historias, abajo quedaba fuera de la vista. */}
        {creando && <p className="text-sm text-grafito/75">Creando el anexo…</p>}
        {error && (
          <p role="alert" className="text-sm text-terracota-oscuro first-letter:uppercase">
            {error}
          </p>
        )}
        {historias.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-grafito">Este paciente todavía no tiene historia clínica.</p>
              <p className="text-sm text-grafito/75">Se crea la General en borrador y el anexo queda dentro de ella.</p>
            </div>
            <button
              type="button"
              onClick={() => void crear(() => crearAnexoConHistoriaGeneralAction(plantillaId, paciente.id))}
              disabled={creando}
              className={`rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60 ${CLASE_TACTIL}`}
            >
              Crear la Historia Clínica General
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {historias.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => void crear(() => crearDocumentoAction(plantillaId, paciente.id, h.id))}
                  disabled={creando}
                  className="flex w-full flex-col gap-1.5 rounded-field border border-linea bg-hueso px-4 py-3 text-left hover:border-salvia disabled:opacity-60"
                >
                  {/* El estado en su propio renglón, siempre en el mismo
                      lugar: al costado del nombre saltaba de lugar según
                      cuánto midiera el nombre. */}
                  <span className="font-medium text-grafito">{h.plantillaNombre}</span>
                  <span className="text-xs text-grafito/75">
                    {fechaYHora(fechaDelDocumento(h))} · {h.autorNombre}
                    {h.folio != null && ` · folio ${h.folio}`}
                  </span>
                  <EstadoEnTabla estado={h.estado} enLinea />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialogo>
  );
}
