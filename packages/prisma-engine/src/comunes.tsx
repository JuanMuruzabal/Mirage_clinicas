import type { ReactNode } from "react";
import { srcsetDeFoto, TAMANOS_FOTO_POR_DEFECTO } from "./imagenes";

// Clases y componentes chicos que comparten varios módulos. Los del EDITOR
// son un espejo literal de apps/web/src/components/editor-pagina/estilos.ts
// (el panel de edición es Mirage, no la página: no lleva tokens del tema),
// copiadas para que el paquete no dependa de apps/web — ver la nota de
// "Infraestructura del paquete" en el plan.

export const CLASE_CAMPO =
  "w-full rounded-field border border-linea bg-hueso px-3 py-2 text-sm text-grafito outline-none focus:border-salvia-oscuro disabled:opacity-60";
export const CLASE_ETIQUETA = "text-xs uppercase tracking-widest text-grafito/75";
export const CLASE_BOTON_PELIGRO =
  "rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-terracota-oscuro hover:border-terracota hover:bg-terracota-claro disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:min-w-11";
export const CLASE_AYUDA = "text-xs text-grafito/75";

export function Contador({ actual, max }: { actual: number; max: number }) {
  return (
    <span className={`${CLASE_AYUDA} self-end tabular-nums`}>
      {actual}/{max}
    </span>
  );
}

/**
 * El campo "Descripción de la foto" (PP-4, H13): el texto alternativo que lee
 * un lector de pantalla, y lo que muestra un buscador de imágenes. Opcional:
 * vacío, la página usa uno genérico. Lo usan la foto suelta, la galería y la
 * portada (apps/web), para que las tres expliquen lo mismo con las mismas
 * palabras.
 */
export function DescripcionDeFoto({
  valor,
  max,
  onCambio,
  etiqueta = "Descripción de la foto",
}: {
  valor: string;
  max: number;
  onCambio: (valor: string) => void;
  etiqueta?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={CLASE_ETIQUETA}>{etiqueta} · opcional</span>
      <input type="text" maxLength={max} value={valor} onChange={(e) => onCambio(e.target.value)} placeholder="Ej.: la sala de espera, con luz natural" className={CLASE_CAMPO} />
      <span className={CLASE_AYUDA}>Contá qué se ve, para quien no puede ver la imagen. Si la dejás vacía, se usa una descripción genérica.</span>
    </label>
  );
}

// Del RENDER público. Desde PE-2 no llevan colores ni medidas fijas: leen
// los tokens de diseño como custom properties `--pp-*`, que define la
// plantilla (ClinicaPublicaTemplate, clase `pp-raiz` + el style del tema —
// ver apps/web/src/lib/temas-pagina-publica/aplicar.ts). Los valores por
// defecto de `.pp-raiz` (globals.css) son los de antes de PE-2: sin tema, la
// página se ve igual que siempre. Fuera de la plantilla estas variables no
// existen — estos renders no se usan en ningún otro lado.
const CLASE_TARJETA_BASE =
  "rounded-(--pp-radio) border-(length:--pp-borde-ancho) border-(--pp-borde) bg-(--pp-superficie) shadow-(--pp-sombra)";
// --pp-relleno-tarjeta y no --pp-relleno: "sin tarjeta" le saca el relleno
// lateral a la tarjeta sin tocar el de las secciones con fondo propio.
export const CLASE_TARJETA = `${CLASE_TARJETA_BASE} p-(--pp-relleno-tarjeta)`;
/** La tarjeta chica (una estadística, una especialidad): el `!p-4` de antes, ahora según la densidad. */
export const CLASE_TARJETA_CHICA = `${CLASE_TARJETA_BASE} p-(--pp-relleno-chico)`;
export const CLASE_TITULO = "font-[family-name:var(--font-display)] text-xl font-medium text-(--pp-texto)";
/** Cuerpo de texto: el /80 y el /70 de siempre, ahora sobre el color de texto del tema. */
export const CLASE_TEXTO = "text-sm text-(--pp-texto)/80";
export const CLASE_TEXTO_TENUE = "text-(--pp-texto)/70";
/** Una foto dentro de un módulo: toma la forma (radio) del tema. */
export const CLASE_FOTO = "rounded-(--pp-radio) object-cover";
/** Chip/pastilla (especialidades, redes): el borde toma el color del tema, siempre a medio píxel. */
export const CLASE_CHIP =
  "rounded-full border-[0.5px] border-(--pp-borde) bg-[var(--pp-acento-suave,var(--color-marfil))] text-[var(--pp-acento-texto,var(--color-grafito))]";
// Alineación de la sección (PE-3): la plantilla pone `--pp-alinear` /
// `--pp-alinear-flex` en el <section> cuando el admin elige "izquierda"; sin
// eso valen `center`, que es como se dibujó siempre.
export const CLASE_ALINEAR = "[text-align:var(--pp-alinear,center)]";
export const CLASE_ALINEAR_FLEX = "[align-items:var(--pp-alinear-flex,center)]";
export const CLASE_JUSTIFICAR_FLEX = "[justify-content:var(--pp-alinear-flex,center)]";

export function Titulo({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`${className ? `${className} ` : ""}${CLASE_TITULO}`}>{children}</h2>;
}

// Un <img> plano y no next/image: las fotos vienen de un storage externo
// (disco en dev, R2 en producción) y next/image exigiría declarar cada host
// en next.config — un acoplamiento que no aporta nada acá. Las variantes de
// tamaño las genera el backend al subir (PE-9, ver imagenes.ts): el `srcset`
// sale del nombre del archivo. `sizes` es cuánto ocupa la foto en pantalla;
// sin él, el navegador supone el ancho entero de la ventana.
export function Foto({
  src,
  alt,
  className,
  sizes = TAMANOS_FOTO_POR_DEFECTO,
}: {
  src: string;
  alt: string;
  className: string;
  sizes?: string;
}) {
  const srcSet = srcsetDeFoto(src);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} srcSet={srcSet} sizes={srcSet ? sizes : undefined} alt={alt} loading="lazy" decoding="async" className={className} />;
}

export type VarianteDeTexto = "centrado" | "con-foto" | "dos-columnas";

/**
 * El cuerpo de "Sobre nosotros" y "Texto libre" (PE-3): los dos son un título
 * + un texto, y comparten las mismas tres variantes. "con-foto" sin una foto
 * (o con una que no pasa el filtro de URL segura) se dibuja centrado: una
 * variante nunca deja un hueco donde iba la imagen.
 */
export function BloqueDeTexto({
  titulo,
  texto,
  variante,
  foto,
  envolverSlot,
}: {
  titulo: string;
  texto: string;
  variante: VarianteDeTexto;
  foto: { src: string; alt: string } | null;
  envolverSlot?: (slot: "titulo" | "texto" | "imagen", nodo: ReactNode) => ReactNode;
}) {
  const parrafo = texto ? (envolverSlot?.("texto", <p className={`${titulo ? "mt-2 " : ""}whitespace-pre-line ${CLASE_TEXTO}`}>{texto}</p>) ?? <p className={`${titulo ? "mt-2 " : ""}whitespace-pre-line ${CLASE_TEXTO}`}>{texto}</p>) : null;
  const encabezado = titulo ? (envolverSlot?.("titulo", <Titulo>{titulo}</Titulo>) ?? <Titulo>{titulo}</Titulo>) : null;

  if (variante === "con-foto" && foto) {
    return (
      <div className={`${CLASE_TARJETA} grid grid-cols-1 items-center gap-6 @xl:grid-cols-2`}>
        {envolverSlot?.("imagen", <Foto src={foto.src} alt={foto.alt} className={`aspect-[4/3] w-full ${CLASE_FOTO}`} />) ??
          <Foto src={foto.src} alt={foto.alt} className={`aspect-[4/3] w-full ${CLASE_FOTO}`} />}
        <div className={CLASE_ALINEAR}>
          {encabezado}
          {parrafo}
        </div>
      </div>
    );
  }
  if (variante === "dos-columnas") {
    // El texto en columnas va siempre alineado a la izquierda: centrado,
    // cada columna quedaría con bordes irregulares a los dos lados.
    return (
      <div className={`${CLASE_TARJETA} ${CLASE_ALINEAR}`}>
        {encabezado}
        {texto && (
          envolverSlot?.("texto", <p className={`${titulo ? "mt-3 " : ""}whitespace-pre-line text-left @xl:columns-2 @xl:gap-8 ${CLASE_TEXTO}`}>{texto}</p>) ??
            <p className={`${titulo ? "mt-3 " : ""}whitespace-pre-line text-left @xl:columns-2 @xl:gap-8 ${CLASE_TEXTO}`}>{texto}</p>)}
      </div>
    );
  }
  return (
    <div className={`${CLASE_TARJETA} ${CLASE_ALINEAR}`}>
      {encabezado}
      {parrafo}
    </div>
  );
}
