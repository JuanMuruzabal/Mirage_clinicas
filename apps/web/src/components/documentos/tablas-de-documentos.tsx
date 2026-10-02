import Link from "next/link";
import type { DocumentoResumen, PacienteConDocumentos } from "@dental-mirage/shared-types";
import { CajaDeTabla } from "@/components/panel/caja-de-tabla";
import { ClickableTableRow } from "@/components/panel/clickable-table-row";
import { CHIP_DE_ESTADO, ETIQUETA_DE_ESTADO, fechaCorta, huellaCorta, nombreConTipo } from "@/lib/documentos";
import { AccionesDePDF, nombreDeArchivoDelPDF, tienePDF } from "./acciones-de-pdf";

// Las tablas del módulo de documentos (Fase 5.1). Misma caja que el resto
// del panel: en el celular muestra cuatro filas enteras antes del scroll
// (CajaDeTabla, TR-180).

const CAJA =
  "panel-table-scroll max-h-[420px] overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:max-h-[var(--alto-mobile,21rem)] md:overflow-x-auto";
const FILA_CABECERA = "border-b border-arena text-xs font-semibold uppercase tracking-wide text-grafito/70 md:border-b-[0.5px]";
const FILA = "border-b border-arena last:border-b-0 hover:bg-arena md:border-b-[0.5px]";

// En la celda de una tabla, en el celular, el chip puede partirse en dos
// renglones (`partible`): "Listo para imprimir o descargar" en una sola
// línea no entra junto al folio y al documento, y empujaba la tabla de
// costado. Desde `md` hay lugar y va en una línea, como en el encabezado del
// documento.
export function EstadoDeDocumento({ estado, partible = false }: { estado: DocumentoResumen["estado"]; partible?: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
        partible ? "max-md:rounded-[0.75rem] max-md:leading-snug md:whitespace-nowrap" : "whitespace-nowrap"
      } ${CHIP_DE_ESTADO[estado]}`}
    >
      {ETIQUETA_DE_ESTADO[estado]}
    </span>
  );
}

// Pacientes con documentos — debajo del selector (R8 del brief): nombre y
// DNI; tocar la fila lleva al registro de ese paciente.
export function TablaPacientesConDocumentos({ pacientes }: { pacientes: PacienteConDocumentos[] }) {
  if (pacientes.length === 0) {
    return (
      <p className="rounded-card border border-linea bg-marfil p-4 text-sm text-grafito/80 shadow-soft">
        Todavía no hay documentos terminados. Cuando termines el primero, el paciente aparece acá.
      </p>
    );
  }
  return (
    <CajaDeTabla className={CAJA}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className={FILA_CABECERA}>
            <th className="panel-th-sticky px-4 py-3">Paciente</th>
            <th className="panel-th-sticky px-4 py-3">DNI</th>
            <th className="panel-th-sticky px-4 py-3 text-right">Documentos</th>
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p) => (
            <ClickableTableRow key={p.id} href={`/panel/pacientes/${p.id}/documentos`} className={FILA}>
              <td className="px-4 py-3">
                <Link href={`/panel/pacientes/${p.id}/documentos`} className="font-medium text-grafito hover:underline">
                  {p.nombre} {p.apellido}
                </Link>
                <p className="text-xs text-grafito/70">Último: {fechaCorta(p.ultimo)}</p>
              </td>
              <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{p.dni}</td>
              <td className="px-4 py-3 text-right tabular-nums text-grafito">{p.cantidad}</td>
            </ClickableTableRow>
          ))}
        </tbody>
      </table>
    </CajaDeTabla>
  );
}

// Una lista de documentos: el registro de un paciente, o lo mío en curso.
export function TablaDeDocumentos({
  documentos,
  conPaciente = false,
  compacta = false,
  vacio,
}: {
  documentos: DocumentoResumen[];
  /** Mostrar de quién es cada documento (la lista de "en curso"). */
  conPaciente?: boolean;
  /** Para una columna angosta (debajo de "Completar este documento"): la
   *  fecha va debajo del documento en vez de en su propia columna. */
  compacta?: boolean;
  vacio: string;
}) {
  if (documentos.length === 0) {
    return <p className="rounded-card border border-linea bg-marfil p-4 text-sm text-grafito/80 shadow-soft">{vacio}</p>;
  }
  return (
    <CajaDeTabla className={CAJA}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className={FILA_CABECERA}>
            {!conPaciente && <th className="panel-th-sticky px-4 py-3">Folio</th>}
            <th className="panel-th-sticky px-4 py-3">Documento</th>
            {conPaciente && <th className="panel-th-sticky px-4 py-3">Paciente</th>}
            {!compacta && <th className="panel-th-sticky max-md:hidden px-4 py-3">Fecha</th>}
            {!conPaciente && <th className="panel-th-sticky max-md:hidden px-4 py-3">Profesional</th>}
            {!conPaciente && <th className="panel-th-sticky max-md:hidden px-4 py-3">Huella</th>}
            <th className="panel-th-sticky px-4 py-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          {documentos.map((d) => (
            <ClickableTableRow key={d.id} href={`/panel/documentos/${d.id}`} className={FILA}>
              {!conPaciente && <td className="px-4 py-3 tabular-nums text-grafito">{d.folio ?? "—"}</td>}
              <td className="px-4 py-3">
                <Link href={`/panel/documentos/${d.id}`} className="font-medium text-grafito hover:underline">
                  {nombreConTipo(d)}
                </Link>
                {compacta && <p className="text-xs text-grafito/70">{fechaCorta(d.selladoEn ?? d.terminadoEn ?? d.actualizadoEn)}</p>}
                {/* En el celular la columna de la huella no entra: baja
                    debajo del documento, como el profesional en la ficha. */}
                {!conPaciente && d.hashContenido && (
                  <p className="font-[family-name:var(--font-mono)] text-xs text-grafito/70 md:hidden" title={d.hashContenido}>
                    Huella {huellaCorta(d.hashContenido)}
                  </p>
                )}
                {/* Un documento terminado se imprime o se descarga desde la
                    misma fila, sin abrirlo (Fase 5.3). */}
                {tienePDF(d) && <AccionesDePDF id={d.id} nombre={nombreConTipo(d)} nombreDeArchivo={nombreDeArchivoDelPDF(d)} />}
              </td>
              {conPaciente && (
                <td className="px-4 py-3 text-grafito">
                  {d.paciente.nombre} {d.paciente.apellido}
                </td>
              )}
              {!compacta && <td className="max-md:hidden px-4 py-3 text-grafito">{fechaCorta(d.selladoEn ?? d.terminadoEn ?? d.actualizadoEn)}</td>}
              {!conPaciente && (
                <td className="max-md:hidden px-4 py-3 text-grafito">
                  {d.autorNombre}
                  {!d.esMio && <span className="ml-1 text-xs text-grafito/70">(colega)</span>}
                </td>
              )}
              {/* La huella del contenido congelado (SHA-256), abreviada; la
                  completa en el title y en la constancia del documento.
                  Pedido del cliente, 2026-09-29. */}
              {!conPaciente && (
                <td className="max-md:hidden px-4 py-3 font-[family-name:var(--font-mono)] text-xs whitespace-nowrap text-grafito" title={d.hashContenido}>
                  {huellaCorta(d.hashContenido)}
                </td>
              )}
              <td className="px-4 py-3">
                <EstadoDeDocumento estado={d.estado} partible />
              </td>
            </ClickableTableRow>
          ))}
        </tbody>
      </table>
    </CajaDeTabla>
  );
}
