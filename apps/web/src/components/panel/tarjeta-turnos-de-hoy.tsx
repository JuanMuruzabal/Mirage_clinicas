"use client";

import { useState, useTransition } from "react";
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
// mira un profesional al entrar, así que pasa a ocupar la fila entera y
// a partirse en dos: a la izquierda el bloque cuadrado que la identifica
// y la cuenta, a la derecha una tabla con una fila por turno.
//
// Las cuatro columnas —HORARIO, PACIENTE, ESTADO, ASISTENCIA— van en una
// cabecera FIJA que no se va con el scroll. Es una `<table>` de verdad y
// no una grilla de divs: son datos tabulares, la cabecera tiene que
// acompañar al cuerpo, y en mobile el ancho mínimo de la tabla es lo que
// produce el scroll horizontal pedido sin tener que declarar anchos dos
// veces.
//
// Lo que se suma en cada fila:
//
//   - **El estado**, PENDIENTE o EN PROCESO. Sale del reloj, no de una
//     columna (ver `estadoDeTurno`): un turno está en proceso porque
//     estamos dentro de su horario.
//   - **La asistencia**, con los mismos dos botones de mantener apretado
//     que el cartel del final del turno. Es la misma acción y el mismo
//     endpoint, y marcar acá ADELANTA todas sus consecuencias (verificar
//     al paciente, resolver el conflicto que ese turno originó) y evita
//     que el cartel aparezca después.
//
// **Marcar NO adelanta el turno** (corrección del mismo día): la persona
// sigue sentada en la sala y el turno sigue siendo de las 10:15. Lo
// único que se guardó es qué va a decir cuando termine, así que la fila
// se queda acá mostrando "Asistido"/"No asistió" y el estado sigue
// saliendo del reloj. Recién cuando pasa la hora de fin el turno sale de
// esta tarjeta y aparece, con esa misma marca, en "Turnos resueltos
// hoy".
//
// Por qué es un Client Component: el estado, la ventana de los botones y
// el conteo del pie dependen del reloj, y tienen que cambiar solos en la
// pantalla que ya está abierta.

// INTERVALO_RELOJ_MS — cada cuánto se vuelve a mirar la hora. No es un
// sondeo al servidor: los datos ya están, lo único que cambia es qué
// hora es. 15 s es la mitad del hueco más chico que el producto permite
// configurar, así que ninguna transición se ve con más de unos segundos
// de atraso.
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
const COL_ESTADO = "w-[8.5rem]";

const CELDA = "px-4 py-3 align-middle";

export function TarjetaTurnosDeHoy({
  turnos,
  hrefCabecera,
}: {
  turnos: ResumenTurnoItem[];
  /** "Ver calendario" — ubica el calendario en el turno más próximo. */
  hrefCabecera: string;
}) {
  // `null` mientras se renderiza en el servidor, a propósito: ahí
  // `Date.now()` es el reloj del contenedor, y si el estado de una fila
  // saliera de esa hora el HTML del servidor podría discrepar del
  // cliente justo en el minuto en que un turno arranca. Ver lib/reloj.ts.
  const ahora = useAhora(INTERVALO_RELOJ_MS);

  // "Quedan N turnos más hoy": los que TODAVÍA NO EMPEZARON y no están
  // marcados. El que está en proceso no es uno "más", es el de ahora.
  const restantes =
    ahora === null
      ? turnos.length
      : turnos.filter((t) => !t.asistencia && estadoDelItem(t, ahora) === "pendiente").length;

  return (
    <div className="flex flex-col overflow-hidden rounded-card border-[0.5px] border-arena shadow-soft">
      {/* En mobile las dos partes se apilan; en escritorio el bloque de
          la izquierda es una columna fija y el cuerpo se queda con el
          resto. `items-stretch` para que el cuerpo tenga siempre el alto
          del bloque cuadrado aunque tenga una sola fila — sin eso el
          efecto vidrio dejaba de cubrir la tarjeta (mismo motivo que el
          `flex-1` de TarjetaConLista). */}
      <div className="flex flex-col items-stretch md:flex-row">
        <div className="relative flex shrink-0 flex-col justify-between gap-4 overflow-hidden bg-marfil p-6 md:w-60">
          <IconoReloj className="pointer-events-none absolute right-2 -bottom-4 h-24 w-24 text-salvia/35" />
          <div className="relative z-10 flex items-baseline justify-between gap-3">
            <p className="font-[family-name:var(--font-mono)] text-xs tracking-widest text-grafito/50 uppercase">
              Turnos de hoy
            </p>
            <Link href={hrefCabecera} className="text-sm font-medium whitespace-nowrap text-salvia-oscuro hover:text-grafito">
              Ver calendario
            </Link>
          </div>
          {/* Solo el número (2026-09-19, pedido del cliente: "quitar el
              'turnos agendados'"). El eyebrow de arriba ya dice de qué
              son, y la cabecera de la tabla los nombra otra vez. */}
          <p className="relative z-10 font-[family-name:var(--font-display)] text-6xl font-medium text-salvia-oscuro">
            {turnos.length}
          </p>
        </div>

        {/* El cuerpo, medio transparente como el resto de las tarjetas
            del Turnero. `overflow-auto` en los DOS ejes: vertical por la
            lista larga, horizontal por el ancho mínimo de la tabla en
            pantalla angosta. `min-h`/`max-h` en vez de un alto fijo: con
            un solo turno no deja un hueco enorme, y con diez no empuja
            el resto del panel fuera de la pantalla. */}
        <div className="panel-card-scroll panel-card-vidrio max-h-64 min-h-[11rem] flex-1 overflow-auto">
          {turnos.length === 0 ? (
            <p className="p-6 font-[family-name:var(--font-display)] text-base font-medium text-grafito/50">
              No hay turnos para hoy.
            </p>
          ) : (
            <table className="w-full min-w-[40rem] border-collapse text-left">
              {/* La cabecera acompaña el scroll (`sticky top-0`), en el
                  verde de siempre. Sin esto, al bajar por la lista se
                  perdía qué columna era cada cosa. */}
              <thead className="sticky top-0 z-10 bg-salvia-oscuro text-marfil">
                <tr className="font-[family-name:var(--font-mono)] text-[10.5px] tracking-widest uppercase">
                  <th scope="col" className={`${CELDA} py-2 font-medium ${COL_HORARIO}`}>
                    Horario
                  </th>
                  <th scope="col" className={`${CELDA} py-2 font-medium ${COL_PACIENTE}`}>
                    Paciente
                  </th>
                  <th scope="col" className={`${CELDA} py-2 font-medium ${COL_ESTADO}`}>
                    Estado
                  </th>
                  {/* Sin ancho: absorbe lo que sobra, y así ESTADO queda
                      pegado al nombre en vez de empujado al otro
                      extremo de la tarjeta. */}
                  <th scope="col" className={`${CELDA} py-2 font-medium`}>
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
        {/* Sin turnos por delante no se dice nada (2026-09-19, pedido del
            cliente): "no queda ningún turno más hoy" era una frase para
            informar que no hay nada que informar. Queda solo "Ver
            todos", alineado a la derecha. */}
        {restantes > 0 && <p className="mr-auto text-sm font-medium text-grafito">{textoRestantes(restantes)}</p>}
        <Link href="/panel/turnos?estado=agendado" className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
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
// forma acotada que manda el resumen del panel (que no es un `Turno`
// entero: son las cuatro cosas que la tarjeta dibuja).
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
      // El turno se queda en esta lista con su marca hasta que termine —
      // la pantalla la vuelve a pedir para mostrarla.
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
            // Misma tipografía que el nombre (pedido del cliente): la
            // pastilla es parte de la misma lectura, no una etiqueta de
            // sistema al costado.
            <span
              className={`inline-block rounded-full px-2.5 py-1 font-[family-name:var(--font-display)] text-xs font-bold whitespace-nowrap ${ESTADO_DERIVADO_PILL[estado]}`}
            >
              {ESTADO_DERIVADO_LABEL[estado]}
            </span>
          )}
        </td>
        <td className={CELDA}>
          {turno.asistencia ? (
            // Ya marcado: el turno SIGUE pendiente o en proceso (la
            // columna de al lado lo dice), lo que se guardó es qué va a
            // decir cuando termine.
            <span
              className={`inline-block rounded-full px-2.5 py-1 font-[family-name:var(--font-display)] text-xs font-bold whitespace-nowrap ${
                turno.asistencia === "asistio"
                  ? "bg-salvia-claro text-salvia-oscuro"
                  : "bg-terracota-claro text-terracota-oscuro"
              }`}
            >
              {turno.asistencia === "asistio" ? "Asistido" : "No asistió"}
            </span>
          ) : (
            // Los botones están SIEMPRE, apagados hasta que falten 5
            // minutos (2026-09-19, pedido del cliente): apareciendo de
            // la nada movían la fila entera y no dejaban ver de antemano
            // que la columna iba a tener algo.
            <div className="flex items-center gap-1.5" title={puedeMarcar ? undefined : TITULO_TODAVIA_NO}>
              <BotonMantenerApretado
                etiqueta="Asistió"
                claseColor="bg-salvia-oscuro"
                className={`px-2.5 py-1.5 text-xs ${puedeMarcar ? "" : "cursor-not-allowed opacity-40"}`}
                disabled={guardando || !puedeMarcar}
                onConfirmar={() => marcar("asistio")}
              />
              <BotonMantenerApretado
                etiqueta="No asistió"
                claseColor="bg-terracota-oscuro"
                className={`px-2.5 py-1.5 text-xs ${puedeMarcar ? "" : "cursor-not-allowed opacity-40"}`}
                disabled={guardando || !puedeMarcar}
                onConfirmar={() => marcar("ausente")}
              />
            </div>
          )}
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

const TITULO_TODAVIA_NO = "La asistencia se puede marcar desde 5 minutos antes del turno.";
