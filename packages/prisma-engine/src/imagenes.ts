// Fotos responsivas (PE-9, plan Prisma Engine). Al subir una foto, el
// backend guarda variantes WebP de estos anchos con el nombre
// "<token>.w<ancho>.webp" y devuelve la URL de la más grande
// (apps/api/internal/imagenes). Con eso alcanza para armar el `srcset` sin
// guardar nada más en la config del módulo: las demás variantes se deducen
// del nombre. Una foto anterior a PE-9 (o de un storage sin variantes) no
// matchea el patrón y se dibuja como siempre, con su `src` solo.
//
// ANCHOS_DE_FOTO es el espejo de imagenes.Anchos en Go: si cambia uno,
// cambia el otro en el mismo commit.
export const ANCHOS_DE_FOTO = [480, 960, 1600] as const;

const PATRON_VARIANTE = /^(.+)\.w(\d+)\.webp$/;

/**
 * El `srcset` de una foto con variantes, o `undefined` si no las tiene. Solo
 * lista los anchos que no superan el de la URL guardada: una foto de 1200 px
 * se guardó hasta la variante de 960, y la de 1600 no existe.
 */
export function srcsetDeFoto(url: string): string | undefined {
  const partes = PATRON_VARIANTE.exec(url);
  if (!partes) return undefined;
  const [, base, anchoTexto] = partes;
  const ancho = Number(anchoTexto);
  if (!(ANCHOS_DE_FOTO as readonly number[]).includes(ancho)) return undefined;
  return ANCHOS_DE_FOTO.filter((a) => a <= ancho)
    .map((a) => `${base}.w${a}.webp ${a}w`)
    .join(", ");
}

/**
 * `sizes` por defecto de una foto de la página: el contenido nunca pasa de
 * `max-w-3xl` (48rem), así que en pantallas anchas la foto ocupa como mucho
 * eso, y en un celular el ancho de la pantalla.
 */
export const TAMANOS_FOTO_POR_DEFECTO = "(min-width: 48rem) 48rem, 100vw";
