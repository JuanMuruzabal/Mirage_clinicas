"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MiembroDelEquipo, VistaActual } from "@dental-mirage/shared-types";
import { elegirVistaAction } from "@/app/actions/topbar-panel";
import { IconChevronDown } from "@/components/icons";

// SelectorVistaProfesional — en qué vista está parada recepción
// (Fase 3.2.6).
//
// El brief pide que recepción tenga "acceso a todas las vistas de los N
// profesionales" e interactúe con ellas. Este control es la única puerta
// a eso: elegir a alguien hace que las cuatro pantallas del panel se
// comporten como su agenda, y volver a "Toda la clínica" devuelve la
// vista general.
//
// POR QUÉ UN SELECTOR Y NO UNA PANTALLA APARTE. Lo que recepción
// necesita hacer en la vista de un profesional es exactamente lo que ese
// profesional hace: cargar un turno, marcar una asistencia, sumar un
// paciente a su lista. Duplicar las cuatro pantallas para recepción
// habría sido mantener dos versiones de cada una — y la segunda siempre
// atrasada. El cliente lo dejó explícito al pedir esta subfase: no hace
// falta una función propia para pasar pacientes entre profesionales
// ("bastaría que el recepcionista se mueva a la vista de ese profesional
// y lo agregue"), ni para marcar la asistencia por adelantado.
//
// Solo se dibuja para recepción. El permiso no depende de eso: el
// backend responde 403 a cualquier otro rol (ver vista_recepcion.go) —
// esconder el control nunca fue cerrar la puerta.

export function SelectorVistaProfesional({
  profesionales,
  vista,
  bloqueado = false,
}: {
  /** Los miembros del equipo que atienden pacientes. */
  profesionales: MiembroDelEquipo[];
  vista: VistaActual | null;
  /** No se despliega mientras el drawer de mobile está abierto. */
  bloqueado?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function alClickearAfuera(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) setAbierto(false);
    }
    function alApretarEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alClickearAfuera);
    document.addEventListener("keydown", alApretarEscape);
    return () => {
      document.removeEventListener("mousedown", alClickearAfuera);
      document.removeEventListener("keydown", alApretarEscape);
    };
  }, [abierto]);

  const enFoco = vista?.profesional ?? null;
  const etiqueta = enFoco ? enFoco.nombre : "Toda la clínica";

  function elegir(userId: string) {
    iniciar(async () => {
      setError(null);
      const resultado = await elegirVistaAction(userId);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setAbierto(false);
      // Cambiar de vista cambia TODO lo que la pantalla muestra, y eso
      // sale del servidor: sin volver a pedirla, el selector diría un
      // nombre y la tabla seguiría mostrando la agenda anterior.
      router.refresh();
    });
  }

  return (
    <div ref={contenedor} className="relative min-w-0">
      <button
        type="button"
        aria-expanded={abierto && !bloqueado}
        aria-label="Cambiar de vista"
        disabled={bloqueado || guardando}
        onClick={() => setAbierto((a) => !a)}
        className="flex min-w-0 items-center gap-2 rounded-full border border-linea bg-marfil px-3 py-1.5 text-sm text-grafito transition-colors hover:border-salvia disabled:opacity-60"
      >
        <span className="font-[family-name:var(--font-mono)] text-[10.5px] tracking-widest text-grafito/50 uppercase">
          Vista
        </span>
        <span className="truncate font-medium">{etiqueta}</span>
        <IconChevronDown className="h-4 w-4 flex-shrink-0 text-grafito/50" />
      </button>

      {abierto && !bloqueado && (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-20 flex w-64 max-w-[calc(100vw-3rem)] flex-col rounded-card border border-linea bg-marfil p-2 shadow-soft">
          <p className="px-3 py-2 font-[family-name:var(--font-mono)] text-[11.5px] tracking-widest text-grafito/45 uppercase">
            Ver como
          </p>

          {/* La vista general primero: es el default y el lugar al que se
              vuelve, no una opción más del final de la lista. */}
          <OpcionDeVista
            etiqueta="Toda la clínica"
            detalle="Todos los turnos y las métricas generales"
            elegida={enFoco === null}
            disabled={guardando}
            onElegir={() => elegir("")}
          />

          {profesionales.length > 0 && <span aria-hidden="true" className="my-1 h-px bg-linea" />}

          {profesionales.map((p) => (
            <OpcionDeVista
              key={p.userId}
              etiqueta={p.nombre}
              detalle="Su agenda, sus pacientes"
              elegida={enFoco?.userId === p.userId}
              disabled={guardando}
              onElegir={() => elegir(p.userId)}
            />
          ))}

          {error && (
            <p role="alert" className="px-3 py-2 text-xs text-terracota-oscuro">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OpcionDeVista({
  etiqueta,
  detalle,
  elegida,
  disabled,
  onElegir,
}: {
  etiqueta: string;
  detalle: string;
  elegida: boolean;
  disabled: boolean;
  onElegir: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onElegir}
      aria-current={elegida ? "true" : undefined}
      className={`flex flex-col items-start gap-0.5 rounded-field px-3 py-2 text-left transition-colors disabled:opacity-60 ${
        elegida ? "bg-salvia-claro" : "hover:bg-hueso"
      }`}
    >
      <span className="flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-grafito">{etiqueta}</span>
        {elegida && (
          <span aria-hidden="true" className="text-sm text-salvia-oscuro">
            ✓
          </span>
        )}
      </span>
      <span className="text-xs text-grafito/50">{detalle}</span>
    </button>
  );
}
