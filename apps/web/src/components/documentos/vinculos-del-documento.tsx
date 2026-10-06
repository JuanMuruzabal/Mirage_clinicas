import Link from "next/link";
import { ETIQUETA_DE_SECCION_DE_CONTINUACION } from "@dental-mirage/documentos-clinicos";
import type { DocumentoDetalle, DocumentoResumen, DocumentoVinculado, SeccionDeContinuacion } from "@dental-mirage/shared-types";
import { CLASE_TACTIL } from "@/components/editor-pagina/estilos";
import { anexosPorSeccion, esAnexoSinFolio, fechaYHora, nombreDeModelo, nombreDelDocumento, rotuloDeFolio } from "@/lib/documentos";
import { EstadoEnTabla } from "./tablas-de-documentos";
import { ContinuacionDeLaSeccion } from "./anexo-de-continuacion";

const LINK = "font-semibold text-salvia-oscuro underline-offset-2 hover:text-grafito hover:underline";
const ROTULO = "text-xs font-semibold uppercase tracking-wide text-grafito/75";
const MIGA = `inline-flex items-center rounded-sm text-salvia-oscuro underline-offset-2 hover:text-grafito hover:underline ${CLASE_TACTIL}`;

// MigaDelDocumento — de dónde cuelga el documento (2026-10-06): Documentos ›
// el paciente (sus documentos) › la historia, si es un anexo, › este. Con los
// dos niveles, "volver" lleva a donde se esperaba se haya entrado desde el
// módulo o desde la ficha del paciente.
export function MigaDelDocumento({
  documento,
  titulo,
}: {
  documento: Pick<DocumentoDetalle, "paciente" | "anexoDe">;
  titulo: string;
}) {
  const { paciente, anexoDe } = documento;
  return (
    <nav aria-label="Ubicación">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-medium text-grafito/80">
        <li>
          <Link href="/panel/documentos" className={MIGA}>
            Documentos
          </Link>
        </li>
        <Separador />
        <li>
          <Link href={`/panel/pacientes/${paciente.id}/documentos`} className={MIGA}>
            {paciente.nombre} {paciente.apellido}
          </Link>
        </li>
        {anexoDe && (
          <>
            <Separador />
            <li>
              <Link href={`/panel/documentos/${anexoDe.id}`} className={MIGA}>
                {nombreDeModelo(anexoDe.nombre)}
              </Link>
            </li>
          </>
        )}
        <Separador ultimo />
        <li aria-current="page" className="text-grafito/80 max-md:sr-only">
          {titulo}
        </li>
      </ol>
    </nav>
  );
}

// `ultimo`: el que va antes de este documento, que en el celular no se
// muestra (es el título, justo debajo).
function Separador({ ultimo = false }: { ultimo?: boolean }) {
  return (
    <li aria-hidden="true" className={`text-grafito/75 ${ultimo ? "max-md:hidden" : ""}`}>
      ›
    </li>
  );
}

// El vínculo entre un anexo y su historia clínica (5.6b), en el encabezado
// del documento —arriba del editor y de la vista—: en un anexo, de qué
// historia es; en una historia, sus anexos. Así se pasa de uno al otro.
// Una historia que existe pero no se ve (la de un colega, sin terminar) se
// menciona sin link. Va en una tarjeta, como el resto del panel: suelto
// sobre el fondo se perdía (2026-10-06).
//
// `continuaciones` (Fase 5.6d): en una historia completada, las secciones
// que continúan en un anexo, cada una con el suyo o "Crear anexo". Sus
// anexos van ahí y no en la lista. En un borrador, eso va junto a cada campo
// del editor, y por eso `continuacionesEnElEditor` los saca de la lista: no
// se repiten.
export function VinculosDelDocumento({
  documento,
  continuaciones,
  continuacionesEnElEditor = false,
}: {
  documento: Pick<DocumentoResumen, "anexoDe" | "anexos" | "historiaNoVisible">;
  continuaciones?: { historiaId: string; secciones: SeccionDeContinuacion[] };
  continuacionesEnElEditor?: boolean;
}) {
  const { anexoDe, historiaNoVisible = false } = documento;
  const anexos = (documento.anexos ?? []).filter((a) => !(continuaciones || continuacionesEnElEditor) || !a.continuacion);
  const conContinuaciones = (continuaciones?.secciones.length ?? 0) > 0;
  if (!anexoDe && !historiaNoVisible && anexos.length === 0 && !conContinuaciones) return null;
  return (
    <div className="flex max-w-3xl flex-col gap-4 self-start rounded-card border border-linea bg-marfil p-4 text-sm text-grafito/80 shadow-soft">
      {historiaNoVisible && <p>Anexo de una historia clínica que todavía no terminaron</p>}
      {anexoDe && (
        <div className="flex flex-col gap-1">
          <span className={ROTULO}>Anexo de</span>
          <Vinculado vinculo={anexoDe} nombre={nombreDeModelo(anexoDe.nombre)} />
        </div>
      )}
      {anexos.length > 0 && (
        // Uno por renglón: dos anexos del mismo modelo, sin folio todavía,
        // en un mismo renglón no se distinguían dónde empieza cada uno.
        <div className="flex flex-col gap-1">
          <span className={ROTULO}>Anexos</span>
          <ul className="flex flex-col gap-2">
            {anexos.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                {/* El mismo conector que en la tabla de la ficha. */}
                <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-bl-sm border-b border-l border-grafito/60" />
                <Vinculado vinculo={a} nombre={nombreDelDocumento({ tipo: "anexo", plantillaNombre: a.nombre, continuacion: a.continuacion })} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {continuaciones && conContinuaciones && (
        <ContinuacionesDeLaHistoria historiaId={continuaciones.historiaId} secciones={continuaciones.secciones} anexos={documento.anexos} />
      )}
    </div>
  );
}

// Un documento del otro lado del vínculo: su nombre (el link) con su estado
// al lado, y debajo el folio y la fecha. El estado va en su pastilla, y por
// eso el detalle no lo repite.
function Vinculado({ vinculo, nombre }: { vinculo: DocumentoVinculado; nombre: string }) {
  const folio = vinculo.folioMostrado && !esAnexoSinFolio(vinculo.folioMostrado) ? rotuloDeFolio(vinculo.folioMostrado) : undefined;
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href={`/panel/documentos/${vinculo.id}`} className={LINK}>
          {nombre}
        </Link>
        <EstadoEnTabla estado={vinculo.estado} enLinea />
      </span>
      <span className="text-[13px] text-grafito/80">{[folio, fechaYHora(vinculo.fecha)].filter(Boolean).join(" · ")}</span>
    </span>
  );
}

function ContinuacionesDeLaHistoria({
  historiaId,
  secciones,
  anexos,
}: {
  historiaId: string;
  secciones: SeccionDeContinuacion[];
  anexos: DocumentoResumen["anexos"];
}) {
  const porSeccion = anexosPorSeccion(anexos);
  return (
    <div className="flex flex-col gap-2">
      <span className={ROTULO}>Continúa en anexo</span>
      <ul className="flex flex-col gap-2">
        {secciones.map((seccion) => (
          <li key={seccion} className="flex items-center gap-x-3 gap-y-1 max-sm:flex-col max-sm:items-start">
            <span className="min-w-[10rem] text-grafito">{ETIQUETA_DE_SECCION_DE_CONTINUACION[seccion]}</span>
            <ContinuacionDeLaSeccion historiaId={historiaId} seccion={seccion} anexo={porSeccion[seccion]} />
          </li>
        ))}
      </ul>
    </div>
  );
}
