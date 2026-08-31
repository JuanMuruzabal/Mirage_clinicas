"use client";

import { useState } from "react";

interface HoraPickerProps {
  slots: string[];
  value: string;
  onChange: (hora: string) => void;
  cargando: boolean;
}

// HoraPicker — corrección de QA (F2.3):
//   1) "el seleccionar hora se escapa de la pantalla de agregar turno,
//      no puede hacer que se vean algunos en pantalla e ir scrolleando
//      para ver las otras horas?". El horario de atención completo, en
//      pasos de 15 minutos, puede tener 40+ opciones — un <select>
//      nativo delega el desplegable al navegador/SO, y su alto no se
//      puede acotar de forma confiable entre navegadores (en algunos
//      entornos termina saliéndose de la pantalla en vez de scrollear
//      solo). En vez de un popup nativo, la lista tiene su propio scroll
//      acotado (`max-h-40` — unas 5 horas a la vista, el resto se
//      scrollea) — nunca se corta contra el borde de la pantalla.
//   2) "quiero que aparezca colapsada primero la lista de horarios y que
//      diga selecciona hora disponible, y una vez que la apriete se vean
//      los horarios... y cuando se seleccione una hora, se vuelva a
//      colapsar y que quede solo el horario seleccionado en la barra" —
//      arranca cerrado (un botón, no la lista), se abre al tocarlo y se
//      vuelve a cerrar solo apenas se elige un horario.
//
// Nota de accesibilidad: el botón que dispara el desplegable NO va
// envuelto en un <label> (a diferencia de otros <Campo>) — un <label> le
// pega su propio texto como nombre accesible a cualquier elemento
// etiquetable que contenga, y cada opción de la lista terminaba
// anunciándose como "Hora" en vez de su propio horario (bug real
// encontrado armando este mismo componente, ver hora-picker.test.tsx).
export function HoraPicker({ slots, value, onChange, cargando }: HoraPickerProps) {
  const [abierto, setAbierto] = useState(false);
  const deshabilitado = cargando || slots.length === 0;

  if (!abierto) {
    const sinValor = !cargando && slots.length > 0 && !value;
    const etiqueta = cargando
      ? "Buscando horarios…"
      : slots.length === 0
        ? "No hay horarios disponibles"
        : sinValor
          ? "Seleccioná un horario disponible"
          : value;

    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={deshabilitado}
        aria-haspopup="listbox"
        aria-expanded={false}
        // aria-label dinámico, no un "Hora" fijo (bug real encontrado
        // armando este mismo componente, ver la nota de accesibilidad de
        // arriba): un aria-label estático oculta el valor elegido del
        // todo para lectores de pantalla (el texto visible dentro de un
        // elemento con aria-label no se anuncia). "Hora: 09:00" cumple
        // igual el criterio de accesibilidad "el nombre accesible debe
        // contener el texto visible" (WCAG 2.5.3) porque el texto visible
        // ("09:00") es al final del string.
        aria-label={`Hora: ${etiqueta}`}
        className={`flex w-full items-center justify-between rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-left text-sm outline-none hover:border-salvia disabled:cursor-not-allowed disabled:opacity-60 ${
          sinValor ? "text-grafito/60" : "font-[family-name:var(--font-mono)] text-grafito"
        }`}
      >
        <span className="truncate">{etiqueta}</span>
        {!deshabilitado && (
          <span aria-hidden="true" className="ml-2 flex-shrink-0 text-grafito/50">
            ▾
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Hora"
      className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-field border-[0.5px] border-arena bg-hueso p-1"
    >
      {slots.map((s) => (
        <button
          key={s}
          type="button"
          role="option"
          aria-selected={value === s}
          onClick={() => {
            onChange(s);
            setAbierto(false);
          }}
          className={`shrink-0 rounded-field px-2 py-1.5 text-left text-sm font-[family-name:var(--font-mono)] ${
            value === s ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
