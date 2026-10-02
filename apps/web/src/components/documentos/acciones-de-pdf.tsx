import type { DocumentoResumen } from "@dental-mirage/shared-types";

// El PDF de un documento terminado (Fase 5.3): lo genera la API en cada
// pedido, por la ruta /panel/documentos/{id}/pdf (BFF). Con `?para=imprimir`
// vuelve inline, para abrirlo en una pestaña nueva e imprimirlo desde el
// visor del navegador; sin eso, como descarga.

/** ¿Este documento tiene PDF? Lo dice la API (`tienePDF` del resumen): un
 *  consentimiento para imprimir y una historia clínica sellada, siempre que
 *  su contenido congelado traiga la composición de la lámina — uno sellado
 *  en la 5.1, antes de que existiera, no la trae y no tiene PDF. Un borrador
 *  o uno a firmar, nunca: el estado se mira igual, por las dudas. */
export function tienePDF(documento: Pick<DocumentoResumen, "estado" | "tienePDF">): boolean {
  return (documento.estado === "para_imprimir" || documento.estado === "sellado") && documento.tienePDF;
}

export function rutaDelPDF(id: string, paraImprimir = false): string {
  return `/panel/documentos/${id}/pdf${paraImprimir ? "?para=imprimir" : ""}`;
}

const ACCION =
  "inline-flex min-h-8 items-center whitespace-nowrap rounded-full border border-linea bg-hueso px-3 text-xs font-medium text-salvia-oscuro hover:bg-arena max-md:min-h-10";

// AccionesDePDF — "Imprimir" y "Descargar PDF" en una fila de una tabla.
// Son <a> y no <Link>: la ruta devuelve un archivo, no una pantalla. Dentro
// de una ClickableTableRow no navegan la fila (la fila ignora los clicks
// sobre un link propio).
export function AccionesDePDF({ id, nombre }: { id: string; nombre: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <a href={rutaDelPDF(id, true)} target="_blank" rel="noopener" aria-label={`Imprimir ${nombre} (se abre en una pestaña nueva)`} className={ACCION}>
        Imprimir
      </a>
      <a href={rutaDelPDF(id)} aria-label={`Descargar PDF de ${nombre}`} className={ACCION}>
        Descargar PDF
      </a>
    </div>
  );
}
