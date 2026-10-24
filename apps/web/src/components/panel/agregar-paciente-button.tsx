"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AgregarPacienteModal } from "./agregar-paciente-modal";

// AgregarPacienteButton — Extra 2.3.5 (E5.5): botón "+ Agregar paciente"
// de la sección Pacientes. Vive en su propio Client Component (en vez de
// dentro de PacientesTable) porque tiene que verse incluso con la tabla
// vacía (page.tsx no renderiza PacientesTable si no hay pacientes
// todavía). `router.refresh()` en vez de recargar con una Server Action
// propia: PacientesPage es un Server Component que resuelve la lista
// desde sus props, no un fetch de cliente — refresh() vuelve a correr ese
// Server Component con la lista ya actualizada.
// La acción principal de una lista del panel ("+ Agregar paciente", "+
// Agregar turno"): el mismo dibujo que "+ Agregar turno" del calendario, y
// 44 px de alto, los del buscador de al lado (correcciones generales, ítem 6).
// Es la acción principal de su pantalla: lleva el contorno prismático
// (`.contorno-prisma`, ítem 11), que reemplaza al borde de 0,5 px, sobre el
// celeste de todos los botones (`boton-primario`).
export const CLASE_BOTON_AGREGAR =
  "contorno-prisma boton-primario inline-flex h-11 flex-none items-center justify-center rounded-control px-5 text-sm font-semibold whitespace-nowrap shadow-soft";

export function AgregarPacienteButton({
  sinListaPropia = false,
}: {
  /** La vista general de recepción: no hay una lista propia a la que
   *  sumar una ficha que ya existe. Ver `AgregarPacienteModal`. */
  sinListaPropia?: boolean;
} = {}) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={CLASE_BOTON_AGREGAR}
      >
        + Agregar paciente
      </button>
      {abierto && (
        <AgregarPacienteModal
          sinListaPropia={sinListaPropia}
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
