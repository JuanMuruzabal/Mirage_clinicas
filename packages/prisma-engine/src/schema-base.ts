import { z } from "zod";

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
