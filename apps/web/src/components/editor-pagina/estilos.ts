// Clases compartidas del editor de página (Fase 4.4). Un campo de formulario
// usa `border border-linea bg-hueso` (y no el `border-[0.5px] border-arena
// bg-marfil` de las tarjetas): a medio píxel y tres puntos de luminosidad, el
// borde desaparecía sobre el marfil del panel — un campo tiene que leerse
// como un hueco donde escribir (CLAUDE.md, Fase 3.2).
export const CLASE_CAMPO =
  "w-full rounded-field border border-linea bg-hueso px-3 py-2 text-sm text-grafito outline-none focus:border-salvia-oscuro disabled:opacity-60";

export const CLASE_ETIQUETA = "text-xs uppercase tracking-widest text-grafito/60";

export const CLASE_BOTON =
  "rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro disabled:cursor-not-allowed disabled:opacity-50";

export const CLASE_BOTON_PELIGRO =
  "rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-terracota-oscuro hover:border-terracota hover:bg-terracota-claro disabled:cursor-not-allowed disabled:opacity-50";

export const CLASE_AYUDA = "text-xs text-grafito/60";
