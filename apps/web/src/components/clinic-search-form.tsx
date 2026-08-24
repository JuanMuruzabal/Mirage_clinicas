import type { Especialidad } from "@dental-mirage/shared-types";

interface ClinicSearchFormProps {
  especialidades: Especialidad[];
  defaultQ?: string;
  defaultEspecialidad?: string;
}

// Formulario GET plano a propósito — sin "use client": el navegador arma
// la query string solo y /buscar vuelve a renderizar en el servidor con
// los filtros nuevos (URL compartible/bookmarkeable, funciona sin JS).
// Mismo patrón que el buscador de alojamiento de Turismo Marcuzzi
// (components/alojamiento/alojamiento-filters-form.tsx de ese proyecto).
export function ClinicSearchForm({ especialidades, defaultQ, defaultEspecialidad }: ClinicSearchFormProps) {
  return (
    <form
      action="/buscar"
      method="get"
      className="flex flex-col gap-4 rounded-card border-[0.5px] border-arena bg-marfil p-3 shadow-soft sm:flex-row sm:items-end sm:p-4"
    >
      <label className="flex flex-1 flex-col gap-1.5 text-left text-sm">
        <span className="font-medium text-grafito">Clínica o profesional</span>
        <input
          type="search"
          name="q"
          defaultValue={defaultQ}
          placeholder="Ej: Sonrisas del Sur, Dr. Games…"
          className="rounded-field border-[0.5px] border-arena bg-hueso px-4 py-3 text-grafito outline-none focus:border-salvia"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-left text-sm sm:w-56">
        <span className="font-medium text-grafito">Especialidad</span>
        <select
          name="especialidad"
          defaultValue={defaultEspecialidad ?? ""}
          className="rounded-field border-[0.5px] border-arena bg-hueso px-4 py-3 text-grafito outline-none focus:border-salvia"
        >
          <option value="">Todas</option>
          {especialidades.map((esp) => (
            <option key={esp.id} value={esp.nombre}>
              {esp.nombre}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="rounded-full bg-salvia-oscuro px-8 py-3 text-sm font-semibold text-marfil hover:brightness-95"
      >
        Buscar
      </button>
    </form>
  );
}
