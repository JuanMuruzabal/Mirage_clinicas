import Link from "next/link";

// DocumentosDeLaFicha — el bloque de la ficha del paciente que antes era el
// placeholder "Historia clínica" (Fase 5.1, R8 del brief: "lo mismo
// sucederá con el botón que se encuentra desactivado en la ficha").
//
// Un profesional ve solo el botón para entrar a los documentos clínicos del
// paciente —la lista, los filtros y "+ Nuevo documento" viven allá (pedido
// del cliente, 2026-09-29)—. Recepción y administración de página solo
// saben CUÁNTOS hay: saber que existe historia clínica no es leerla
// (TR-186).
export function DocumentosDeLaFicha({
  pacienteId,
  esProfesional,
  cantidad,
}: {
  pacienteId: string;
  esProfesional: boolean;
  /** Los terminados: sellados y consentimientos para imprimir. */
  cantidad: number;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border-[0.5px] border-arena bg-marfil p-6 shadow-soft">
      <h2 className="font-[family-name:var(--font-display)] text-base font-medium text-grafito">Documentos clínicos</h2>
      {esProfesional ? (
        <Link
          href={`/panel/pacientes/${pacienteId}/documentos`}
          className="self-start rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95"
        >
          Ver documentos clínicos
        </Link>
      ) : (
        <p className="text-sm text-grafito/80">
          {cantidad === 0
            ? "Todavía no tiene documentos terminados."
            : `${cantidad} ${cantidad === 1 ? "documento terminado" : "documentos terminados"}. Solo los profesionales pueden abrirlos.`}
        </p>
      )}
    </div>
  );
}
