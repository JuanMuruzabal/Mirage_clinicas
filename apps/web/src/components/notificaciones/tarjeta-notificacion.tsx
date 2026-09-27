"use client";

import type { Notificacion } from "@dental-mirage/shared-types";
import { IconArrowRight, IconChevronDown } from "@/components/icons";
import { QuadrantMark } from "@/components/quadrant-mark";
import { fechaLarga, haceCuanto, hora, principalDe, rangoHorario, resumenDe, selloDeFecha, tituloDe } from "@/lib/notificaciones";

interface TarjetaNotificacionProps {
  notificacion: Notificacion;
  expandida: boolean;
  /** Se leyó en esta apertura del panel: se queda en "Nuevas" hasta la
   *  próxima, pero ya sin el punto. Si desapareciera al tocarla, no se
   *  podría leer lo que se acaba de abrir. */
  leidaRecien: boolean;
  ahora: number | null;
  abriendo: boolean;
  error: string | null;
  onAlternar: () => void;
  onVerTurno: () => void;
}

// TarjetaNotificacion — una notificación de la bandeja (TR-179). Cerrada
// dice lo mínimo para decidir (quién, a qué hora, de qué clínica); abierta,
// todo lo del turno y el botón para ir a él.
//
// El sello de la izquierda es el día del turno —no el de la notificación—,
// porque es lo que hay que ver primero: "¿para cuándo es?".
export function TarjetaNotificacion({
  notificacion: n,
  expandida,
  leidaRecien,
  ahora,
  abriendo,
  error,
  onAlternar,
  onVerTurno,
}: TarjetaNotificacionProps) {
  const nueva = n.leidaEn === null && !leidaRecien;
  const esTurno = n.tipo === "turno_nuevo";
  const idDetalle = `notificacion-${n.id}`;

  return (
    <article
      className={`overflow-hidden rounded-card border-[0.5px] transition-shadow ${
        nueva ? "border-linea bg-marfil shadow-soft" : "border-arena bg-marfil/70"
      }`}
    >
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={expandida}
        aria-controls={idDetalle}
        className="flex w-full items-stretch gap-4 p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-salvia"
      >
        {esTurno ? <SelloDelTurno iso={n.datos.horaInicio} nueva={nueva} /> : <SelloDeMarca />}

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span
              className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                esTurno ? "text-salvia-oscuro" : "text-acero-oscuro"
              }`}
            >
              {tituloDe(n)}
            </span>
            {nueva && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-terracota" aria-label="Sin leer" />}
            <span className="ml-auto flex-shrink-0 text-xs text-grafito/50">
              {ahora !== null ? haceCuanto(n.creadaEn, ahora) : ""}
            </span>
          </span>

          <span className="mt-1 truncate font-semibold text-grafito">{principalDe(n)}</span>
          {esTurno ? (
            <span className="truncate text-sm text-grafito/70">
              <span className="font-[family-name:var(--font-mono)]">{hora(n.datos.horaInicio)}</span>
              {n.datos.clinicaNombre && <> · {n.datos.clinicaNombre}</>}
            </span>
          ) : (
            <span className="text-sm text-grafito/70">{resumenDe(n)}</span>
          )}
        </span>

        <IconChevronDown
          className={`mt-0.5 h-4 w-4 flex-shrink-0 text-grafito/40 transition-transform duration-200 ${
            expandida ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* grid-rows 0fr→1fr: se despliega a la altura de su contenido sin
          medirlo, y sin animación con "reducir movimiento". */}
      <div
        id={idDetalle}
        className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 ${
          expandida ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden" inert={!expandida}>
          {esTurno ? (
            <DetalleDelTurno n={n} abriendo={abriendo} error={error} onVerTurno={onVerTurno} />
          ) : (
            <DetalleDeBienvenida />
          )}
        </div>
      </div>
    </article>
  );
}

function SelloDelTurno({ iso, nueva }: { iso: string | undefined; nueva: boolean }) {
  const sello = selloDeFecha(iso);
  return (
    <span
      aria-hidden="true"
      className={`flex w-14 flex-shrink-0 flex-col items-center justify-center rounded-field py-2 ${
        nueva ? "bg-salvia-claro text-salvia-oscuro" : "bg-arena/60 text-grafito/60"
      }`}
    >
      <span className="text-[10px] font-semibold tracking-[0.14em]">{sello?.diaSemana}</span>
      <span className="font-[family-name:var(--font-display)] text-[1.9rem] font-black leading-none">{sello?.dia}</span>
      <span className="text-[10px] font-semibold tracking-[0.14em]">{sello?.mes}</span>
    </span>
  );
}

function SelloDeMarca() {
  return (
    <span
      aria-hidden="true"
      className="flex w-14 flex-shrink-0 items-center justify-center rounded-field bg-acero-oscuro py-3 text-marfil"
    >
      <QuadrantMark className="text-[1.6rem]" estado="agendado" />
    </span>
  );
}

function Dato({ etiqueta, children, destacado }: { etiqueta: string; children: React.ReactNode; destacado?: boolean }) {
  return (
    <>
      <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-grafito/45">{etiqueta}</dt>
      <dd className={destacado ? "font-semibold text-acero-oscuro" : "text-grafito"}>{children}</dd>
    </>
  );
}

function DetalleDelTurno({
  n,
  abriendo,
  error,
  onVerTurno,
}: {
  n: Notificacion;
  abriendo: boolean;
  error: string | null;
  onVerTurno: () => void;
}) {
  const d = n.datos;
  return (
    <div className="flex flex-col gap-4 border-t-[0.5px] border-arena px-4 pb-4 pt-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <Dato etiqueta="Fecha">
          <span className="first-letter:uppercase">{fechaLarga(d.horaInicio)}</span>
        </Dato>
        <Dato etiqueta="Horario">
          <span className="font-[family-name:var(--font-mono)]">{rangoHorario(d.horaInicio, d.horaFin)}</span>
        </Dato>
        <Dato etiqueta="Paciente">{d.pacienteNombre}</Dato>
        {d.tipoConsulta && <Dato etiqueta="Consulta">{d.tipoConsulta}</Dato>}
        {d.paraRecepcion && d.profesionalNombre && (
          <Dato etiqueta="Para" destacado>
            {d.profesionalNombre}
          </Dato>
        )}
        {d.clinicaNombre && <Dato etiqueta="Clínica">{d.clinicaNombre}</Dato>}
        <Dato etiqueta="Entró por">{d.porEnlace ? "Un link compartido" : "Tu página pública"}</Dato>
      </dl>

      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onVerTurno}
        disabled={abriendo}
        className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-salvia-oscuro px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-marfil transition hover:brightness-95 disabled:opacity-60"
      >
        {abriendo ? "Abriendo…" : "Ver turno"}
        <IconArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function DetalleDeBienvenida() {
  return (
    <div className="flex flex-col gap-3 border-t-[0.5px] border-arena px-4 pb-5 pt-4 text-sm leading-relaxed text-grafito/80">
      <p>
        Esta es tu bandeja. Cada vez que un paciente saca un turno por su cuenta —desde tu página pública o con un
        link que compartiste— te avisamos acá, con el día, la hora, el paciente y la clínica.
      </p>
      <p>
        Tocá una notificación para ver el detalle: pasa a <strong className="font-semibold text-grafito">Leídas</strong> y
        deja de sumar en la campana. Con <strong className="font-semibold text-grafito">Ver turno</strong> vas directo a
        él en el calendario, aunque sea de otra de tus clínicas.
      </p>
      <p>Si activás los avisos en tu celular, te llegan también con la app cerrada.</p>
    </div>
  );
}
