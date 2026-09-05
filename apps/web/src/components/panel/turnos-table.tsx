"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ListarTurnosParams } from "@/lib/api";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { cancelarTurnoAction, cancelarTurnosSinVerificarAction, listTurnosAction } from "@/app/actions/turnos";
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

  // Corrección de seguridad (Fase 2.4.1): "cómo se hace para borrar todos
  // los turnos sin verificar" — el botón solo aparece con el filtro
  // "Sin verificar" activo (page.tsx). Mismo criterio de confirmación
  // explícita que CancelarTurnoModal, pero sin modal aparte (es un botón
  // de acción de página, no de una fila puntual) — pedir confirmación en
  // dos pasos alcanza para una acción destructiva de este tamaño.
  const [confirmandoCancelarTodos, setConfirmandoCancelarTodos] = useState(false);
  const [cancelandoTodos, setCancelandoTodos] = useState(false);
  const [mensajeCancelacionMasiva, setMensajeCancelacionMasiva] = useState<string | null>(null);

  async function cancelarTodosSinVerificar() {
    setError(null);
    setMensajeCancelacionMasiva(null);
    setCancelandoTodos(true);
    const result = await cancelarTurnosSinVerificarAction();
    setCancelandoTodos(false);
    setConfirmandoCancelarTodos(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setMensajeCancelacionMasiva(
      result.cancelados === 0 ? "No había turnos sin verificar para cancelar." : `Se cancelaron ${result.cancelados} turno(s) sin verificar.`,
    );
    recargar();
  }

  function recargar() {
    listTurnosAction(filtros).then(setTurnos);
  }

  function alternarExpandido(id: string) {
    setExpandidoId((actual) => (actual === id ? null : id));
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

  // bulkCancelarSinVerificar — se arma antes del early-return de "no hay
  // turnos" (más abajo) porque el mensaje de resultado ("se cancelaron N
  // turnos") tiene que poder mostrarse incluso cuando la lista quedó
  // vacía JUSTAMENTE por haberlos cancelado.
  const bulkCancelarSinVerificar = filtros.verificacion === "sin_verificar" && (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border-[0.5px] border-arena bg-marfil p-4 shadow-soft">
      {!confirmandoCancelarTodos ? (
        <button
          type="button"
          onClick={() => setConfirmandoCancelarTodos(true)}
          className="rounded-full border-[0.5px] border-terracota bg-marfil px-4 py-2 text-sm font-medium text-terracota-oscuro hover:bg-terracota-claro"
        >
          Cancelar todos los turnos sin verificar
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-terracota-oscuro">
            Esto cancela TODOS los turnos vigentes de pacientes sin verificar (no se puede deshacer). ¿Confirmás?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={cancelarTodosSinVerificar}
              disabled={cancelandoTodos}
              className="rounded-full bg-terracota-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {cancelandoTodos ? "Cancelando…" : "Sí, cancelar todos"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmandoCancelarTodos(false)}
              disabled={cancelandoTodos}
              className="rounded-full border-[0.5px] border-arena px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro disabled:opacity-60"
            >
              Volver
            </button>
          </div>
        </div>
      )}
      {mensajeCancelacionMasiva && <p className="text-sm text-salvia-oscuro">{mensajeCancelacionMasiva}</p>}
    </div>
  );

  if (turnos.length === 0) {
    return (
      <>
        {bulkCancelarSinVerificar}
        <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">
          No hay turnos para este filtro.
        </p>
      </>
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
      // Corrección de QA (rediseño del cartel de asistencia en tiempo
      // real, `AsistenciaCartelGlobal`): "vamos a quitar todos los otros
      // botones para poner ausente o presente fuera de esto, por
      // ejemplo al tocar el turno resuelto en la sección de turnos
      // resueltos en turnos" — esta fila deja de tener forma de marcar
      // asistencia, solo muestra lo que el cartel ya marcó (o un aviso
      // de que está pendiente ahí).
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
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-grafito/60">Asistencia:</span>
              <span className="text-xs text-grafito/50">Pendiente de confirmar en el cartel de asistencia.</span>
            </p>
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
      {bulkCancelarSinVerificar}

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
              {/* Corrección de QA (2026-09-06): "Fecha y hora" envolvía en
                  3 líneas en mobile (columna angosta con solo 3 visibles:
                  Paciente/Fecha/Estado) — "Fecha" a secas entra en una
                  línea; desde `md` sigue el texto completo. */}
              <th className="panel-th-sticky px-4 py-3">
                <span className="md:hidden">Fecha</span>
                <span className="hidden md:inline">Fecha y hora</span>
              </th>
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
                          {/* Corrección de seguridad (Fase 2.4.1): visibilidad
                              sobre turnos de pacientes que todavía no
                              demostraron ser reales (ningún turno resuelto y
                              asistido todavía) — para triage rápido sin abrir
                              ficha por ficha. */}
                          {!t.pacienteVerificado && (
                            <span className="mt-0.5 inline-flex w-fit items-center rounded-full border-[0.5px] border-arena bg-hueso px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-grafito/60">
                              Sin verificar
                            </span>
                          )}
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
                      {/* w-px + el div interno min-w-full — corrección de QA
                          (2026-09-06, "imitando las dimensiones de mi
                          celular el mail queda recortado"): en una
                          `<table>` con `table-layout: auto` (el default,
                          sin tocar acá porque el ancho de columna
                          "a medida" es justo lo que hace ver bien las
                          columnas de escritorio), el algoritmo de ancho
                          mira el contenido de CUALQUIER celda —incluida
                          una con `colSpan`— para decidir cuánto necesita
                          la tabla entera, y en algunos navegadores/casos
                          eso ignora que el contenido de adentro ya puede
                          envolver (`break-all`): la tabla entera se
                          estira para "no perder" ese texto, y el
                          `overflow-x-hidden` del contenedor de más arriba
                          termina RECORTANDO en vez de envolver. `w-px`
                          en la celda le dice al algoritmo de ancho "esta
                          celda casi no necesita nada" (gana prioridad
                          sobre medir el contenido de adentro); el `div`
                          con `min-w-full` de adentro después sí ocupa
                          todo el ancho real ya resuelto de la tabla —
                          truco estándar de CSS para este problema
                          puntual, no afecta el resto de las columnas. */}
                      <td colSpan={8} className="w-px px-4 py-3">
                        <div className="min-w-full">
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
                        {/* grid-cols-[auto_minmax(0,1fr)] — corrección de QA
                            (2026-09-06, "el mail tiende a desbordarse... se
                            ven no alineados"): con `1fr` a secas, una celda
                            de contenido intrínsecamente ancho (un email
                            largo) empuja la columna más allá del ancho
                            disponible en vez de achicarse — el clásico bug
                            de CSS Grid ("min-width: auto" por default en
                            los hijos). `minmax(0, 1fr)` fuerza el mínimo a
                            0, dejando que `break-all` de adentro recién ahí
                            pueda envolver de verdad en vez de desbordar la
                            pantalla. `min-w-0` explícito en la celda del
                            teléfono/mail por las dudas (el `<dd>` en sí
                            también necesita poder achicarse, no solo la
                            columna del grid). */}
                        {/* items-start explícito (corrección de QA,
                            2026-09-06) — sin esto, el default de CSS
                            Grid ("stretch") estira cada `dt`/`dd` a la
                            altura de TODA su fila. También se pareja el
                            tono de todos los valores a `text-grafito`
                            (antes el mail y Origen quedaban en `/50`, más
                            tenues que Tipo de consulta/teléfono al lado —
                            leído como inconsistente/"desalineado" a
                            simple vista, no un problema de posición sino
                            de peso visual). Se saca también la fuente
                            monoespaciada de Teléfono/Email (pedido
                            textual del cliente: "tiene 2 tamaños
                            diferentes el contenido a la referencia") —
                            al mismo `text-base`, una fuente monoespaciada
                            se ve más grande que la fuente normal de
                            Tipo de consulta/Origen al lado; ahora las 4
                            filas comparten exactamente la misma fuente.
                            Teléfono/Email — corrección de QA (2026-09-06,
                            seguía viéndose desalineado): "Contacto" metía
                            las dos líneas (teléfono + mail) contra UNA
                            sola etiqueta, en la misma celda del grid — la
                            fuente real de la rareza visual (una etiqueta
                            de una línea nunca queda prolijamente alineada
                            contra un valor de dos). Se separan en dos
                            filas propias, cada una con su propia
                            etiqueta — mismo criterio que ya usa
                            PacientesTable (DNI/Teléfono/Email, cada uno
                            su fila), nunca dos datos combinados en una. */}
                        <dl className="mb-3 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-base md:hidden">
                          <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Tipo de consulta</dt>
                          <dd className="min-w-0 text-grafito">{renderTipoConsulta(tipo)}</dd>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Teléfono</dt>
                          <dd className="min-w-0 text-grafito">{t.telefonoContacto}</dd>
                          {t.emailContacto && (
                            <>
                              <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Email</dt>
                              <dd className="min-w-0 text-grafito">
                                {textoEsLargo(t.emailContacto) ? (
                                  <VerTextoBoton titulo="Email" texto={t.emailContacto} variante="link" flecha />
                                ) : (
                                  <span className="break-all">{t.emailContacto}</span>
                                )}
                              </dd>
                            </>
                          )}
                          {t.motivo && (
                            <>
                              <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Motivo</dt>
                              <dd className="min-w-0 text-grafito">
                                {textoEsLargo(t.motivo) ? <VerTextoBoton titulo="Motivo de consulta" texto={t.motivo} /> : t.motivo}
                              </dd>
                            </>
                          )}
                          <dt className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Origen</dt>
                          <dd className="min-w-0 text-grafito">{ORIGEN_LABEL[t.origen]}</dd>
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
