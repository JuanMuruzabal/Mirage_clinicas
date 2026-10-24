"use client";

import { Dialogo } from "@/components/dialogo";
import { useState } from "react";
import { IconHelp } from "@/components/icons";

// QueEsVerificadoBoton — pedido textual del cliente: "agregue en la
// sección de pacientes un botón que diga 'qué es un paciente verificado?'
// y que dé una explicación de qué es un paciente verificado". Puramente
// informativo (sin Server Action, sin efecto sobre ningún dato) — mismo
// criterio de "verificado" que EstadoVerificadoBadge en pacientes-table.tsx
// y pacienteEstaVerificado del lado del backend: al menos un turno
// resuelto y marcado "asistió".
export function QueEsVerificadoBoton() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {/* Corrección de estética (2026-09-06, fotos de referencia
          "diseñoviejo.png"/"diseñonuevo.png"): texto suelto con ícono de
          ayuda, sin el botón con borde/relleno de antes. */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-grafito hover:text-marca"
      >
        <IconHelp className="h-4 w-4" />
        ¿Qué es un paciente verificado?
      </button>
      {abierto && (
        <Dialogo titulo="Paciente verificado" onCerrar={() => setAbierto(false)} superficie="marfil" centrado ancho="chico">
          <div className="flex flex-col gap-4 p-6 text-sm text-grafito">
            <p>
              Un paciente queda <strong>verificado</strong> apenas se confirma que asistió a al menos un turno — la clínica
              comprobó en persona que esa identidad y esos datos de contacto son reales.
            </p>
            <p>
              Hasta ese momento, el DNI que cargó puede coincidir con el de otra ficha (por ejemplo, si alguien más pidió un turno
              usando el mismo documento por error o mala intención). Una vez verificado, esa ficha pasa a ser la que prevalece si
              aparece un conflicto de identidad con ese DNI.
            </p>
            <p className="text-xs text-grafito/75">
              Un paciente cargado a mano desde el panel (sin pasar por la página pública) queda verificado desde el principio — ya
              fue el propio profesional quien confirmó sus datos.
            </p>
          </div>
        </Dialogo>
      )}
    </>
  );
}
