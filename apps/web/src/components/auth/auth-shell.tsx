import type { ReactNode } from "react";
import Link from "next/link";

// Estilos compartidos de las pantallas de auth (sumarse/ingresar/
// recuperar-password/verificar-mail) — layout estructural adaptado de
// auth-shell.tsx de Marcuzzi_Madryn (card centrada, labels/inputs/estados
// de error), pero sobre los tokens YA EXISTENTES de Dental Mirage
// (hueso/marfil/salvia/terracota/grafito/arena, rounded-card/rounded-field,
// shadow-soft — nunca los tokens de Madryn ink/coral/tide, ver
// docs/tradeoffs.md TR-013/015). Reemplaza el `Campo`/`inputClass` que
// hoy vive copy-pasteado en sumarse-wizard.tsx y varios modales del panel.
export const authFieldWrapClass = "flex flex-col gap-1.5 text-sm";
export const authLabelClass = "font-medium text-grafito";
export const authInputClass =
  "rounded-field border-[0.5px] border-arena bg-marfil px-3 py-2 text-grafito outline-none focus:border-salvia disabled:opacity-60";
export const authSubmitClass =
  "rounded-full bg-salvia-oscuro px-4 py-3 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60";
export const authSecondaryButtonClass =
  "rounded-full border-[0.5px] border-arena bg-marfil px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro disabled:opacity-60";
export const authErrorClass = "text-sm text-terracota-oscuro";
export const authSuccessClass = "text-sm text-salvia-oscuro";

interface AuthFieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function AuthField({ label, error, hint, children }: AuthFieldProps) {
  return (
    <label className={authFieldWrapClass}>
      <span className={authLabelClass}>{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-grafito/50">{hint}</span>}
      {error && (
        <span role="alert" className={authErrorClass}>
          {error}
        </span>
      )}
    </label>
  );
}

interface AuthCheckboxFieldProps {
  error?: string;
  children: ReactNode;
}

export function AuthCheckboxField(props: AuthCheckboxFieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  const { error, children, ...inputProps } = props;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-start gap-2.5 text-sm text-grafito">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-salvia-oscuro" {...inputProps} />
        <span>{children}</span>
      </label>
      {error && (
        <span role="alert" className={authErrorClass}>
          {error}
        </span>
      )}
    </div>
  );
}

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Destino y texto del link "volver" de arriba de la tarjeta — default
   * "Volver al inicio" → "/". Bug real reportado por el cliente
   * (2026-08-26): el header global no se muestra en estas pantallas (ver
   * isAuthFlowRoute en lib/site-routes.ts), así que esta es la única forma
   * de salir del flujo de auth sin usar el botón "atrás" del navegador —
   * mismo criterio que AuthShell de Marcuzzi_Madryn. Pantallas alcanzadas
   * DESDE otra pantalla de auth (ej. "Recuperar contraseña", que se llega
   * desde /ingresar) pasan un destino más específico que "/".
   */
  volverHref?: string;
  volverLabel?: string;
  /** Alternativa a volverHref para un paso de un wizard client-side (ej.
   * "volver al paso anterior" desde la verificación de código, sin
   * navegar — pedido explícito del cliente, 2026-08-26: "el botón de
   * volver al inicio solo debe estar en el primer paso de sumarse, si
   * llego al paso de verificación poder volver al paso anterior"). Cuando
   * se pasa, reemplaza el <Link> por un <button>, mismo estilo visual. */
  onVolver?: () => void;
  /** Suprime el link/botón "volver" por completo — para pantallas que
   * viven DENTRO de otro flujo ya protegido (ej. el modal de bienvenida
   * sobre /seleccionar-servicio) donde "volver al inicio" no tiene
   * sentido. */
  sinVolver?: boolean;
}

// AuthShell — card centrada compartida por todas las pantallas de auth.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  volverHref = "/",
  volverLabel = "Volver al inicio",
  onVolver,
  sinVolver = false,
}: AuthShellProps) {
  const volverClassName =
    "inline-flex w-fit items-center gap-1.5 self-start rounded-full bg-salvia-claro px-3.5 py-1.5 text-xs font-medium text-salvia-oscuro transition-colors hover:brightness-95";

  return (
    <div className="flex w-full max-w-md flex-col gap-7 rounded-card border-[0.5px] border-arena bg-marfil p-8 shadow-soft">
      {!sinVolver &&
        (onVolver ? (
          <button type="button" onClick={onVolver} className={volverClassName}>
            <span aria-hidden>←</span>
            {volverLabel}
          </button>
        ) : (
          <Link href={volverHref} className={volverClassName}>
            <span aria-hidden>←</span>
            {volverLabel}
          </Link>
        ))}
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium text-grafito">{title}</h1>
        {subtitle && <p className="text-sm text-grafito/60">{subtitle}</p>}
      </div>
      {children}
      {footer && <div className="border-t-[0.5px] border-arena pt-5 text-center text-sm text-grafito/60">{footer}</div>}
    </div>
  );
}

// AuthDivider — separador "o" entre el botón de Google y el form nativo.
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-grafito/40">
      <span className="h-px flex-1 bg-arena" />
      o
      <span className="h-px flex-1 bg-arena" />
    </div>
  );
}
