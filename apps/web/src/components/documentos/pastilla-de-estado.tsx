import type { EstadoDocumento } from "@dental-mirage/shared-types";
import { CHIP_DE_ESTADO } from "@/lib/documentos";

// PastillaDeEstado — la única pastilla de estado del módulo de documentos:
// la usan el encabezado de un documento, sus vínculos y todas las tablas.
// El color sale del estado (CHIP_DE_ESTADO); la etiqueta, de quien la usa
// ("Esperando firmas" en el encabezado, "Completado" en una tabla).
// `grande`: la del encabezado, al lado del título.
export function PastillaDeEstado({
  estado,
  children,
  grande = false,
}: {
  estado: EstadoDocumento;
  children: React.ReactNode;
  grande?: boolean;
}) {
  const medida = grande ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold whitespace-nowrap ${medida} ${CHIP_DE_ESTADO[estado]}`}>
      {children}
    </span>
  );
}
