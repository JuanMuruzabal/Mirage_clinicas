"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

interface DialogoProps {
  titulo: string;
  /** Texto chico debajo del título (y descripción accesible del diálogo). */
  descripcion?: ReactNode;
  onCerrar: () => void;
  children: ReactNode;
  /** Ancho máximo: "chico" para una confirmación, "ancho" para la galería.
   *  "completo" es la pantalla entera en el celular y, en la computadora,
   *  lo justo para el odontograma (16 piezas de 44 px): más ancho, el
   *  diagrama quedaba centrado y todo lo demás pegado a la izquierda. */
  ancho?: "chico" | "medio" | "ancho" | "completo";
  /** Nombre accesible del botón "Cerrar", si hay otros en la pantalla. */
  etiquetaCerrar?: string;
  /** El fondo de la caja. "marfil" es la paleta blanca de los modales del
   *  panel (como "Agregar turno"); por defecto sigue siendo hueso. */
  superficie?: "hueso" | "marfil";
  /** Centrado en la pantalla en vez de pegado arriba (los diálogos del
   *  módulo de documentos, pedido del cliente 2026-09-29). Con `my-auto`
   *  en la caja y no `items-center` en el fondo: si no entra en la
   *  pantalla, scrollea desde arriba en vez de quedar cortado. */
  centrado?: boolean;
  /** Una fila fija al final (los botones de cierre): con ella, la caja
   *  mide a lo sumo la pantalla y solo el contenido se desplaza. Un pie
   *  `sticky` adentro del scroll dejaba ver lo que pasaba por debajo y
   *  a los costados (QA del odontograma, 5.5). */
  pie?: ReactNode;
}

const ANCHOS = {
  chico: "max-w-md",
  medio: "max-w-2xl",
  ancho: "max-w-7xl",
  completo: "max-w-4xl max-sm:min-h-full max-sm:rounded-none max-sm:border-0",
} as const;

/**
 * Diálogo modal accesible (PP-3, H10): foco adentro al abrir, Tab y
 * Shift+Tab no salen de él, Escape y el fondo lo cierran, y al cerrarse el
 * foco vuelve a lo que lo abrió. Reemplaza a `window.confirm`, que no se
 * puede estilar, corta el hilo de la página y en algunos navegadores
 * móviles se puede silenciar para siempre con "no mostrar más".
 *
 * Portal a `document.body`, como ModalPortal del panel: un ancestro con
 * `overflow` o `container-type` recortaría al diálogo (TR-030, TR-151).
 *
 * A diferencia de ModalPortal, este diálogo SÍ puede estar abierto en el
 * primer render: la galería de plantillas se abre sola en una página que
 * nunca se personalizó. En el servidor no hay `document`, y el portal
 * tiraba un ReferenceError que dejaba /personalizar-pagina en 500 (PP-4,
 * visto en el log de `next dev`, que después se recuperaba en el cliente).
 * Por eso no se dibuja nada hasta hidratar, y el foco espera a eso.
 */
const sinSuscripcion = () => () => {};

export function Dialogo({ titulo, descripcion, onCerrar, children, ancho = "chico", etiquetaCerrar, superficie = "hueso", centrado = false, pie }: DialogoProps) {
  const id = useId();
  // false en el servidor y al hidratar; true desde el render siguiente.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  });

  useEffect(() => {
    if (!montado) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const nodo = caja.current;
    // El primer control, o la caja misma si no hay ninguno.
    (nodo?.querySelector<HTMLElement>("[data-autofocus]") ?? nodo?.querySelector<HTMLElement>(ENFOCABLES) ?? nodo)?.focus();

    function teclado(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Un control de adentro ya lo usó (la pieza agrandada del
        // odontograma vuelve al diagrama): no cierra el diálogo.
        if (e.defaultPrevented) return;
        e.stopPropagation();
        cerrar.current();
        return;
      }
      if (e.key !== "Tab" || !nodo) return;
      const enfocables = [...nodo.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((el) => !el.closest("[inert]"));
      if (enfocables.length === 0) {
        e.preventDefault();
        return;
      }
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === nodo)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener("keydown", teclado);
    return () => {
      document.removeEventListener("keydown", teclado);
      anterior?.focus();
    };
  }, [montado]);

  if (!montado) return null;
  const fondo = superficie === "marfil" ? "bg-marfil" : "bg-hueso";
  const completo = ancho === "completo";
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-grafito/50 p-3 py-6 backdrop-blur-sm sm:p-6 ${
        completo ? "max-sm:p-0" : ""
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={descripcion ? `${id}-descripcion` : undefined}
        tabIndex={-1}
        className={`w-full ${ANCHOS[ancho]} ${centrado ? "my-auto" : ""} rounded-card border-[0.5px] border-arena ${fondo} shadow-soft outline-none ${
          pie ? `flex max-h-[calc(100dvh-3rem)] flex-col ${completo ? "max-sm:h-dvh max-sm:max-h-dvh" : ""}` : ""
        }`}
      >
        {/* Un <div> y no un <header>: fuera de un article/section, <header> es
            un landmark "banner", y con el diálogo abierto el documento tenía
            dos (el del sitio y este) — axe, PP-4. */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b-[0.5px] border-arena p-4 sm:p-6">
          <div>
            <h2 id={`${id}-titulo`} className="font-[family-name:var(--font-display)] text-2xl font-medium text-grafito">
              {titulo}
            </h2>
            {descripcion && (
              <p id={`${id}-descripcion`} className="mt-1 text-sm text-grafito/80">
                {descripcion}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={etiquetaCerrar}
            className="min-h-11 rounded-full border-[0.5px] border-arena px-4 text-sm text-grafito hover:border-salvia"
          >
            Cerrar
          </button>
        </div>
        {pie ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            <div
              className={`flex shrink-0 justify-end gap-2 rounded-b-card border-t border-linea ${fondo} px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 ${
                completo ? "max-sm:rounded-none" : ""
              }`}
            >
              {pie}
            </div>
          </>
        ) : (
          children
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmacionProps {
  titulo: string;
  mensaje: ReactNode;
  confirmar: string;
  /** Pinta el botón de confirmar con el tono de peligro. */
  peligro?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Una pregunta de sí/no sobre el Dialogo. El foco arranca en "Cancelar": Enter por reflejo no confirma. */
export function Confirmacion({ titulo, mensaje, confirmar, peligro, onConfirmar, onCancelar }: ConfirmacionProps) {
  return (
    <Dialogo titulo={titulo} onCerrar={onCancelar}>
      <div className="flex flex-col gap-4 p-4 text-sm text-grafito sm:p-6">
        {mensaje}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            data-autofocus
            onClick={onCancelar}
            className="min-h-11 rounded-full border-[0.5px] border-arena bg-marfil px-4 text-sm font-medium text-grafito hover:border-salvia"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold text-marfil hover:brightness-95 ${peligro ? "bg-terracota-oscuro" : "bg-salvia-oscuro"}`}
          >
            {confirmar}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
