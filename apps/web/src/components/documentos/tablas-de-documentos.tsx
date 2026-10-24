import { Fragment } from "react";
import Link from "next/link";
import type { DocumentoResumen, PacienteConDocumentos } from "@dental-mirage/shared-types";
import { CajaDeTabla } from "@/components/panel/caja-de-tabla";
import { ClickableTableRow } from "@/components/panel/clickable-table-row";
import { FechaHoraCelda } from "@/components/panel/fecha-hora-celda";
import {
  CLASE_CABECERA,
  CLASE_CAJA_TABLA,
  CLASE_CAJA_VACIA,
  CLASE_CELDA,
  CLASE_CELDA_SECUNDARIA,
  CLASE_COLUMNA_ACCIONES,
  CLASE_FILA_CLICABLE,
  CLASE_CODIGO,
  CLASE_MONO,
  CLASE_TABLA,
  CLASE_TEXTO_SECUNDARIO,
} from "@/components/panel/tabla";
import {
  ETIQUETA_DE_ESTADO,
  estadoEnTabla,
  fechaCorta,
  fechaDelDocumento,
  filasDeHistorias,
  huellaCorta,
  nombreConTipo,
  nombreDeModelo,
  nombreDelDocumento,
  partesFechaHoraDeDocumento,
  referenciaDeVinculo,
  type FilaDeHistorias,
} from "@/lib/documentos";
import { ImprimirYDescargar, tienePDF } from "./acciones-de-pdf";
import { CuerpoDesplegable, FilaDesplegable } from "./fila-desplegable";
import { PastillaDeEstado } from "./pastilla-de-estado";

// Las tablas del módulo de documentos (Fase 5.1), con el sistema común de
// las tablas del panel (components/panel/tabla.ts): en el celular van
// completas y scrollean de costado, y crecen hasta el espacio libre de la
// pantalla sin bajar de cuatro filas (CajaDeTabla, TR-180).

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

// Los rótulos que agrupan, al final de la tabla de historias, los anexos
// que no van debajo de una historia de la tabla: los de una historia que
// quien mira no ve (5.6b, no se nombra porque no se ve), y los sueltos (su
// historia quedó afuera por un filtro, o no tienen).
export const HISTORIA_OCULTA = "Historia de otro profesional, todavía sin terminar";
export const ANEXOS_SUELTOS = "Anexos sin su historia en esta lista";

// El nombre de un documento en su celda (5.6b). Un anexo va con la
// etiqueta "Anexo" (o "Anexo sin historia"); el suelto cuya historia quedó
// afuera dice de cuál es. Un anexo de continuación (Fase 5.6d) se nombra
// "Anexo Nº n · Sección", sin repetir la etiqueta. La sangría y el riel del
// subcuerpo los pone la celda.
//
// `sinTipo`: el nombre sin el tipo adelante, en una tabla que ya es de un
// solo tipo (las dos de la ficha del paciente).
function NombreDelDocumento({ documento: d, nivel, sinTipo }: FilaDeHistorias & { sinTipo: boolean }) {
  const link = (
    <Link href={`/panel/documentos/${d.id}`} className="rounded-sm font-medium text-grafito hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
      {d.continuacion ? nombreDelDocumento(d) : nivel === "documento" && !sinTipo ? nombreConTipo(d) : nombreDeModelo(d.plantillaNombre)}
    </Link>
  );
  if (nivel === "documento") return link;
  const sinHistoria = nivel === "anexo-suelto" && !d.anexoDe;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2">
        {!d.continuacion && (
          <span className="inline-flex rounded-pastilla border border-marca-medio bg-marfil px-1.5 text-[0.6875rem] leading-4 font-semibold text-marca">
            {sinHistoria ? "Anexo sin historia" : "Anexo"}
          </span>
        )}
        {link}
      </span>
      {nivel === "anexo-suelto" && d.anexoDe && (
        <span className={CLASE_TEXTO_SECUNDARIO}>
          De: {nombreDeModelo(d.anexoDe.nombre)} · {referenciaDeVinculo(d.anexoDe)}
        </span>
      )}
    </div>
  );
}

// El grupo de una fila de la tabla anidada: los anexos de una historia, los
// de la historia oculta y los sueltos son, cada uno, el subcuerpo de su
// grupo.
function grupoDe(nivel: FilaDeHistorias["nivel"]): "historia" | "oculta" | "sueltos" {
  if (nivel === "anexo-de-historia-oculta") return "oculta";
  if (nivel === "anexo-suelto") return "sueltos";
  return "historia";
}

// Si la fila que sigue es un anexo del mismo grupo (de esta historia, del
// rótulo de la historia oculta o del de los sueltos).
function sigueEnElGrupo(filas: FilaDeHistorias[], i: number): boolean {
  const siguiente = filas[i + 1]?.nivel;
  if (!siguiente || siguiente === "documento") return false;
  if (siguiente === "anexo") return true;
  return grupoDe(siguiente) === grupoDe(filas[i].nivel);
}

// El rótulo de un grupo de anexos sin historia en la tabla (la historia
// oculta, los sueltos), en una fila antes de su primer anexo.
function rotuloDelGrupo(filas: FilaDeHistorias[], i: number): string | null {
  const { nivel } = filas[i];
  if (nivel !== "anexo-de-historia-oculta" && nivel !== "anexo-suelto") return null;
  if (filas[i - 1]?.nivel === nivel) return null;
  return nivel === "anexo-suelto" ? ANEXOS_SUELTOS : HISTORIA_OCULTA;
}

// El riel del subcuerpo (correcciones generales, ítem 8, pedido de la
// persona: "los anexos deben verse como un subcuerpo por debajo de la
// historia clínica, esto más en mobile, a diferentes alturas de sangría").
// Una línea vertical que baja desde la historia (o desde el rótulo del
// grupo) y una rama hacia cada anexo; en el último del grupo la línea
// termina en la rama, como un └. Es decorativo: lo que dice que es un anexo
// es la etiqueta. Mide lo mismo en todos los anchos, porque en el celular la
// tabla ya no se comprime: scrollea de costado.
//
// La rama va a la mitad de la fila, donde queda el nombre (la celda lo
// centra): desde el 2026-10-18 la fila la alarga el chevron y, en el
// celular, la fecha en dos renglones, y una rama a una altura fija apuntaba
// por encima del nombre.
function RielDelSubcuerpo({ ultimo }: { ultimo: boolean }) {
  return (
    <>
      <span aria-hidden="true" className={`absolute top-0 left-6 w-px bg-marca-medio ${ultimo ? "h-1/2" : "bottom-0"}`} />
      <span aria-hidden="true" className="absolute top-1/2 left-6 h-px w-4 bg-marca-medio" />
    </>
  );
}

// El tramo del riel que cruza lo desplegado de un anexo que no es el último
// de su grupo: sin él, la línea se cortaba hasta el anexo siguiente.
function TramoDelRiel() {
  return <span aria-hidden="true" className="absolute inset-y-0 left-6 w-px bg-marca-medio" />;
}

// Lo desplegado arranca donde arranca el nombre de su fila: el de una
// historia con el relleno de la celda, el de un anexo con su sangría, a la
// derecha del riel.
const SANGRIA_DEL_DOCUMENTO = "pl-3 md:pl-2 2xl:pl-3";
const SANGRIA_DEL_ANEXO = "pl-12";

// Pacientes con documentos — debajo del selector (R8 del brief): nombre y
// DNI; tocar la fila lleva al registro de ese paciente.
export function TablaPacientesConDocumentos({ pacientes }: { pacientes: PacienteConDocumentos[] }) {
  if (pacientes.length === 0) {
    return (
      <p className={`${CLASE_CAJA_VACIA} p-4 text-sm text-grafito/80`}>
        Todavía no hay documentos terminados. Cuando termines el primero, el paciente aparece acá.
      </p>
    );
  }
  return (
    <CajaDeTabla llenaLaPantalla className={CLASE_CAJA_TABLA}>
      <table className={CLASE_TABLA}>
        <thead>
          <tr>
            <th className={CLASE_CABECERA}>Paciente</th>
            <th className={CLASE_CABECERA}>DNI</th>
            <th className={`${CLASE_CABECERA} text-right`}>Documentos</th>
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p) => (
            <ClickableTableRow key={p.id} href={`/panel/pacientes/${p.id}/documentos`} className={CLASE_FILA_CLICABLE}>
              <td className={CLASE_CELDA}>
                <Link href={`/panel/pacientes/${p.id}/documentos`} className="rounded-sm font-medium text-grafito hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
                  {p.nombre} {p.apellido}
                </Link>
                <p className={CLASE_TEXTO_SECUNDARIO}>Último: {fechaCorta(p.ultimo)}</p>
              </td>
              <td className={`${CLASE_CELDA} ${CLASE_MONO}`}>{p.dni}</td>
              <td className={`${CLASE_CELDA} text-right tabular-nums`}>{p.cantidad}</td>
            </ClickableTableRow>
          ))}
        </tbody>
      </table>
    </CajaDeTabla>
  );
}

// Una lista de documentos: el registro de un paciente, o lo mío en curso.
// Todas las columnas en todos los anchos (en el celular, la tabla scrollea
// de costado): nada baja debajo del documento. Una fila con PDF se despliega
// al tocarla, con Imprimir y Descargar adentro (FilaDesplegable); una sin PDF
// (un borrador, uno a firmar) abre el documento, que es lo más común:
// retomarlo. El nombre abre el documento en todas.
export function TablaDeDocumentos({
  documentos,
  conPaciente = false,
  anidada = false,
  sinTipo = false,
  vacio,
}: {
  documentos: DocumentoResumen[];
  /** Mostrar de quién es cada documento (la lista de "en curso"). */
  conPaciente?: boolean;
  /** Cada historia con sus anexos debajo (filasDeHistorias, 5.6b). */
  anidada?: boolean;
  /** La tabla es de un solo tipo: cada documento se nombra sin él. */
  sinTipo?: boolean;
  vacio: string;
}) {
  if (documentos.length === 0) {
    return <p className={`${CLASE_CAJA_VACIA} p-4 text-sm text-grafito/80`}>{vacio}</p>;
  }
  const filas: FilaDeHistorias[] = anidada ? filasDeHistorias(documentos) : documentos.map((documento) => ({ documento, nivel: "documento" }));
  // La columna del chevron, solo si alguna fila tiene PDF: la lista de lo
  // que está en curso no la necesita.
  const conAcciones = filas.some(({ documento }) => tienePDF(documento));
  const columnas = (conPaciente ? 4 : 6) + (conAcciones ? 1 : 0);
  // Las columnas desde la del documento: el rótulo de un grupo de anexos
  // ocupa ese tramo de la fila, alineado con el nombre de las historias.
  const columnasDesdeElDocumento = conPaciente ? columnas : columnas - 1;
  return (
    <CajaDeTabla llenaLaPantalla className={CLASE_CAJA_TABLA}>
      <table className={CLASE_TABLA}>
        <thead>
          <tr>
            {!conPaciente && <th className={CLASE_CABECERA}>Folio</th>}
            <th className={CLASE_CABECERA}>Documento</th>
            {conPaciente && <th className={CLASE_CABECERA}>Paciente</th>}
            <th className={CLASE_CABECERA}>Fecha</th>
            {!conPaciente && <th className={CLASE_CABECERA}>Profesional</th>}
            {!conPaciente && <th className={CLASE_CABECERA}>Huella</th>}
            <th className={CLASE_CABECERA}>Estado</th>
            {conAcciones && <th className={`${CLASE_CABECERA} ${CLASE_COLUMNA_ACCIONES}`} aria-hidden="true" />}
          </tr>
        </thead>
        <CuerpoDesplegable>
          {filas.map(({ documento: d, nivel }, i) => {
            const rotulo = rotuloDelGrupo(filas, i);
            const anexo = nivel !== "documento";
            const ultimoDelGrupo = !sigueEnElGrupo(filas, i);
            // Una historia y sus anexos se leen como un bloque: sin la línea
            // entre ellos, solo entre un grupo y el siguiente. Sin fondo propio
            // (pedido de la persona): el subcuerpo lo marcan el riel y la
            // sangría.
            const celdas = (
              <>
                {/* El folio y la huella no se parten ("Anexo Nº" arriba y el
                    número abajo, o la huella cortada en la elipsis) cuando la
                    columna se angosta. */}
                {!conPaciente && (
                  <td className={`${CLASE_CELDA} ${CLASE_MONO}`}>
                    <span className="whitespace-nowrap">{d.folioMostrado ?? "—"}</span>
                  </td>
                )}
                {/* La sangría repetida por breakpoint: el padding de CLASE_CELDA
                    cambia en `md` y `2xl`, y sin esto la pisaría. */}
                <td className={anexo ? `${CLASE_CELDA} relative pl-12 md:pl-12 2xl:pl-12` : CLASE_CELDA}>
                  {anexo && <RielDelSubcuerpo ultimo={ultimoDelGrupo} />}
                  <NombreDelDocumento documento={d} nivel={nivel} sinTipo={sinTipo} />
                </td>
                {conPaciente && (
                  <td className={CLASE_CELDA}>
                    {d.paciente.nombre} {d.paciente.apellido}
                  </td>
                )}
                <td className={`${CLASE_CELDA} ${CLASE_MONO}`}>
                  <FechaHoraCelda iso={fechaDelDocumento(d)} formato={partesFechaHoraDeDocumento} />
                </td>
                {!conPaciente && (
                  <td className={CLASE_CELDA}>
                    {d.autorNombre}
                    {!d.esMio && <span className={`ml-1 ${CLASE_TEXTO_SECUNDARIO}`}>(colega)</span>}
                  </td>
                )}
                {/* La huella del contenido congelado (SHA-256), abreviada; la
                    completa en el title y en la constancia del documento.
                    Pedido del cliente, 2026-09-29. */}
                {!conPaciente && (
                  <td className={`${CLASE_CELDA} ${CLASE_CODIGO}`}>
                    <span className="whitespace-nowrap" title={d.hashContenido}>
                      {huellaCorta(d.hashContenido)}
                    </span>
                  </td>
                )}
                <td className={CLASE_CELDA}>
                  <EstadoEnTabla estado={d.estado} enLinea />
                </td>
              </>
            );
            return (
              <Fragment key={d.id}>
                {rotulo && (
                  <tr className="border-b border-transparent">
                    {!conPaciente && <td aria-hidden="true" className={CLASE_CELDA} />}
                    <td colSpan={columnasDesdeElDocumento} className={`${CLASE_CELDA_SECUNDARIA} font-medium`}>
                      {rotulo}
                    </td>
                  </tr>
                )}
                {tienePDF(d) ? (
                  <FilaDesplegable
                    id={d.id}
                    columnas={columnas}
                    columnasAntes={conPaciente ? 0 : 1}
                    sangria={anexo ? SANGRIA_DEL_ANEXO : SANGRIA_DEL_DOCUMENTO}
                    riel={anexo && !ultimoDelGrupo ? <TramoDelRiel /> : null}
                    sinBorde={!ultimoDelGrupo}
                    acciones={<ImprimirYDescargar documento={d} />}
                  >
                    {celdas}
                  </FilaDesplegable>
                ) : (
                  <ClickableTableRow href={`/panel/documentos/${d.id}`} className={`${CLASE_FILA_CLICABLE} ${ultimoDelGrupo ? "" : "border-b-transparent"}`}>
                    {celdas}
                    {conAcciones && <td aria-hidden="true" className={`${CLASE_CELDA} ${CLASE_COLUMNA_ACCIONES}`} />}
                  </ClickableTableRow>
                )}
              </Fragment>
            );
          })}
        </CuerpoDesplegable>
      </table>
    </CajaDeTabla>
  );
}
