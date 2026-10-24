import { partesFechaHora } from "@/lib/turno-format";

// FechaHoraCelda — la fecha y la hora de un turno en una tabla del panel
// (2026-09-27, captura del cliente en un iPhone). En el celular la columna
// era angosta, y "15 sept · 08:00" se partía donde entraba: cuatro renglones
// ("15" / "sept" / "·" / "08:00") que hacían cada fila altísima. Desde las
// correcciones generales (ítem 9, 2026-10-12) la tabla del celular va
// completa y scrollea de costado, así que la fecha y la hora van en UN
// renglón en todos los anchos, con el punto, y ninguna pieza se parte.
//
// `formato`: cómo se escriben la fecha y la hora. Los documentos clínicos la
// llevan completa, "27/09/2026" (partesFechaHoraDeDocumento).
//
// `apiladaBajo2xl`: entre `md` y `2xl`, la hora va debajo de la fecha y sin
// el punto. Para la tabla de Turnos de la vista general, que con la columna
// "Profesional" no entraba a 1280 px con datos reales (un "Ver motivo", un
// mail largo): la fecha en un renglón era la celda más ancha que no se
// podía partir, y apilada devuelve unos 30 px (desde ahí manda la cabecera,
// "Fecha y hora") sin sumar alto a la fila, que ya tiene dos renglones (el
// nombre y el DNI).
export function FechaHoraCelda({
  iso,
  formato = partesFechaHora,
  apiladaBajo2xl = false,
}: {
  iso?: string;
  formato?: (iso?: string) => { fecha: string; hora: string } | null;
  apiladaBajo2xl?: boolean;
}) {
  const partes = formato(iso);
  if (!partes) return <>—</>;
  return (
    <span className={apiladaBajo2xl ? "inline-flex gap-1.5 md:max-2xl:flex-col md:max-2xl:gap-0" : "inline-flex gap-1.5"}>
      <span className="whitespace-nowrap">{partes.fecha}</span>
      <span aria-hidden="true" className={apiladaBajo2xl ? "md:max-2xl:hidden" : undefined}>
        ·
      </span>
      <span className="whitespace-nowrap">{partes.hora}</span>
    </span>
  );
}
