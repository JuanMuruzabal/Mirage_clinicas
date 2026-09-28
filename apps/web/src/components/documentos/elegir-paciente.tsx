"use client";

import { useEffect, useState } from "react";
import type { PacienteConocido } from "@dental-mirage/shared-types";
import { listPacientesAction } from "@/app/actions/pacientes";
import { crearDocumentoAction } from "@/app/actions/documentos";
import { Dialogo } from "@/components/dialogo";

// ElegirPaciente — el primer paso de un documento (R4 del brief): para
// quién es. Busca en toda la clínica, no solo en mi lista: la identidad del
// paciente es de la clínica (TR-144), y hacerle un documento lo suma a mi
// lista (TR-157). Elegir crea el borrador y lleva al editor.
export function ElegirPaciente({
  plantillaId,
  plantillaNombre,
  onCerrar,
}: {
  plantillaId: string;
  plantillaNombre: string;
  onCerrar: () => void;
}) {
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<PacienteConocido[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = consulta.trim();
    if (q.length < 2) return;
    let vigente = true;
    const espera = setTimeout(async () => {
      setBuscando(true);
      const encontrados = await listPacientesAction(q);
      if (!vigente) return;
      setResultados(encontrados);
      setBuscando(false);
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [consulta]);

  async function elegir(p: PacienteConocido) {
    setCreando(p.id);
    setError(null);
    const res = await crearDocumentoAction(plantillaId, p.id);
    // Si salió bien, la acción redirige y esto no vuelve.
    setCreando(null);
    if (res?.error) setError(res.error);
  }

  const q = consulta.trim();
  const lista = q.length >= 2 ? resultados : null;

  return (
    <Dialogo titulo="¿Para qué paciente?" descripcion={plantillaNombre} onCerrar={onCerrar} ancho="medio">
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        <label className="flex flex-col gap-1 text-sm font-medium text-grafito">
          Buscá por nombre, apellido o DNI
          <input
            type="search"
            data-autofocus
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            className="w-full rounded-field border border-linea bg-hueso px-4 py-2.5 text-[15px] text-grafito outline-none focus:border-salvia"
            placeholder="Ej.: Paz o 30111222"
          />
        </label>

        <div aria-live="polite" className="text-xs text-grafito/75">
          {q.length < 2 ? "Escribí al menos dos letras o números." : buscando ? "Buscando…" : lista && lista.length === 0 ? "No hay ningún paciente con esos datos en la clínica." : ""}
        </div>

        {lista && lista.length > 0 && (
          <ul className="flex max-h-80 flex-col divide-y divide-linea overflow-y-auto rounded-card border border-linea bg-marfil">
            {lista.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={creando !== null}
                  onClick={() => void elegir(p)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-hueso disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-grafito">
                      {p.nombre} {p.apellido}
                    </span>
                    <span className="block text-xs text-grafito/75">DNI {p.dni}</span>
                  </span>
                  <span className="flex-none text-xs font-medium text-salvia-oscuro">
                    {creando === p.id ? "Creando…" : p.esMio ? "Tu paciente" : "De la clínica"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="text-sm text-terracota-oscuro">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
