import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { IconDownload, IconPrinter } from "@/components/icons";
import { rutaDelPDF } from "@/lib/pdf-de-documentos";
import { BotonDescargarPDF } from "./descargar-pdf";

// El PDF de un documento terminado (Fase 5.3): lo genera la API en cada
// pedido, por la ruta /panel/documentos/{id}/pdf (BFF). Con `?para=imprimir`
// vuelve inline, para abrirlo en una pestaña nueva e imprimirlo desde el
// visor del navegador; sin eso, como descarga (`BotonDescargarPDF`).
//
// Este archivo no es de cliente a propósito: `tienePDF` se llama desde la
// tabla de documentos, que también se dibuja en el servidor.
export { nombreDeArchivoDelPDF, rutaDelPDF } from "@/lib/pdf-de-documentos";

/** ¿Este documento tiene PDF? Lo dice la API (`tienePDF` del resumen): un
 *  consentimiento para imprimir y una historia clínica sellada, siempre que
 *  su contenido congelado traiga la composición de la lámina — uno sellado
 *  en la 5.1, antes de que existiera, no la trae y no tiene PDF. Un borrador
 *  o uno a firmar, nunca: el estado se mira igual, por las dudas. */
export function tienePDF(documento: Pick<DocumentoResumen, "estado" | "tienePDF">): boolean {
  return (documento.estado === "para_imprimir" || documento.estado === "sellado") && documento.tienePDF;
}

// Una mitad del control: cómoda para el dedo en el celular (36 px) sin ser
// una pastilla enorme, y más baja desde md, donde se usa el mouse. En el
// celular, con poco relleno: a 390 px la columna del documento deja unos
// 130 px, y las dos mitades tienen que entrar ahí (medido, 2026-10-02).
const MITAD =
  "inline-flex min-h-9 items-center gap-1 whitespace-nowrap border border-linea bg-hueso px-2 text-xs font-medium text-salvia-oscuro hover:bg-arena focus-visible:relative focus-visible:z-10 sm:gap-1.5 sm:px-3 md:min-h-8";

// AccionesDePDF — "Imprimir" y "Descargar PDF" en una fila de una tabla, como
// un control segmentado: una sola pastilla partida por una línea (pedido
// del cliente, 2026-10-02: en el celular eran dos pastillas grandes
// apiladas). En el celular la descarga dice "PDF"; el nombre accesible
// sigue completo.
//
// Las mitades son hermanas en una grilla y no van dentro de una caja propia:
// la grilla no las separa nunca en dos renglones, y el aviso de un error de
// la descarga (que dibuja `BotonDescargarPDF` al lado del link) baja a su
// propio renglón en vez de quedar adentro de la pastilla. La tercera
// columna (1fr) es la que absorbe el ancho del aviso: sin ella, las mitades
// se estirarían.
//
// Son <a> y no <Link>: la ruta devuelve un archivo, no una pantalla. Dentro
// de una ClickableTableRow no navegan la fila (la fila ignora los clicks
// sobre un link propio).
export function AccionesDePDF({ id, nombre, nombreDeArchivo = "documento.pdf" }: { id: string; nombre: string; nombreDeArchivo?: string }) {
  return (
    <div className="mt-2 grid grid-cols-[auto_auto_1fr] items-center">
      <a
        href={rutaDelPDF(id, true)}
        target="_blank"
        rel="noopener"
        aria-label={`Imprimir ${nombre} (se abre en una pestaña nueva)`}
        className={`${MITAD} rounded-l-full`}
      >
        <IconPrinter className="h-3.5 w-3.5 shrink-0" />
        Imprimir
      </a>
      <BotonDescargarPDF
        id={id}
        nombreDeArchivo={nombreDeArchivo}
        titulo={nombre}
        de={nombre}
        icono={<IconDownload className="h-3.5 w-3.5 shrink-0" />}
        className={`${MITAD} rounded-r-full border-l-0 aria-busy:max-sm:animate-pulse`}
        claseDelAviso="col-span-3 mt-1 text-xs"
        // En el celular la mitad sigue diciendo "PDF" en todos los estados:
        // "Preparando…" o "Guardar PDF" ensanchaban la columna y la tabla
        // se corría de costado (medido a 390 px). Mientras baja, late; si
        // hay que tocarla de nuevo, lo dice el aviso de abajo.
        etiquetas={{
          preparando: (
            <>
              <span className="sm:hidden">PDF</span>
              <span className="max-sm:hidden">Preparando…</span>
            </>
          ),
          guardar: (
            <>
              <span className="sm:hidden">PDF</span>
              <span className="max-sm:hidden">Guardar PDF</span>
            </>
          ),
        }}
        avisoParaGuardar="El PDF está listo: tocá de nuevo para guardarlo."
      >
        <span className="sm:hidden">PDF</span>
        <span className="max-sm:hidden">Descargar PDF</span>
      </BotonDescargarPDF>
    </div>
  );
}
