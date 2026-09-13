"use client";

import { useEffect, useRef, useState } from "react";

export const LARGO_CODIGO = 6;

interface CasillasCodigoProps {
  /** Mensaje de error del intento anterior. Al cambiar, limpia las
   *  casillas y devuelve el foco a la primera. */
  error?: string | null;
  /** Se llama con el código completo o parcial cada vez que cambia. */
  onCambio: (codigo: string) => void;
  /** Prefijo de los `id`, por si hay dos en una pantalla. */
  idPrefijo?: string;
  /** Código con el que llenar las casillas de una, cuando algo de afuera
   *  lo resuelve. Hoy lo usa el "Autocompletar" del bloque solo-dev del
   *  wizard (TR-135: nunca llega nada en producción). */
  autocompletar?: string | null;
}

// Las seis casillas del código de verificación.
//
// Nació en el wizard público de sacar turno (`docs/Fases post MVP/Fase
// 2/turnero_pagina/rediseno-flujo-turnos.md` §5, pantalla [4]) y se
// extrajo acá en la ronda de QA del 2026-09-13, a pedido del cliente:
// *"el modal de introducir código en sumate y login reutilizar el que se
// usa en el wizard de sacar turno, para mantener consistencia"*.
//
// Es la misma acción —copiar seis dígitos de un mail— en tres pantallas
// distintas, y hasta acá se veía de dos formas: seis casillas en el
// wizard y un campo de texto suelto en el alta. Lo que se comparte no es
// solo el aspecto: el pegado del código entero, el borrado que vuelve a
// la casilla anterior, las flechas, y el limpiado tras un intento fallido
// son cuatro comportamientos que estaban escritos una sola vez y ahora
// valen para las tres.
//
// El campo único con placeholder `000000` que había antes en el alta se
// leía como contenido ya cargado y no mostraba cuántos dígitos faltan.
export function CasillasCodigo({ error, onCambio, idPrefijo = "codigo", autocompletar }: CasillasCodigoProps) {
  const [digitos, setDigitos] = useState<string[]>(Array(LARGO_CODIGO).fill(""));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Un error del intento anterior limpia las casillas. Limpieza de estado
  // DURANTE el render (patrón "ajustar estado cuando cambia una prop" de
  // la doc de React), no en un efecto — la regla `set-state-in-effect`
  // del compilador de React marca como error un setState disparado
  // sincrónicamente desde un efecto. El foco sí es un efecto legítimo
  // (DOM imperativo, no estado), así que ese queda aparte.
  const [ultimoErrorLimpiado, setUltimoErrorLimpiado] = useState<string | null>(null);
  if (error && error !== ultimoErrorLimpiado) {
    setUltimoErrorLimpiado(error);
    setDigitos(Array(LARGO_CODIGO).fill(""));
  }

  useEffect(() => {
    if (error) inputsRef.current[0]?.focus();
  }, [error]);

  // Mismo patrón que el limpiado por error: se aplica cuando el valor
  // CAMBIA, no en cada render, así las casillas siguen siendo editables
  // después de autocompletar.
  const [ultimoAutocompletado, setUltimoAutocompletado] = useState<string | null>(null);
  if (autocompletar && autocompletar !== ultimoAutocompletado) {
    setUltimoAutocompletado(autocompletar);
    const next = Array(LARGO_CODIGO).fill("");
    for (let i = 0; i < Math.min(autocompletar.length, LARGO_CODIGO); i++) next[i] = autocompletar[i];
    setDigitos(next);
    onCambio(next.join(""));
  }

  function aplicar(next: string[]) {
    setDigitos(next);
    onCambio(next.join(""));
  }

  function setDigito(i: number, valor: string) {
    const next = [...digitos];
    next[i] = valor;
    aplicar(next);
  }

  function manejarCambio(i: number, raw: string) {
    const limpio = raw.replace(/\D/g, "");
    if (!limpio) {
      setDigito(i, "");
      return;
    }
    // Toma solo el último dígito tipeado — cubre el caso de un input que
    // ya tenía un valor y el usuario escribe encima sin seleccionar.
    setDigito(i, limpio.at(-1) ?? "");
    if (i < LARGO_CODIGO - 1) inputsRef.current[i + 1]?.focus();
  }

  function manejarTecla(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digitos[i] && i > 0) {
      e.preventDefault();
      setDigito(i - 1, "");
      inputsRef.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      inputsRef.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < LARGO_CODIGO - 1) {
      e.preventDefault();
      inputsRef.current[i + 1]?.focus();
    }
  }

  function manejarPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pegado = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LARGO_CODIGO);
    if (!pegado) return;
    e.preventDefault();
    const next = Array(LARGO_CODIGO).fill("");
    for (let i = 0; i < pegado.length; i++) next[i] = pegado[i];
    aplicar(next);
    const siguienteFoco = Math.min(pegado.length, LARGO_CODIGO - 1);
    inputsRef.current[siguienteFoco]?.focus();
  }

  return (
    <div className="flex justify-center gap-2.5">
      {digitos.map((d, i) => (
        <input
          key={i}
          id={`${idPrefijo}-${i}`}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          inputMode="numeric"
          maxLength={1}
          aria-label={`Dígito ${i + 1}`}
          value={d}
          onChange={(e) => manejarCambio(i, e.target.value)}
          onKeyDown={(e) => manejarTecla(i, e)}
          onPaste={manejarPaste}
          className="h-14 w-full max-w-14 rounded-field border-[1.5px] border-transparent bg-hueso text-center font-mono text-[22px] text-grafito outline-none focus:border-salvia-oscuro focus:bg-marfil"
        />
      ))}
    </div>
  );
}
