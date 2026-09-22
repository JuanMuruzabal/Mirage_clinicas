import type { ReactNode } from "react";

// Clases y componentes chicos que comparten varios módulos. Los del EDITOR
// son un espejo literal de apps/web/src/components/editor-pagina/estilos.ts
// (PE-2 va a consolidar esto en tokens de diseño reales; hasta entonces son
// las mismas clases de Tailwind, copiadas para que el paquete no dependa de
// apps/web — ver la nota de "Infraestructura del paquete" en el plan).

export const CLASE_CAMPO =
  "w-full rounded-field border border-linea bg-hueso px-3 py-2 text-sm text-grafito outline-none focus:border-salvia-oscuro disabled:opacity-60";
export const CLASE_ETIQUETA = "text-xs uppercase tracking-widest text-grafito/60";
export const CLASE_BOTON_PELIGRO =
  "rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-terracota-oscuro hover:border-terracota hover:bg-terracota-claro disabled:cursor-not-allowed disabled:opacity-50";
export const CLASE_AYUDA = "text-xs text-grafito/60";

export function Contador({ actual, max }: { actual: number; max: number }) {
  return (
    <span className={`${CLASE_AYUDA} self-end tabular-nums`}>
      {actual}/{max}
    </span>
  );
}

// Del RENDER público — espejo de las mismas constantes en
// apps/web/src/components/public/modulos-publicos.tsx.
export const CLASE_TARJETA = "rounded-card border-[0.5px] border-arena bg-marfil p-6";
export const CLASE_TITULO = "font-[family-name:var(--font-display)] text-xl font-medium text-grafito";

export function Titulo({ children }: { children: ReactNode }) {
  return <h2 className={CLASE_TITULO}>{children}</h2>;
}

// Un <img> plano y no next/image: las fotos vienen de un storage externo
// (disco en dev, R2 en producción) y next/image exigiría declarar cada host
// en next.config — un acoplamiento que no aporta nada acá, las fotos ya se
// suben acotadas (5 MB, jpeg/png/webp) por el backend.
export function Foto({ src, alt, className }: { src: string; alt: string; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}
