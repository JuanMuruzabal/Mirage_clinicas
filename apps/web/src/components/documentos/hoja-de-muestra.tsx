import type { ModeloDeMuestra } from "@/lib/documentos-de-muestra";

// HojaDeMuestra — una hoja carta dibujada, para las muestras de la pila de
// modelos (lib/documentos-de-muestra.ts): la franja de color, un título,
// renglones grises en lugar del texto y dos renglones de firma. Todo se
// mide en unidades del ancho de la hoja (`cqw`), así se ve igual de grande
// o de chica. Una sola aclaración de verdad: que es de muestra.

const TONOS: Record<ModeloDeMuestra["tono"], string> = {
  salvia: "bg-salvia",
  terracota: "bg-terracota",
  acero: "bg-acero",
};

// Los anchos de los renglones de cada párrafo, en % de la caja de texto.
const PARRAFOS = [
  [100, 96, 100, 88, 62],
  [100, 92, 97, 100, 74],
  [98, 100, 90, 45],
];

// `llenar` — toma el alto de su caja en vez de la proporción carta: detrás
// de la hoja de adelante, en la pila, mide lo mismo que ella.
export function HojaDeMuestra({ modelo, decorativa = false, llenar = false }: { modelo: ModeloDeMuestra; decorativa?: boolean; llenar?: boolean }) {
  return (
    <div
      role={decorativa ? undefined : "img"}
      aria-label={decorativa ? undefined : `${modelo.nombre}: hoja de muestra`}
      className={`@container flex ${llenar ? "h-full" : "aspect-[8.5/11]"} w-full flex-col overflow-hidden rounded-[4px] border border-linea bg-white shadow-soft`}
    >
      <div className={`h-[2.4cqw] ${TONOS[modelo.tono]}`} />
      <div className="flex flex-1 flex-col gap-[4cqw] px-[9cqw] py-[8cqw]">
        <div className="flex flex-col gap-[1.6cqw]">
          <p className="font-[family-name:var(--font-display)] text-[5cqw] leading-tight font-semibold text-grafito">{modelo.nombre}</p>
          <p className="text-[2.6cqw] text-grafito/70">Hoja de muestra: se reemplaza cuando se sumen los demás modelos del Colegio.</p>
        </div>
        {PARRAFOS.map((renglones, i) => (
          <div key={i} className="flex flex-col gap-[1.8cqw]">
            {renglones.map((ancho, j) => (
              <div key={j} className="h-[1.3cqw] rounded-full bg-arena" style={{ width: `${ancho}%` }} />
            ))}
          </div>
        ))}
        <div className="mt-auto grid grid-cols-2 gap-[8cqw]">
          {["Firma del paciente", "Firma del profesional"].map((firma) => (
            <div key={firma} className="flex flex-col gap-[1.2cqw]">
              <div className="h-px bg-grafito/40" />
              <p className="text-[2.2cqw] text-grafito/60">{firma}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
