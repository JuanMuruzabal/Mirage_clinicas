import type { UseFormRegisterReturn } from "react-hook-form";
import { authErrorClass, authLabelClass } from "./auth-shell";

// Países con los que puede tener que lidiar una clínica de Córdoba: la
// Argentina primero y sus vecinos, más España y Estados Unidos, que son
// los destinos de migración más comunes de los pacientes que se van y
// siguen en contacto. No pretende ser el listado completo del mundo: una
// lista de 200 países vuelve al control inusable para el 99% de los
// casos, y agregar uno es una línea.
const PAISES = [
  { codigo: "+54", nombre: "Argentina", sigla: "AR" },
  { codigo: "+598", nombre: "Uruguay", sigla: "UY" },
  { codigo: "+56", nombre: "Chile", sigla: "CL" },
  { codigo: "+595", nombre: "Paraguay", sigla: "PY" },
  { codigo: "+591", nombre: "Bolivia", sigla: "BO" },
  { codigo: "+55", nombre: "Brasil", sigla: "BR" },
  { codigo: "+51", nombre: "Perú", sigla: "PE" },
  { codigo: "+34", nombre: "España", sigla: "ES" },
  { codigo: "+1", nombre: "Estados Unidos", sigla: "US" },
] as const;

interface CampoTelefonoProps {
  label: string;
  /** El `register("telefonoPrefijo")` del formulario. */
  prefijo: UseFormRegisterReturn;
  /** El `register("telefono")` del formulario. */
  numero: UseFormRegisterReturn;
  error?: string;
  placeholder?: string;
}

// Teléfono con el país adentro del mismo borde — Fase 3.2.3, ronda de QA
// del 2026-09-13 — ver la bitácora de la fase (`docs/Fases post MVP/Fase 3/fase3.2-multi-tenant.md`).
//
// Antes eran dos campos de texto separados, y el del país era **editable**:
// se podía borrar el "+54" o escribir cualquier cosa ahí. Textual del
// cliente: *"es un select pegado al teléfono dentro de un mismo borde,
// así se lee como un control único y nadie puede borrar el +54 ni
// escribir cualquier cosa"*.
//
// **El prefijo y el número se siguen guardando por separado en la base**
// (`telefono_prefijo` / `telefono`, como ya estaban): lo que cambia es el
// control, no el modelo. Pegarlos en un solo string obligaría a
// partirlos de nuevo cada vez que haya que armar un `wa.me`.
export function CampoTelefono({ label, prefijo, numero, error, placeholder }: CampoTelefonoProps) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label className={authLabelClass} htmlFor={numero.name}>
        {label}
      </label>
      {/* `focus-within` en el contenedor, y los dos controles sin borde
          propio: es lo que hace que se vea y se comporte como un campo
          solo. */}
      <div className="flex items-center rounded-[10px] border border-linea bg-hueso focus-within:border-salvia-oscuro">
        <select
          aria-label="País"
          className="rounded-l-[10px] bg-transparent py-2.5 pl-3 pr-1 text-grafito outline-none"
          {...prefijo}
        >
          {PAISES.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.sigla} {p.codigo}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="h-5 w-px flex-shrink-0 bg-linea" />
        <input
          id={numero.name}
          type="tel"
          autoComplete="tel"
          placeholder={placeholder}
          className="w-full min-w-0 rounded-r-[10px] bg-transparent px-3 py-2.5 text-grafito outline-none"
          {...numero}
        />
      </div>
      {error && (
        <span role="alert" className={authErrorClass}>
          {error}
        </span>
      )}
    </div>
  );
}
