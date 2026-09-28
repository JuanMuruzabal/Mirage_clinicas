import Link from "next/link";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { fechaCorta } from "@/lib/documentos";
import { EstadoDeDocumento } from "./tablas-de-documentos";

// DocumentosDeLaFicha — el bloque de la ficha del paciente que antes era el
// placeholder "Historia clínica" (Fase 5.1, R8 del brief: "lo mismo
// sucederá con el botón que se encuentra desactivado en la ficha").
//
// Un profesional ve los últimos documentos y llega al registro. Recepción y
// administración de página solo saben CUÁNTOS hay: saber que existe
// historia clínica no es leerla (TR-186).
export function DocumentosDeLaFicha({
  pacienteId,
  documentos,
  cantidadSellados,
}: {
  pacienteId: string;
  /** null cuando quien mira no es profesional: no los puede leer. */
  documentos: DocumentoResumen[] | null;
  cantidadSellados: number;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border-[0.5px] border-arena bg-marfil p-6 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-base font-medium text-grafito">Documentos clínicos</h2>
        {documentos && (
          <Link href={`/panel/documentos?paciente=${pacienteId}`} className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
            + Nuevo
          </Link>
        )}
      </div>

      {documentos === null ? (
        <p className="text-sm text-grafito/80">
          {cantidadSellados === 0
            ? "Todavía no tiene documentos firmados."
            : `${cantidadSellados} ${cantidadSellados === 1 ? "documento firmado" : "documentos firmados"}. Solo los profesionales pueden abrirlos.`}
        </p>
      ) : documentos.length === 0 ? (
        <p className="text-sm text-grafito/80">Todavía no tiene documentos. Empezá uno con “+ Nuevo”.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-arena">
            {documentos.slice(0, 3).map((d) => (
              <li key={d.id}>
                <Link href={`/panel/documentos/${d.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-hueso">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-grafito">{d.plantillaNombre}</span>
                    <span className="block text-xs text-grafito/70">
                      {fechaCorta(d.selladoEn ?? d.actualizadoEn)} · {d.autorNombre}
                    </span>
                  </span>
                  <EstadoDeDocumento estado={d.estado} />
                </Link>
              </li>
            ))}
          </ul>
          <Link href={`/panel/pacientes/${pacienteId}/documentos`} className="self-start text-sm font-medium text-salvia-oscuro hover:text-grafito">
            Ver todos ({documentos.length}) →
          </Link>
        </>
      )}
    </div>
  );
}
