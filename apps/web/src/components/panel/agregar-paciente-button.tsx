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
export function AgregarPacienteButton() {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95"
      >
        + Agregar paciente
      </button>
      {abierto && (
        <AgregarPacienteModal
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
