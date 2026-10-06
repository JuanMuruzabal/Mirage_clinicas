import { partesFechaHora } from "@/lib/turno-format";

// FechaHoraCelda — la fecha y la hora de un turno en una tabla del panel
// (2026-09-27, captura del cliente en un iPhone). En el celular la columna
// es angosta, y "15 sept · 08:00" se partía donde entraba: cuatro renglones
// ("15" / "sept" / "·" / "08:00") que hacían cada fila altísima. Ahora son
// dos renglones prolijos —la fecha arriba, la hora abajo— y ninguno se
// parte por dentro. Desde `md` vuelve a ir en una línea, con el punto.
//
// `formato`: cómo se escriben la fecha y la hora. Los documentos clínicos la
// llevan completa, "27/09/2026" (partesFechaHoraDeDocumento).
export function FechaHoraCelda({
  iso,
  formato = partesFechaHora,
}: {
  iso?: string;
  formato?: (iso?: string) => { fecha: string; hora: string } | null;
}) {
  const partes = formato(iso);
  if (!partes) return <>—</>;
  return (
    <span className="flex flex-col md:flex-row md:gap-1.5">
      <span className="whitespace-nowrap">{partes.fecha}</span>
      <span aria-hidden="true" className="hidden md:inline">
        ·
      </span>
      <span className="whitespace-nowrap">{partes.hora}</span>
    </span>
  );
}
