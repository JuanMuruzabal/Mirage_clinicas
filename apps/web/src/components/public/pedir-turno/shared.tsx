"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconChevronDown, IconCheckBadge, IconX } from "@/components/icons";

/**
 * Componentes compartidos del rediseño del wizard público "Pedir turno"
 * (docs/rediseno-flujo-turnos.md §3). Implementados una sola vez acá y
 * reutilizados en cada pantalla del flujo — el propio documento lo pide
 * como paso 1 de su orden sugerido (§9): "todo lo demás depende de esto".
 *
 * Mapeo de tokens del documento a los tokens YA existentes en
 * `globals.css` (TR-010/TR-013) — el propio documento pide esto
 * explícitamente (§2: "Si ya existen variables en el proyecto, usar esas
 * y descartar estas"). No se agrega ninguna variable CSS nueva:
 *
 *   --t-modal        → bg-marfil          (#FFFDF9 vs. #FDFCF8 del doc)
 *   --t-field         → bg-hueso           (#F6F2EA vs. #F3EBE2)
 *   --t-field-hover   → bg-marfil          (más claro, foco)
 *   --t-field-sel     → bg-arena           (#E7DFD1, tarjeta seleccionada)
 *   --t-field-deep    → bg-arena           (mismo tono — el doc los separa
 *                                            por 2-3 puntos de hex, no
 *                                            justifica un segundo token)
 *   --t-ink           → text-grafito       (#35312B vs. #2C3A2A)
 *   --t-ink-soft      → text-grafito/70
 *   --t-ink-mute      → text-grafito/50
 *   --t-green         → salvia-oscuro      (#3F5943, calca casi exacto)
 *   --t-green-ink     → marfil             (texto sobre botón verde, ya
 *                                            usado así en pedir-turno-
 *                                            button.tsx)
 *   --t-green-tint    → bg-salvia-claro    (#E4EBE2 vs. #EDF2ED)
 *   --t-line/-strong  → border-arena       (un solo tono, igual criterio
 *                                            que field-sel/-deep arriba)
 *   --t-danger        → text-terracota-oscuro (ya es el color de error
 *                                            real del wizard, ver ErrorMsg
 *                                            en pedir-turno-form.tsx)
 *   --t-r-modal (18px) → rounded-card       (--radius-card, calce exacto)
 *   --t-r-card  (12px) → rounded-field      (--radius-field, calce exacto)
 *   --t-r-field (10px) → rounded-field      (12px, 2px de diferencia no
 *                                            justifica un token nuevo)
 *   --t-r-btn   (8px)  → rounded-lg         (utilidad nativa de Tailwind,
 *                                            8px por default — pedido
 *                                            explícito del cliente de
 *                                            seguir el doc al pie de la
 *                                            letra acá, a diferencia del
 *                                            resto del sitio que usa
 *                                            rounded-full en sus botones)
 *   --t-overlay       → bg-grafito/50 backdrop-blur-sm, ya en
 *                                            pedir-turno-button.tsx — sin
 *                                            cambios, no es parte de este
 *                                            archivo.
 */

// activarConTeclado — Enter/Espacio disparan el mismo onClick que un
// click de mouse, para las tarjetas/filas con role="button" (§6: "manejo
// de Enter y Espacio" en toda tarjeta u fila seleccionable).
function activarConTeclado(onActivate: () => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  };
}

// ---------------------------------------------------------------------
// 3.1 — Shell del modal
// ---------------------------------------------------------------------

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Slot para la barra de contexto (3.7), debajo del subtítulo. */
  contextBar?: ReactNode;
  /** 480px (elección) / 520px (formularios, día-hora) / 500px (búsqueda). */
  maxWidthClassName?: string;
  /** Contenido del cuerpo — la única zona que scrollea (ver estructura de 3 zonas más abajo). */
  children: ReactNode;
  /** El pie (normalmente un <ModalFooter>) — zona fija, fuera del scroll del cuerpo. */
  footer: ReactNode;
}

// Estructura de 3 zonas (cabecera fija / cuerpo con scroll / pie fijo) —
// pedido explícito del cliente sobre la primera entrega del rediseño
// (docs/archivo/prompt-claude-code-fecha-horario.md, punto 3): "con el calendario
// abierto la pantalla no entra en viewports chicos... aplicá esto a TODOS
// los modales del flujo, porque el mismo problema aparece con la lista
// larga de fichas de [5b]". Antes todo el contenido (título, subtítulo,
// barra de contexto, campos, pie) vivía en un solo bloque sin scroll
// propio — si el contenido superaba el viewport, no había forma de llegar
// al botón de acción del pie.
//
// `max-h-[min(85dvh,720px)]`: `dvh` en vez de `vh` porque en mobile la
// barra de direcciones del navegador rompe `vh` (mismo criterio que
// `.panel-shell-h` en globals.css, TR-029). El pie NUNCA scrollea con el
// resto — es la queja puntual que motivó este cambio ("si el pie se va
// de pantalla, el usuario no encuentra 'Confirmar turno'").
export function ModalShell({ title, subtitle, onClose, contextBar, maxWidthClassName = "max-w-[480px]", children, footer }: ModalShellProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrolleado, setScrolleado] = useState(false);

  function manejarScroll() {
    setScrolleado((bodyRef.current?.scrollTop ?? 0) > 0);
  }

  return (
    <div className={`flex max-h-[min(85dvh,720px)] w-full ${maxWidthClassName} flex-col rounded-card bg-marfil`}>
      {/* Cabecera fija — la sombra solo aparece con scrollTop > 0: es la
          única señal de que hay contenido arriba una vez que el cuerpo
          ya se scrolleó. */}
      <div
        className="flex-none rounded-t-card px-6 pt-6 pb-5"
        style={scrolleado ? { boxShadow: "0 1px 0 var(--color-arena)" } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-[26px] leading-tight font-semibold text-grafito">{title}</h2>
            {subtitle && <p className="text-sm text-grafito/70">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-grafito/50 hover:text-grafito"
          >
            <IconX className="h-[18px] w-[18px]" />
          </button>
        </div>

        {contextBar && <div className="mt-5">{contextBar}</div>}
      </div>

      <div ref={bodyRef} onScroll={manejarScroll} className="panel-card-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
        {children}
      </div>

      <div className="flex-none rounded-b-card border-t border-arena px-6 pt-4 pb-6">{footer}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 3.2 — Pie (footer)
// ---------------------------------------------------------------------

interface ModalFooterProps {
  /** Se omite del todo en el primer paso de cada rama — no hay a dónde volver. */
  onBack?: () => void;
  /** "Atrás" con flecha por default — [5a] lo pisa con "No soy yo", sin flecha, misma jerarquía visual. */
  backLabel?: string;
  /** [6] (Día y horario) no lleva indicador de paso — es la pantalla de acción final, fuera del contador (§5, ver el mockup de [6]: sin "Paso N de M" en el pie). Omitir paso/total lo saca del todo. */
  paso?: number;
  total?: number;
  actionLabel: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  /** "submit" cuando el pie vive dentro de un <form>; default "button". */
  actionType?: "button" | "submit";
  /**
   * id del <form> a enviar cuando actionType="submit". El pie ahora vive
   * en la zona fija de ModalShell (fuera del cuerpo con scroll donde
   * está el propio <form>) — el atributo HTML `form` deja que un botón
   * ubicado en otra parte del DOM siga enviando ese formulario por id,
   * sin necesitar que sean descendiente/ancestro.
   */
  formId?: string;
}

// Sin borde/margen propios (antes tenía `border-t`/`mt-5`/`pt-4`): eso
// ahora lo pone la zona fija de pie de ModalShell — con las 3 zonas de
// scroll (docs/archivo/prompt-claude-code-fecha-horario.md, punto 3), un divisor
// acá Y otro en ModalShell hubiera dejado dos líneas seguidas.
export function ModalFooter({ onBack, backLabel = "Atrás", paso, total, actionLabel, onAction, actionDisabled, actionType = "button", formId }: ModalFooterProps) {
  return (
    <div className="flex items-center justify-between">
      {onBack ? (
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-grafito/70 hover:text-grafito">
          {backLabel === "Atrás" && <span aria-hidden="true">←</span>} {backLabel}
        </button>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-3">
        {paso !== undefined && total !== undefined && (
          <span className="text-xs text-grafito/50">
            Paso {paso} de {total}
          </span>
        )}
        <button
          type={actionType}
          form={actionType === "submit" ? formId : undefined}
          onClick={onAction}
          disabled={actionDisabled}
          className="h-10 rounded-lg bg-salvia-oscuro px-6 text-sm font-semibold text-marfil disabled:opacity-45"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 3.3 — Campo de texto
// ---------------------------------------------------------------------

interface CampoTextoProps {
  id: string;
  label: string;
  hint?: string;
  /** "Opcional" alineado a la derecha del label (3.3/[3a]), no entre paréntesis. */
  opcional?: boolean;
  className?: string;
}

// baseCampoClass — mismo estilo para <input>, <textarea> y <select> (3.4
// reutiliza esto). Borde transparente en reposo (evita que el layout
// salte al enfocar, ver doc) que pasa a salvia-oscuro + fondo más claro
// en foco.
export const baseCampoClass =
  "h-11 w-full rounded-field border-[1.5px] border-transparent bg-hueso px-3 text-[15px] text-grafito outline-none placeholder:text-grafito/50 focus:border-salvia-oscuro focus:bg-marfil";

// El hint va FUERA del <label> (asociado por aria-describedby, no
// anidado adentro): un <label> anidando texto extra hace que ese texto
// pase a formar parte del nombre accesible del campo completo (el hint
// se suma al label) — un query exacto por el label solo ("DNI") deja de
// matchear en cuanto el campo tiene hint ("DNI Sin puntos ni espacios").
// `aria-describedby` es el mecanismo correcto para "ayuda opcional"
// (§3.3) sin tocar el nombre accesible del campo.
export function CampoTexto({
  id,
  label,
  hint,
  opcional,
  className,
  ...inputProps
}: CampoTextoProps & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between text-[13px] text-grafito/70">
        <span>{label}</span>
        {opcional && <span className="text-grafito/50">Opcional</span>}
      </label>
      <input id={id} aria-describedby={hintId} className={`${baseCampoClass} ${className ?? ""}`} {...inputProps} />
      {hint && (
        <p id={hintId} className="text-xs text-grafito/50">
          {hint}
        </p>
      )}
    </div>
  );
}

export function CampoTextarea({
  id,
  label,
  hint,
  opcional,
  className,
  ...textareaProps
}: CampoTextoProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between text-[13px] text-grafito/70">
        <span>{label}</span>
        {opcional && <span className="text-grafito/50">Opcional</span>}
      </label>
      <textarea id={id} aria-describedby={hintId} rows={2} className={`${baseCampoClass} h-auto resize-none py-2.5 ${className ?? ""}`} {...textareaProps} />
      {hint && (
        <p id={hintId} className="text-xs text-grafito/50">
          {hint}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// 3.4 — Select
// ---------------------------------------------------------------------

interface CampoSelectProps {
  id: string;
  label: string;
  hint?: string;
  opcional?: boolean;
  placeholder?: string;
  className?: string;
}

export function CampoSelect({
  id,
  label,
  hint,
  opcional,
  placeholder = "Elegí una opción",
  className,
  children,
  ...selectProps
}: CampoSelectProps & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const sinElegir = !selectProps.value || selectProps.value === "";
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between text-[13px] text-grafito/70">
        <span>{label}</span>
        {opcional && <span className="text-grafito/50">Opcional</span>}
      </label>
      <span className="relative block">
        <select
          id={id}
          aria-describedby={hintId}
          className={`${baseCampoClass} appearance-none pr-9 ${sinElegir ? "text-grafito/50" : "text-grafito"} ${className ?? ""}`}
          {...selectProps}
        >
          <option value="">{placeholder}</option>
          {children}
        </select>
        <IconChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-grafito/50" />
      </span>
      {hint && (
        <p id={hintId} className="text-xs text-grafito/50">
          {hint}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// 3.5 — Tarjeta de opción (elección binaria)
// ---------------------------------------------------------------------

interface TarjetaOpcionProps {
  icon: ReactNode;
  titulo: string;
  descripcion: string;
  selected?: boolean;
  onSelect: () => void;
}

export function TarjetaOpcion({ icon, titulo, descripcion, selected, onSelect }: TarjetaOpcionProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={activarConTeclado(onSelect)}
      className={`relative flex flex-col items-start gap-3 rounded-field border-2 p-4 text-left transition-colors ${
        selected ? "border-salvia-oscuro bg-arena" : "border-transparent bg-hueso hover:border-arena"
      }`}
    >
      <IconCheckBadge
        className={`absolute top-3 right-3 h-5 w-5 text-salvia-oscuro transition-opacity ${selected ? "opacity-100" : "opacity-0"}`}
      />
      <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-arena text-salvia-oscuro">
        <span className="h-5 w-5 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-grafito">{titulo}</span>
        <span className="text-sm text-grafito/70">{descripcion}</span>
      </span>
    </div>
  );
}

// Grilla de tarjetas de opción — repeat(auto-fit, minmax(180px, 1fr)),
// colapsa sola a una columna en mobile (§2).
export function GrillaOpciones({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">{children}</div>;
}

// ---------------------------------------------------------------------
// 3.6 — Fila de persona (listas de fichas)
// ---------------------------------------------------------------------

interface FilaPersonaProps {
  nombre: string;
  secundaria?: string;
  badge?: string;
  selected?: boolean;
  onSelect: () => void;
}

function iniciales(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function FilaPersona({ nombre, secundaria, badge, selected, onSelect }: FilaPersonaProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={activarConTeclado(onSelect)}
      className={`relative flex items-center gap-3 rounded-field border-2 px-3.5 py-3 text-left transition-colors ${
        selected ? "border-salvia-oscuro bg-arena" : "border-transparent bg-hueso hover:border-arena"
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-arena text-sm font-semibold text-salvia-oscuro">
        {iniciales(nombre)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-grafito">
          <span className="truncate">{nombre}</span>
          {badge && <span className="shrink-0 rounded-full bg-arena px-2 py-0.5 text-[11px] font-medium text-grafito/70">{badge}</span>}
        </span>
        {secundaria && <span className="truncate text-[13px] text-grafito/70">{secundaria}</span>}
      </span>
      <IconCheckBadge className={`h-5 w-5 shrink-0 text-salvia-oscuro transition-opacity ${selected ? "opacity-100" : "opacity-0"}`} />
    </div>
  );
}

// Fila "Otra persona" al final de [5b] — borde punteado, sin selección
// posible (siempre navega a [3d] al tocarla).
export function FilaOtraPersona({ icon, titulo, descripcion, onSelect }: { icon: ReactNode; titulo: string; descripcion: string; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={activarConTeclado(onSelect)}
      className="flex items-center gap-3 rounded-field border-2 border-dashed border-arena px-3.5 py-3 text-left hover:bg-hueso"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-salvia-oscuro">
        <span className="h-5 w-5 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-grafito">{titulo}</span>
        <span className="text-[13px] text-grafito/70">{descripcion}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------
// 3.7 — Barra de contexto
// ---------------------------------------------------------------------

interface BarraContextoProps {
  icon: ReactNode;
  texto: string;
  accionLabel: string;
  onAccion: () => void;
}

export function BarraContexto({ icon, texto, accionLabel, onAccion }: BarraContextoProps) {
  return (
    <div className="flex w-full items-center gap-2 rounded-field bg-hueso px-3 py-2.5">
      <span className="shrink-0 text-salvia-oscuro [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span className="flex-1 text-[13px] text-grafito">{texto}</span>
      <button type="button" onClick={onAccion} className="shrink-0 text-[13px] font-medium text-salvia-oscuro hover:underline">
        {accionLabel}
      </button>
    </div>
  );
}
