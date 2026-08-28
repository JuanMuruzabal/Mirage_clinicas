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

  // Acciones (Confirmar/Editar/Cancelar) — extraído en su propia función
  // porque antes vivía duplicado entre la fila de escritorio y la card
  // de mobile (intento descartado, ver rediseño 2026-08-27 más abajo);
  // ahora es una única tabla para cualquier ancho, pero se deja
  // extraído igual para no volver a mezclar la lógica de qué botón
  // mostrar según estado/resuelto con el JSX de la fila expandida.
  function renderAcciones(t: Turno, resuelto: boolean) {
    if (resuelto) {
      return <p className="text-xs text-grafito/50">Turno ya resuelto — sin acciones disponibles.</p>;
    }
    return (
      <>
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
      </>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 rounded-card border-[0.5px] border-terracota bg-terracota-claro px-4 py-3 text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      {/* Rediseño 2026-08-27 (pedido explícito del cliente, reemplaza el
          intento anterior de cards apiladas) — "es descartar por
          completo el movimiento horizontal y
          vertical... quiero que las tablas... funcionen de la misma
          forma que en escritorio, que cuando se vayan siendo muy
          extensas con un scrollbar puedas ir bajando... dar la
          información clave a la vista, al tocarlos desplegar más
          información junto a sus respectivos botones, pero usar las
          mismas tablas que en web"). Sigue siendo LA MISMA tabla en
          mobile y escritorio (nunca un componente distinto) — lo que
          cambia es CUÁNTAS columnas se ven en cada ancho:
          Contacto/Motivo/Origen pasan a `max-md:hidden` (ver los
          `<th>`/`<td>` de abajo), visibles otra vez desde `md`. Con
          menos columnas, el contenido real vuelve a entrar sin
          desbordar — la caja ya NO necesita ningún `min-width` forzado
          ni compartir scroll con el buscador/tabs de arriba (eso lo
          resolvía turnos/page.tsx por separado, tampoco lo necesita
          más). `overflow-x-auto` queda como red de seguridad, no como
          mecanismo principal: si algún dato puntual necesitara más ancho,
          esta caja scrollea SOLA, nunca la página entera.

          `max-h-[600px] overflow-y-auto` en escritorio (con
          `max-md:max-h-[21rem]` en mobile — pedido explícito del
          cliente, 2026-08-27: "solo habrá 4 visibles a primera vista,
          para ver los demás se deberá ir para abajo" — cabecera + 4
          filas ya alcanzan el ancho de la pantalla, así que 4 es lo que
          entra cómodo). Reemplaza `max-md:max-h-none
          max-md:overflow-visible` de TR-028: la caja vuelve a ser su
          propio contenedor de scroll vertical en cualquier ancho — con
          muchos turnos, es ESTA caja la que saca su propia scrollbar
          (`.panel-table-scroll`, ver globals.css — la nativa quedaba
          invisible), la página (`<main>`) no se alarga sin límite.
          `max-md:overflow-x-hidden` (pedido explícito del cliente:
          "que se pueda desplazar solo verticalmente") — con las
          columnas secundarias ya ocultas en mobile (ver los `<th>`/
          `<td>` de abajo) no hace falta scroll horizontal ahí, y sin
          esto un gesto diagonal disparaba los dos ejes a la vez.
          `thead` vuelve a `sticky top-0 z-10` sin condición de `md:`
          por el mismo motivo (TR-065 solo aplicaba la condición cuando
          esta caja NO era su propio scroll en mobile — ahora siempre lo
          es). */}
      <div className="panel-table-scroll max-h-[600px] overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:max-h-[21rem] max-md:overflow-x-hidden md:overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10">
            {/* border-b (1px) en mobile — pedido explícito del cliente,
                2026-08-27: "las tablas... no poseen separadores claros
                como sí tiene la versión de escritorio". El `0.5px` de
                escritorio se pierde en algunos anchos de píxel de
                mobile (redondea a 0 según densidad de pantalla); acá se
                fuerza a 1px completo, visible en cualquier dispositivo. */}
            <tr className="border-b border-arena bg-marfil text-xs font-semibold uppercase tracking-wide text-grafito/60 md:border-b-[0.5px]">
              <th className="px-4 py-3">Paciente</th>
              <th className="max-md:hidden px-4 py-3">Contacto</th>
              <th className="max-md:hidden px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Fecha y hora</th>
              <th className="px-4 py-3">Estado</th>
              <th className="max-md:hidden px-4 py-3">Origen</th>
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
                    className={`cursor-pointer border-b border-arena last:border-b-0 hover:bg-arena md:border-b-[0.5px] ${expandido ? "bg-hueso" : ""}`}
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
                    <td className="max-md:hidden px-4 py-3 font-[family-name:var(--font-mono)] text-xs text-grafito">
                      <div>{t.telefonoContacto}</div>
                      {t.emailContacto && <div className="text-grafito/50">{t.emailContacto}</div>}
                    </td>
                    <td className="max-md:hidden px-4 py-3 text-grafito">{t.motivo || "—"}</td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{formatFechaHora(t.horaInicio)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-2 text-xs ${resuelto ? "font-semibold text-grafito/60" : ESTADO_CLASS[t.estado]}`}>
                        <QuadrantMark estado={t.estado} />
                        {resuelto ? "Resuelto" : ESTADO_LABEL[t.estado]}
                      </span>
                    </td>
                    <td className="max-md:hidden px-4 py-3 text-xs text-grafito/50">{ORIGEN_LABEL[t.origen]}</td>
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
                    <tr className="border-b border-arena bg-hueso last:border-b-0 md:border-b-[0.5px]">
                      <td colSpan={7} className="px-4 py-3">
                        {/* Contacto/Motivo/Origen — ocultos como columna en
                            mobile (arriba), reaparecen ACÁ al desplegar la
                            fila, junto a los botones. Desde `md` no hace
                            falta (ya se ven como columnas), por eso
                            `md:hidden`. `text-base` (pedido explícito del
                            cliente, 2026-08-27: "hacer bien visibles los
                            datos al presionar... porque se ven muy
                            pequeños") — antes el teléfono/email quedaban
                            en `text-xs` (12px) mientras motivo/origen ya
                            heredaban un `text-sm` sin querer más chico que
                            el resto; ahora todos los valores comparten el
                            mismo tamaño, más grande, solo las etiquetas
                            (dt) se mantienen chicas a propósito. */}
                        <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-base md:hidden">
                          <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Contacto</dt>
                          <dd className="font-[family-name:var(--font-mono)] text-grafito">
                            <div>{t.telefonoContacto}</div>
                            {t.emailContacto && <div className="break-all text-grafito/50">{t.emailContacto}</div>}
                          </dd>
                          {t.motivo && (
                            <>
                              <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Motivo</dt>
                              <dd className="text-grafito">{t.motivo}</dd>
                            </>
                          )}
                          <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Origen</dt>
                          <dd className="text-grafito/50">{ORIGEN_LABEL[t.origen]}</dd>
                        </dl>
                        <div className="flex flex-wrap gap-2">{renderAcciones(t, resuelto)}</div>
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
