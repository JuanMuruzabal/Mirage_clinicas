"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { TipoConsultaPublico } from "@/lib/api";
import { fechaISOLocal, parseFechaISOLocal } from "@/lib/calendar-utils";
import { IconCalendar, IconCheckBadge } from "@/components/icons";
import { CampoSelect, ModalFooter, ModalShell } from "./shared";
import { PanelCalendarioMes } from "./panel-calendario-mes";

/**
 * [6] Día y horario — la pantalla más compleja del flujo (docs/rediseno-
 * flujo-turnos.md §5, con la sección reemplazada por docs/prompt-claude-
 * code-fecha-horario.md): navegador de día + calendario mensual propio
 * (3.8, reemplaza el `<input type="date">` nativo) + horarios agrupados
 * por franja (mañana/tarde/noche) para días con muchos turnos.
 */

function offsetDias(fecha: string): number {
  const hoy = parseFechaISOLocal(fechaISOLocal());
  const d = parseFechaISOLocal(fecha);
  return Math.round((d.getTime() - hoy.getTime()) / 86_400_000);
}

function diaGrande(fecha: string): string {
  const offset = offsetDias(fecha);
  if (offset === 0) return "HOY";
  if (offset === 1) return "MAÑANA";
  const d = parseFechaISOLocal(fecha);
  const diaSemana = new Intl.DateTimeFormat("es-AR", { weekday: "long" }).format(d);
  return `${diaSemana.toUpperCase()} ${d.getDate()}`;
}

function fechaCompleta(fecha: string): string {
  const d = parseFechaISOLocal(fecha);
  return new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(d);
}

function capitalizar(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function etiquetaResumen(fecha: string, hora: string): string {
  const offset = offsetDias(fecha);
  const dia = offset === 0 ? "Hoy" : offset === 1 ? "Mañana" : capitalizar(fechaCompleta(fecha));
  return `${dia} a las ${hora} hs`;
}

// Franjas horarias (docs/Fases post MVP/Fase 2/turnero_pagina/prompt-claude-code-fecha-horario.md, punto 2):
// un día con 60+ turnos es inusable como una sola tira — se agrupan en
// chips y la tira muestra solo la franja activa.
type Franja = "manana" | "tarde" | "noche";
const FRANJA_ORDEN: Franja[] = ["manana", "tarde", "noche"];
const FRANJA_LABEL: Record<Franja, string> = { manana: "Mañana", tarde: "Tarde", noche: "Noche" };

function franjaDeHora(hora: string): Franja {
  const h = Number(hora.split(":")[0]);
  if (h < 12) return "manana";
  if (h < 18) return "tarde";
  return "noche";
}

const ANCHO_SCROLL_HORARIOS = 220;

interface PantallaDiaHoraProps {
  tipos: TipoConsultaPublico[];
  tipoConsultaId: string;
  onTipoConsultaChange: (id: string) => void;
  fecha: string;
  onFechaChange: (iso: string) => void;
  slots: string[];
  cargandoSlots: boolean;
  hora: string;
  onHoraChange: (h: string) => void;
  error: string | null;
  confirmando: boolean;
  onConfirmar: () => void;
  onIrProximoDisponible: () => void;
  onBack: () => void;
  onClose: () => void;
  /** 3.8 — estado del calendario mensual, dueño en el padre (dispara la llamada al backend cuando cambia). */
  mesVisible: string;
  diasConTurnos: string[];
  cargandoMes: boolean;
  onMesChange: (mes: string) => void;
  /** Contenido extra debajo del error (ej. el contacto por WhatsApp cuando ya hay un turno activo con este DNI — TR-107). */
  extra?: ReactNode;
}

export function PantallaDiaHora({
  tipos,
  tipoConsultaId,
  onTipoConsultaChange,
  fecha,
  onFechaChange,
  slots,
  cargandoSlots,
  hora,
  onHoraChange,
  error,
  confirmando,
  onConfirmar,
  onIrProximoDisponible,
  onBack,
  onClose,
  mesVisible,
  diasConTurnos,
  cargandoMes,
  onMesChange,
  extra,
}: PantallaDiaHoraProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const calendarioRef = useRef<HTMLDivElement>(null);
  const botonCalendarioRef = useRef<HTMLButtonElement>(null);
  const [puedeIzq, setPuedeIzq] = useState(false);
  const [puedeDer, setPuedeDer] = useState(false);
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const [franjaElegida, setFranjaElegida] = useState<Franja | null>(null);

  function actualizarFlechas() {
    const el = stripRef.current;
    if (!el) return;
    setPuedeIzq(el.scrollLeft > 4);
    setPuedeDer(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    actualizarFlechas();
  }, [slots]);

  // Al abrir el calendario, llevarlo a la vista dentro del scroll del
  // modal — el panel se despliega empujando el contenido, no como
  // overlay flotante, así que puede quedar fuera del viewport visible
  // del cuerpo con scroll.
  useEffect(() => {
    if (!calendarioAbierto) return;
    const reducido = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    calendarioRef.current?.scrollIntoView({ block: "nearest", behavior: reducido ? "auto" : "smooth" });
  }, [calendarioAbierto]);

  function scrollHorarios(direccion: 1 | -1) {
    const el = stripRef.current;
    if (!el) return;
    const reducido = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direccion * ANCHO_SCROLL_HORARIOS, behavior: reducido ? "auto" : "smooth" });
  }

  const hoyISO = fechaISOLocal();
  const esHoy = fecha === hoyISO;

  const porFranja = useMemo(() => {
    const mapa: Record<Franja, string[]> = { manana: [], tarde: [], noche: [] };
    for (const s of slots) mapa[franjaDeHora(s)].push(s);
    return mapa;
  }, [slots]);
  const franjasConTurnos = FRANJA_ORDEN.filter((f) => porFranja[f].length > 0);
  // Si la franja elegida quedó vacía (cambió el día) o todavía no se
  // eligió ninguna, cae a la primera con turnos — ajuste derivado en el
  // render, no en un efecto (mismo criterio que otras pantallas de este
  // wizard: evita el lint react-hooks/set-state-in-effect).
  const franjaActiva = franjaElegida && porFranja[franjaElegida].length > 0 ? franjaElegida : (franjasConTurnos[0] ?? null);
  const mostrarChips = franjasConTurnos.length > 1;
  const horariosVisibles = franjaActiva ? porFranja[franjaActiva] : [];

  function toggleCalendario() {
    setCalendarioAbierto((abierto) => {
      const next = !abierto;
      if (next) onMesChange(fecha.slice(0, 7));
      return next;
    });
  }

  function cerrarCalendario() {
    setCalendarioAbierto(false);
    botonCalendarioRef.current?.focus();
  }

  function elegirDiaDelCalendario(nuevaFecha: string) {
    onFechaChange(nuevaFecha);
    setCalendarioAbierto(false);
    botonCalendarioRef.current?.focus();
  }

  return (
    <ModalShell
      title="Elegí día y horario"
      onClose={onClose}
      maxWidthClassName="max-w-[520px]"
      footer={
        <ModalFooter
          actionLabel={confirmando ? "Confirmando…" : "Confirmar turno"}
          onBack={onBack}
          onAction={onConfirmar}
          actionDisabled={!tipoConsultaId || !hora || confirmando}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <CampoSelect id="dh-tipo" label="Tipo de consulta" value={tipoConsultaId} onChange={(e) => onTipoConsultaChange(e.target.value)} disabled={tipos.length === 0}>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre} — {t.duracionMinutos} min
            </option>
          ))}
        </CampoSelect>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-grafito/70">Día</span>
            <button
              ref={botonCalendarioRef}
              type="button"
              aria-expanded={calendarioAbierto}
              onClick={toggleCalendario}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-salvia-oscuro hover:underline"
            >
              <IconCalendar className="h-4 w-4" aria-hidden="true" />
              {calendarioAbierto ? "Cerrar calendario" : "Elegir fecha"}
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-field bg-hueso p-2">
            <button
              type="button"
              aria-label="Día anterior"
              disabled={esHoy}
              onClick={() => onFechaChange(fechaISOLocal(new Date(parseFechaISOLocal(fecha).getTime() - 86_400_000)))}
              className="flex h-[52px] w-10 shrink-0 items-center justify-center rounded-lg bg-marfil text-grafito disabled:opacity-35"
            >
              ‹
            </button>
            <div className="flex flex-1 flex-col items-center">
              <span className="font-display text-[28px] leading-none font-semibold text-grafito">{diaGrande(fecha)}</span>
              <span className="mt-1 text-xs text-grafito/70">{fechaCompleta(fecha)}</span>
            </div>
            <button
              type="button"
              aria-label="Día siguiente"
              onClick={() => onFechaChange(fechaISOLocal(new Date(parseFechaISOLocal(fecha).getTime() + 86_400_000)))}
              className="flex h-[52px] w-10 shrink-0 items-center justify-center rounded-lg bg-marfil text-grafito"
            >
              ›
            </button>
          </div>

          {calendarioAbierto && (
            <div ref={calendarioRef}>
              <PanelCalendarioMes
                mesVisible={mesVisible}
                fechaSeleccionada={fecha}
                diasConTurnos={diasConTurnos}
                cargando={cargandoMes}
                onCambiarMes={onMesChange}
                onSeleccionarDia={elegirDiaDelCalendario}
                onVolverAHoy={() => elegirDiaDelCalendario(hoyISO)}
                onEscape={cerrarCalendario}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-grafito/70">Horarios disponibles</span>
            {!cargandoSlots && <span className="text-xs text-grafito/50">{slots.length} turnos</span>}
          </div>

          {mostrarChips && (
            <div className="flex gap-2">
              {franjasConTurnos.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFranjaElegida(f)}
                  className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-medium ${
                    franjaActiva === f ? "bg-salvia-oscuro text-marfil" : "bg-hueso text-grafito/70"
                  }`}
                >
                  {FRANJA_LABEL[f]} ({porFranja[f].length})
                </button>
              ))}
            </div>
          )}

          {cargandoSlots ? (
            <p className="py-4 text-center text-sm text-grafito/50">Buscando horarios…</p>
          ) : slots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <p className="text-sm text-grafito/70">No hay turnos este día.</p>
              <button type="button" onClick={onIrProximoDisponible} className="text-sm font-medium text-salvia-oscuro hover:underline">
                Ir al próximo disponible
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Horarios anteriores"
                onClick={() => scrollHorarios(-1)}
                disabled={!puedeIzq}
                className="flex h-[60px] w-[34px] shrink-0 items-center justify-center rounded-field bg-hueso text-grafito/60 disabled:opacity-35"
              >
                ‹
              </button>
              <div
                ref={stripRef}
                onScroll={actualizarFlechas}
                className="flex flex-1 gap-2 overflow-x-auto scroll-smooth motion-reduce:scroll-auto [overscroll-behavior-x:contain] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {horariosVisibles.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onHoraChange(s)}
                    className={`h-[60px] w-[96px] shrink-0 rounded-field font-mono text-[20px] ${
                      hora === s ? "bg-salvia-oscuro text-marfil" : "bg-hueso text-grafito"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label="Horarios siguientes"
                onClick={() => scrollHorarios(1)}
                disabled={!puedeDer}
                className="flex h-[60px] w-[34px] shrink-0 items-center justify-center rounded-field bg-hueso text-grafito/60 disabled:opacity-35"
              >
                ›
              </button>
            </div>
          )}
        </div>

        {hora && (
          <div className="flex items-center gap-2 rounded-field bg-salvia-claro px-3 py-2.5">
            <IconCheckBadge className="h-5 w-5 shrink-0 text-salvia-oscuro" />
            <span className="text-sm font-medium text-grafito">{etiquetaResumen(fecha, hora)}</span>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-terracota-oscuro">
            {error}
          </p>
        )}

        {extra}
      </div>
    </ModalShell>
  );
}
