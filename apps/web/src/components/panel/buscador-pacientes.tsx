"use client";

import { useEffect, useState } from "react";
import type { PacienteConocido } from "@dental-mirage/shared-types";
import { listPacientesAction } from "@/app/actions/pacientes";

// BuscadorPacientes — el buscador de "Paciente conocido", extraído de
// agregar-turno-modal.tsx para reusarlo en los otros dos lugares que
// terminaron necesitando lo mismo (2026-09-19):
//
//   - "+ Agregar paciente" → "De la clínica": sumar a tu lista una ficha
//     que ya existe pero que todavía no atendiste.
//   - "Compartir link" → "¿Para quién?": elegir la ficha que el enlace
//     va a llevar.
//
// Las tres preguntan lo mismo —"¿cuál de las fichas de la clínica?"— y
// tenían tres implementaciones distintas del mismo campo con la misma
// lista. `filtrar` es lo único que cambia entre ellas: el alta de turno
// las quiere todas, y "De la clínica" solo las que todavía no son mías.
//
// La lista viene de /pacientes/de-la-clinica (la identidad del paciente
// es de la CLÍNICA, TR-144), se pide una vez al montar y se filtra acá
// mientras se tipea: es la misma lista corta que ya usaba el alta, y
// volver a pedirla en cada tecla no agrega nada.

interface BuscadorPacientesProps {
  /** Qué hacer con la ficha elegida. */
  onElegir: (paciente: PacienteConocido) => void;
  /** Acota la lista. Sin esto, todas las de la clínica. */
  filtrar?: (paciente: PacienteConocido) => boolean;
  /** Qué decir cuando no queda ninguna para mostrar. */
  vacio?: string;
  /** Texto del campo. */
  placeholder?: string;
  /** Alto máximo de los resultados; el campo queda fijo arriba. */
  altoMaximo?: string;
}

export function BuscadorPacientes({
  onElegir,
  filtrar,
  vacio = "No encontramos pacientes para esa búsqueda.",
  placeholder = "Nombre, apellido o DNI…",
  altoMaximo = "max-h-72",
}: BuscadorPacientesProps) {
  const [termino, setTermino] = useState("");
  const [pacientes, setPacientes] = useState<PacienteConocido[] | null>(null);

  useEffect(() => {
    let activo = true;
    listPacientesAction().then((lista) => {
      if (activo) setPacientes(lista);
    });
    return () => {
      activo = false;
    };
  }, []);

  const disponibles = (pacientes ?? []).filter((p) => (filtrar ? filtrar(p) : true));
  const buscado = termino.trim().toLowerCase();
  const resultados = buscado
    ? disponibles.filter((p) => `${p.nombre} ${p.apellido} ${p.dni}`.toLowerCase().includes(buscado))
    : disponibles;

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={termino}
        onChange={(e) => setTermino(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar paciente"
        className="w-full rounded-field border border-linea bg-hueso px-4 py-2.5 text-sm text-grafito outline-none focus:border-salvia"
      />
      {/* max-h + overflow-y-auto (corrección de QA de la Fase 2): "a
          medida que se van acumulando pacientes conocidos... se agranda
          la pestaña, organizar esto con un scrollbar" — el campo de
          arriba queda fijo, solo scrollean los resultados. */}
      <div className={`flex ${altoMaximo} flex-col gap-2 overflow-y-auto pr-1`}>
        {pacientes === null && <p className="text-sm text-grafito/60">Cargando…</p>}
        {pacientes !== null && resultados.length === 0 && <p className="text-sm text-grafito/60">{vacio}</p>}
        {resultados.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onElegir(p)}
            className="flex flex-shrink-0 flex-col gap-0.5 rounded-field border-[0.5px] border-arena bg-hueso px-4 py-3 text-left hover:border-salvia"
          >
            <span className="text-sm font-semibold text-grafito">
              {p.nombre} {p.apellido}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-xs text-grafito/60">DNI {p.dni}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
