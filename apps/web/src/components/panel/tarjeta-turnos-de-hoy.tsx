"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ResumenTurnoItem } from "@dental-mirage/shared-types";
import { marcarAsistenciaAction } from "@/app/actions/turnos";
import { useAhora } from "@/lib/reloj";
import {
  ESTADO_DERIVADO_LABEL,
  ESTADO_DERIVADO_PILL,
  estadoDeTurno,
  type EstadoDeTurno,
} from "@/lib/turno-format";
import { IconoReloj } from "./tarjeta-turnero-iconos";
import { BotonMantenerApretado } from "./boton-mantener-apretado";

// TarjetaTurnosDeHoy — la tarjeta principal del panel (2026-09-19,
// rediseño pedido por el cliente, referencia `rediseñoTurnosHoy.png`).
//
// Hasta acá era una tarjeta más entre seis, del mismo tamaño que
// "Horarios reservados", y decía hora y nombre. Es lo más urgente que
// mira un profesional al entrar, así que ocupa la fila entera y se parte
// en dos: a la izquierda el bloque que la identifica y la cuenta, a la
// derecha una tabla con una fila por turno.
//
// Las cuatro columnas —HORARIO, PACIENTE, ESTADO, ASISTENCIA— van en una
// cabecera FIJA que no se va con el scroll. Es una `<table>` de verdad y
// no una grilla de divs: son datos tabulares, la cabecera tiene que
// acompañar al cuerpo, y en mobile el ancho mínimo de la tabla es lo que
// produce el scroll horizontal sin declarar anchos dos veces.
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

// Los anchos de las columnas, en un solo lugar para que la cabecera fija
// y las filas no se puedan desalinear. El total define el ancho mínimo
// de la tabla, que es lo que dispara el scroll horizontal en mobile.
const COL_HORARIO = "w-[9.5rem]";
const COL_PACIENTE = "w-[14rem]";
const COL_ESTADO = "w-[9.5rem]";

const CELDA = "px-4 py-3 align-middle";

export function TarjetaTurnosDeHoy({
  turnos,
  hrefCabecera,
  hrefPie,
}: {
  turnos: ResumenTurnoItem[];
  /** "Ver en calendario" — ubica el calendario en el turno más próximo. */
  hrefCabecera: string;
  /** "Ver todos" — Turnos con el mismo recorte que muestra la tarjeta. */
  hrefPie: string;
}) {
  const router = useRouter();
  // `null` mientras se renderiza en el servidor, a propósito: ahí
  // `Date.now()` es el reloj del contenedor, y si el estado de una fila
  // saliera de esa hora el HTML del servidor podría discrepar del
  // cliente justo en el minuto en que un turno arranca. Ver lib/reloj.ts.
  const ahora = useAhora(INTERVALO_RELOJ_MS);

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
    <div className="flex flex-col overflow-hidden rounded-card border-[0.5px] border-arena shadow-soft">
      {/* En mobile las dos partes se apilan; en escritorio el bloque de
          la izquierda es una columna fija y el cuerpo se queda con el
          resto. `items-stretch` para que el cuerpo tenga siempre el alto
          del bloque de la izquierda aunque tenga una sola fila — sin eso
          el efecto vidrio dejaba de cubrir la tarjeta (mismo motivo que
          el `flex-1` de TarjetaConLista). `min-w-0` en los dos: sin eso
          un hijo de flex no baja de su ancho de contenido, y el scroll
          horizontal del cuerpo no llegaba a activarse nunca en mobile. */}
      <div className="flex min-w-0 flex-col items-stretch md:flex-row">
        <div className="relative flex shrink-0 flex-col justify-between gap-4 overflow-hidden bg-marfil p-6 md:w-60">
          <IconoReloj className="pointer-events-none absolute right-2 -bottom-4 h-24 w-24 text-salvia/35" />
          <div className="relative z-10 flex items-baseline justify-between gap-3">
            <p className="font-[family-name:var(--font-mono)] text-xs tracking-widest text-grafito/50 uppercase">
              Turnos de hoy
            </p>
            <Link href={hrefCabecera} className="text-sm font-medium whitespace-nowrap text-salvia-oscuro hover:text-grafito">
              Ver en calendario
            </Link>
          </div>
          <p className="relative z-10 font-[family-name:var(--font-display)] text-6xl font-medium text-salvia-oscuro">
            {turnos.length}
          </p>
        </div>

        {/* `min-w-0` es lo que hace funcionar el scroll horizontal en
            mobile: sin él, este hijo de flex se estira al ancho de la
            tabla y el `overflow-auto` no tiene nada que recortar. */}
        <div className="panel-card-scroll panel-card-vidrio max-h-64 min-h-[11rem] min-w-0 flex-1 overflow-auto">
          {turnos.length === 0 ? (
            <p className="p-6 font-[family-name:var(--font-display)] text-base font-medium text-grafito/50">
              No hay turnos para hoy.
            </p>
          ) : (
            <table className="w-full min-w-[42rem] border-collapse text-left">
              {/* La cabecera acompaña el scroll (`sticky top-0`) pero NO
                  lleva fondo propio: el cuerpo tiene el efecto vidrio de
                  las tarjetas del Turnero y una banda opaca acá lo
                  partía en dos. Lo que va en el verde de siempre son los
                  rótulos, en la misma tipografía que el nombre del
                  paciente — son parte de la misma lectura, no etiquetas
                  de sistema. */}
              <thead className="panel-card-vidrio sticky top-0 z-10">
                <tr className="font-[family-name:var(--font-display)] text-xs font-bold tracking-wide text-salvia-oscuro uppercase">
                  <th scope="col" className={`${CELDA} py-2 ${COL_HORARIO}`}>
                    Horario
                  </th>
                  <th scope="col" className={`${CELDA} py-2 ${COL_PACIENTE}`}>
                    Paciente
                  </th>
                  <th scope="col" className={`${CELDA} py-2 ${COL_ESTADO}`}>
                    Estado
                  </th>
                  {/* Sin ancho: absorbe lo que sobra, y así ESTADO queda
                      pegado al nombre en vez de empujado al otro extremo
                      de la tarjeta. */}
                  <th scope="col" className={`${CELDA} py-2`}>
                    Asistencia
                  </th>
                </tr>
              </thead>
              <tbody>
                {turnos.map((t) => (
                  <FilaTurnoDeHoy key={t.id} turno={t} ahora={ahora} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t-[0.5px] border-arena bg-marfil px-6 py-3">
        {/* Sin turnos por delante no se dice nada: era una frase para
            informar que no hay nada que informar. */}
        {restantes > 0 && <p className="mr-auto text-sm font-medium text-grafito">{textoRestantes(restantes)}</p>}
        <Link href={hrefPie} className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
          Ver todos
        </Link>
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

function FilaTurnoDeHoy({ turno, ahora }: { turno: ResumenTurnoItem; ahora: number | null }) {
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
      <tr className="border-b-[0.5px] border-arena/60">
        {/* La hora y el nombre siguen llevando al turno en el
            calendario; los botones NO pueden ir adentro de ese link (un
            <button> dentro de un <a> no es HTML válido, y el click
            navegaría), así que el link vive en estas dos celdas. */}
        <td className={`${CELDA} ${COL_HORARIO}`}>
          <Link
            href={`/panel/calendario?vista=dia&fecha=${turno.fecha}&turno=${turno.id}`}
            className="font-[family-name:var(--font-display)] text-lg leading-tight font-bold tabular-nums whitespace-nowrap text-salvia-oscuro hover:underline"
          >
            {turno.hora} a {turno.horaFin}
          </Link>
        </td>
        <td className={`${CELDA} ${COL_PACIENTE}`}>
          <Link
            href={`/panel/calendario?vista=dia&fecha=${turno.fecha}&turno=${turno.id}`}
            className="block truncate font-[family-name:var(--font-display)] text-base leading-tight font-bold text-grafito uppercase hover:underline"
          >
            {turno.nombre}
          </Link>
        </td>
        <td className={`${CELDA} ${COL_ESTADO}`}>
          {estado && (
            // Del tamaño del nombre y en su misma tipografía (pedido del
            // cliente): la pastilla es parte de la misma lectura, no una
            // etiqueta de sistema al costado.
            <span
              className={`inline-block rounded-full px-3 py-1 font-[family-name:var(--font-display)] text-base leading-tight font-bold whitespace-nowrap ${ESTADO_DERIVADO_PILL[estado]}`}
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
        <tr className="border-b-[0.5px] border-arena/60">
          <td colSpan={4} className="px-4 pb-3 text-xs text-terracota-oscuro">
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
      className={`px-2.5 py-1.5 text-xs ${elegido ? contorno : "opacity-70"} ${
        disabled ? "cursor-not-allowed opacity-40" : ""
      }`}
      disabled={disabled}
      onConfirmar={onConfirmar}
    />
  );
}

const TITULO_TODAVIA_NO = "La asistencia se puede marcar desde 5 minutos antes del turno.";
