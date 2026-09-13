"use client";

import { useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { authErrorClass, authInputConIconoClass, authLabelClass } from "./auth-shell";
import { IconCheck, IconEye, IconEyeOff, IconLock } from "../icons";

export const LARGO_MINIMO_PASSWORD = 12;

export interface FuerzaPassword {
  nivel: 0 | 1 | 2 | 3 | 4;
  etiqueta: string;
}

// fuerzaPassword — el nivel que pinta la barra.
//
// El largo mínimo es la regla real que valida el backend (12), así que
// mientras no se alcanza, el nivel es 1 aunque la contraseña tenga de
// todo: una clave corta y variada sigue siendo rechazada, y una barra
// llena diciendo "buena" justo antes de un error sería mentir. Pasado
// ese piso, lo que suma es variedad.
export function fuerzaPassword(valor: string): FuerzaPassword {
  if (valor.length === 0) return { nivel: 0, etiqueta: "" };
  if (valor.length < LARGO_MINIMO_PASSWORD) {
    const faltan = LARGO_MINIMO_PASSWORD - valor.length;
    return { nivel: 1, etiqueta: `Te ${faltan === 1 ? "falta" : "faltan"} ${faltan} ${faltan === 1 ? "carácter" : "caracteres"}` };
  }
  const variedad =
    (/[a-z]/.test(valor) && /[A-Z]/.test(valor) ? 1 : 0) +
    (/\d/.test(valor) ? 1 : 0) +
    (/[^a-zA-Z0-9]/.test(valor) ? 1 : 0) +
    (valor.length >= 16 ? 1 : 0);

  if (variedad >= 3) return { nivel: 4, etiqueta: "Muy buena" };
  if (variedad === 2) return { nivel: 3, etiqueta: "Buena" };
  return { nivel: 2, etiqueta: "Suficiente" };
}

interface CampoPasswordProps {
  label: string;
  registro: UseFormRegisterReturn;
  /** Valor actual — para la barra de fuerza y el tilde de coincidencia. */
  valor: string;
  error?: string;
  autoComplete?: string;
  /** Muestra la barra de fuerza (solo el campo de contraseña nueva). */
  conFuerza?: boolean;
  /** Muestra el tilde verde cuando coincide (solo el de repetir). */
  coincide?: boolean;
}

// Campo de contraseña — Fase 3.2.3, ronda de QA del 2026-09-13
// (detalle en `docs/Fases post MVP/Fase 3/fase3.2-multi-tenant.md`).
//
// Tres cosas que antes no estaban:
//
//   - **Ojo para mostrar/ocultar.** Una clave de 12 caracteres tipeada a
//     ciegas es la razón más común de "mi contraseña no funciona".
//   - **Barra de fuerza en vez del texto fijo "Mínimo 12 caracteres"**:
//     *"el requisito se comunica mejor mostrando progreso que con una
//     regla estática"*. Mientras falta largo, el texto dice cuántos
//     caracteres faltan — la regla sigue estando, pero como avance.
//   - **Tilde verde en el repetir cuando coinciden**, *"así el error no
//     aparece recién al enviar"*.
export function CampoPassword({
  label,
  registro,
  valor,
  error,
  autoComplete = "new-password",
  conFuerza = false,
  coincide = false,
}: CampoPasswordProps) {
  const [visible, setVisible] = useState(false);
  const fuerza = conFuerza ? fuerzaPassword(valor) : null;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label className={authLabelClass} htmlFor={registro.name}>
        {label}
      </label>
      <div className="relative flex flex-col">
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-grafito/40">
          <IconLock className="h-[18px] w-[18px]" />
        </span>
        <input
          id={registro.name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className={`${authInputConIconoClass} pr-16`}
          {...registro}
        />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {/* El nombre accesible va en el span, no en el ícono: los
              componentes de `icons.tsx` solo aceptan `className`, así que
              un aria-label pasado ahí se descarta en silencio. */}
          {coincide && valor.length > 0 && (
            <span role="img" aria-label="Las contraseñas coinciden" className="flex text-salvia-oscuro">
              <IconCheck className="h-[18px] w-[18px]" />
            </span>
          )}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-grafito/50 transition-colors hover:bg-hueso hover:text-grafito"
          >
            {visible ? <IconEyeOff className="h-[18px] w-[18px]" /> : <IconEye className="h-[18px] w-[18px]" />}
          </button>
        </span>
      </div>

      {fuerza && fuerza.nivel > 0 && (
        <div className="flex items-center gap-2">
          <span className="flex flex-1 gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((segmento) => (
              <span
                key={segmento}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  segmento <= fuerza.nivel
                    ? fuerza.nivel === 1
                      ? "bg-terracota"
                      : fuerza.nivel === 2
                        ? "bg-salvia"
                        : "bg-salvia-oscuro"
                    : "bg-arena"
                }`}
              />
            ))}
          </span>
          <span className={`text-xs ${fuerza.nivel === 1 ? "text-terracota-oscuro" : "text-grafito/60"}`}>
            {fuerza.etiqueta}
          </span>
        </div>
      )}

      {error && (
        <span role="alert" className={authErrorClass}>
          {error}
        </span>
      )}
    </div>
  );
}
