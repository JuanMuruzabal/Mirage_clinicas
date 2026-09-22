import { z } from "zod";

export const INTENSIDADES_EFECTO = ["sutil", "media", "marcada"] as const;
export const ESTILOS_MOVIMIENTO = ["quieto", "sereno", "dinamico"] as const;

export type IntensidadEfecto = (typeof INTENSIDADES_EFECTO)[number];
export type EstiloMovimiento = (typeof ESTILOS_MOVIMIENTO)[number];
export type ObjetivoEfecto = "texto" | "boton" | "imagen" | "tarjeta" | "numero" | "fondo";
export type DisparadorEfecto = "entrada" | "hover" | "clic" | "continuo";

export interface DefinicionEfecto {
  id: string;
  nombre: string;
  descripcion: string;
  objetivo: ObjetivoEfecto;
  disparador: DisparadorEfecto;
  intensidades: readonly IntensidadEfecto[];
  /** Efectos experimentales o que no pasan contraste no se publican. */
  habilitado: boolean;
}

export interface DefinicionSlotAnimable {
  id: string;
  etiqueta: string;
  objetivo: ObjetivoEfecto;
  efectos: readonly string[];
}

export const CATALOGO_EFECTOS: readonly DefinicionEfecto[] = [
  { id: "aparicion-suave", nombre: "Aparición suave", descripcion: "Aparece sin ocultarse antes de hidratar.", objetivo: "texto", disparador: "entrada", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "deslizar-suave", nombre: "Deslizamiento suave", descripcion: "Entra unos pocos píxeles desde abajo.", objetivo: "texto", disparador: "entrada", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "revelado-scroll", nombre: "Revelado al desplazarse", descripcion: "Se activa cuando el contenido entra en pantalla.", objetivo: "texto", disparador: "entrada", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "brillo-texto", nombre: "Brillo sutil", descripcion: "Un reflejo lento recorre el texto.", objetivo: "texto", disparador: "continuo", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "degrade-texto", nombre: "Degradé animado", descripcion: "Los colores del tema cambian despacio.", objetivo: "texto", disparador: "continuo", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "frases-rotativas", nombre: "Frases rotativas", descripcion: "Rota frases separadas por un punto medio.", objetivo: "texto", disparador: "continuo", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "palabras", nombre: "Aparición por palabras", descripcion: "Las palabras aparecen en secuencia breve.", objetivo: "texto", disparador: "entrada", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "subrayado", nombre: "Subrayado dibujado", descripcion: "Un trazo del color de acento aparece bajo el texto.", objetivo: "texto", disparador: "entrada", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "conteo", nombre: "Conteo animado", descripcion: "El número cuenta desde cero al entrar en pantalla.", objetivo: "numero", disparador: "entrada", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "borde-estrella", nombre: "Borde de acento", descripcion: "Un acento suave aparece en el borde al pasar el mouse.", objetivo: "boton", disparador: "hover", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "magnetico", nombre: "Atracción leve", descripcion: "El botón acompaña unos píxeles el movimiento del puntero.", objetivo: "boton", disparador: "hover", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "chispas", nombre: "Destello al clic", descripcion: "Destello breve y sin parpadeos al activar.", objetivo: "boton", disparador: "clic", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "inclinacion", nombre: "Inclinación leve", descripcion: "Una tarjeta acompaña el puntero con perspectiva discreta.", objetivo: "tarjeta", disparador: "hover", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "reflejo", nombre: "Reflejo", descripcion: "Un reflejo suave aparece al pasar el mouse.", objetivo: "imagen", disparador: "hover", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "foco-cursor", nombre: "Foco suave", descripcion: "Un halo tenue acompaña el puntero.", objetivo: "tarjeta", disparador: "hover", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "degrade-respira", nombre: "Degradé que respira", descripcion: "El fondo cambia lentamente entre colores del tema.", objetivo: "fondo", disparador: "continuo", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "malla-suave", nombre: "Malla suave", descripcion: "Manchas de color se desplazan lentamente.", objetivo: "fondo", disparador: "continuo", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "aurora-suave", nombre: "Aurora desaturada", descripcion: "Una aurora tenue se mueve lentamente.", objetivo: "fondo", disparador: "continuo", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "puntos-pulso", nombre: "Puntos con pulso", descripcion: "Un patrón de puntos cambia de opacidad sin destellos.", objetivo: "fondo", disparador: "continuo", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "particulas-lentas", nombre: "Partículas lentas", descripcion: "Pocas partículas suben despacio como polvo en suspensión.", objetivo: "fondo", disparador: "continuo", intensidades: INTENSIDADES_EFECTO, habilitado: true },
  { id: "ondas-suaves", nombre: "Ondas suaves", descripcion: "Ondas amplias recorren la parte baja de la sección.", objetivo: "fondo", disparador: "continuo", intensidades: INTENSIDADES_EFECTO, habilitado: true },
];

export const IDS_EFECTOS = CATALOGO_EFECTOS.filter((e) => e.habilitado).map((e) => e.id) as [string, ...string[]];
export const EFECTOS_POR_ID = Object.fromEntries(CATALOGO_EFECTOS.map((e) => [e.id, e])) as Record<string, DefinicionEfecto>;
export const IntensidadEfectoSchema = z.enum(INTENSIDADES_EFECTO);

export function schemaDeEfectos(slots: readonly DefinicionSlotAnimable[]) {
  const forma = Object.fromEntries(
    slots.map((slot) => [
      slot.id,
      z.object({
        id: z.enum([...slot.efectos, "ninguno"] as unknown as [string, ...string[]]),
        intensidad: IntensidadEfectoSchema,
      }).strict().optional(),
    ]),
  );
  return z.object(forma).strict().optional();
}

export function efectoPorDefecto(estilo: EstiloMovimiento, objetivo: ObjetivoEfecto): string | undefined {
  if (estilo === "quieto" || objetivo === "fondo" || objetivo === "boton") return undefined;
  return estilo === "sereno" ? "aparicion-suave" : "deslizar-suave";
}
