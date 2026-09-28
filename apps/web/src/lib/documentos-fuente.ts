// La letra con la que se escribe sobre la lámina (TR-187). Arimo tiene las
// mismas métricas que Arial y Helvetica —cada letra ocupa lo mismo—, y con
// esas métricas compone la lámina el paquete de documentos (y Go, al
// congelarla): así el renglón se corta en pantalla en el mismo lugar que en
// el documento sellado y en el PDF.
//
// `preload: false`, como las de la página pública: solo la usan las
// pantallas del módulo de documentos, y precargada viajaría en todas.
import { Arimo } from "next/font/google";

export const fuenteDeLamina = Arimo({ variable: "--font-lamina", subsets: ["latin"], weight: ["400"], preload: false });

/** La pila de fuentes de lo escrito sobre la lámina: Arimo, y si todavía no
 *  bajó, las que tienen sus mismas métricas. */
export const FAMILIA_DE_LAMINA = "var(--font-lamina), Arimo, Arial, Helvetica, sans-serif";
