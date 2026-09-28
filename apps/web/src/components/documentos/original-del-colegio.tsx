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
export function OriginalDelColegio({ plantilla, hoy }: { plantilla: Plantilla; hoy: string }) {
  const paginas = paginasDelOriginal(plantilla.id, plantilla.version);
  if (paginas.length === 0) return <CalcoEnVivo plantilla={plantilla} valores={{}} hoy={hoy} />;
  return (
    <div className="flex flex-col gap-4">
      {paginas.map((p) => (
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
          loading={p.numero === 1 ? "eager" : "lazy"}
          alt={`${plantilla.nombre}: modelo original del Colegio${paginas.length > 1 ? `, página ${p.numero} de ${paginas.length}` : ""}`}
          className="h-auto w-full rounded-[4px] border border-linea bg-white shadow-soft"
        />
      ))}
    </div>
  );
}
