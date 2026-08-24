"use client";

import { useState } from "react";
import type { Especialidad, Profesional } from "@dental-mirage/shared-types";
import { updateMeAction } from "@/app/actions/auth";

export function PerfilForm({ profesional, catalogo }: { profesional: Profesional; catalogo: Especialidad[] }) {
  const [nombre, setNombre] = useState(profesional.nombre);
  const [telefono, setTelefono] = useState(profesional.telefono ?? "");
  const [seleccionadas, setSeleccionadas] = useState<string[]>(profesional.especialidades.map((e) => e.id));
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pending, setPending] = useState(false);

  function toggleEspecialidad(id: string) {
    setGuardado(false);
    setSeleccionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardado(false);
    setPending(true);
    const result = await updateMeAction({
      nombre,
      telefono: telefono || undefined,
      especialidadIds: seleccionadas,
    });
    setPending(false);
    if (result?.error) {
      setError(result.error);
    } else {
      setGuardado(true);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-lg flex-col gap-6">
      <div className="rounded-card border-[0.5px] border-arena bg-marfil p-5 shadow-soft">
        <p className="text-xs uppercase tracking-widest text-grafito/50">Email</p>
        <p className="mt-1 text-sm text-grafito">{profesional.email}</p>
        <p className="mt-3 text-xs uppercase tracking-widest text-grafito/50">Clínica</p>
        <p className="mt-1 text-sm text-grafito">{profesional.nombreClinica}</p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-grafito">Nombre y apellido</span>
        <input
          required
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
            setGuardado(false);
          }}
          className="rounded-field border-[0.5px] border-arena bg-marfil px-3 py-2 text-grafito outline-none focus:border-salvia"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-grafito">Teléfono</span>
        <input
          value={telefono}
          onChange={(e) => {
            setTelefono(e.target.value);
            setGuardado(false);
          }}
          className="rounded-field border-[0.5px] border-arena bg-marfil px-3 py-2 text-grafito outline-none focus:border-salvia"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-grafito">Especialidades</span>
        <div className="flex flex-wrap gap-2">
          {catalogo.map((esp) => {
            const activa = seleccionadas.includes(esp.id);
            return (
              <button
                key={esp.id}
                type="button"
                onClick={() => toggleEspecialidad(esp.id)}
                aria-pressed={activa}
                className={`rounded-full border-[0.5px] px-3 py-1.5 text-sm ${
                  activa
                    ? "border-salvia bg-salvia-claro text-salvia-oscuro"
                    : "border-arena text-grafito hover:border-salvia hover:text-salvia-oscuro"
                }`}
              >
                {esp.nombre}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}
      {guardado && (
        <p role="status" className="text-sm text-salvia-oscuro">
          Cambios guardados.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
