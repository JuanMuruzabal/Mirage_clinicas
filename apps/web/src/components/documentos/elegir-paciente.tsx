"use client";

import { useState } from "react";
import type { PacienteConocido } from "@dental-mirage/shared-types";
import { crearDocumentoAction } from "@/app/actions/documentos";
import { Dialogo } from "@/components/dialogo";
import { BuscadorPacientes } from "@/components/panel/buscador-pacientes";

// ElegirPaciente — el primer paso de un documento (R4 del brief): para
// quién es. Usa el MISMO buscador que "Paciente conocido" de "+ Agregar
// turno" (`BuscadorPacientes`, pedido del cliente, 2026-09-28), en un
// diálogo blanco como el de ese modal. Busca en toda la clínica: la
// identidad del paciente es de la clínica (TR-144), y hacerle un documento
// lo suma a mi lista (TR-157). Elegir crea el borrador y lleva al editor.
export function ElegirPaciente({
  plantillaId,
  plantillaNombre,
  onCerrar,
}: {
  plantillaId: string;
  plantillaNombre: string;
  onCerrar: () => void;
}) {
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(p: PacienteConocido) {
    if (creando) return;
    setCreando(true);
    setError(null);
    const res = await crearDocumentoAction(plantillaId, p.id);
    // Si salió bien, la acción redirige y esto no vuelve.
    setCreando(false);
    if (res?.error) setError(res.error);
  }

  return (
    <Dialogo titulo="¿Para qué paciente?" descripcion={plantillaNombre} onCerrar={onCerrar} ancho="chico" superficie="marfil">
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        <BuscadorPacientes onElegir={(p) => void elegir(p)} />
        {creando && <p className="text-sm text-grafito/75">Creando el documento…</p>}
        {error && (
          <p role="alert" className="text-sm text-terracota-oscuro">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
