"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoConsulta } from "@dental-mirage/shared-types";
import { AgregarTurnoModal } from "./agregar-turno-modal";
import { CLASE_BOTON_AGREGAR } from "./agregar-paciente-button";

// AgregarTurnoButton — "+ Agregar turno" en la página de Turnos
// (correcciones generales, ítem 6, pedido de la persona), en el mismo lugar
// que "+ Agregar paciente" en Pacientes: al lado del buscador. Abre el MISMO
// modal que el botón del calendario, con su `SelectorDeAgenda` para
// recepción; no hay otra lógica de alta. Como TurnosPage es un Server
// Component que lee la lista de sus props, `router.refresh()` la vuelve a
// pedir con el turno nuevo (el mismo criterio que AgregarPacienteButton).
export function AgregarTurnoButton({ tiposConsulta }: { tiposConsulta: TipoConsulta[] }) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={CLASE_BOTON_AGREGAR}>
        + Agregar turno
      </button>
      {abierto && (
        <AgregarTurnoModal
          tiposConsulta={tiposConsulta}
          onClose={() => setAbierto(false)}
          onSuccess={() => {
            setAbierto(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
