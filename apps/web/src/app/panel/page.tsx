import type { Metadata } from "next";
import { apiResumenPanel } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { formatDiaCorto, parseFechaISOLocal } from "@/lib/calendar-utils";
import { TarjetaConLista, TarjetaEstadistica, TarjetaSimple, FilaResumen } from "@/components/panel/tarjeta-turnero";
import {
  IconoAvance,
  IconoCasilleros,
  IconoEstadistica,
  IconoReloj,
  IconoSello,
  IconoTilde,
} from "@/components/panel/tarjeta-turnero-iconos";
import { AbrirConfiguracionBoton } from "@/components/panel/abrir-configuracion-boton";
import { VerTextoBoton } from "@/components/ver-texto-boton";
import { textoEsLargo } from "@/lib/texto-largo";

export const metadata: Metadata = { title: "General — Dental Mirage" };

// Dashboard "Turnero" (F2.3 extra ítem 1 — rediseño completo,
// docs/implementation-plan.md §11.5, brief en
// docs/fase2.3-extra-dental-mirage.md): reemplaza las 2 tarjetas viejas
// (turnos pendientes/turnos próximos, T2.2) por 5 — 3 con un cuerpo de
// filas scrolleable, 2 solo con un número. El estado `pendiente` en sí
// sigue existiendo en el backend (lo saca recién el ítem 2.3.3/2.3.5,
// implementado después según el orden confirmado por el cliente) — este
// dashboard solo deja de tener una tarjeta propia para eso.
export default async function PanelGeneralPage() {
  const token = await getSessionToken();
  const resumenResult = token ? await apiResumenPanel(token) : null;
  const resumen = resumenResult?.ok
    ? resumenResult.data
    : {
        turnosHoy: [],
        turnosProximos: [],
        horariosReservados: [],
        totalConfirmados: 0,
        turnosResueltos: [],
        turnosAsistidos: 0,
        turnosAusentes: 0,
      };

  // proximoTurnoHoy/proximoTurnoManana (corrección de QA, 2026-09-08): "el
  // ver calendario de estas tarjetas me llevara a la primera vista del
  // turno más próximo" — el header "Ver calendario" de "Turnos de hoy"/
  // "Turnos próximos" UBICA el calendario en el turno más próximo de SU
  // propia lista (ya viene ordenada por hora_inicio desde el backend, el
  // primero es el más próximo) — corrección de QA, mismo día: "no tiene
  // que abrir la tarjeta del turno más próximo, sino ubicar el
  // calendario a la vista del usuario con el turno más próximo visible,
  // no abre la tarjeta de ningún turno" — por eso usa `posicionar`, NO
  // `turno` (ese último sí abre el detalle, es el que ya usa cada fila
  // del cuerpo). Sin turnos, cae al link plano de siempre (no hay a
  // dónde deep-linkear).
  const proximoTurnoHoy = resumen.turnosHoy[0];
  const proximoTurnoManana = resumen.turnosProximos[0];
  const hrefTurnosHoy = proximoTurnoHoy
    ? `/panel/calendario?vista=dia&fecha=${proximoTurnoHoy.fecha}&posicionar=${proximoTurnoHoy.id}`
    : "/panel/calendario?vista=dia";
  const hrefTurnosProximos = proximoTurnoManana
    ? `/panel/calendario?vista=semana&fecha=${proximoTurnoManana.fecha}&posicionar=${proximoTurnoManana.id}`
    : "/panel/calendario?vista=semana";

  return (
    <div className="flex flex-col gap-8 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      {/* gap-3 (corrección de QA, 2026-09-06: "separar más el título
          General [del] subtítulo Turnero") — antes gap-1, quedaban casi
          pegados. */}
      <div className="flex flex-col gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]">
          General
        </h1>
        {/* "TURNERO" más visible + descripción al lado (corrección de QA,
            2026-09-06) — antes era un subtítulo chico tipo eyebrow, casi
            invisible; ahora un subtítulo real, con una bajada explicando
            qué es esta sección. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-wide text-salvia-oscuro uppercase">
            Turnero
          </h2>
          <p className="text-sm text-grafito/60">Control general de tus turnos y pacientes.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1 max-md:min-w-[18rem]">
        <TarjetaConLista
          eyebrow="Turnos de hoy"
          valor={resumen.turnosHoy.length}
          hrefCabecera={hrefTurnosHoy}
          labelCabecera="Ver calendario"
          vacioMensaje="No hay turnos para hoy."
          acento
          icono={<IconoReloj className="pointer-events-none absolute right-2 -bottom-4 h-24 w-24 text-salvia/35" />}
          filas={resumen.turnosHoy.map((t) => ({
            key: t.id,
            href: `/panel/calendario?vista=dia&fecha=${t.fecha}&turno=${t.id}`,
            contenido: (
              <FilaResumen hora={`${t.hora} a ${t.horaFin}`}>{t.nombre}</FilaResumen>
            ),
          }))}
        />

        <TarjetaConLista
          eyebrow="Turnos próximos"
          valor={resumen.turnosProximos.length}
          hrefCabecera={hrefTurnosProximos}
          labelCabecera="Ver calendario"
          vacioMensaje="No hay turnos próximos."
          acento
          icono={<IconoAvance className="pointer-events-none absolute right-2 -bottom-4 h-24 w-24 text-salvia/35" />}
          filas={resumen.turnosProximos.map((t) => ({
            key: t.id,
            href: `/panel/calendario?vista=semana&fecha=${t.fecha}&turno=${t.id}`,
            contenido: (
              <FilaResumen etiqueta={formatDiaCorto(parseFechaISOLocal(t.fecha))} hora={`${t.hora} a ${t.horaFin}`}>
                {t.nombre}
              </FilaResumen>
            ),
          }))}
        />

        <TarjetaConLista
          eyebrow="Horarios reservados"
          valor={resumen.horariosReservados.length}
          cabeceraCustom={<AbrirConfiguracionBoton />}
          vacioMensaje="Todavía no cargaste ningún horario reservado."
          acento
          // Un poco más abajo que las demás (pedido explícito del
          // cliente, 2026-09-06) — mismo tamaño/offset horizontal, más
          // margen inferior.
          icono={<IconoCasilleros className="pointer-events-none absolute right-2 -bottom-8 h-24 w-24 text-salvia/35" />}
          filas={resumen.horariosReservados.map((h) => ({
            key: h.id,
            href: `/panel/calendario?vista=semana&fecha=${h.fecha}&bloqueo=${h.id}`,
            contenido: (
              <FilaResumen
                etiqueta={h.etiquetaGeneral ?? formatDiaCorto(parseFechaISOLocal(h.fecha))}
                hora={`${h.horaDesde} a ${h.horaHasta}`}
                uppercase={false}
              >
                {textoEsLargo(h.motivo) ? <VerTextoBoton titulo="Motivo" texto={h.motivo} variante="link" /> : (h.motivo ?? "")}
              </FilaResumen>
            ),
          }))}
        />

        <TarjetaConLista
          // Corrección de QA (rediseño del cartel de asistencia en
          // tiempo real, `AsistenciaCartelGlobal`): esta tarjeta deja de
          // ser una bandeja de "todavía falta marcar" — el cartel,
          // siempre encima bloqueando hasta que se resuelva, ya cubre
          // eso desde cualquier pantalla — y pasa a ser un reporte de
          // HOY: los turnos que YA se marcaron, con el resultado. Mismo
          // formato que "Turnos de hoy" (hora, nombre, sin etiqueta de
          // día — siempre es hoy) más el resultado.
          eyebrow="Turnos resueltos hoy"
          valor={resumen.turnosResueltos.length}
          hrefCabecera="/panel/turnos?estado=resuelto"
          labelCabecera="Ver turnos"
          vacioMensaje="Todavía no se marcó ningún turno hoy."
          acento
          icono={<IconoTilde className="pointer-events-none absolute right-2 -bottom-4 h-24 w-24 text-salvia/35" />}
          filas={resumen.turnosResueltos.map((t) => ({
            key: t.id,
            href: `/panel/turnos?estado=resuelto&turno=${t.id}`,
            contenido: (
              <FilaResumen hora={`${t.hora} a ${t.horaFin}`}>
                {t.nombre}{" "}
                <span className={t.asistencia === "asistio" ? "text-salvia-oscuro" : "text-terracota-oscuro"}>
                  {t.asistencia === "asistio" ? "· Asistió" : "· Ausente"}
                </span>
              </FilaResumen>
            ),
          }))}
        />

        {/* Última (corrección de QA, 2026-09-06: "la tarjeta de turnos
            confirmados debe ser la última") — antes iba cuarta. */}
        <TarjetaSimple
          eyebrow="Turnos confirmados"
          valor={resumen.totalConfirmados}
          href="/panel/turnos?estado=agendado"
          titulo="Ver turnos"
          acento
          icono={<IconoSello className="pointer-events-none absolute right-2 -bottom-4 h-24 w-24 text-arena" />}
        />

        {/* "Estadística" (corrección de QA, 2026-09-06: "crear una
            tarjeta nueva al lado de turnos confirmados... turnos
            asistidos en verde y turnos ausentados en rojo") — acumulado
            histórico completo, no acotado a hoy/la semana. */}
        <TarjetaEstadistica
          eyebrow="Estadística"
          asistieron={resumen.turnosAsistidos}
          ausentes={resumen.turnosAusentes}
          icono={<IconoEstadistica className="pointer-events-none absolute right-2 -bottom-4 h-24 w-24 text-salvia/35" />}
        />
      </div>
    </div>
  );
}
