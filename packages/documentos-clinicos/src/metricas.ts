// Los anchos de Helvetica (métricas AFM estándar, en milésimas de em),
// con las que se compone el texto de la lámina. Arial y Arimo tienen las
// mismas, así que lo que se ve en pantalla corta las líneas en el mismo
// lugar que el PDF. Generadas una vez desde la fuente base de PDF; Go lee
// la misma tabla (el generador la copia a internal/documentos).
import metricas from "./metricas-helvetica.json";

const ANCHOS = metricas.anchos as Record<string, number>;
const POR_DEFECTO = metricas.porDefecto;

/** El ancho de un texto en milésimas de em (multiplicar por el tamaño en
 *  puntos y dividir por 1000 para tener puntos). */
export function anchoEnUnidades(texto: string): number {
  let total = 0;
  for (const caracter of texto) total += ANCHOS[String(caracter.codePointAt(0))] ?? POR_DEFECTO;
  return total;
}

export { metricas as METRICAS_HELVETICA };
