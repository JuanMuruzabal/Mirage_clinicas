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
// y la cuenta, a la derecha el cuerpo con una fila por turno.
//
// Lo que se suma en cada fila:
//
//   - **El estado**, PENDIENTE o EN PROCESO. Sale del reloj, no de una
//     columna (ver `estadoDeTurno`): un turno está en proceso porque
//     estamos dentro de su horario. Los resueltos no aparecen acá —
//     tienen su propia tarjeta.
//   - **La asistencia**, con los mismos dos botones de mantener apretado
//     que el cartel del final del turno. Es la misma acción y el mismo
//     endpoint: marcar acá ADELANTA todas sus consecuencias (verificar
//     al paciente, resolver el conflicto que ese turno originó) y evita
//     que el cartel aparezca después. Se abren 5 minutos antes de que el
//     turno empiece — antes de eso "asistió" sería adivinar, y el
//     backend lo rechaza igual.
//
// Por qué es un Client Component y no una tarjeta más del Server
// Component: las tres cosas de arriba dependen del reloj, y tienen que
// cambiar solas en la pantalla que ya está abierta.

// INTERVALO_RELOJ_MS — cada cuánto se vuelve a mirar la hora. No es un
// sondeo al servidor: los datos ya están, lo único que cambia es qué
// hora es. 15 s es la mitad del hueco más chico que el producto permite
// configurar, así que ninguna transición se ve con más de unos segundos
// de atraso.
const INTERVALO_RELOJ_MS = 15_000;

// ANTICIPO_ASISTENCIA_MS — espejo de `AnticipoAsistencia` del backend
// (turnos.go). El backend es el que manda: si esto se adelantara, los
// botones aparecerían para que el servidor los rechace.
const ANTICIPO_ASISTENCIA_MS = 5 * 60 * 1000;

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
  // cliente justo en el minuto en que un turno arranca. Hasta ese
  // momento la fila muestra hora y nombre; el estado y los botones
  // aparecen en el primer render del cliente. Ver lib/reloj.ts.
  const ahora = useAhora(INTERVALO_RELOJ_MS);

  // "Quedan N turnos más hoy": los que TODAVÍA NO EMPEZARON. El que está
  // en proceso no es uno "más", es el de ahora — contarlo ahí haría que
  // la frase dijera que falta algo que está pasando.
  const restantes =
    ahora === null ? turnos.length : turnos.filter((t) => estadoDelItem(t, ahora) === "pendiente").length;

  return (
    <div className="flex flex-col overflow-hidden rounded-card border-[0.5px] border-arena shadow-soft">
      {/* En mobile las dos partes se apilan; en escritorio el bloque de
          la izquierda es una columna fija y el cuerpo se queda con el
          resto. `items-stretch` para que el cuerpo tenga siempre el alto
          del bloque cuadrado aunque tenga una sola fila — sin eso el
          efecto vidrio dejaba de cubrir la tarjeta (mismo motivo que el
          `flex-1` de TarjetaConLista). */}
      <div className="flex flex-col items-stretch md:flex-row">
        <div className="relative flex shrink-0 flex-col justify-between gap-4 overflow-hidden bg-marfil p-6 md:w-64">
          <IconoReloj className="pointer-events-none absolute right-2 -bottom-4 h-24 w-24 text-salvia/35" />
          <div className="relative z-10 flex items-baseline justify-between gap-3">
            <p className="font-[family-name:var(--font-mono)] text-xs tracking-widest text-grafito/50 uppercase">
              Turnos de hoy
            </p>
            <Link href={hrefCabecera} className="text-sm font-medium whitespace-nowrap text-salvia-oscuro hover:text-grafito">
              Ver calendario
            </Link>
          </div>
          <div className="relative z-10 flex flex-col">
            <p className="font-[family-name:var(--font-display)] text-6xl font-medium text-salvia-oscuro">
              {turnos.length}
            </p>
            <p className="text-sm text-grafito/60">
              {turnos.length === 1 ? "turno agendado" : "turnos agendados"}
            </p>
          </div>
        </div>

        {/* El cuerpo, medio transparente como el resto de las tarjetas
            del Turnero. `min-h`/`max-h` en vez de un alto fijo: con un
            solo turno no deja un hueco enorme, y con diez no empuja el
            resto del panel fuera de la pantalla. */}
        <div className="panel-card-scroll panel-card-vidrio max-h-64 min-h-[11rem] flex-1 overflow-y-auto">
          {turnos.length === 0 ? (
            <p className="p-6 font-[family-name:var(--font-display)] text-base font-medium text-grafito/50">
              No hay turnos para hoy.
            </p>
          ) : (
            <ul>
              {turnos.map((t) => (
                <FilaTurnoDeHoy key={t.id} turno={t} ahora={ahora} />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t-[0.5px] border-arena bg-marfil px-6 py-3">
        <p className="text-sm font-medium text-grafito">{textoRestantes(restantes)}</p>
        <Link href="/panel/turnos?estado=agendado" className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
          Ver todos
        </Link>
      </div>
    </div>
  );
}

export function textoRestantes(restantes: number): string {
  if (restantes === 0) return "No queda ningún turno más hoy.";
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
  // Los botones se abren 5 minutos antes del comienzo. Sin hora de
  // inicio no se abren nunca: no hay contra qué medir, y el backend
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
      // El turno marcado sale de esta lista y entra en "Turnos resueltos
      // hoy" — las dos las arma el mismo endpoint, así que alcanza con
      // volver a pedir la pantalla.
      router.refresh();
    });
  }

  return (
    <li className="border-b-[0.5px] border-arena/60 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        {/* La hora y el nombre siguen llevando al turno en el
            calendario; los botones NO pueden ir adentro de ese link
            (un <button> dentro de un <a> no es HTML válido, y el click
            navegaría), así que la fila deja de ser un solo link. */}
        <Link
          href={`/panel/calendario?vista=dia&fecha=${turno.fecha}&turno=${turno.id}`}
          className="flex min-w-0 flex-1 items-baseline gap-x-3 hover:underline"
        >
          <span className="w-[8.5rem] shrink-0 font-[family-name:var(--font-display)] text-lg leading-tight font-bold tabular-nums whitespace-nowrap text-salvia-oscuro">
            {turno.hora} a {turno.horaFin}
          </span>
          <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-base leading-tight font-bold text-grafito uppercase">
            {turno.nombre}
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          {estado && (
            <span
              className={`rounded-full px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase ${ESTADO_DERIVADO_PILL[estado]}`}
            >
              {ESTADO_DERIVADO_LABEL[estado]}
            </span>
          )}
          {puedeMarcar && (
            <div className="flex items-center gap-1.5">
              <BotonMantenerApretado
                etiqueta="Asistió"
                claseColor="bg-salvia-oscuro"
                className="px-2.5 py-1.5 text-xs"
                disabled={guardando}
                onConfirmar={() => marcar("asistio")}
              />
              <BotonMantenerApretado
                etiqueta="No asistió"
                claseColor="bg-terracota-oscuro"
                className="px-2.5 py-1.5 text-xs"
                disabled={guardando}
                onConfirmar={() => marcar("ausente")}
              />
            </div>
          )}
        </div>
      </div>
      {/* Por qué no se pudo marcar — un conflicto de identidad sin
          resolver, casi siempre. Sin esto el botón se llena, no pasa
          nada, y no hay forma de saber por qué. */}
      {error && (
        <p role="alert" className="px-4 pb-3 text-xs text-terracota-oscuro">
          {error}
        </p>
      )}
    </li>
  );
}
