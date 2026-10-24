import type { ReactNode } from "react";
import type { DocumentoResumen, EstadoDocumento } from "@dental-mirage/shared-types";
import { IconDownload, IconPrinter } from "@/components/icons";
import { CLASE_TACTIL } from "@/components/editor-pagina/estilos";
import { CLASE_TEXTO_SECUNDARIO } from "@/components/panel/tabla";
import { nombreDelDocumento } from "@/lib/documentos";
import { nombreDeArchivoDelPDF, rutaDelPDF } from "@/lib/pdf-de-documentos";
import { BotonDescargarPDF } from "./descargar-pdf";

// El PDF de un documento terminado (Fase 5.3): lo genera la API en cada
// pedido, por la ruta /panel/documentos/{id}/pdf (BFF). Con `?para=imprimir`
// vuelve inline, para abrirlo en una pestaña nueva e imprimirlo desde el
// visor del navegador; sin eso, como descarga (`BotonDescargarPDF`).
//
// Este archivo no es de cliente a propósito: `tienePDF` se llama desde la
// tabla de documentos, que también se dibuja en el servidor.
export { nombreDeArchivoDelPDF, rutaDelPDF } from "@/lib/pdf-de-documentos";

/** ¿Este documento tiene PDF? Lo dice la API (`tienePDF` del resumen, o de
 *  cada anexo de una historia): un consentimiento para imprimir, una historia
 *  clínica sellada —siempre que su contenido congelado traiga la composición
 *  de la lámina: uno sellado en la 5.1, antes de que existiera, no la trae y
 *  no tiene PDF— y un anexo de continuación, con sus asientos (Fase 5.6d). Un
 *  borrador o uno a firmar, nunca: el estado se mira igual, por las dudas. */
export function tienePDF(documento: { estado: EstadoDocumento; tienePDF?: boolean }): boolean {
  return (documento.estado === "para_imprimir" || documento.estado === "sellado" || documento.estado === "abierto") && documento.tienePDF === true;
}

/** Cuántos anexos entran en el PDF de una historia con sus anexos: los de su
 *  lista que tienen PDF. La API arma ese PDF con el mismo criterio. */
export function anexosConPDF(documento: Pick<DocumentoResumen, "anexos">): number {
  return documento.anexos?.filter(tienePDF).length ?? 0;
}

// El botón de PDF (Imprimir, Descargar PDF) en TODAS las pantallas del
// módulo: secundario y chico —36 px en la computadora, del ancho de su
// contenido—, con el borde de la marca sobre marfil para que no se pierda
// en el fondo, y de 44 px con el dedo (CLASE_TACTIL). Sin redondeo: lo pone
// quien lo usa (una pastilla entera, o una mitad del control segmentado).
export const CLASE_BOTON_PDF = `inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap border border-marca bg-marfil px-3 text-sm font-semibold text-marca hover:bg-velo ${CLASE_TACTIL}`;

// Una mitad del control segmentado de las tablas. En el celular, con poco
// relleno: a 390 px la columna del documento deja unos 130 px, y las dos
// mitades tienen que entrar ahí (medido, 2026-10-02).
const MITAD = `${CLASE_BOTON_PDF} focus-visible:relative focus-visible:z-10 max-sm:gap-1 max-sm:px-2`;

// AccionesDePDF — "Imprimir" y "Descargar PDF" como un control segmentado: una
// sola pastilla partida por una línea (pedido del cliente, 2026-10-02: en el
// celular eran dos pastillas grandes apiladas). Nació para las filas de las
// tablas, que desde el 2026-10-18 despliegan `ImprimirYDescargar`; queda en el
// encabezado de un anexo de continuación, que se imprime solo. En el celular
// la descarga dice "PDF"; el nombre accesible sigue completo.
//
// Las mitades son hermanas en una grilla y no van dentro de una caja propia:
// la grilla no las separa nunca en dos renglones, y el aviso de un error de
// la descarga (que dibuja `BotonDescargarPDF` al lado del link) baja a su
// propio renglón en vez de quedar adentro de la pastilla. La tercera
// columna (1fr) es la que absorbe el ancho del aviso: sin ella, las mitades
// se estirarían.
//
// Son <a> y no <Link>: la ruta devuelve un archivo, no una pantalla.
export function AccionesDePDF({ id, nombre, nombreDeArchivo = "documento.pdf" }: { id: string; nombre: string; nombreDeArchivo?: string }) {
  return (
    <div className="mt-2 grid grid-cols-[auto_auto_1fr] items-center">
      <a
        href={rutaDelPDF(id, true)}
        target="_blank"
        rel="noopener"
        aria-label={`Imprimir ${nombre} (se abre en una pestaña nueva)`}
        className={`${MITAD} rounded-l-control`}
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
        className={`${MITAD} rounded-r-control border-l-0 aria-busy:max-sm:animate-pulse`}
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

const PILDORA = `${CLASE_BOTON_PDF} rounded-control`;

// ImprimirYDescargar — las acciones del PDF de un documento terminado en la
// fila desplegada de una tabla y en la pantalla de un sellado. Una historia
// con anexos con PDF las ofrece en dos grupos a la vista, "Solo la historia" y
// "Con sus N anexos" (correcciones generales, 2026-10-18): no en un menú que
// se cierra al elegir, porque "Descargar PDF" tiene estados ("Preparando…",
// "Guardar PDF") que se perderían, y "Guardar como" o la hoja de compartir
// necesitan el gesto del clic. Sin anexos con PDF, un solo par.
export function ImprimirYDescargar({ documento: d }: { documento: DocumentoResumen }) {
  const nombre = nombreDelDocumento(d);
  const solo = <ParDePDF id={d.id} nombre={nombre} nombreDeArchivo={nombreDeArchivoDelPDF(d)} />;
  const anexos = anexosConPDF(d);
  if (anexos === 0) return solo;
  const conAnexos = anexos === 1 ? "Con su anexo" : `Con sus ${anexos} anexos`;
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      <GrupoDePDF rotulo="Solo la historia">{solo}</GrupoDePDF>
      <GrupoDePDF rotulo={conAnexos}>
        <ParDePDF id={d.id} conAnexos nombre={`${nombre} ${conAnexos.toLowerCase()}`} nombreDeArchivo={nombreDeArchivoDelPDF(d, true)} />
      </GrupoDePDF>
    </div>
  );
}

// El rótulo visible es el nombre del grupo: el lector de pantalla lo dice al
// entrar, y no lo repite como un texto suelto.
function GrupoDePDF({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-col gap-1.5">
      <p aria-hidden="true" className={`${CLASE_TEXTO_SECUNDARIO} font-semibold`}>
        {rotulo}
      </p>
      {children}
    </div>
  );
}

// "Imprimir" abre el PDF inline en una pestaña nueva; "Descargar PDF" lo baja
// y lo guarda según el dispositivo (`BotonDescargarPDF`). El nombre accesible
// dice de qué documento es (y si va con sus anexos): en una tabla hay varios.
// En el celular la descarga dice "PDF" en todos sus estados, como en
// `AccionesDePDF`: debajo de un anexo, con su sangría, "Descargar PDF" no
// entraba al lado de "Imprimir" y bajaba a otro renglón (medido a 375 y 390
// px, 2026-10-18). Si hay que tocarla de nuevo, lo dice el aviso de abajo.
function ParDePDF({ id, nombre, nombreDeArchivo, conAnexos = false }: { id: string; nombre: string; nombreDeArchivo: string; conAnexos?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={rutaDelPDF(id, true, conAnexos)}
        target="_blank"
        rel="noopener"
        aria-label={`Imprimir ${nombre} (se abre en una pestaña nueva)`}
        className={PILDORA}
      >
        <IconPrinter className="h-3.5 w-3.5 shrink-0" />
        Imprimir
      </a>
      <BotonDescargarPDF
        id={id}
        conAnexos={conAnexos}
        nombreDeArchivo={nombreDeArchivo}
        titulo={nombre}
        de={nombre}
        icono={<IconDownload className="h-3.5 w-3.5 shrink-0" />}
        className={`${PILDORA} aria-busy:max-sm:animate-pulse`}
        claseDelAviso="basis-full text-xs"
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
