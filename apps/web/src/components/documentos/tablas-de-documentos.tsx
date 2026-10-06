import { Fragment } from "react";
import Link from "next/link";
import type { DocumentoResumen, PacienteConDocumentos } from "@dental-mirage/shared-types";
import { CajaDeTabla } from "@/components/panel/caja-de-tabla";
import { ClickableTableRow } from "@/components/panel/clickable-table-row";
import { FechaHoraCelda } from "@/components/panel/fecha-hora-celda";
import {
  ETIQUETA_DE_ESTADO,
  estadoEnTabla,
  fechaCorta,
  fechaDelDocumento,
  fechaYHora,
  filasDeHistorias,
  huellaCorta,
  nombreConTipo,
  nombreDeModelo,
  nombreDelDocumento,
  partesFechaHoraDeDocumento,
  referenciaDeVinculo,
  rotuloDeFolio,
  type FilaDeHistorias,
} from "@/lib/documentos";
import { AccionesDePDF, nombreDeArchivoDelPDF, tienePDF } from "./acciones-de-pdf";
import { PastillaDeEstado } from "./pastilla-de-estado";

// Las tablas del módulo de documentos (Fase 5.1). Misma caja que el resto
// del panel: en el celular muestra cuatro filas enteras antes del scroll
// (CajaDeTabla, TR-180).

const CAJA =
  "panel-table-scroll max-h-[420px] overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:max-h-[var(--alto-mobile,21rem)] md:overflow-x-auto";
const FILA_CABECERA = "border-b border-arena text-xs font-semibold uppercase tracking-wide text-grafito/70 md:border-b-[0.5px]";
const FILA = "border-b border-arena last:border-b-0 hover:bg-arena md:border-b-[0.5px]";

// El estado en el encabezado de un documento, con todo su detalle
// ("Esperando firmas", "Firmado y sellado").
export function EstadoDeDocumento({ estado }: { estado: DocumentoResumen["estado"] }) {
  return (
    <PastillaDeEstado estado={estado} grande>
      {ETIQUETA_DE_ESTADO[estado]}
    </PastillaDeEstado>
  );
}

// El estado en una tabla (2026-10-05): Borrador, Completado o Anulado, el
// mismo nombre en todas las tablas del módulo (estadoEnTabla). Un "a
// firmar" lleva debajo la marca de la firma que falta.
// `enLinea`: la marca al lado de la etiqueta, para cuando va debajo del
// nombre del documento (en el celular).
export function EstadoEnTabla({ estado, enLinea = false }: { estado: DocumentoResumen["estado"]; enLinea?: boolean }) {
  const { etiqueta, faltaFirmar } = estadoEnTabla(estado);
  // Un "a firmar" se muestra como completado (salvia) con la marca de la
  // firma que falta (terracota); el resto, con el color de su estado.
  const color = estado === "a_firmar" || estado === "para_imprimir" ? "sellado" : estado;
  return (
    <span className={`inline-flex gap-1 ${enLinea ? "flex-wrap items-center" : "flex-col items-start"}`}>
      <PastillaDeEstado estado={color}>{etiqueta}</PastillaDeEstado>
      {faltaFirmar && <PastillaDeEstado estado="a_firmar">Falta firmar</PastillaDeEstado>}
    </span>
  );
}

// El rótulo que agrupa, al final de la tabla de historias, los anexos de
// una historia que quien mira no ve (5.6b): no se nombra porque no se ve.
export const HISTORIA_OCULTA = "Historia de otro profesional, todavía sin terminar";

// El nombre de un documento en su celda (5.6b). Un anexo debajo de su
// historia (o del rótulo de una historia oculta) va con sangría, un
// conector y la etiqueta "Anexo"; uno cuya historia no está en la tabla
// dice de cuál es, o que no tiene. Un anexo de continuación (Fase 5.6d) se
// nombra "Anexo Nº n · Sección", sin repetir la etiqueta.
//
// `sinTipo`: el nombre sin el tipo adelante, en una tabla que ya es de un
// solo tipo (las dos de la ficha del paciente).
function NombreDelDocumento({ documento: d, nivel, sinTipo }: FilaDeHistorias & { sinTipo: boolean }) {
  const link = (
    <Link href={`/panel/documentos/${d.id}`} className="font-medium text-grafito hover:underline">
      {d.continuacion ? nombreDelDocumento(d) : nivel === "documento" && !sinTipo ? nombreConTipo(d) : nombreDeModelo(d.plantillaNombre)}
    </Link>
  );
  if (nivel === "documento") return link;
  const sinHistoria = nivel === "anexo-suelto" && !d.anexoDe;
  const anidado = nivel !== "anexo-suelto";
  return (
    <div className={`flex items-start gap-2 ${anidado ? "pl-3" : ""}`}>
      {anidado && <span aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 rounded-bl-sm border-b border-l border-grafito/60" />}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {!d.continuacion && <span className="inline-flex rounded-full border border-grafito/60 bg-hueso px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap text-grafito/80">{sinHistoria ? "Anexo sin historia" : "Anexo"}</span>}
          {link}
        </span>
        {nivel === "anexo-suelto" && d.anexoDe && (
          <span className="text-xs text-grafito/75">
            De: {nombreDeModelo(d.anexoDe.nombre)} · {referenciaDeVinculo(d.anexoDe)}
          </span>
        )}
      </div>
    </div>
  );
}

// Si la fila que sigue es un anexo del mismo grupo (de esta historia, o del
// mismo rótulo de historia oculta).
function sigueEnElGrupo(filas: FilaDeHistorias[], i: number): boolean {
  const siguiente = filas[i + 1]?.nivel;
  if (siguiente === "anexo") return true;
  return siguiente === "anexo-de-historia-oculta" && filas[i].nivel === "anexo-de-historia-oculta";
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
// La fecha es la de fechaDelDocumento, con hora (en el celular, en dos
// renglones: FechaHoraCelda).
export function TablaDeDocumentos({
  documentos,
  conPaciente = false,
  compacta = false,
  anidada = false,
  sinTipo = false,
  vacio,
}: {
  documentos: DocumentoResumen[];
  /** Mostrar de quién es cada documento (la lista de "en curso"). */
  conPaciente?: boolean;
  /** Para una columna angosta (debajo de "Completar este documento"): la
   *  fecha va debajo del documento en vez de en su propia columna. */
  compacta?: boolean;
  /** Cada historia con sus anexos debajo (filasDeHistorias, 5.6b). */
  anidada?: boolean;
  /** La tabla es de un solo tipo: cada documento se nombra sin él. */
  sinTipo?: boolean;
  vacio: string;
}) {
  if (documentos.length === 0) {
    return <p className="rounded-card border border-linea bg-marfil p-4 text-sm text-grafito/80 shadow-soft">{vacio}</p>;
  }
  const filas: FilaDeHistorias[] = anidada ? filasDeHistorias(documentos) : documentos.map((documento) => ({ documento, nivel: "documento" }));
  // Documento y Estado, más las que dependen de la vista: para el rótulo de
  // los anexos de una historia oculta, que ocupa la fila entera.
  const columnas = 2 + (conPaciente ? 1 : 3) + (compacta ? 0 : 1);
  // Con la columna de la fecha, en el celular no entran el documento (con
  // Imprimir/PDF), la fecha y el estado: el estado baja debajo del
  // documento, como el folio y la huella.
  const conFecha = !compacta;
  return (
    <CajaDeTabla className={CAJA}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className={FILA_CABECERA}>
            {!conPaciente && <th className="panel-th-sticky max-md:hidden px-4 py-3">Folio</th>}
            <th className="panel-th-sticky px-4 py-3">Documento</th>
            {conPaciente && <th className="panel-th-sticky px-4 py-3">Paciente</th>}
            {!compacta && <th className="panel-th-sticky px-4 py-3">Fecha</th>}
            {!conPaciente && <th className="panel-th-sticky max-md:hidden px-4 py-3">Profesional</th>}
            {!conPaciente && <th className="panel-th-sticky max-md:hidden px-4 py-3">Huella</th>}
            <th className={`panel-th-sticky px-4 py-3 max-md:px-3 ${conFecha ? "max-md:hidden" : ""}`}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ documento: d, nivel }, i) => (
            <Fragment key={d.id}>
            {nivel === "anexo-de-historia-oculta" && filas[i - 1]?.nivel !== nivel && (
              <tr className="border-b border-transparent md:border-b-[0.5px]">
                <td colSpan={columnas} className="px-4 pt-3 pb-1 text-xs font-medium text-grafito/75">
                  {HISTORIA_OCULTA}
                </td>
              </tr>
            )}
            {/* Una historia y sus anexos se leen como un bloque: sin la línea
                entre ellos, solo entre un grupo y el siguiente. */}
            <ClickableTableRow href={`/panel/documentos/${d.id}`} className={`${FILA} ${sigueEnElGrupo(filas, i) ? "border-b-transparent" : ""}`}>
              {!conPaciente && <td className="max-md:hidden px-4 py-3 tabular-nums text-grafito">{d.folioMostrado ?? "—"}</td>}
              <td className="px-4 py-3">
                <NombreDelDocumento documento={d} nivel={nivel} sinTipo={sinTipo} />
                {compacta && <p className="text-xs text-grafito/75">{fechaYHora(fechaDelDocumento(d))}</p>}
                {/* En el celular las columnas del folio y de la huella no
                    entran: bajan debajo del documento, como el profesional
                    en la ficha. */}
                {!conPaciente && d.folioMostrado && <p className="text-xs tabular-nums text-grafito/75 md:hidden">{rotuloDeFolio(d.folioMostrado)}</p>}
                {!conPaciente && d.hashContenido && (
                  <p className="font-[family-name:var(--font-mono)] text-xs text-grafito/75 md:hidden" title={d.hashContenido}>
                    Huella {huellaCorta(d.hashContenido)}
                  </p>
                )}
                {/* Un documento terminado se imprime o se descarga desde la
                    misma fila, sin abrirlo (Fase 5.3). */}
                {conFecha && (
                  <div className="mt-1.5 md:hidden">
                    <EstadoEnTabla estado={d.estado} enLinea />
                  </div>
                )}
                {tienePDF(d) && <AccionesDePDF id={d.id} nombre={nombreDelDocumento(d)} nombreDeArchivo={nombreDeArchivoDelPDF(d)} />}
              </td>
              {conPaciente && (
                <td className="px-4 py-3 text-grafito">
                  {d.paciente.nombre} {d.paciente.apellido}
                </td>
              )}
              {!compacta && (
                <td className="px-4 py-3 tabular-nums text-grafito">
                  <FechaHoraCelda iso={fechaDelDocumento(d)} formato={partesFechaHoraDeDocumento} />
                </td>
              )}
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
              <td className={`px-4 py-3 max-md:px-3 ${conFecha ? "max-md:hidden" : ""}`}>
                <EstadoEnTabla estado={d.estado} />
              </td>
            </ClickableTableRow>
            </Fragment>
          ))}
        </tbody>
      </table>
    </CajaDeTabla>
  );
}
