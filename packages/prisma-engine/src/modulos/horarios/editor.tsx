"use client";

import { useState } from "react";
import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ETIQUETA } from "../../comunes";
import type { DiaClinica, EditorModuloProps, FranjaClinica, HorariosClinica } from "../../tipos";

const DIAS: { diaSemana: DiaClinica["diaSemana"]; nombre: string }[] = [
  { diaSemana: 1, nombre: "Lunes" },
  { diaSemana: 2, nombre: "Martes" },
  { diaSemana: 3, nombre: "Miércoles" },
  { diaSemana: 4, nombre: "Jueves" },
  { diaSemana: 5, nombre: "Viernes" },
  { diaSemana: 6, nombre: "Sábado" },
  { diaSemana: 0, nombre: "Domingo" },
];

function normalizar(valor?: HorariosClinica): HorariosClinica {
  const porDia = new Map((valor?.dias ?? []).map((dia) => [dia.diaSemana, dia]));
  return {
    dias: DIAS.map(({ diaSemana }) => {
      const dia = porDia.get(diaSemana);
      return dia
        ? { diaSemana, cerrado: dia.cerrado, franjas: dia.franjas.slice(0, 2).map((franja) => ({ ...franja })) }
        : { diaSemana, cerrado: true, franjas: [] };
    }),
    nota: valor?.nota ?? "",
  };
}

function validar(valor: HorariosClinica): string | null {
  for (const { nombre, diaSemana } of DIAS) {
    const dia = valor.dias.find((item) => item.diaSemana === diaSemana);
    if (!dia || dia.cerrado) continue;
    if (dia.franjas.length < 1 || dia.franjas.length > 2) return `${nombre}: cargá una o dos franjas, o marcá el día como cerrado.`;
    const franjas = dia.franjas.slice().sort((a, b) => a.desde.localeCompare(b.desde));
    for (const franja of franjas) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(franja.desde) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(franja.hasta)) {
        return `${nombre}: completá los horarios de cada franja.`;
      }
      if (franja.desde >= franja.hasta) return `${nombre}: la hora de cierre debe ser posterior a la de apertura.`;
    }
    if (franjas.length === 2 && franjas[0].hasta > franjas[1].desde) return `${nombre}: las franjas no pueden superponerse.`;
  }
  return null;
}

export function Editor({ horariosClinica, guardarHorariosClinica }: EditorModuloProps) {
  const [borrador, setBorrador] = useState(() => normalizar(horariosClinica));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  function actualizarDia(diaSemana: DiaClinica["diaSemana"], actualizar: (dia: DiaClinica) => DiaClinica) {
    setBorrador((actual) => ({
      ...actual,
      dias: actual.dias.map((dia) => (dia.diaSemana === diaSemana ? actualizar(dia) : dia)),
    }));
    setMensaje("");
    setError("");
  }

  function actualizarFranja(diaSemana: DiaClinica["diaSemana"], indice: number, parcial: Partial<FranjaClinica>) {
    actualizarDia(diaSemana, (dia) => ({
      ...dia,
      franjas: dia.franjas.map((franja, i) => (i === indice ? { ...franja, ...parcial } : franja)),
    }));
  }

  async function guardar() {
    if (!guardarHorariosClinica) {
      setError("El guardado del horario todavía no está disponible.");
      return;
    }
    const problema = validar(borrador);
    if (problema) {
      setError(problema);
      setMensaje("");
      return;
    }

    setGuardando(true);
    setError("");
    setMensaje("");
    try {
      const respuesta = await guardarHorariosClinica(borrador);
      if (!respuesta.ok) {
        setError(respuesta.error);
      } else {
        setBorrador(normalizar(respuesta.valor));
        setMensaje("Horario guardado: ya se ve en tu página.");

      }
    } catch {
      setError("No se pudo guardar el horario. Intentá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className={CLASE_AYUDA}>Este es el horario del consultorio. Los turnos se ofrecen según la agenda de cada profesional.</p>
      {/* El horario es un dato del consultorio, no del diseño: no pasa por
          el borrador ni por Publicar (PP-2, H4, decidido por Kevin el
          2026-09-25). El editor tiene que decirlo, porque todo lo demás de
          esta pantalla sí espera a Publicar. */}
      <p className="rounded-field border border-linea bg-hueso px-3 py-2 text-xs text-grafito">
        <strong className="font-semibold">Se aplica al instante.</strong> “Guardar horario” lo cambia en tu página publicada, sin esperar a “Publicar”.
      </p>
      {!guardarHorariosClinica && <p className={CLASE_AYUDA}>El guardado se conecta desde el editor de la clínica.</p>}

      <div className="flex flex-col gap-3">
        {DIAS.map(({ diaSemana, nombre }) => {
          const dia = borrador.dias.find((item) => item.diaSemana === diaSemana) ?? { diaSemana, cerrado: true, franjas: [] };
          return (
            <fieldset key={diaSemana} className="flex flex-col gap-2 rounded-field border border-linea bg-marfil p-3">
              <legend className="px-1 text-sm font-medium text-grafito">{nombre}</legend>
              <label className="flex items-center gap-2 text-sm text-grafito">
                <input
                  type="checkbox"
                  checked={dia.cerrado}
                  onChange={(event) => actualizarDia(diaSemana, (actual) => ({
                    ...actual,
                    cerrado: event.target.checked,
                    franjas: event.target.checked ? [] : actual.franjas.length ? actual.franjas : [{ desde: "", hasta: "" }],
                  }))}
                />
                Cerrado
              </label>
              {!dia.cerrado && (
                <div className="flex flex-col gap-2">
                  {dia.franjas.map((franja, indice) => (
                    <div key={`${diaSemana}-${indice}`} className="flex flex-wrap items-end gap-2">
                      <label className="flex min-w-28 flex-1 flex-col gap-1">
                        <span className={CLASE_AYUDA}>Desde</span>
                        <input type="time" value={franja.desde} className={CLASE_CAMPO} onChange={(event) => actualizarFranja(diaSemana, indice, { desde: event.target.value })} />
                      </label>
                      <label className="flex min-w-28 flex-1 flex-col gap-1">
                        <span className={CLASE_AYUDA}>Hasta</span>
                        <input type="time" value={franja.hasta} className={CLASE_CAMPO} onChange={(event) => actualizarFranja(diaSemana, indice, { hasta: event.target.value })} />
                      </label>
                      {dia.franjas.length > 1 && (
                        <button type="button" className="px-2 py-2 text-xs underline" onClick={() => actualizarDia(diaSemana, (actual) => ({ ...actual, franjas: actual.franjas.filter((_, i) => i !== indice) }))}>
                          Quitar franja
                        </button>
                      )}
                    </div>
                  ))}
                  {dia.franjas.length < 2 && (
                    <button type="button" className="self-start text-xs underline" onClick={() => actualizarDia(diaSemana, (actual) => ({ ...actual, franjas: [...actual.franjas, { desde: "", hasta: "" }] }))}>
                      Agregar otra franja
                    </button>
                  )}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={CLASE_ETIQUETA}>Nota opcional</span>
        <textarea
          value={borrador.nota}
          maxLength={160}
          rows={2}
          className={CLASE_CAMPO}
          placeholder="Por ejemplo: feriados cerrado"
          onChange={(event) => {
            setBorrador((actual) => ({ ...actual, nota: event.target.value }));
            setMensaje("");
          }}
        />
      </label>

      <div className="flex flex-col items-start gap-2">
        <button type="button" disabled={guardando || !guardarHorariosClinica} className="rounded-full border border-salvia-oscuro bg-marfil px-4 py-2 text-sm font-medium text-salvia-oscuro hover:bg-salvia-claro disabled:cursor-not-allowed disabled:opacity-50" onClick={guardar}>

          {guardando ? "Guardando…" : "Guardar horario"}
        </button>
        {error && <p role="alert" className="text-xs text-terracota-oscuro">{error}</p>}
        {mensaje && <p role="status" className={CLASE_AYUDA}>{mensaje}</p>}
      </div>
    </div>
  );
}
