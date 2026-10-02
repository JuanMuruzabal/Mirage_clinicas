import type { Plantilla } from "@dental-mirage/documentos-clinicos";
import { paginasDelOriginal } from "@/lib/documentos-originales";
import { CalcoEnVivo } from "./calco";

// OriginalDelColegio — "Así es el documento": el modelo del Colegio tal
// cual es, página por página (Fase 5.1). Las páginas son la imagen del PDF
// original, así que coinciden hasta el último detalle: tipografía,
// recuadros, renglones.
//
// Una plantilla cuyo original todavía no se renderizó cae al calco vacío,
// que muestra la misma estructura con cada hueco nombrado.
//
// `pagina` (desde 1, en el orden de la lámina): muestra solo esa página, para
// la pila de modelos, que pasa de una en una (2026-10-02). Sin ella, todas
// apiladas (la pantalla completa).
export function OriginalDelColegio({ plantilla, hoy, pagina }: { plantilla: Plantilla; hoy: string; pagina?: number }) {
  const paginas = paginasDelOriginal(plantilla.id, plantilla.version);
  if (paginas.length === 0) return <CalcoEnVivo plantilla={plantilla} valores={{}} hoy={hoy} />;
  if (pagina !== undefined) {
    const indice = Math.min(Math.max(pagina, 1), paginas.length) - 1;
    const p = paginas[indice];
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={p.src}
        srcSet={p.srcSet}
        sizes="(min-width: 1280px) 50vw, 100vw"
        width={p.ancho}
        height={p.alto}
        alt={`${plantilla.nombre}: modelo original del Colegio${paginas.length > 1 ? `, página ${indice + 1} de ${paginas.length}` : ""}`}
        className="h-auto w-full rounded-[4px] border border-linea bg-white shadow-soft"
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {paginas.map((p, i) => (
        // Un <img> y no next/image: son archivos estáticos ya en su tamaño,
        // y el srcset con los dos anchos alcanza.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={p.numero}
          src={p.src}
          srcSet={p.srcSet}
          sizes="(min-width: 1280px) 50vw, 100vw"
          width={p.ancho}
          height={p.alto}
          loading={i === 0 ? "eager" : "lazy"}
          // La posición dentro del modelo, no `p.numero`: ese es el número de
          // página del PDF del Colegio (Ortodoncia son las páginas 5 y 6).
          alt={`${plantilla.nombre}: modelo original del Colegio${paginas.length > 1 ? `, página ${i + 1} de ${paginas.length}` : ""}`}
          className="h-auto w-full rounded-[4px] border border-linea bg-white shadow-soft"
        />
      ))}
    </div>
  );
}
