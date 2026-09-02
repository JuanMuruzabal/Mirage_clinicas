"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ListarTurnosParams } from "@/lib/api";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { cancelarTurnoAction, listTurnosAction, marcarAsistenciaAction } from "@/app/actions/turnos";
import { ESTADO_CLASS, ESTADO_LABEL, ORIGEN_LABEL, formatFechaHora, temaTipoConsulta } from "@/lib/turno-format";
import { textoEsLargo, tipoConsultaNombreEsLargo } from "@/lib/texto-largo";
import { QuadrantMark } from "../quadrant-mark";
import { VerTextoBoton } from "../ver-texto-boton";
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
  // tipoPorId — corrección de QA: "dar un indicador visual en la tabla de
  // turnos el tipo de consulta, ya que está ausente" — mismo criterio que
  // paciente-turnos-table.tsx (temaTipoConsulta, punto de color + nombre,
  // nunca el color solo — TR-013).
  const tipoPorId = useMemo(() => new Map(tiposConsulta.map((t) => [t.id, t])), [tiposConsulta]);
  const [expandidoId, setExpandidoId] = useState<string | null>(abrirId ?? null);
  const [editarTurno, setEditarTurno] = useState<Turno | null>(null);
  const [error, setError] = useState<string | null>(null);
  // asistenciaPendingId (pedido explícito del cliente, 2026-09-04): "los
  // turnos resueltos ahora tienen la opción... de marcar asistidos o
  // ausente... tanto en el calendario, como de la sección de turnos
  // resueltos en la pestaña de turnos" — este es el lado "pestaña de
  // turnos" de ese pedido (TurnoDetalle tiene el mismo flujo para el
  // calendario). `pidiendoConfirmarAsistencia` guarda a la vez el turno Y
  // el valor que espera el "sí, confirmar" del aviso de irreversibilidad
  // (corrección de QA, 2026-09-04, textual: "me debe aparecer un aviso
  // que la elección es irreversible y confirmar esto") — comparado contra
  // el id de cada fila al renderizar, para no mezclar la confirmación
  // pendiente de una fila con otra.
  const [asistenciaPendingId, setAsistenciaPendingId] = useState<string | null>(null);
  const [pidiendoConfirmarAsistencia, setPidiendoConfirmarAsistencia] = useState<{
    turnoId: string;
    valor: "asistio" | "ausente";
  } | null>(null);

  // Bug reportado 2026-08-28: "si toco Ver turno... y este turno está muy
  // debajo de la tabla, tengo que bajar manualmente para ver el turno
  // desplegado" — la fila arrancaba ya desplegada (`abrirId`, más arriba)
  // pero nada la traía a la vista. `scrollIntoView` sube por TODOS los
  // ancestros con scroll que hagan falta (la caja `.panel-table-scroll` de
  // esta tabla y, si todavía no alcanza, `<main>`), sin necesidad de medir
  // nada a mano. `key={tab-q-abrirId}` en turnos/page.tsx remonta este
  // componente entero cada vez que cambia `abrirId` (patrón ya
  // establecido, ver el comentario ahí) — un efecto de montaje simple
  // alcanza, no hace falta re-disparar esto en ningún otro momento.
  const filaAbiertaRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    filaAbiertaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Cancelar un turno agendado deshace un compromiso ya asumido con el
  // paciente — pide confirmación extra vía CancelarTurnoModal. Hasta
  // Extra 2.3.3 un turno `pendiente` se cancelaba directo, sin preguntar
  // (recién llegado de la página pública, todavía no era un compromiso
  // real); ese estado se sacó del todo (TR-104) — ahora cualquier turno
  // (siempre `agendado` en este punto) pasa por el modal de confirmación.
  const [cancelarModalTurno, setCancelarModalTurno] = useState<Turno | null>(null);
  const [cancelarModalPending, setCancelarModalPending] = useState(false);
  const [cancelarModalError, setCancelarModalError] = useState<string | null>(null);

  function recargar() {
    listTurnosAction(filtros).then(setTurnos);
  }

  function alternarExpandido(id: string) {
    setExpandidoId((actual) => (actual === id ? null : id));
  }

  async function confirmarAsistencia(turno: Turno, valor: "asistio" | "ausente") {
    setError(null);
    setAsistenciaPendingId(turno.id);
    const result = await marcarAsistenciaAction(turno.id, valor);
    setAsistenciaPendingId(null);
    setPidiendoConfirmarAsistencia(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    recargar();
  }

  function pedirCancelar(turno: Turno) {
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

  // renderTipoConsulta — corrección de QA: "dar un indicador visual en la
  // tabla de turnos el tipo de consulta, ya que está ausente" — mismo
  // criterio de dos señales a la vez (color + nombre, nunca el color
  // solo, TR-013) que paciente-turnos-table.tsx. Un nombre largo pasa a
  // "Ver tipo →" en vez de romper el ancho de la columna (mismo
  // componente que "Ver motivo"/"Ver paciente" de al lado) — el umbral es
  // el específico de tipoConsultaNombreEsLargo (más largo que "Consulta
  // general"), no el genérico de 30 caracteres de textoEsLargo. Extraída
  // para no duplicar la lógica entre la columna de escritorio y el
  // bloque de mobile (mismo criterio que renderAcciones, más abajo).
  function renderTipoConsulta(tipo: TipoConsulta | undefined) {
    if (!tipo) return "—";
    if (tipoConsultaNombreEsLargo(tipo.nombre)) {
      return <VerTextoBoton titulo="Tipo" texto={tipo.nombre} flecha />;
    }
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: temaTipoConsulta(tipo).acento }} />
        {tipo.nombre}
      </span>
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
      // Irreversible (corrección de QA, 2026-09-04, textual): "me debe
      // aparecer un aviso que la elección es irreversible y confirmar
      // esto" — tocar "Asistió"/"Ausente" solo pide confirmación con ese
      // aviso, recién al confirmar se llama a la Server Action. Ya
      // marcada, se muestra como etiqueta fija, sin botones.
      const confirmando = pidiendoConfirmarAsistencia?.turnoId === t.id ? pidiendoConfirmarAsistencia.valor : null;
      return (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-grafito/50">Turno ya resuelto — sin acciones de edición disponibles.</p>
          {t.asistencia ? (
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-grafito/60">Asistencia:</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  t.asistencia === "asistio" ? "bg-salvia-oscuro text-marfil" : "bg-terracota-oscuro text-marfil"
                }`}
              >
                {t.asistencia === "asistio" ? "Asistió" : "Ausente"}
              </span>
              <span className="text-xs text-grafito/50">No se puede modificar.</span>
            </p>
          ) : confirmando ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-xs text-terracota-oscuro">
                Esta elección es irreversible. ¿Confirmás que el paciente {confirmando === "asistio" ? "asistió" : "estuvo ausente"}?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => confirmarAsistencia(t, confirmando)}
                  disabled={asistenciaPendingId === t.id}
                  className="rounded-full bg-salvia-oscuro px-3 py-1.5 text-xs font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
                >
                  {asistenciaPendingId === t.id ? "Guardando…" : "Confirmar"}
                </button>
                <button
                  type="button"
                  onClick={() => setPidiendoConfirmarAsistencia(null)}
                  disabled={asistenciaPendingId === t.id}
                  className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-grafito/60">Asistencia:</span>
              <button
                type="button"
                onClick={() => setPidiendoConfirmarAsistencia({ turnoId: t.id, valor: "asistio" })}
                className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
              >
                Asistió
              </button>
              <button
                type="button"
                onClick={() => setPidiendoConfirmarAsistencia({ turnoId: t.id, valor: "ausente" })}
                className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-xs font-medium text-grafito hover:border-terracota hover:text-terracota-oscuro"
              >
                Ausente
              </button>
            </div>
          )}
        </div>
      );
    }
    return (
      <>
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
            className="rounded-full border-[0.5px] border-terracota bg-marfil px-3 py-1.5 text-xs font-medium text-terracota-oscuro hover:bg-terracota-claro"
          >
            Cancelar
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
          El sticky ya no vive en `thead`/`tr` — pasa a cada `th`
          (`.panel-th-sticky`, ver globals.css) por un bug de Safari de
          iOS con rebote elástico (2026-08-28): WebKit no soporta bien
          el sticky en thead/tr durante el overscroll, sí en las celdas
          directamente. */}
      <div className="panel-table-scroll max-h-[600px] overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:max-h-[21rem] max-md:overflow-x-hidden md:overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            {/* border-b (1px) en mobile — pedido explícito del cliente,
                2026-08-27: "las tablas... no poseen separadores claros
                como sí tiene la versión de escritorio". El `0.5px` de
                escritorio se pierde en algunos anchos de píxel de
                mobile (redondea a 0 según densidad de pantalla); acá se
                fuerza a 1px completo, visible en cualquier dispositivo. */}
            <tr className="border-b border-arena text-xs font-semibold uppercase tracking-wide text-grafito/60 md:border-b-[0.5px]">
              <th className="panel-th-sticky px-4 py-3">Paciente</th>
              <th className="panel-th-sticky max-md:hidden px-4 py-3">Tipo de consulta</th>
              <th className="panel-th-sticky max-md:hidden px-4 py-3">Contacto</th>
              <th className="panel-th-sticky max-md:hidden px-4 py-3">Motivo</th>
              <th className="panel-th-sticky px-4 py-3">Fecha y hora</th>
              <th className="panel-th-sticky px-4 py-3">Estado</th>
              <th className="panel-th-sticky max-md:hidden px-4 py-3">Origen</th>
              <th className="panel-th-sticky w-10 px-4 py-3" aria-hidden="true" />
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
              const tipo = t.tipoConsultaId ? tipoPorId.get(t.tipoConsultaId) : undefined;
              return (
                <Fragment key={t.id}>
                  <tr
                    ref={t.id === abrirId ? filaAbiertaRef : undefined}
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
                    <td className="max-md:hidden px-4 py-3 text-sm text-grafito">{renderTipoConsulta(tipo)}</td>
                    <td className="max-md:hidden px-4 py-3 font-[family-name:var(--font-mono)] text-xs text-grafito">
                      <div>{t.telefonoContacto}</div>
                      {/* Corrección de QA: un mail largo en la columna de
                          Contacto pasa a "Ver email →", solo texto (sin
                          la pastilla con borde que usa "Ver motivo" al
                          lado) — variante "link" de VerTextoBoton. */}
                      {t.emailContacto &&
                        (textoEsLargo(t.emailContacto) ? (
                          <VerTextoBoton titulo="Email" texto={t.emailContacto} variante="link" flecha />
                        ) : (
                          <div className="text-grafito/50">{t.emailContacto}</div>
                        ))}
                    </td>
                    <td className="max-md:hidden px-4 py-3 text-grafito">
                      {/* Extra 2.3.3 (E3.3): un motivo largo no se muestra
                          más inline — rompía el ancho de la fila. Reusa
                          VerTextoBoton (Extra 2.3.1/E1.7), el mismo
                          componente de "Ver mail" en Pacientes. */}
                      {textoEsLargo(t.motivo) ? (
                        <VerTextoBoton titulo="Motivo de consulta" texto={t.motivo} />
                      ) : (
                        t.motivo || "—"
                      )}
                    </td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{formatFechaHora(t.horaInicio)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-2 text-xs ${resuelto ? "font-semibold text-grafito/60" : ESTADO_CLASS[t.estado]}`}>
                        <QuadrantMark estado={t.estado} />
                        {resuelto ? "Resuelto" : ESTADO_LABEL[t.estado]}
                      </span>
                      {/* Corrección de QA (2026-09-06): "abajo del estado
                          asistido... poner lo que el profesional marcó" —
                          antes solo se veía al desplegar la fila
                          (renderAcciones, más abajo). `!expandido`: al
                          desplegar, esa misma marca ya aparece ahí con más
                          contexto ("No se puede modificar.") — evita
                          mostrarla duplicada en las dos filas a la vez. */}
                      {resuelto && t.asistencia && !expandido && (
                        <span
                          className={`mt-1 block rounded-full px-2 py-0.5 text-center text-[10px] font-semibold ${
                            t.asistencia === "asistio" ? "bg-salvia-oscuro text-marfil" : "bg-terracota-oscuro text-marfil"
                          }`}
                        >
                          {t.asistencia === "asistio" ? "Asistió" : "Ausente"}
                        </span>
                      )}
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
                      <td colSpan={8} className="px-4 py-3">
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
                          <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Tipo de consulta</dt>
                          <dd className="text-grafito">{renderTipoConsulta(tipo)}</dd>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Contacto</dt>
                          <dd className="font-[family-name:var(--font-mono)] text-grafito">
                            <div>{t.telefonoContacto}</div>
                            {t.emailContacto &&
                              (textoEsLargo(t.emailContacto) ? (
                                <VerTextoBoton titulo="Email" texto={t.emailContacto} variante="link" flecha />
                              ) : (
                                <div className="break-all text-grafito/50">{t.emailContacto}</div>
                              ))}
                          </dd>
                          {t.motivo && (
                            <>
                              <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Motivo</dt>
                              <dd className="text-grafito">
                                {textoEsLargo(t.motivo) ? <VerTextoBoton titulo="Motivo de consulta" texto={t.motivo} /> : t.motivo}
                              </dd>
                            </>
                          )}
                          <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Origen</dt>
                          <dd className="text-grafito/50">{ORIGEN_LABEL[t.origen]}</dd>
                        </dl>
                        <div className="flex flex-wrap gap-2">
                          {renderAcciones(t, resuelto)}
                          {/* Extra 2.3.3 (E3.4) — misma navegación que el
                              botón homónimo de TurnoDetalle en el
                              calendario (turno-detalle.tsx): un turno
                              manual sin ficha vinculada (bug de DNI ya
                              corregido, ver continuarConNuevo en
                              agregar-turno-modal.tsx) no tiene
                              `pacienteId`, así que no se ofrece el botón. */}
                          {t.pacienteId && (
                            <Link
                              href={`/panel/pacientes/${t.pacienteId}`}
                              className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                            >
                              Ver paciente →
                            </Link>
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

      {editarTurno && (
        <EditarTurnoModal
          turno={editarTurno}
          tiposConsulta={tiposConsulta}
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
