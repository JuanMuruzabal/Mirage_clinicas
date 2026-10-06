import Link from "next/link";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { fechaYHora, referenciaDeVinculo } from "@/lib/documentos";

const LINK = "font-medium text-salvia-oscuro hover:text-grafito hover:underline";

// El vínculo entre un anexo y su historia clínica (5.6b), en el encabezado
// del documento —arriba del editor y de la vista—: en un anexo, de qué
// historia es; en una historia, sus anexos. Así se pasa de uno al otro.
// Una historia que existe pero no se ve (la de un colega, sin terminar) se
// menciona sin link.
export function VinculosDelDocumento({ documento }: { documento: Pick<DocumentoResumen, "anexoDe" | "anexos" | "historiaNoVisible"> }) {
  const { anexoDe, anexos = [], historiaNoVisible = false } = documento;
  if (!anexoDe && !historiaNoVisible && anexos.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 text-sm text-grafito/80">
      {historiaNoVisible && <p>Anexo de una historia clínica que todavía no terminaron</p>}
      {anexoDe && (
        <p>
          Anexo de:{" "}
          <Link href={`/panel/documentos/${anexoDe.id}`} className={LINK}>
            {anexoDe.nombre}
          </Link>{" "}
          · {referenciaDeVinculo(anexoDe)} · {fechaYHora(anexoDe.fecha)}
        </p>
      )}
      {anexos.length > 0 && (
        // Uno por renglón: dos anexos del mismo modelo, sin folio todavía,
        // en un mismo renglón no se distinguían dónde empieza cada uno.
        <div className="flex flex-col gap-1">
          <span>Anexos:</span>
          <ul className="flex flex-col gap-1">
            {anexos.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                {/* El mismo conector que en la tabla de la ficha. */}
                <span aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 rounded-bl-sm border-b border-l border-grafito/40" />
                <span>
                  <Link href={`/panel/documentos/${a.id}`} className={LINK}>
                    {a.nombre}
                  </Link>{" "}
                  · {referenciaDeVinculo(a)} · {fechaYHora(a.fecha)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
