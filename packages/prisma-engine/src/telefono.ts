// El teléfono de la página pública en formato local argentino (PP-7, H26):
// "+5493510000000" → "351 000-0000". Se guarda en E.164 (con +54 9), que es
// lo que necesitan los links de llamar y de WhatsApp; esto es solo lo que se
// LEE, y los links siguen usando el número crudo.
//
// El número nacional tiene 10 dígitos: código de área + abonado. El código
// de área mide 2, 3 o 4 dígitos, y no hay forma de saberlo mirando solo los
// dígitos: se decide con la lista de los de 2 y 3 (los de 4 son el resto).
// Si a la lista le faltara un código de 3, ese número se partiría como si
// fuera de 4: se lee raro, pero el link de llamar sigue funcionando.

const AREAS_DE_2 = new Set(["11"]);
const AREAS_DE_3 = new Set([
  "220", "221", "223", "230", "236", "237", "249", "260", "261", "263", "264", "266", "280", "291", "294", "297", "298", "299",
  "336", "341", "342", "343", "345", "348", "351", "353", "358", "362", "364", "370", "376", "379", "380", "381", "383", "385",
  "387", "388",
]);

/**
 * "351 000-0000", "11 1234-5678", "3543 12-3456". Un número que no es
 * argentino de 10 dígitos (con o sin +54, 9, 0 o 15) se devuelve como vino:
 * mostrarlo raro es peor que mostrarlo crudo.
 */
export function telefonoLegible(telefono: string): string {
  const crudo = telefono.trim();
  let digitos = crudo.replace(/\D/g, "");
  if (digitos.startsWith("54")) digitos = digitos.slice(2);
  // El 9 de los celulares en formato internacional, y el 0 de discado nacional.
  if (digitos.length === 11 && (digitos.startsWith("9") || digitos.startsWith("0"))) digitos = digitos.slice(1);
  if (digitos.length !== 10) return crudo;

  const largoArea = AREAS_DE_2.has(digitos.slice(0, 2)) ? 2 : AREAS_DE_3.has(digitos.slice(0, 3)) ? 3 : 4;
  const area = digitos.slice(0, largoArea);
  const abonado = digitos.slice(largoArea);
  return `${area} ${abonado.slice(0, abonado.length - 4)}-${abonado.slice(-4)}`;
}
