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
          min-w-[760px] en la tabla (abajo, TR-067 en docs/tradeoffs.md)
          es un mínimo de contenido real (7 columnas legibles).

          Mobile (quinta corrección 2026-08-24 — ver TR-028 en
          docs/tradeoffs.md, reemplaza el criterio de TR-026/027): esta
          caja DEJA de tener su propio scroll (`max-md:overflow-visible`,
          las dos direcciones) — antes tenía scroll horizontal propio,
          aislado del filtro/búsqueda de arriba (turnos/page.tsx), que
          por no compartir ese scroll se comprimía con `flex-wrap`. Ahora
          filtro + tabla son una sola unidad que scrollea junta en
          `<main>` (app/panel/layout.tsx) — el `min-w-[760px]` de la
          tabla (abajo) es lo único que hace falta para que se desborde y
          se navegue deslizando, igual criterio que
          docs/referencia-para-claude-code.html. `max-md:w-full`
          (undécima corrección, TR-034 en docs/tradeoffs.md, pedido
          explícito del cliente: "la tabla de turnos no queda bien del
          todo con los cuadros de arriba, no queda alineada") — faltaba
          acá (turnos/page.tsx ya se lo daba a la fila de filtros, pero
          esta caja no lo tenía) para medir siempre lo mismo que el
          wrapper que la envuelve, no un ancho propio independiente.

          `md:sticky md:top-0 md:z-10` en el thead (TR-065 en
          docs/tradeoffs.md, pedido explícito del cliente, 2026-08-26):
          antes era `sticky top-0` sin condición — con `overflow-visible`
          en mobile, esta caja deja de ser el contenedor de scroll (lo es
          `<main>`), así que el `sticky` del thead pasaba a "pegarse" contra
          ESE ancestro en vez del suyo propio, resultado: el encabezado se
          veía como una cajita redondeada flotando separada de la fila de
          abajo, desalineada del buscador de arriba ("ENCABEZADOS...
          flotando sobre la nada"). Sticky solo tiene sentido donde esta
          caja SÍ es su propio contenedor de scroll — desde `md`, sin
          cambios; debajo, el thead vuelve a fluir como una fila más de la
          tabla (mismo fondo/borde que las demás, sin volar aparte).

          `min-w-[760px]` (TR-067 en docs/tradeoffs.md, 2026-08-27,
          reemplaza el número de TR-029/034): el thead ya no-sticky (TR-065)
          y sin `WebkitOverflowScrolling` (TR-066) no alcanzaban — el
          cliente seguía viendo el mismo encabezado separado, y confirmado
          en vivo con getBoundingClientRect que layout/ancho/alto medían
          perfecto. La causa real: 720px quedaba justo para las 7 columnas
          con contenido real (no el de prueba) — la tabla necesitaba un
          poco más de ancho que el que le daba esta caja, y ese sobrante se
          desbordaba por fuera de la tarjeta redondeada (`overflow-visible`
          no la recorta, la deja flotar sobre el fondo del panel en vez de
          sobre el fondo `bg-marfil` de la caja). El cliente lo confirmó a
          mano en el inspector del navegador (agrandando el div a 760px en
          vivo) antes de tocar el código. Sigue siendo el mismo número que
          `turnos/page.tsx` (TR-029: filtros y tabla comparten un solo
          min-width) — cambia el valor compartido, no el criterio.

          Subido de nuevo a 880px (TR-070 en docs/tradeoffs.md,
          2026-08-27): esta vez no era la tabla la que necesitaba más
          ancho (760px le sobraba) sino la FILA DE FILTROS de
          turnos/page.tsx (tabs + buscador), que quedaba más angosta que
          el buscador y se veía desalineada. Mismo número en los dos
          lugares igual, por el invariante de TR-029/034. */}
      <div
        // Sin `WebkitOverflowScrolling: "touch"` (TR-066 en
        // docs/tradeoffs.md): esa propiedad iOS vestigial es una causa
        // real y ya documentada de bugs de repintado en WebKit (mismo
        // motivo por el que se sacó de `<main>` en panel-shell.tsx) — pero
        // NO era la causa de este bug puntual (ver TR-067, el comentario
        // de arriba, sobre `min-w-[760px]`): sacarla solo no alcanzó, el
        // cliente confirmó que el encabezado seguía viéndose separado.
        // Queda sacada de todos modos por ser la corrección más segura en
        // general, sin relación con el fix real.
        className="max-h-[600px] overflow-x-auto overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:max-h-none max-md:w-full max-md:overflow-visible"
      >
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="md:sticky md:top-0 md:z-10">
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
              // resuelto (TR-074 en docs/tradeoffs.md, 2026-08-27, pedido
              // explícito del cliente: "un turno resuelto sigue
              // apareciendo... como confirmado, debería aparecer
              // resuelto, no se tendría que poder editar") — no es un
              // estado real en la base (sigue siendo "agendado", igual
              // criterio que la pestaña "Resueltos" de turnos/page.tsx y
              // que TurnoDetalle), se deriva acá: agendado + horaFin ya
              // pasado.
              const resuelto = t.estado === "agendado" && Boolean(t.horaFin) && new Date(t.horaFin!).getTime() < new Date().getTime();
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
                      <span className={`inline-flex items-center gap-2 text-xs ${resuelto ? "font-semibold text-grafito/60" : ESTADO_CLASS[t.estado]}`}>
                        <QuadrantMark estado={t.estado} />
                        {resuelto ? "Resuelto" : ESTADO_LABEL[t.estado]}
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
                          {/* Turno resuelto: solo lectura, sin acciones
                              (TR-074 en docs/tradeoffs.md) — ya pasó, no
                              tiene sentido confirmar/editar/cancelar algo
                              que ya ocurrió. */}
                          {resuelto && <p className="text-xs text-grafito/50">Turno ya resuelto — sin acciones disponibles.</p>}
                          {!resuelto && t.estado === "pendiente" && (
                            <button
                              type="button"
                              onClick={() => setConfirmarTurno(t)}
                              className="rounded-full bg-salvia-oscuro px-3 py-1.5 text-xs font-semibold text-marfil hover:brightness-95"
                            >
                              Confirmar
                            </button>
                          )}
                          {!resuelto && t.estado !== "cancelada" && (
                            <button
                              type="button"
                              onClick={() => setEditarTurno(t)}
                              className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                            >
                              Editar
                            </button>
                          )}
                          {!resuelto && t.estado !== "cancelada" && (
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
