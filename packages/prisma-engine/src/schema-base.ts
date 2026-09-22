import { z } from "zod";
import { ALINEACIONES, FONDOS_SECCION, MAX_LARGO_TITULO_PUBLICO } from "./seccion";

// Campo común a la config de CUALQUIER módulo: el nombre que el admin le
// puso para reconocerlo en el editor ("Foto de la sala de espera"). Espejo
// de la validación genérica de `nombre` en validarModulos
// (apps/api/internal/http/pagina_publica.go) — PE-1 la mueve al esquema
// generado, así que cada schema.ts la suma con el spread de abajo.
export const campoNombrePropio = { nombre: z.string().max(60).optional() };

// Una URL de foto de la página: la sube POST /panel/pagina/fotos y siempre
// es relativa a /uploads/ (storage local) o absoluta http(s) (storage
// externo) — nunca "javascript:" ni otro esquema, porque el frontend la usa
// como `src`/`href`. Vacía vale (= sin foto). Espejo de urlDeFotoValida en
// pagina_publica.go.
export const urlDeFotoSchema = z
  .string()
  .max(500)
  .regex(/^$|^\/uploads\/|^https:\/\/|^http:\/\//, "URL de foto inválida");

// Opciones comunes de SECCIÓN (PE-3): cualquier módulo las acepta en su
// config (cada schema.ts las suma con el spread, igual que el nombre
// propio). Qué controles ofrece el editor para cada módulo lo dice su
// meta.ts (`opcionesDeSeccion`); el esquema las acepta en todos para que una
// config vieja o copiada de otro módulo no se rechace por una clave de más.
// Todas opcionales: sin ellas la sección se ve exactamente como antes.

export const camposDeSeccion = {
  // tituloPublico — el título que ve el VISITANTE (y el link del menú),
  // separado de `nombre`, que es solo la etiqueta del editor (TR-155).
  tituloPublico: z.string().max(MAX_LARGO_TITULO_PUBLICO).optional(),
  fondoSeccion: z.enum(FONDOS_SECCION).optional(),
  alineacion: z.enum(ALINEACIONES).optional(),
};

/** La variante de layout de un módulo: opcional, sin ella vale la primera (la de antes de PE-3). */
export function campoVariante<T extends readonly [string, ...string[]]>(ids: T) {
  return { variante: z.enum(ids).optional() };
}
