// Clases compartidas del editor de página (Fase 4.4). Un campo de formulario
// usa `border border-linea bg-hueso` (y no el `border-[0.5px] border-arena
// bg-marfil` de las tarjetas): a medio píxel y tres puntos de luminosidad, el
// borde desaparecía sobre el marfil del panel — un campo tiene que leerse
// como un hueco donde escribir (CLAUDE.md, Fase 3.2).
export const CLASE_CAMPO =
  "w-full rounded-field border border-linea bg-hueso px-3 py-2 text-sm text-grafito outline-none focus:border-salvia-oscuro disabled:opacity-60";

// Texto secundario del editor (PP-4, H11): grafito al 75 % es el tono más
// claro que da 4,5:1 (AA) sobre los tres fondos del panel — marfil, hueso y
// salvia-claro (la opción elegida). Al 60 %, lo de antes, daba 3,5–3,7:1.
// `contraste.test.ts` lo verifica y falla si algún archivo del editor usa un
// tono más claro.
export const TONO_SECUNDARIO = "text-grafito/75";

export const CLASE_ETIQUETA = `text-xs uppercase tracking-widest ${TONO_SECUNDARIO}`;

// Área táctil (PP-4, H14): 44 px en pantallas táctiles (`pointer: coarse`)
// para lo que se toca con el dedo — asa, ↑↓, pastillas. Con mouse se queda
// en el tamaño compacto de siempre.
export const CLASE_TACTIL = "pointer-coarse:min-h-11 pointer-coarse:min-w-11";

export const CLASE_BOTON =
  `rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro disabled:cursor-not-allowed disabled:opacity-50 ${CLASE_TACTIL}`;

export const CLASE_BOTON_PELIGRO =
  `rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-terracota-oscuro hover:border-terracota hover:bg-terracota-claro disabled:cursor-not-allowed disabled:opacity-50 ${CLASE_TACTIL}`;

export const CLASE_AYUDA = `text-xs ${TONO_SECUNDARIO}`;

// Una opción de un GrupoDeOpciones: pastilla (texto corto) o tarjeta (con
// descripción). La elegida lleva borde y fondo salvia.
export const CLASE_PASTILLA = `rounded-full border-[0.5px] px-3 py-1.5 text-xs text-grafito ${CLASE_TACTIL}`;
export const CLASE_TARJETA_OPCION = "rounded-card border-[0.5px] p-3 text-left text-sm transition-colors";
export const claseDeEleccion = (elegida: boolean) => (elegida ? "border-salvia-oscuro bg-salvia-claro" : "border-arena bg-marfil hover:border-salvia");
