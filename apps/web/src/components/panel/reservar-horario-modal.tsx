"use client";

import { Dialogo } from "@/components/dialogo";
import { useState } from "react";
import type { BloqueoHorario } from "@dental-mirage/shared-types";
import { AgregarReglaModal } from "./agregar-regla-modal";
import { SelectorDeAgenda } from "./selector-de-agenda";

interface ReservarHorarioModalProps {
  onClose: () => void;
  // onGuardada — el padre (calendar-view.tsx) recarga bloqueosGenerales/
  // bloqueosEspecificas con esto, mismo dato que ya usa
  // ConfiguracionCalendarioModal — no hace falta que este componente sepa
  // nada de esa recarga.
  onGuardada: (bloqueo: BloqueoHorario) => void;
}

// ReservarHorarioModal — acceso rápido desde la pantalla principal del
// calendario (pedido explícito del cliente, 2026-09-04): "agregar un
// acceso rápido a reservar horario... al lado de agregar turno, donde te
// dé las 2 opciones, reserva general y específica, explicar más o menos
// para qué sirven y su diferencia, le doy a agregar y sin ir al panel
// poder agregarlos por el acceso rápido, todo lo demás será dentro del
// panel de configuración". Dos pasos:
//   1. Elegir tipo (esta pantalla) — cada tarjeta explica su diferencia y
//      tiene su propio botón "Agregar" para arrancar el formulario de ESE
//      tipo directo, sin pasar por "Configuración de calendario".
//   2. El formulario de siempre (AgregarReglaModal), sin cambios — cierra
//      TODO el acceso rápido al guardar o al cancelar (nunca vuelve al
//      paso 1); si el profesional quiere el otro tipo, vuelve a abrir el
//      acceso rápido desde cero. Editar/eliminar/listar reglas existentes
//      sigue siendo cosa exclusiva de "Configuración de calendario" — este
//      acceso rápido es solo para agregar una nueva.
export function ReservarHorarioModal({
  onClose,
  onGuardada,
}: ReservarHorarioModalProps) {
  // Sobre el Dialogo de todos: foco adentro, Tab atrapado, Escape (el de
  // arriba si hay varios), el foco vuelve a quien lo abrió y la página de
  // atrás no scrollea (correcciones generales, 2026-10-12).
  const [tipoElegido, setTipoElegido] = useState<
    "general" | "especifica" | null
  >(null);
  // De quién es la agenda que se va a reservar (QA de la 3.2.6). Se
  // pregunta ACÁ y no en el formulario del paso 2 porque es la misma
  // pregunta para los dos tipos, y porque leerla antes de elegir general
  // o específica es el orden en que se piensa: primero de quién, después
  // qué.
  const [agenda, setAgenda] = useState<string | null>(null);

  if (tipoElegido !== null) {
    return (
      <AgregarReglaModal
        especifico={tipoElegido === "especifica"}
        profesionalUserId={agenda}
        onClose={onClose}
        onGuardada={(bloqueo) => {
          onGuardada(bloqueo);
          onClose();
        }}
      />
    );
  }

  return (
    <Dialogo titulo="Reservar horario" onCerrar={onClose} superficie="marfil" centrado ancho="mediano">
      <div className="flex flex-col gap-4 px-6 pt-4 pb-6">
        <SelectorDeAgenda
          valor={agenda}
          onElegir={setAgenda}
          etiqueta="¿En qué agenda?"
        />

        <p className="text-sm text-grafito/60">
          Elegí qué tipo de horario reservado querés agregar:
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <TarjetaTipo
            titulo="General"
            descripcion="Se repite: elegís un día de la semana y por cuánto tiempo (esta semana, todos los meses, etc.). Sirve para compromisos recurrentes, como una limpieza semanal o una reunión fija los martes."
            onAgregar={() => setTipoElegido("general")}
          />
          <TarjetaTipo
            titulo="Específica"
            descripcion="Una sola fecha puntual. Sirve para imprevistos de una sola vez, como una reunión de último momento un día en particular."
            onAgregar={() => setTipoElegido("especifica")}
          />
        </div>
      </div>
    </Dialogo>
  );
}

function TarjetaTipo({
  titulo,
  descripcion,
  onAgregar,
}: {
  titulo: string;
  descripcion: string;
  onAgregar: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-field border-[0.5px] border-arena bg-hueso p-4">
      <p className="font-[family-name:var(--font-display)] text-base font-semibold text-grafito">
        {titulo}
      </p>
      <p className="flex-1 text-xs text-grafito/70">{descripcion}</p>
      <button
        type="button"
        onClick={onAgregar}
        className="self-start rounded-control boton-primario px-4 py-2 text-sm font-semibold"
      >
        Agregar {titulo.toLowerCase()}
      </button>
    </div>
  );
}
