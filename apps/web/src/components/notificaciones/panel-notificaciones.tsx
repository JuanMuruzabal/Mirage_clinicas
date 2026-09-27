"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BandejaDeNotificaciones, Notificacion } from "@dental-mirage/shared-types";
import {
  abrirNotificacionAction,
  bandejaDeNotificacionesAction,
  leerNotificacionAction,
} from "@/app/actions/notificaciones";
import { IconBell, IconX } from "@/components/icons";
import { ModalPortal } from "@/components/panel/modal-portal";
import { usePanelSidebar } from "@/lib/panel-sidebar-context";
import { useAhora } from "@/lib/reloj";
import { AvisosEnEsteDispositivo } from "./avisos-en-este-dispositivo";
import { TarjetaNotificacion } from "./tarjeta-notificacion";

type Pestania = "nuevas" | "leidas";

interface PanelNotificacionesProps {
  onCerrar: () => void;
  /** Una notificación nueva se acaba de leer: la campana resta una. */
  onLeida: () => void;
}

// PanelNotificaciones — la bandeja de la cuenta (TR-179), un panel que
// entra desde la izquierda. Dos pestañas: Nuevas (sin leer) y Leídas.
//
// Leer = expandir la tarjeta. La que se lee se queda en "Nuevas" mientras
// el panel sigue abierto —sin el punto de "sin leer"—: si desapareciera al
// tocarla, no se podría leer lo que se acaba de abrir. Pasa a "Leídas" en
// la próxima carga.
export function PanelNotificaciones({ onCerrar, onLeida }: PanelNotificacionesProps) {
  const router = useRouter();
  const panelSidebar = usePanelSidebar();
  const ahora = useAhora(60_000);
  const botonCerrar = useRef<HTMLButtonElement>(null);

  const [pestania, setPestania] = useState<Pestania>("nuevas");
  const [intento, setIntento] = useState(0);
  // La bandeja ANOTADA con la pestaña que pidió: mientras no coincida con
  // la pestaña actual, está cargando. Así no hace falta un setState dentro
  // del efecto para marcar "cargando".
  const [datos, setDatos] = useState<{ pestania: Pestania; intento: number; bandeja: BandejaDeNotificaciones | null } | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [leidasRecien, setLeidasRecien] = useState<ReadonlySet<string>>(new Set());
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [errorDeApertura, setErrorDeApertura] = useState<{ id: string; mensaje: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    bandejaDeNotificacionesAction(pestania)
      .catch(() => null)
      .then((bandeja) => {
        if (!vigente) return;
        setDatos({ pestania, intento, bandeja });
        setLeidasRecien(new Set());
      });
    return () => {
      vigente = false;
    };
  }, [pestania, intento]);

  // Esc cierra; el foco arranca en el botón de cerrar; el fondo no se
  // desplaza mientras el panel está abierto.
  useEffect(() => {
    botonCerrar.current?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowAnterior;
    };
  }, [onCerrar]);

  const cargando = !datos || datos.pestania !== pestania || datos.intento !== intento;
  const bandeja = cargando ? null : datos.bandeja;
  const nuevasSinLeer = Math.max(0, (datos?.bandeja?.nuevas ?? 0) - leidasRecien.size);
  const leidas = (datos?.bandeja?.leidas ?? 0) + leidasRecien.size;

  function cambiarPestania(p: Pestania) {
    if (p === pestania) return;
    setPestania(p);
    setExpandida(null);
    setErrorDeApertura(null);
  }

  function marcarLeidaAhora(n: Notificacion) {
    if (n.leidaEn !== null || leidasRecien.has(n.id)) return;
    setLeidasRecien((prev) => new Set(prev).add(n.id));
    onLeida();
  }

  function alternar(n: Notificacion) {
    if (expandida === n.id) {
      setExpandida(null);
      return;
    }
    setExpandida(n.id);
    if (n.leidaEn === null && !leidasRecien.has(n.id)) {
      marcarLeidaAhora(n);
      void leerNotificacionAction(n.id);
    }
  }

  async function verTurno(n: Notificacion) {
    setAbriendo(n.id);
    setErrorDeApertura(null);
    const resultado = await abrirNotificacionAction(n.id);
    setAbriendo(null);
    if ("error" in resultado) {
      setErrorDeApertura({ id: n.id, mensaje: resultado.error });
      return;
    }
    marcarLeidaAhora(n);
    if (!resultado.destino) return;
    // Si está en el panel, el menú lateral también se cierra (en mobile
    // queda abierto encima de la pantalla a la que se va).
    panelSidebar.close();
    onCerrar();
    if (resultado.recargar) {
      window.location.assign(resultado.destino);
    } else {
      router.push(resultado.destino);
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="titulo-notificaciones">
        <button
          type="button"
          aria-label="Cerrar notificaciones"
          tabIndex={-1}
          onClick={onCerrar}
          className="absolute inset-0 cursor-default bg-grafito/45 backdrop-blur-[2px] motion-safe:animate-[notificaciones-velo_200ms_ease-out]"
        />

        <aside
          id="panel-notificaciones"
          className="absolute inset-y-0 left-0 flex w-full max-w-[26rem] flex-col border-r-[0.5px] border-arena bg-hueso shadow-[0_0_40px_-8px_rgb(53_49_43/0.35)] motion-safe:animate-[notificaciones-entrar_280ms_cubic-bezier(0.2,0.8,0.2,1)]"
        >
          <header className="flex flex-col gap-5 px-6 pb-4 pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-grafito/50">Tu cuenta</p>
                <h2
                  id="titulo-notificaciones"
                  className="font-[family-name:var(--font-display)] text-[2rem] font-black uppercase leading-none tracking-tight text-grafito"
                >
                  Notificaciones
                </h2>
              </div>
              <button
                ref={botonCerrar}
                type="button"
                onClick={onCerrar}
                aria-label="Cerrar"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-grafito/60 transition-colors hover:bg-arena hover:text-grafito"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            <div role="tablist" aria-label="Notificaciones" className="grid grid-cols-2 gap-1 rounded-full bg-arena/70 p-1">
              <Pestana activa={pestania === "nuevas"} onClick={() => cambiarPestania("nuevas")} numero={nuevasSinLeer}>
                Nuevas
              </Pestana>
              <Pestana activa={pestania === "leidas"} onClick={() => cambiarPestania("leidas")} numero={leidas}>
                Leídas
              </Pestana>
            </div>
          </header>

          <div role="tabpanel" aria-label={pestania === "nuevas" ? "Nuevas" : "Leídas"} className="flex-1 overflow-y-auto px-4 pb-6">
            {cargando && <Esqueleto />}

            {!cargando && !bandeja && (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <p className="text-sm text-grafito/70">No pudimos cargar tus notificaciones.</p>
                <button
                  type="button"
                  onClick={() => setIntento((i) => i + 1)}
                  className="rounded-full border border-linea px-4 py-2 text-xs font-bold uppercase tracking-wider text-grafito hover:border-salvia"
                >
                  Reintentar
                </button>
              </div>
            )}

            {!cargando && bandeja && bandeja.notificaciones.length === 0 && <Vacio pestania={pestania} />}

            {!cargando && bandeja && bandeja.notificaciones.length > 0 && (
              <ul className="flex flex-col gap-3">
                {bandeja.notificaciones.map((n) => (
                  <li key={n.id}>
                    <TarjetaNotificacion
                      notificacion={n}
                      expandida={expandida === n.id}
                      leidaRecien={leidasRecien.has(n.id)}
                      ahora={ahora}
                      abriendo={abriendo === n.id}
                      error={errorDeApertura?.id === n.id ? errorDeApertura.mensaje : null}
                      onAlternar={() => alternar(n)}
                      onVerTurno={() => void verTurno(n)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AvisosEnEsteDispositivo />
        </aside>
      </div>
    </ModalPortal>
  );
}

function Pestana({
  activa,
  numero,
  onClick,
  children,
}: {
  activa: boolean;
  numero: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        activa ? "bg-marfil text-grafito shadow-soft" : "text-grafito/60 hover:text-grafito"
      }`}
    >
      {children}
      {numero > 0 && (
        <span
          className={`min-w-[1.4rem] rounded-full px-1.5 font-[family-name:var(--font-mono)] text-[11px] leading-5 ${
            activa ? "bg-grafito text-marfil" : "bg-grafito/10 text-grafito/70"
          }`}
        >
          {numero}
        </span>
      )}
    </button>
  );
}

function Esqueleto() {
  return (
    <ul aria-label="Cargando notificaciones" className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex gap-4 rounded-card border-[0.5px] border-arena bg-marfil/70 p-4">
          <span className="h-[4.5rem] w-14 rounded-field bg-arena motion-safe:animate-pulse" />
          <span className="flex flex-1 flex-col gap-2 pt-1">
            <span className="h-3 w-24 rounded-full bg-arena motion-safe:animate-pulse" />
            <span className="h-4 w-40 rounded-full bg-arena motion-safe:animate-pulse" />
            <span className="h-3 w-32 rounded-full bg-arena motion-safe:animate-pulse" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Vacio({ pestania }: { pestania: Pestania }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-salvia-claro text-salvia-oscuro">
        <IconBell className="h-6 w-6" />
      </span>
      {pestania === "nuevas" ? (
        <>
          <p className="font-[family-name:var(--font-display)] text-xl font-black uppercase tracking-tight text-grafito">
            Estás al día
          </p>
          <p className="text-sm text-grafito/60">
            Cuando un paciente saque un turno desde tu página o con un link, te avisamos acá.
          </p>
        </>
      ) : (
        <p className="text-sm text-grafito/60">Todavía no leíste ninguna notificación.</p>
      )}
    </div>
  );
}
