/**
 * Datos de contacto para el footer público. Sin dato real del cliente
 * todavía — mismo patrón de placeholder por variable de entorno que
 * Marcuzzi_Madryn usa para storage/email (TR-013/TR-014 de ese proyecto).
 */
export const CONTACTO_EMAIL = process.env.CONTACTO_EMAIL ?? "hola@dentalmirage.com.ar";

export function getCurrentYear(): number {
  return new Date().getFullYear();
}
