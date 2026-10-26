"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ResumenTurnoItem } from "@dental-mirage/shared-types";
import { marcarAsistenciaAction } from "@/app/actions/turnos";
import { useAhora } from "@/lib/reloj";
import { useAltoDeFilas } from "@/lib/alto-de-filas";
import {
  ESTADO_DERIVADO_LABEL,
  ESTADO_DERIVADO_PILL,
  estadoDeTurno,
  type EstadoDeTurno,
} from "@/lib/turno-format";
import { IconoReloj } from "./tarjeta-turnero-iconos";
import { LinkConVista } from "./link-con-vista";
import { BotonMantenerApretado } from "./boton-mantener-apretado";
import { Despliegue } from "./despliegue";
import { CLASE_CABECERA_SOBRE_VIDRIO, CLASE_FILA } from "./tabla";

// TarjetaTurnosDeHoy — la tarjeta principal del panel (2026-09-19,
// rediseño pedido por el cliente).
//
// Hasta acá era una tarjeta más entre seis, del mismo tamaño que
// "Horarios reservados", y decía hora y nombre. Es lo más urgente que
// mira un profesional al entrar, así que ocupa la fila entera y se parte
// en dos: a la izquierda el bloque que la identifica y la cuenta, a la
// derecha una tabla con una fila por turno.
//
// Las cuatro columnas —HORARIO, PACIENTE, ESTADO, ASISTENCIA— llevan una
// cabecera que no se va con el scroll vertical. Es una `<table>` de verdad
// y no una grilla de divs: son datos tabulares, la cabecera tiene que
// acompañar al cuerpo de costado, y en mobile el ancho mínimo es lo que
// produce el scroll horizontal. Desde el ítem 8 (2026-10-25) esa cabecera
// queda sobre el vidrio, sin la capa opaca de las cabeceras fijas: para que
// ninguna fila pase por debajo, sale del scroll vertical y la tabla se parte
// en dos (ver TablaDeTurnos, más abajo).
//
// ## La asistencia de acá es REVERSIBLE
//
// Los dos botones son los mismos del cartel del final del turno, pero lo
// que escriben mientras el turno no terminó es un BORRADOR
// (`asistenciaPreliminar`): se puede marcar "no asistió", que la persona
// llegue tarde, y corregir a "asistió". Por eso el botón elegido se
// marca con un CONTORNO en vez de reemplazar la celda por un texto — la
// elección se sigue pudiendo cambiar, y una celda de solo lectura diría
// lo contrario.
//
// El último estado es el que se lee cuando el turno cruza su hora de
// fin: ahí el borrador se vuelve la asistencia definitiva, con todas sus
// consecuencias, y recién entonces es irreversible (ver models.go y
// aplicarLosBorradoresQueVencieron en el backend).
//
// Por qué es un Client Component: el estado, la ventana de los botones y
// el conteo del pie dependen del reloj, y tienen que cambiar solos en la
// pantalla que ya está abierta.

// INTERVALO_RELOJ_MS — cada cuánto se vuelve a mirar la hora. No es un
// sondeo al servidor: los datos ya están, lo único que cambia es qué
// hora es.
const INTERVALO_RELOJ_MS = 15_000;

// ANTICIPO_ASISTENCIA_MS — espejo de `AnticipoAsistencia` del backend
// (turnos.go). El backend es el que manda: si esto se adelantara, los
// botones se habilitarían para que el servidor los rechace.
const ANTICIPO_ASISTENCIA_MS = 5 * 60 * 1000;

// Los anchos de las columnas, en un solo lugar: las dos tablas (la cabecera
// visible y la de las filas) los declaran con el mismo `<colgroup>`, así no
// se pueden desalinear. El total define el ancho mínimo de la tabla, que es
// lo que dispara el scroll horizontal en mobile.
//
// Van con `table-layout: fixed` (ver la tabla): con el layout automático
// el navegador reparte el sobrante entre las columnas de texto, y la de
// PACIENTE —la única con contenido de largo variable— se quedaba con
// todo, empujando ESTADO y ASISTENCIA contra el borde derecho
// (2026-09-19, pedido del cliente: "hay un gran espacio entre PACIENTE y
// ESTADO"). Con el layout fijo los anchos se respetan tal cual y el
// sobrante queda en ASISTENCIA, que es la última: las tres primeras
// columnas quedan juntas a la izquierda.
const COL_HORARIO = "w-[8.75rem]";
const COL_PACIENTE = "w-[11rem]";
const COL_ESTADO = "w-[8.5rem]";
const COL_PROFESIONAL = "w-[11rem]";

const CELDA = "px-4 py-3 align-middle";

// La cabecera es la de las tablas del panel en su variante sobre el vidrio
// (CLASE_CABECERA_SOBRE_VIDRIO, ítem 8, 2026-10-25): el mismo renglón en
// mayúsculas, sin fondo y con la línea inferior translúcida. El cuerpo de
// esta tarjeta conserva la tipografía display del Turnero (pedido del
// cliente, 2026-09-19): es la tarjeta de lo más urgente del día, no una lista
// de gestión.
interface Columna {
  nombre: string;
  /** Sin ancho, la columna absorbe lo que sobra (en las dos tablas). */
  ancho?: string;
  clase?: string;
}

function columnasDeLaTabla(conProfesional: boolean): Columna[] {
  return [
    { nombre: "Horario", ancho: COL_HORARIO },
    { nombre: "Paciente", ancho: COL_PACIENTE },
    // Solo en la vista general de recepción: ahí los turnos son de varias
    // personas y la lista tiene que decir de quién es cada uno.
    ...(conProfesional ? [{ nombre: "Profesional", ancho: COL_PROFESIONAL }] : []),
    // `pl-7` y no `pl-4`: la píldora de abajo tiene su propio `px-3`, así
    // que su TEXTO arranca 12 px más adentro que su caja. Alineado contra
    // la caja, el rótulo quedaba corrido respecto de la palabra que nombra
    // (2026-09-19, pedido del cliente). Repetido con `md:` y `2xl:`, o el
    // padding de la cabecera común se lo pisa.
    { nombre: "Estado", ancho: COL_ESTADO, clase: "pl-7 md:pl-7 2xl:pl-7" },
    // Sin ancho: absorbe lo que sobra, y así ESTADO queda pegado al nombre
    // en vez de empujado al otro extremo de la tarjeta.
    { nombre: "Asistencia" },
  ];
}

function AnchosDeColumnas({ columnas }: { columnas: Columna[] }) {
  return (
    <colgroup>
      {columnas.map((c) => (
        <col key={c.nombre} className={c.ancho} />
      ))}
    </colgroup>
  );
}

export function TarjetaTurnosDeHoy({
  turnos,
  hrefCabecera,
  hrefPie,
  ahoraDelServidor,
}: {
  turnos: ResumenTurnoItem[];
  /** La hora a la que el servidor armó la pantalla (ms). Se usa solo hasta
   *  que el cliente tiene su propio reloj: así el estado de cada fila y los
   *  botones de asistencia vienen en el HTML y no aparecen tarde. */
  ahoraDelServidor?: number;
  // `profesional` viene solo en la vista general de recepción (ver
  // resumenTurnoItem en el backend). Con el dato presente la tabla suma
  // una columna; sin él queda igual que siempre, que es lo que ve un
  // profesional en su propia agenda.
  /** "Ver en calendario" — ubica el calendario en el turno más próximo. */
  hrefCabecera: string;
  /** "Ver todos" — Turnos con el mismo recorte que muestra la tarjeta. */
  hrefPie: string;
}) {
  const router = useRouter();
  // `useAhora` es `null` en el servidor y durante la hidratación, a
  // propósito (lib/reloj.ts). Hasta que llega el reloj del cliente se usa
  // la hora que trae la página desde el servidor (2026-10-10): la misma en
  // el HTML y en el render de hidratación, así que no hay discrepancia, y
  // el estado de las filas y los botones de asistencia ya vienen en el
  // HTML en vez de aparecer medio segundo después. Si el cliente ve otra
  // hora (el minuto en que un turno arranca), se actualiza como cualquier
  // tic del reloj.
  const ahora = useAhora(INTERVALO_RELOJ_MS) ?? ahoraDelServidor ?? null;
  // Basta con que UN turno lo traiga: el backend lo manda para todos o
  // para ninguno, y mirar la lista entera evita depender de que el
  // primero exista.
  const conProfesional = turnos.some((t) => Boolean(t.profesional));

  // Cuando un turno cruza su hora de fin deja de pertenecer a esta
  // tarjeta: el backend lo pasa a "Turnos resueltos hoy" (aplicando el
  // borrador si lo tenía). Pero eso es un cambio del SERVIDOR, y acá lo
  // único que se movió es el reloj — sin volver a pedir la pantalla, la
  // fila se quedaría acá hasta que alguien navegue.
  //
  // Pedido del cliente: "cuando el turno esté resuelto y se haya marcado
  // asistido o no asistido, la tarjeta debe actualizarse en tiempo real
  // y pasar a la tarjeta de turnos resueltos".
  const hayVencidos = ahora !== null && turnos.some((t) => estadoDelItem(t, ahora) === "resuelto");
  useEffect(() => {
    if (hayVencidos) router.refresh();
  }, [hayVencidos, router]);

  // "Quedan N turnos más hoy": los que TODAVÍA NO EMPEZARON. El que está
  // en proceso no es uno "más", es el de ahora.
  const restantes =
    ahora === null ? turnos.length : turnos.filter((t) => estadoDelItem(t, ahora) === "pendiente").length;

  return (
    <Despliegue forma="derecha" className="vidrio flex flex-col overflow-hidden">
      {/* En mobile las dos partes se apilan; en escritorio el bloque de
          la izquierda es una columna fija y el cuerpo se queda con el
          resto. `items-stretch` para que el cuerpo tenga siempre el alto
          del bloque de la izquierda aunque tenga una sola fila — sin eso
          quedaba un hueco abajo (mismo motivo que el `flex-1` de
          TarjetaConLista). `min-w-0` en los dos: sin eso
          un hijo de flex no baja de su ancho de contenido, y el scroll
          horizontal del cuerpo no llegaba a activarse nunca en mobile. */}
      <div className="flex min-w-0 flex-col items-stretch md:flex-row">
        {/* La carátula de la tarjeta (`.vidrio-capa`, 2026-10-17): la
            segunda capa del vidrio, con el número, a la misma curva que
            las esquinas de la tarjeta. */}
        <div className="vidrio-capa relative flex shrink-0 flex-col justify-between gap-4 overflow-hidden p-4.5 md:w-60">
          <IconoReloj className="pointer-events-none absolute right-2 -bottom-4 h-24 w-24 opacity-60" />
          {/* El rótulo solo en su renglón y el link abajo (2026-09-26): los
              dos en la misma fila no entraban en los 240 px de la columna,
              y "TURNOS DE HOY" se partía en dos renglones. En mobile el
              bloque es ancho y vuelven a compartir la fila. */}
          <div className="relative z-10 flex items-baseline justify-between gap-3 md:flex-col md:gap-1">
            <p className="font-[family-name:var(--font-mono)] tabular-nums text-xs tracking-widest whitespace-nowrap text-grafito/75 uppercase">
              Turnos de hoy
            </p>
            <Link href={hrefCabecera} className="text-sm font-medium whitespace-nowrap text-marca hover:text-grafito">
              Ver en calendario
            </Link>
          </div>
          <p className="despliegue-cifra relative z-10 font-[family-name:var(--font-display)] tracking-tight text-5xl font-semibold text-marca">
            {turnos.length}
          </p>
        </div>

        {/* La caja de afuera recorta el despliegue (`despliegue-cuerpo`,
            un `clip-path` que se abre hacia la derecha) y cierra los dos
            ejes: con uno solo en `hidden`, el otro computa `auto` y sería
            otro contenedor de scroll. Adentro van la cabecera visible y UNA
            caja que scrollea las filas en los dos sentidos (TablaDeTurnos).
            `min-w-0` para que ningún hijo de flex se niegue a bajar de su
            ancho de contenido. */}
        <div className="despliegue-cuerpo flex min-h-[11rem] min-w-0 flex-1 overflow-hidden">
          {turnos.length === 0 ? (
            <p className="p-6 font-[family-name:var(--font-display)] text-base font-semibold text-grafito/75">
              No hay turnos para hoy.
            </p>
          ) : (
            <TablaDeTurnos turnos={turnos} ahora={ahora} conProfesional={conProfesional} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t border-grafito/10 px-6 py-3">
        {/* Sin turnos por delante no se dice nada: era una frase para
            informar que no hay nada que informar. */}
        {restantes > 0 && <p className="mr-auto text-sm font-medium text-grafito">{textoRestantes(restantes)}</p>}
        <Link href={hrefPie} className="text-sm font-medium text-marca hover:text-grafito">
          Ver todos
        </Link>
      </div>
    </Despliegue>
  );
}

// TablaDeTurnos — las dos tablas alineadas de la tarjeta: la cabecera
// visible arriba y, debajo, UNA caja que scrollea las filas en los dos
// sentidos. La cabecera queda fuera del scroll vertical (ítem 8, 2026-10-25:
// así ninguna fila le pasa por debajo y puede ir sin fondo) y sigue el de
// costado copiando el `scrollLeft` de la caja, sin estado ni renders.
//
// Hasta el 25/10 el scroll de costado era de una caja de afuera, con una
// columna al ancho mínimo de la tabla y la caja vertical adentro: en la
// tablet (768 a 1279 px) la barra vertical quedaba al final de esa columna
// de 44 rem, escondida hasta llegar de costado al borde. Con una sola caja
// la barra vertical está en el borde visible y la horizontal, debajo de
// las filas.
//
// Es un componente aparte porque es dueño de la caja que mide
// `useAltoDeFilas`: se monta recién cuando hay turnos, así el hook la mide
// también si la lista llega después (de "No hay turnos para hoy" a la
// primera fila, con un refresh).
function TablaDeTurnos({
  turnos,
  ahora,
  conProfesional,
}: {
  turnos: ResumenTurnoItem[];
  ahora: number | null;
  conProfesional: boolean;
}) {
  // En el celular, cuatro filas enteras antes del scroll (ver lib/alto-de-filas.ts).
  // La barra horizontal ahora vive en esta misma caja: el hook la descuenta
  // como parte del marco (`offsetHeight - clientHeight`).
  const cajaTabla = useRef<HTMLDivElement>(null);
  const cabecera = useRef<HTMLDivElement>(null);
  useAltoDeFilas(cajaTabla);
  const columnas = columnasDeLaTabla(conProfesional);
  const anchoMinimo = conProfesional ? "min-w-[55rem]" : "min-w-[44rem]";
  return (
    <div className="flex w-full min-w-0 flex-col">
      {/* La cabecera que se ve. `aria-hidden`: la que leen los lectores
          de pantalla es el `<thead>` de la tabla de abajo.
          La barra vertical ocupa ancho en la caja de las filas y no acá:
          sin compensarla, en Windows con mouse las columnas se corrían
          su ancho. `scrollbar-gutter: stable` en las DOS cajas, con la
          misma clase de barra: el navegador reserva el mismo canal en
          ambas (también con `overflow: hidden`), sin medir con JS, y con
          barras superpuestas (celular, macOS) el canal vale 0 en las dos.
          El costo: con pocas filas queda un canal vacío de 8 px. */}
      <div ref={cabecera} className="panel-card-scroll shrink-0 overflow-hidden [scrollbar-gutter:stable]">
        <table aria-hidden="true" className={`w-full table-fixed border-collapse text-left ${anchoMinimo}`}>
          <AnchosDeColumnas columnas={columnas} />
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c.nombre} className={`${CLASE_CABECERA_SOBRE_VIDRIO} ${c.clase ?? ""}`}>
                  {c.nombre}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>
      {/* El alto desde `md`: cuatro filas y media, para que la quinta
          asome y se note que hay más. Una fila mide 55 px (el `py-3` de
          CELDA más los botones de asistencia): 4,5 × 55 = 247,5 px ≈
          15,5 rem. En el celular, cuatro filas medidas con
          `useAltoDeFilas`. */}
      <div
        ref={cajaTabla}
        onScroll={(e) => {
          if (cabecera.current) cabecera.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
        className="panel-card-scroll min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable] max-h-[15.5rem] max-md:max-h-[var(--alto-mobile,15.5rem)]"
      >
        <table className={`w-full table-fixed border-collapse text-left ${anchoMinimo}`}>
          <AnchosDeColumnas columnas={columnas} />
          {/* El `<thead>` de verdad, de alto cero: sin relleno ni
              borde, y el texto solo para los lectores de pantalla. */}
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c.nombre} scope="col" className="p-0">
                  <span className="sr-only">{c.nombre}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => (
              <FilaTurnoDeHoy key={t.id} turno={t} ahora={ahora} conProfesional={conProfesional} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function textoRestantes(restantes: number): string {
  if (restantes === 1) return "Queda 1 turno más hoy.";
  return `Quedan ${restantes} turnos más hoy.`;
}

// estadoDelItem — el mismo `estadoDeTurno` de siempre, adaptado a la
// forma acotada que manda el resumen del panel.
function estadoDelItem(turno: ResumenTurnoItem, ahora: number): EstadoDeTurno {
  return estadoDeTurno(
    { estado: "agendado", horaInicio: turno.horaInicioIso, horaFin: turno.horaFinIso },
    ahora,
  );
}

function FilaTurnoDeHoy({
  turno,
  ahora,
  conProfesional,
}: {
  turno: ResumenTurnoItem;
  ahora: number | null;
  conProfesional: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  // Lo elegido en ESTA pantalla, para que el contorno cambie apenas se
  // suelta el botón. El servidor confirma con el refresh de abajo; sin
  // esto habría medio segundo en que el botón apretado no muestra nada.
  const [elegidoLocal, setElegidoLocal] = useState<"asistio" | "ausente" | null>(null);
  const elegido = elegidoLocal ?? turno.asistenciaPreliminar ?? turno.asistencia ?? null;

  const estado = ahora === null ? null : estadoDelItem(turno, ahora);
  const inicio = turno.horaInicioIso ? new Date(turno.horaInicioIso).getTime() : null;
  // Los botones se habilitan 5 minutos antes del comienzo. Sin hora de
  // inicio no se habilitan nunca: no hay contra qué medir, y el backend
  // rechazaría igual.
  const puedeMarcar = ahora !== null && inicio !== null && ahora >= inicio - ANTICIPO_ASISTENCIA_MS;

  function marcar(valor: "asistio" | "ausente") {
    iniciar(async () => {
      setError(null);
      const resultado = await marcarAsistenciaAction(turno.id, valor);
      if (resultado && "error" in resultado && resultado.error) {
        setError(resultado.error);
        return;
      }
      setElegidoLocal(valor);
      router.refresh();
    });
  }

  return (
    <>
      <tr className={CLASE_FILA}>
        {/* La hora y el nombre siguen llevando al turno en el
            calendario; los botones NO pueden ir adentro de ese link (un
            <button> dentro de un <a> no es HTML válido, y el click
            navegaría), así que el link vive en estas dos celdas. */}
        <td className={`${CELDA} ${COL_HORARIO}`}>
          {/* Desde la vista general, tocar la fila se para primero en la
              agenda de ese profesional: el calendario al que llega tiene
              que ser el que la fila prometía (QA de la 3.2.6). */}
          <LinkConVista
            href={`/panel/calendario?vista=dia&fecha=${turno.fecha}&turno=${turno.id}`}
            userId={turno.profesionalId}
            className="font-[family-name:var(--font-display)] text-lg leading-tight font-bold tabular-nums whitespace-nowrap text-marca hover:underline"
          >
            {turno.hora} a {turno.horaFin}
          </LinkConVista>
        </td>
        <td className={`${CELDA} ${COL_PACIENTE}`}>
          {/* EL NOMBRE LLEVA A LA FICHA, no al turno (QA de la 3.2.6,
              2026-09-21). El horario de al lado sigue llevando al
              calendario: son dos preguntas distintas —"¿qué pasa a esta
              hora?" y "¿quién es esta persona?"— y hasta acá las dos
              terminaban en el mismo lugar.
              Sin ficha (un turno sin paciente vinculado) se queda con el
              link de siempre: un link a ninguna parte sería peor. */}
          <LinkConVista
            href={
              turno.pacienteId
                ? `/panel/pacientes/${turno.pacienteId}`
                : `/panel/calendario?vista=dia&fecha=${turno.fecha}&turno=${turno.id}`
            }
            userId={turno.profesionalId}
            className="block truncate font-[family-name:var(--font-display)] text-base leading-tight font-bold text-grafito uppercase hover:underline"
          >
            {turno.nombre}
          </LinkConVista>
        </td>
        {conProfesional && (
          <td className={`${CELDA} ${COL_PROFESIONAL}`}>
            {/* La misma tipografía que el nombre del paciente (QA de la
                3.2.6). Estaba en la fuente del cuerpo y a 14px: al lado
                de una fila entera en display se leía como si fuera de
                otra pantalla. Lo que lo deja en segundo plano es el peso
                y el tono, no una familia distinta. */}
            <span className="block truncate font-[family-name:var(--font-display)] text-base leading-tight font-semibold text-grafito/75">
              {turno.profesional ?? "—"}
            </span>
          </td>
        )}
        <td className={`${CELDA} ${COL_ESTADO}`}>
          {estado && (
            // Del tamaño del nombre y en su misma tipografía (pedido del
            // cliente): la pastilla es parte de la misma lectura, no una
            // etiqueta de sistema al costado.
            <span
              className={`inline-block rounded-pastilla px-3 py-1 font-[family-name:var(--font-display)] text-base leading-tight font-bold whitespace-nowrap ${ESTADO_DERIVADO_PILL[estado]}`}
            >
              {ESTADO_DERIVADO_LABEL[estado]}
            </span>
          )}
        </td>
        <td className={CELDA}>
          {/* Los botones están SIEMPRE, apagados hasta que falten 5
              minutos: apareciendo de la nada movían la fila entera y no
              dejaban ver de antemano que la columna iba a tener algo.
              El elegido queda con contorno, y se puede cambiar. */}
          <div className="flex items-center gap-1.5" title={puedeMarcar ? undefined : TITULO_TODAVIA_NO}>
            <BotonAsistencia
              etiqueta="Asistió"
              color="salvia"
              elegido={elegido === "asistio"}
              disabled={guardando || !puedeMarcar}
              onConfirmar={() => marcar("asistio")}
            />
            <BotonAsistencia
              etiqueta="No asistió"
              color="terracota"
              elegido={elegido === "ausente"}
              disabled={guardando || !puedeMarcar}
              onConfirmar={() => marcar("ausente")}
            />
          </div>
        </td>
      </tr>
      {/* Por qué no se pudo marcar — un conflicto de identidad sin
          resolver, casi siempre. Sin esto el botón se llena, no pasa
          nada, y no hay forma de saber por qué. */}
      {error && (
        <tr className={CLASE_FILA}>
          <td colSpan={conProfesional ? 5 : 4} className="px-4 pb-3 text-xs text-terracota-oscuro">
            <span role="alert">{error}</span>
          </td>
        </tr>
      )}
    </>
  );
}

// BotonAsistencia — el botón de mantener apretado de siempre, con el
// contorno que marca cuál está elegido.
//
// Contorno y no un cambio de texto: la elección sigue siendo reversible
// mientras el turno no termine, y una celda que dijera "Asistido" en vez
// de los botones haría pensar que ya no se puede tocar.
function BotonAsistencia({
  etiqueta,
  color,
  elegido,
  disabled,
  onConfirmar,
}: {
  etiqueta: string;
  color: "salvia" | "terracota";
  elegido: boolean;
  disabled: boolean;
  onConfirmar: () => void;
}) {
  const relleno = color === "salvia" ? "bg-salvia-oscuro" : "bg-terracota-oscuro";
  // Ancho fijo para los dos: "No asistió" es cuatro letras más largo que
  // "Asistió", y sin esto quedaban de tamaños distintos al lado uno del
  // otro (2026-09-19, corrección pedida con captura). Es un par de
  // opciones equivalentes; que una se vea más grande sugiere que pesa
  // más.
  const ancho = "w-[6.75rem]";
  const contorno =
    color === "salvia"
      ? "ring-2 ring-salvia-oscuro ring-offset-1 ring-offset-hueso"
      : "ring-2 ring-terracota-oscuro ring-offset-1 ring-offset-hueso";
  return (
    <BotonMantenerApretado
      etiqueta={etiqueta}
      claseColor={relleno}
      // Sin elegir, el botón va apagado: los dos llenos de color
      // competían entre sí y no se leía cuál estaba puesto.
      className={`${ancho} px-2.5 py-1.5 text-xs ${elegido ? contorno : "opacity-70"} ${
        disabled ? "cursor-not-allowed opacity-40" : ""
      }`}
      disabled={disabled}
      onConfirmar={onConfirmar}
      // Se puede cambiar de opinión las veces que haga falta mientras el
      // turno no termine: lo anotado es un borrador.
      repetible
    />
  );
}

const TITULO_TODAVIA_NO = "La asistencia se puede marcar desde 5 minutos antes del turno.";
