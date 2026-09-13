"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CasillasCodigo, LARGO_CODIGO } from "@/components/auth/casillas-codigo";
import { ModalFooter, ModalShell } from "./shared";

/**
 * [4] Código de verificación (docs/Fases post MVP/Fase 2/turnero_pagina/rediseno-flujo-turnos.md §5) — seis
 * casillas separadas en vez del campo único con placeholder `000000` del
 * diseño anterior (se leía como contenido ya cargado, sin mostrar
 * cuántos dígitos faltan).
 */

const REENVIO_SEGUNDOS = 30;

interface PantallaCodigoProps {
  email: string;
  onCambiarEmail: () => void;
  onBack: () => void;
  onClose: () => void;
  paso: number;
  total: number;
  /** true mientras se está validando el código contra el backend. */
  verificando: boolean;
  /** Mensaje de error del intento anterior (código incorrecto/vencido), o null. */
  error: string | null;
  onSubmit: (codigo: string) => void;
  onReenviar: () => void;
  /** Código real, para el bloque "solo dev" — nunca se le pasa nada en producción. */
  codigoDev?: string;
  /**
   * true tras un código válido cuando la búsqueda posterior (por DNI o
   * por mail de tutor) no encontró ninguna ficha verificada. El doc
   * (§5, [3b]) pone este estado en la pantalla de búsqueda ("acá se
   * dispara una búsqueda que puede fallar") — pero el backend real busca
   * DESPUÉS de validar el código, no antes (decisión ya tomada: "Mantener
   * el orden actual, código antes de buscar"), así que el estado vacío
   * vive acá, no en [3b]/[3e].
   */
  pacienteNoEncontrado?: boolean;
  onEmpezarComoNuevo?: () => void;
  /** "Reenviar código" dispara un nuevo envío — necesita su propio Turnstile (de un solo uso, distinto del que ya se consumió en el paso anterior). */
  extra?: ReactNode;
}

export function PantallaCodigo({
  email,
  onCambiarEmail,
  onBack,
  onClose,
  paso,
  total,
  verificando,
  error,
  onSubmit,
  onReenviar,
  codigoDev,
  pacienteNoEncontrado,
  onEmpezarComoNuevo,
  extra,
}: PantallaCodigoProps) {
  // Las casillas y su comportamiento (pegado, borrado, flechas, limpieza
  // tras un error) viven en CasillasCodigo desde la ronda de QA del
  // 2026-09-13: el alta de cuenta usa exactamente las mismas.
  const [codigo, setCodigo] = useState("");
  const [autocompletar, setAutocompletar] = useState<string | null>(null);
  const [segundosReenvio, setSegundosReenvio] = useState(REENVIO_SEGUNDOS);

  useEffect(() => {
    if (segundosReenvio <= 0) return;
    const id = setInterval(() => setSegundosReenvio((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [segundosReenvio]);

  const codigoCompleto = codigo.length === LARGO_CODIGO;

  return (
    <ModalShell
      title="Confirmanos que sos vos"
      onClose={onClose}
      footer={
        <ModalFooter
          paso={paso}
          total={total}
          actionLabel={verificando ? "Verificando…" : "Confirmar"}
          onBack={onBack}
          actionType="submit"
          formId="form-codigo"
          actionDisabled={!codigoCompleto || verificando}
        />
      }
    >
      <form
        id="form-codigo"
        onSubmit={(e) => {
          e.preventDefault();
          if (codigoCompleto) onSubmit(codigo);
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <p className="text-sm text-grafito/70">
            Mandamos un código de 6 dígitos a <b className="text-grafito">{email}</b>
          </p>
          <button type="button" onClick={onCambiarEmail} className="mt-1 text-sm font-medium text-salvia-oscuro hover:underline">
            Cambiar email
          </button>
        </div>

        <CasillasCodigo error={error} onCambio={setCodigo} autocompletar={autocompletar} />

        {/* Línea de error con altura reservada siempre (visibility, no
            display) — así el layout no salta al aparecer/desaparecer
            (§5, [4]). */}
        <p role="alert" className={`text-center text-xs text-terracota-oscuro ${error ? "visible" : "invisible"}`}>
          {error ?? " "}
        </p>

        <div className="text-center">
          {segundosReenvio > 0 ? (
            <span className="text-sm text-grafito/50">Reenviar código en 0:{String(segundosReenvio).padStart(2, "0")}</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                onReenviar();
                setSegundosReenvio(REENVIO_SEGUNDOS);
              }}
              className="text-sm font-medium text-salvia-oscuro hover:underline"
            >
              Reenviar código
            </button>
          )}
        </div>

        {pacienteNoEncontrado && (
          <div className="flex flex-col gap-2 rounded-field bg-hueso p-3 text-sm text-grafito/70">
            <p>No encontramos una ficha verificada con esos datos.</p>
            {onEmpezarComoNuevo && (
              // "Empezar como paciente nuevo" (no "Registrarme...", copy
              // literal del doc §5 [3b]): esta pantalla es compartida por
              // los 2 caminos "ya vine antes" (para mí Y para otro) — en
              // el camino "para otro" quien está acá es el tutor, no el
              // paciente, así que un texto en primera persona ("me
              // registro") sería incorrecto para ese caso.
              <button type="button" onClick={onEmpezarComoNuevo} className="self-start font-medium text-salvia-oscuro hover:underline">
                Empezar como paciente nuevo
              </button>
            )}
          </div>
        )}

        {extra}

        {codigoDev && (
          <div className="flex items-center justify-between gap-3 rounded-field border border-dashed border-arena px-3 py-2.5">
            <span className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-arena px-2 py-0.5 font-medium text-grafito/70">solo dev</span>
              <span className="font-mono text-grafito">{codigoDev}</span>
            </span>
            <button type="button" onClick={() => setAutocompletar(codigoDev)} className="text-xs font-medium text-salvia-oscuro hover:underline">
              Autocompletar
            </button>
          </div>
        )}
      </form>
    </ModalShell>
  );
}
