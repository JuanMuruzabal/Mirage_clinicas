import { z } from "zod";
import type { TipoModulo } from "./tipos";
import { OPCIONES_TOKENS, type ClaveToken } from "./tokens";
import { schema as sobreNosotrosSchema } from "./modulos/sobre-nosotros/schema";
import { schema as textoLibreSchema } from "./modulos/texto-libre/schema";
import { schema as especialidadesSchema } from "./modulos/especialidades/schema";
import { schema as fotoSchema } from "./modulos/foto/schema";
import { schema as galeriaSchema } from "./modulos/galeria/schema";
import { schema as estadisticasSchema } from "./modulos/estadisticas/schema";
import { schema as contactoSchema } from "./modulos/contacto/schema";
import { schema as preguntasFrecuentesSchema } from "./modulos/preguntas-frecuentes/schema";
import { schema as obrasSocialesSchema } from "./modulos/obras-sociales/schema";
import { schema as llamadoAccionSchema } from "./modulos/llamado-accion/schema";
import { schema as videoSchema } from "./modulos/video/schema";
import { schema as equipoSchema } from "./modulos/equipo/schema";
import { schema as horariosSchema } from "./modulos/horarios/schema";
import { schema as serviciosSchema } from "./modulos/servicios/schema";

/**
 * El esquema (zod) de la config de cada módulo — lo que `pnpm engine:generar`
 * convierte a JSON Schema para que apps/api valide sin conocer los módulos
 * por nombre (PE-1). Separado de `registro.ts` (que es de UI: Editor/
 * seccion) a propósito: el generador no necesita importar React.
 *
 * La configuración de cada módulo vive en su schema local; Equipo, Horarios y Servicios
 * mantienen sus datos vivos fuera de la config y los hidratan las APIs del editor/público.
 */
export const ESQUEMAS_MODULOS: Record<TipoModulo, z.ZodTypeAny> = {
  sobre_nosotros: sobreNosotrosSchema,
  texto_libre: textoLibreSchema,
  especialidades: especialidadesSchema,
  foto: fotoSchema,
  galeria: galeriaSchema,
  estadisticas: estadisticasSchema,
  contacto: contactoSchema,
  horarios: horariosSchema,
  equipo: equipoSchema,
  servicios: serviciosSchema,
  preguntas_frecuentes: preguntasFrecuentesSchema,
  obras_sociales: obrasSocialesSchema,
  llamado_accion: llamadoAccionSchema,
  video: videoSchema,
};

// z.enum necesita una tupla no vacía; `as const` de arriba ya la garantiza.
const opcion = <K extends ClaveToken>(clave: K) => z.enum(OPCIONES_TOKENS[clave]).optional();

/**
 * Tokens de diseño de la página (PE-2, ver tokens.ts). El esquema que `pnpm engine:generar` exporta como `tema_tokens.schema.json`
 * para que apps/api valide el PATCH sin conocer los tokens por nombre.
 * `.strict()`: una clave desconocida se rechaza (zod-to-json-schema emite
 * `additionalProperties: false`), igual que la config de un módulo.
 */
export const tokensSchema = z
  .object({
    forma: opcion("forma"),
    densidad: opcion("densidad"),
    superficie: opcion("superficie"),
    fondo: opcion("fondo"),
    boton: opcion("boton"),
    botonEstilo: opcion("botonEstilo"),
    menu: opcion("menu"),
    portada: opcion("portada"),
    movimiento: opcion("movimiento"),
    fondoAnimado: opcion("fondoAnimado"),
  })
  .strict();
