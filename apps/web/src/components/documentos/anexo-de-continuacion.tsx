"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { AsientoDeDocumento, DocumentoDetalle, SeccionDeContinuacion } from "@dental-mirage/shared-types";
import { crearContinuacionAction, leerDocumentoAction, sumarAsientoAction } from "@/app/actions/documentos";
import { Dialogo } from "@/components/dialogo";
import { useEstadoDelServidor } from "@/lib/estado-del-servidor";
import { fechaYHora, nombreDelAnexoDeLaSeccion, nombreDelDocumento, rotuloDeFolio, type AnexoDeLaSeccion } from "@/lib/documentos";

// Los anexos de continuación (Fase 5.6d): el "Continúa en anexo Nº" de una
// sección de la historia, como la hoja de evolución del papel. El anexo no se
// completa con el formulario: se le suman ANOTACIONES (los asientos de la
// API), fijas una vez guardadas. No se firman dibujando: las firma el
// registro digital —quien tiene la sesión, su nombre, la fecha y la hora—. Se
// abre en un diálogo sin salir de la historia, o en su propia página.

/** Lo mismo que el CHECK de documento_asientos.texto. */
const MAX_CARACTERES = 4000;

const CLASE_CAMPO =
  "w-full rounded-field border border-linea bg-hueso px-3 py-2 text-[15px] text-grafito outline-none focus:border-salvia disabled:opacity-70";
// Mismos botones que el genograma (`campo-dibujo.tsx`) y que firmar
// (`firmar-dialogo.tsx`), a 44 px: se tocan con el dedo.
const BOTON_PRINCIPAL = "min-h-11 rounded-full bg-salvia-oscuro px-5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60";
const BOTON_CANCELAR = "min-h-11 rounded-full px-4 text-sm font-medium text-grafito hover:bg-arena disabled:opacity-60";
const BOTON_ANEXO =
  "min-h-11 rounded-full border border-salvia-oscuro bg-marfil px-4 text-sm font-medium text-salvia-oscuro hover:bg-salvia-claro disabled:opacity-60";

function AsientosDelAnexo({ asientos }: { asientos: AsientoDeDocumento[] }) {
  if (asientos.length === 0) return <p className="text-sm text-grafito/75">Sin anotaciones todavía.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {asientos.map((a) => (
        <li key={a.numero} className="flex flex-col gap-2 rounded-card border border-linea bg-marfil p-4">
          <p className="text-xs font-semibold text-grafito">Anotación {a.numero}</p>
          <p className="text-sm whitespace-pre-wrap text-grafito">{a.texto}</p>
          {/* En el lugar de la firma: el registro digital. */}
          <p className="text-xs text-grafito/75">
            Registrado digitalmente por {a.autorNombre} · {fechaYHora(a.creadoEn)}
          </p>
        </li>
      ))}
    </ol>
  );
}

// Una anotación nueva: el texto y "Guardar anotación", que pide confirmar acá
// mismo (dentro del diálogo, otro diálogo encima se cerraría junto con él al
// apretar Escape).
//
// El texto vive afuera (`texto`/`onTexto`): en el diálogo, en el botón de la
// sección, así cerrarlo no pierde una anotación a medio escribir. Solo en
// memoria, nunca en el navegador: son datos de salud.
function NuevoAsiento({
  anexoId,
  texto,
  onTexto,
  onGuardado,
}: {
  anexoId: string;
  texto: string;
  onTexto: (texto: string) => void;
  onGuardado: (anexo: DocumentoDetalle) => void;
}) {
  const id = useId();
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelar = useRef<HTMLButtonElement>(null);
  const listo = texto.trim().length > 0;

  useEffect(() => {
    if (confirmando) cancelar.current?.focus();
  }, [confirmando]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const res = await sumarAsientoAction(anexoId, texto.trim());
    setGuardando(false);
    setConfirmando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onTexto("");
    onGuardado(res.documento);
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-3 rounded-card border border-linea bg-marfil p-4">
      <h3 id={`${id}-titulo`} className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">
        Agregar anotación
      </h3>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-grafito">
        Texto
        <textarea
          rows={5}
          value={texto}
          maxLength={MAX_CARACTERES}
          disabled={guardando}
          onChange={(e) => onTexto(e.target.value)}
          className={`${CLASE_CAMPO} resize-y font-normal`}
        />
        <span className="self-end text-xs font-normal text-grafito/75">
          {texto.length} de {MAX_CARACTERES}
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}
      {confirmando ? (
        <div role="group" aria-label="Confirmar la anotación" className="flex flex-col gap-3 rounded-card border border-linea bg-hueso p-3">
          <p className="text-sm text-grafito">La anotación queda registrada a tu nombre y no se puede modificar ni borrar después. ¿La guardás?</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button ref={cancelar} type="button" onClick={() => setConfirmando(false)} disabled={guardando} className={BOTON_CANCELAR}>
              Cancelar
            </button>
            <button type="button" onClick={guardar} disabled={guardando} className={BOTON_PRINCIPAL}>
              {guardando ? "Guardando…" : "Guardar anotación"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmando(true)} disabled={!listo} className={`${BOTON_PRINCIPAL} self-end`}>
          Guardar anotación
        </button>
      )}
    </section>
  );
}

/** El texto de una anotación que todavía no se guardó. */
type BorradorDeAsiento = { texto: string; onTexto: (texto: string) => void };

// Las anotaciones y, si el anexo sigue abierto, el formulario de una nueva.
function ContenidoDelAnexo({
  anexo,
  onCambio,
  borrador,
}: {
  anexo: DocumentoDetalle;
  onCambio: (anexo: DocumentoDetalle) => void;
  borrador: BorradorDeAsiento;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AsientosDelAnexo asientos={anexo.asientos ?? []} />
      {anexo.estado === "abierto" && <NuevoAsiento anexoId={anexo.id} texto={borrador.texto} onTexto={borrador.onTexto} onGuardado={onCambio} />}
    </div>
  );
}

/** El anexo en su página (/panel/documentos/{id}): lo que manda el servidor,
 *  y lo que devuelve cada anotación guardada. */
export function AnexoDeContinuacion({ documento }: { documento: DocumentoDetalle }) {
  const [anexo, setAnexo] = useEstadoDelServidor(documento);
  const [texto, setTexto] = useState("");
  // A lo ancho de la página los renglones serían demasiado largos para leer.
  return (
    <div className="max-w-3xl">
      <ContenidoDelAnexo anexo={anexo} onCambio={setAnexo} borrador={{ texto, onTexto: setTexto }} />
    </div>
  );
}

/** El anexo en un diálogo, sin salir de la historia. `inicial`: el que se
 *  acaba de crear; si no viene, se pide. */
export function DialogoDeAnexo({
  anexoId,
  inicial,
  borrador,
  onCerrar,
}: {
  anexoId: string;
  inicial?: DocumentoDetalle;
  /** La anotación a medio escribir: la guarda quien abre el diálogo. */
  borrador: BorradorDeAsiento;
  onCerrar: () => void;
}) {
  const [anexo, setAnexo] = useState<DocumentoDetalle | null>(inicial ?? null);
  const [error, setError] = useState<string | null>(null);
  const folio = rotuloDeFolio(anexo?.folioMostrado);

  useEffect(() => {
    if (inicial) return;
    let vigente = true;
    void leerDocumentoAction(anexoId).then((res) => {
      if (!vigente) return;
      if (res.ok) setAnexo(res.documento);
      else setError(res.error);
    });
    return () => {
      vigente = false;
    };
  }, [anexoId, inicial]);

  return (
    <Dialogo
      titulo={anexo ? nombreDelDocumento(anexo) : "Anexo de continuación"}
      descripcion={folio ? `${folio} · cada anotación queda fija una vez guardada` : undefined}
      onCerrar={onCerrar}
      ancho="completo"
      superficie="marfil"
    >
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <Link href={`/panel/documentos/${anexoId}`} className="inline-flex min-h-11 items-center self-start text-sm font-medium text-salvia-oscuro hover:text-grafito hover:underline">
          Abrir en pantalla completa →
        </Link>
        {error && (
          <p role="alert" className="text-sm text-terracota-oscuro">
            {error}
          </p>
        )}
        {!anexo && !error && <p className="text-sm text-grafito/75">Cargando el anexo…</p>}
        {anexo && <ContenidoDelAnexo anexo={anexo} onCambio={setAnexo} borrador={borrador} />}
      </div>
    </Dialogo>
  );
}

/** Junto a un "Continúa en anexo Nº": el anexo de esa sección, si ya tiene,
 *  o "Crear anexo". Lo que se crea se abre enseguida. */
export function ContinuacionDeLaSeccion({
  historiaId,
  seccion,
  anexo,
  onCreado,
}: {
  historiaId: string;
  seccion: SeccionDeContinuacion;
  anexo?: AnexoDeLaSeccion;
  onCreado?: (anexo: DocumentoDetalle) => void;
}) {
  const [abierto, setAbierto] = useState<{ id: string; inicial?: DocumentoDetalle } | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La anotación a medio escribir sobrevive a cerrar el diálogo.
  const [texto, setTexto] = useState("");
  // El recién creado, hasta que la página traiga el anexo actualizado.
  const [creado, setCreado] = useState<AnexoDeLaSeccion | null>(null);
  const actual = anexo ?? creado ?? undefined;
  const sinGuardar = texto.trim().length > 0;

  async function crear() {
    setCreando(true);
    setError(null);
    const res = await crearContinuacionAction(historiaId, seccion);
    setCreando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCreado?.(res.documento);
    if (res.documento.continuacion) {
      setCreado({ id: res.documento.id, numero: res.documento.continuacion.numero, folioMostrado: res.documento.folioMostrado });
    }
    setAbierto({ id: res.documento.id, inicial: res.documento });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {actual ? (
        <button
          type="button"
          onClick={() => setAbierto({ id: actual.id })}
          // El nombre, con su separación: los dos tramos se leen pegados.
          aria-label={sinGuardar ? `${nombreDelAnexoDeLaSeccion(actual)} · texto sin guardar` : undefined}
          className={`${BOTON_ANEXO} inline-flex items-center gap-2 self-start`}
        >
          {nombreDelAnexoDeLaSeccion(actual)}
          {sinGuardar && (
            <>
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-terracota" />
              <span className="font-normal text-grafito/75">texto sin guardar</span>
            </>
          )}
        </button>
      ) : (
        <button type="button" onClick={crear} disabled={creando} className={`${BOTON_ANEXO} self-start`}>
          {creando ? "Creando el anexo…" : "Crear anexo"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-terracota-oscuro">
          {error}
        </p>
      )}
      {abierto && (
        <DialogoDeAnexo
          anexoId={abierto.id}
          inicial={abierto.inicial}
          borrador={{ texto, onTexto: setTexto }}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </div>
  );
}
