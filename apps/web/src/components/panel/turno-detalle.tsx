import Link from "next/link";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { formatDiaLargo, formatHora } from "@/lib/calendar-utils";
import { temaTipoConsulta } from "@/lib/turno-format";

interface TurnoDetalleProps {
  turno: Turno;
  tiposConsulta: TipoConsulta[];
  onClose: () => void;
}

// Al tocar una casilla de consulta ya agendada: hora, paciente adjunto y
// tipo de consulta (spec §4.3) — un panel simple, no otro formulario. Dos
// atajos sumados a pedido del cliente (2026-08-23): "Ver turno" manda a la
// fila de este turno en la vista Turnos —ahí es donde se puede
// editar/cancelar de verdad, este panel es solo de lectura— con esa fila
// ya desplegada (vía `?turno=`, ver TurnosTable/abrirId) para no obligar
// al profesional a volver a buscarla; "Ver paciente" manda a su ficha
// completa. La hora pasó al tope del panel, en un tamaño grande, y ambos
// atajos son ahora botones (antes texto chico al lado del título, se
// confundían con el fondo — mismo pedido del cliente).
export function TurnoDetalle({ turno, tiposConsulta, onClose }: TurnoDetalleProps) {
  const tipo = tiposConsulta.find((t) => t.id === turno.tipoConsultaId);
  const inicio = turno.horaInicio ? new Date(turno.horaInicio) : null;
  const fin = turno.horaFin ? new Date(turno.horaFin) : null;
  const resuelto = fin !== null && fin.getTime() < new Date().getTime();
  const hrefVerTurno = `/panel/turnos?estado=${turno.estado}&q=${encodeURIComponent(turno.dniContacto)}&turno=${turno.id}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detalle del turno"
      className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
        <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Turno</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
            ×
          </button>
        </div>
        <div className="flex flex-col gap-4 p-6 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              {inicio && <p className="text-xs uppercase tracking-widest text-grafito/50">{formatDiaLargo(inicio)}</p>}
              <p className="mt-1 font-[family-name:var(--font-mono)] text-3xl font-semibold text-grafito">
                {inicio && fin ? `${formatHora(inicio)}–${formatHora(fin)}` : "—"}
              </p>
            </div>
            {resuelto && (
              <span className="shrink-0 rounded-full border-[0.5px] border-arena px-2.5 py-1 text-xs font-medium text-grafito/60">
                Resuelto
              </span>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-grafito/50">Paciente</p>
            <p className="mt-1 text-grafito">
              {turno.nombreContacto} {turno.apellidoContacto}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-grafito/50">Tipo de consulta</p>
            <p className="mt-1 flex items-center gap-2 text-grafito">
              {tipo && (
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: temaTipoConsulta(tipo).acento }} />
              )}
              {tipo?.nombre ?? "—"}
            </p>
          </div>
          {turno.motivo && (
            <div>
              <p className="text-xs uppercase tracking-widest text-grafito/50">Motivo</p>
              <p className="mt-1 text-grafito">{turno.motivo}</p>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2 border-t-[0.5px] border-arena pt-4">
            <Link
              href={hrefVerTurno}
              className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              Ver turno →
            </Link>
            {turno.pacienteId && (
              <Link
                href={`/panel/pacientes/${turno.pacienteId}`}
                className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
              >
                Ver paciente →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
