"use client";

import { useState } from "react";
import { ConfiguracionCalendarioModal } from "./configuracion-calendario-modal";

// AbrirConfiguracionBoton (F2.3 extra ítem 1, docs/implementation-plan.md
// §11.5) — la cabecera de la tarjeta "Horarios reservados" del Turnero
// dice "Ver horarios reservados" y abre Configuración de calendario, no
// navega a `/panel/calendario` (a diferencia de las otras tarjetas) —
// pedido explícito del cliente. `ConfiguracionCalendarioModal` es un
// Client Component con estado propio, así que este botón vive aparte del
// resto de la tarjeta (Server Component) solo para poder montarlo.
export function AbrirConfiguracionBoton() {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="text-sm font-medium whitespace-nowrap text-salvia-oscuro hover:text-grafito"
      >
        Ver horarios reservados →
      </button>
      {abierta && <ConfiguracionCalendarioModal onClose={() => setAbierta(false)} />}
    </>
  );
}
