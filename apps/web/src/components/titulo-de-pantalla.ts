/**
 * El `h1` de los módulos del panel (General, Turnos, Pacientes, Documentos y
 * Calendario, en `EncabezadoDeSeccion`). Una sola clase para que ningún
 * módulo diverja (pedido de la persona, ítem 8, 26/10: los módulos quedan
 * "solo con el título", en verde petróleo). /clinicas y /seleccionar-servicio
 * NO la usan: su saludo y su pregunta siguen como antes de esa ronda, con
 * `.titulo-prismatico` (pedido de la persona, 26/10).
 *
 * En petróleo y sin degradé, a 28 px en el celular y 32 desde `sm` (el
 * Title 1 de iOS es 28 pt; HIG, Typography), semibold, con el interlineado
 * apretado de un título de un renglón (1,15) y un tracking apenas negativo
 * (−0,015 em: a este tamaño las letras de Figtree se separan). Sobre el peor
 * tramo de las ondas da 4,8:1 (medido con el DOM, 26/10). Sin mayúsculas
 * forzadas: en mayúsculas un título de pantalla grita, y el resto de la app
 * escribe en minúscula.
 */
export const CLASE_TITULO_DE_PANTALLA =
  "font-[family-name:var(--font-display)] text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em] text-balance text-marca sm:text-[2rem]";
