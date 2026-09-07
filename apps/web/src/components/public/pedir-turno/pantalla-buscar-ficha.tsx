"use client";

import type { ReactNode } from "react";
import { CampoTexto, ModalFooter, ModalShell } from "./shared";

/**
 * [3b]/[3e] — pantallas de "ya vine antes" (docs/rediseno-flujo-turnos.md
 * §5). Deviación deliberada de copy respecto del doc: ahí el botón dice
 * "Buscar mi ficha"/"Buscar" porque asume que la búsqueda ocurre en este
 * paso. El backend real busca DESPUÉS de validar el código (decisión ya
 * tomada: "Mantener el orden actual, código antes de buscar" — ver
 * PantallaCodigo, que es donde vive el estado "no encontramos tu
 * ficha"), así que lo que este botón dispara de verdad es el envío del
 * código — "Enviar código" es la etiqueta honesta para esa acción (§7:
 * "los botones nombran la acción concreta").
 */

// [3b] — para mí, ya vine antes.
export function PantallaBuscarFicha({
  dni,
  email,
  onChangeDni,
  onChangeEmail,
  onSubmit,
  onBack,
  onClose,
  paso,
  total,
  enviando,
  extra,
  accionLabel = "Enviar código",
  accionLabelEnviando = "Enviando código…",
}: {
  dni: string;
  email: string;
  onChangeDni: (v: string) => void;
  onChangeEmail: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onClose: () => void;
  paso: number;
  total: number;
  enviando?: boolean;
  /** Este paso dispara el envío del código — necesita su Turnstile. */
  extra?: ReactNode;
  /**
   * Fase 2, ítem 5 ("compartir calendario"): con enlace no se manda
   * ningún código — este paso busca la ficha directo, así que el botón
   * dice "Buscar"/"Buscando…" en vez de "Enviar código"/"Enviando
   * código…" (§7: "los botones nombran la acción concreta").
   */
  accionLabel?: string;
  accionLabelEnviando?: string;
}) {
  return (
    <ModalShell
      title="Buscamos tu ficha"
      subtitle="Con tu DNI y el mail que usaste la última vez."
      onClose={onClose}
      maxWidthClassName="max-w-[500px]"
      footer={
        <ModalFooter
          paso={paso}
          total={total}
          actionLabel={enviando ? accionLabelEnviando : accionLabel}
          onBack={onBack}
          actionType="submit"
          formId="form-buscar-ficha"
          actionDisabled={enviando}
        />
      }
    >
      <form
        id="form-buscar-ficha"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <CampoTexto id="bf-dni" label="DNI" placeholder="30123456" hint="Sin puntos ni espacios" required inputMode="numeric" value={dni} onChange={(e) => onChangeDni(e.target.value)} />
          <CampoTexto
            id="bf-email"
            label="Email"
            type="email"
            placeholder="maria@gmail.com"
            hint="Ahí te llega el código"
            required
            value={email}
            onChange={(e) => onChangeEmail(e.target.value)}
          />
        </div>

        {extra}
      </form>
    </ModalShell>
  );
}

// [3e] — para otro, ya vine antes: búsqueda solo por email (una persona
// puede tener varios pacientes asociados como tutor).
export function PantallaBuscarPorMail({
  email,
  onChangeEmail,
  onSubmit,
  onBack,
  onClose,
  paso,
  total,
  enviando,
  extra,
  accionLabel = "Enviar código",
  accionLabelEnviando = "Enviando código…",
}: {
  email: string;
  onChangeEmail: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onClose: () => void;
  paso: number;
  total: number;
  enviando?: boolean;
  extra?: ReactNode;
  accionLabel?: string;
  accionLabelEnviando?: string;
}) {
  return (
    <ModalShell
      title="¿Con qué mail reservaste antes?"
      subtitle="Buscamos las fichas asociadas a esa dirección."
      onClose={onClose}
      maxWidthClassName="max-w-[500px]"
      footer={
        <ModalFooter
          paso={paso}
          total={total}
          actionLabel={enviando ? accionLabelEnviando : accionLabel}
          onBack={onBack}
          actionType="submit"
          formId="form-buscar-mail"
          actionDisabled={enviando}
        />
      }
    >
      <form
        id="form-buscar-mail"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <CampoTexto
          id="bm-email"
          label="Tu email"
          type="email"
          placeholder="lucia@gmail.com"
          required
          value={email}
          onChange={(e) => onChangeEmail(e.target.value)}
        />

        {extra}
      </form>
    </ModalShell>
  );
}
