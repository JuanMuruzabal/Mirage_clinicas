"use client";

import { Fragment, useState } from "react";
import type { ListarTurnosParams } from "@/lib/api";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { cancelarTurnoAction, listTurnosAction } from "@/app/actions/turnos";
import { ESTADO_CLASS, ESTADO_LABEL, ORIGEN_LABEL, formatFechaHora } from "@/lib/turno-format";
import { QuadrantMark } from "../quadrant-mark";
import { AgregarTurnoModal } from "./agregar-turno-modal";
import { AvatarIniciales } from "./avatar-iniciales";
import { CancelarTurnoModal } from "./cancelar-turno-modal";
import { EditarTurnoModal } from "./editar-turno-modal";

interface TurnosTableProps {
  turnosIniciales: Turno[];
  tiposConsulta: TipoConsulta[];
  filtros: ListarTurnosParams;
  // Deep-link desde TurnoDetalle ("Ver turno →", 2026-08-23): esa fila
  // arranca desplegada en vez de que el profesional tenga que buscarla y
  // tocarla de nuevo.
  abrirId?: string;
}

// TurnosTable (T3.3) — tabla de la vista Turnos: filtros de tab/búsqueda ya
// resueltos por page.tsx vía searchParams (GET, URL compartible, mismo
// patrón que /buscar). Cada fila es clickeable (pedido explícito del
// cliente, 2026-08-23): tocarla despliega un panel debajo con las
// acciones (Confirmar/Editar/Cancelar) — antes vivían siempre visibles en
// una columna aparte, que competía por espacio con los datos del turno.
export function TurnosTable({ turnosIniciales, tiposConsulta, filtros, abrirId }: TurnosTableProps) {
  const [turnos, setTurnos] = useState<Turno[]>(turnosIniciales);
  const [expandidoId, setExpandidoId] = useState<string | null>(abrirId ?? null);
  const [confirmarTurno, setConfirmarTurno] = useState<Turno | null>(null);
  const [editarTurno, setEditarTurno] = useState<Turno | null>(null);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cancelar un turno agendado deshace un compromiso ya asumido con el
  // paciente — pide confirmación extra vía CancelarTurnoModal. Un turno
  // pendiente todavía no era un compromiso real (recién llegó de la
  // página pública o se está por descartar), así que se cancela directo,
  // sin preguntar (pedido explícito del cliente, 2026-08-23).
  const [cancelarModalTurno, setCancelarModalTurno] = useState<Turno | null>(null);
  const [cancelarModalPending, setCancelarModalPending] = useState(false);
  const [cancelarModalError, setCancelarModalError] = useState<string | null>(null);

  function recargar() {
    listTurnosAction(filtros).then(setTurnos);
  }

  function alternarExpandido(id: string) {
    setExpandidoId((actual) => (actual === id ? null : id));
  }

  async function ejecutarCancelacion(turno: Turno) {
    setError(null);
    setCancelandoId(turno.id);
    const result = await cancelarTurnoAction(turno.id);
    setCancelandoId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    recargar();
  }

  function pedirCancelar(turno: Turno) {
    if (turno.estado === "pendiente") {
      ejecutarCancelacion(turno);
      return;
    }
    setCancelarModalError(null);
    setCancelarModalTurno(turno);
  }

  async function confirmarCancelacionDelModal() {
    if (!cancelarModalTurno) return;
    setCancelarModalError(null);
    setCancelarModalPending(true);
    const result = await cancelarTurnoAction(cancelarModalTurno.id);
    setCancelarModalPending(false);
    if ("error" in result) {
      setCancelarModalError(result.error);
      return;
    }
    setCancelarModalTurno(null);
    recargar();
  }

  if (turnos.length === 0) {
    return (
      <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">
        No hay turnos para este filtro.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 rounded-card border-[0.5px] border-terracota bg-terracota-claro px-4 py-3 text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      {/* Escritorio: max-h + scroll interno en las dos direcciones —
          mismo criterio que el calendario (T2.3), no estira la página.
          thead sticky para no perder las columnas al scrollear.
          min-w-[720px] en la tabla (abajo) es un mínimo de contenido
          real (7 columnas legibles), no un ancho "de escritorio"
          artificial — ya cumple el pedido de la rama fix/mobile
          (2026-08-24: "min-width... para que se estire y llene la
          pantalla, y que solo desborde lo que realmente no entra").

          Mobile (corrección 2026-08-24 — ver TR-026 en
          docs/tradeoffs.md): `max-md:max-h-none max-md:overflow-y-visible`
          cancela el recorte/scroll vertical propio — ese scroll ahora lo
          maneja `<main>` en app/panel/layout.tsx (un solo scroll de
          página, no dos anidados). El scroll horizontal se mantiene
          siempre (`overflow-x-auto`). WebkitOverflowScrolling: Tailwind
          no tiene utilidad para esta propiedad, va inline.
          `max-md:overscroll-contain` (corrección 2026-08-24 — ver TR-027
          en docs/tradeoffs.md): evita que arrastrar hasta el borde del
          scroll horizontal dispare el rebote elástico del documento —
          ver PanelScrollLock para la otra mitad del mismo arreglo. */}
      <div
        className="max-h-[600px] overflow-x-auto overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:max-h-none max-md:overflow-y-visible max-md:overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b-[0.5px] border-arena bg-marfil text-xs font-semibold uppercase tracking-wide text-grafito/60">
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Fecha y hora</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Origen</th>
              <th className="w-10 px-4 py-3" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => {
              const expandido = expandidoId === t.id;
              return (
                <Fragment key={t.id}>
                  <tr
                    onClick={() => alternarExpandido(t.id)}
                    className={`cursor-pointer border-b-[0.5px] border-arena last:border-b-0 hover:bg-arena ${expandido ? "bg-hueso" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <AvatarIniciales nombre={t.nombreContacto} apellido={t.apellidoContacto} />
                        <div>
                          <p className="font-medium text-grafito">
                            {t.nombreContacto} {t.apellidoContacto}
                          </p>
                          <p className="font-[family-name:var(--font-mono)] text-xs text-grafito/50">DNI {t.dniContacto}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-xs text-grafito">
                      <div>{t.telefonoContacto}</div>
                      {t.emailContacto && <div className="text-grafito/50">{t.emailContacto}</div>}
                    </td>
                    <td className="px-4 py-3 text-grafito">{t.motivo || "—"}</td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{formatFechaHora(t.horaInicio)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-2 text-xs ${ESTADO_CLASS[t.estado]}`}>
                        <QuadrantMark estado={t.estado} />
                        {ESTADO_LABEL[t.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-grafito/50">{ORIGEN_LABEL[t.origen]}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-expanded={expandido}
                        aria-label={expandido ? "Ocultar acciones" : "Mostrar acciones"}
                        onClick={(e) => {
                          e.stopPropagation();
                          alternarExpandido(t.id);
                        }}
                        className={`text-grafito/50 transition-transform duration-200 hover:text-grafito ${expandido ? "rotate-180" : ""}`}
                      >
                        ▾
                      </button>
                    </td>
                  </tr>
                  {expandido && (
                    <tr className="border-b-[0.5px] border-arena bg-hueso last:border-b-0">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {t.estado === "pendiente" && (
                            <button
                              type="button"
                              onClick={() => setConfirmarTurno(t)}
                              className="rounded-full bg-salvia-oscuro px-3 py-1.5 text-xs font-semibold text-marfil hover:brightness-95"
                            >
                              Confirmar
                            </button>
                          )}
                          {t.estado !== "cancelada" && (
                            <button
                              type="button"
                              onClick={() => setEditarTurno(t)}
                              className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                            >
                              Editar
                            </button>
                          )}
                          {t.estado !== "cancelada" && (
                            <button
                              type="button"
                              onClick={() => pedirCancelar(t)}
                              disabled={cancelandoId === t.id}
                              className="rounded-full border-[0.5px] border-terracota bg-marfil px-3 py-1.5 text-xs font-medium text-terracota-oscuro hover:bg-terracota-claro disabled:opacity-60"
                            >
                              {cancelandoId === t.id ? "Cancelando…" : "Cancelar"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmarTurno && (
        <AgregarTurnoModal
          tiposConsulta={tiposConsulta}
          turnoPendienteInicial={confirmarTurno}
          onClose={() => setConfirmarTurno(null)}
          onSuccess={() => {
            setConfirmarTurno(null);
            recargar();
          }}
        />
      )}

      {editarTurno && (
        <EditarTurnoModal
          turno={editarTurno}
          onClose={() => setEditarTurno(null)}
          onSuccess={() => {
            setEditarTurno(null);
            recargar();
          }}
        />
      )}

      {cancelarModalTurno && (
        <CancelarTurnoModal
          turno={cancelarModalTurno}
          pending={cancelarModalPending}
          error={cancelarModalError}
          onClose={() => setCancelarModalTurno(null)}
          onConfirm={confirmarCancelacionDelModal}
        />
      )}
    </>
  );
}
