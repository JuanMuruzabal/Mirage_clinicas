import type { ComponentType, ReactNode } from "react";

// Tipos del registro único de módulos (PE-1). apps/web es hoy el único
// consumidor, así que el paquete no conoce Server Actions ni imports con
// alias "@/": todo lo que un módulo necesita del lado de la app (subir una
// foto, construir un href seguro) entra INYECTADO — ver `ComponentesInyectados`
// y `UtilsRender` más abajo — para que el paquete se pueda transpilar y
// testear solo, sin depender de apps/web.

export type TipoModulo = "sobre_nosotros" | "texto_libre" | "especialidades" | "foto" | "galeria" | "estadisticas" | "contacto";
export type SubtipoFoto = "retrato" | "banner" | "franja";
export type EstadisticaId = "pacientes_atendidos" | "turnos_realizados";
export type RedSocial = "instagram" | "facebook" | "whatsapp";

/**
 * Un módulo tal como lo maneja el editor. `clave` es SOLO del cliente —
 * identifica la fila en React y en el arrastre —, no viaja al backend.
 */
export interface ModuloBorrador {
  clave: string;
  tipo: string;
  visible: boolean;
  config: Record<string, unknown>;
}

export interface SeccionPublica {
  /** Ancla (#id) — también la usa el menú de la página. */
  id: string;
  /** Texto del link del menú, o null si la sección no lleva. */
  etiqueta: string | null;
  ancho: "completo" | "medio";
  /** Sin el `<section>` ni el ancho: eso lo pone la plantilla. */
  contenido: ReactNode;
}

/**
 * Los campos de la página (no de un módulo puntual) que "sobre_nosotros" y
 * "contacto" editan/muestran — la bio, el override de dirección, el mapa y
 * las redes viven en `paginas_publicas`, no en la config de ningún módulo
 * (así una clínica puede tener redes sociales sin haber agregado "Contacto"
 * a su página). Subconjunto de `Borrador` (apps/web/src/lib/pagina-publica/borrador.ts).
 */
export interface CamposDePagina {
  bio: string;
  direccionOverride: string;
  mostrarMapa: boolean;
  redes: Record<string, string>;
}

/** El componente de subida de fotos real vive en apps/web (usa una Server Action) — se inyecta. */
export interface PropsSubirFoto {
  url: string;
  onSubida: (url: string) => void;
  onQuitar?: () => void;
  modo?: "reemplazar" | "agregar";
  etiqueta: string;
  deshabilitado?: boolean;
}

export interface ComponentesInyectados {
  SubirFoto: ComponentType<PropsSubirFoto>;
}

export interface EditorModuloProps {
  modulo: ModuloBorrador;
  pagina: CamposDePagina;
  /** La dirección de la clínica: es lo que se muestra si no hay override. */
  direccionClinica?: string | null;
  /** El teléfono viene del perfil; acá solo se muestra cuál va a aparecer. */
  telefono: string;
  onConfig: (config: Record<string, unknown>) => void;
  onPagina: (parcial: Partial<CamposDePagina>) => void;
  componentes: ComponentesInyectados;
}

/** Subconjunto de ContenidoPagina (apps/web) que necesita el render de los módulos. */
export interface ContenidoParaModulos {
  bio?: string | null;
  direccion?: string | null;
  mostrarMapa: boolean;
  redesSociales: Record<string, string>;
  estadisticas: Record<string, number>;
}

/** Construcción de URLs/hrefs seguros — vive en apps/web (enlaces.ts, TR-154) y se inyecta acá. */
export interface UtilsRender {
  esUrlDeFotoSegura: (url: string) => boolean;
  hrefDeTelefono: (telefono: string) => string | null;
  urlDeComoLlegar: (direccion: string) => string;
  urlDeMapaEmbebido: (direccion: string) => string;
  urlDeRedSocial: (red: string, valor: string) => string | null;
}

export interface ContextoPublico {
  nombreClinica: string;
  telefono?: string | null;
  especialidades: string[];
  contenido: ContenidoParaModulos;
  utils: UtilsRender;
}

/**
 * Un módulo es un paquete autocontenido: metadatos + config inicial + ancho
 * en la grilla + su formulario de editor + su render público. El backend NO
 * conoce este registro (valida contra el JSON Schema generado, ver PE-1 en
 * el plan) — este `DefinicionModulo` es solo para el frontend.
 */
export interface DefinicionModulo {
  tipo: TipoModulo;
  nombre: string;
  descripcion: string;
  /** Se puede tener más de uno en la misma página. */
  repetible: boolean;
  configInicial: () => Record<string, unknown>;
  ancho: (config: Record<string, unknown>) => "completo" | "medio";
  Editor: (props: EditorModuloProps) => ReactNode;
  seccion: (modulo: ModuloBorrador, indice: number, contexto: ContextoPublico) => SeccionPublica | null;
}
