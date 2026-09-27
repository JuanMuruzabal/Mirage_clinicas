import type { CSSProperties, ReactNode } from "react";
import { DibujoAgil, DibujoOrdenada, DibujoTranquila, DibujoVisible } from "./dibujos";
import { Revelar } from "./revelar";

// Ventajas — lo que cambia con PRISMA, en cuatro tarjetas de un dibujo y
// una frase (2026-09-27: "simple y al pie"). Es el destino de "Servicios
// para profesionales" del header (#como-funciona). Todo lo que dicen existe
// en el producto (TR-181).

const VENTAJAS: { titulo: string; texto: string; Dibujo: (p: { className?: string }) => ReactNode }[] = [
  {
    titulo: "Más ágil",
    texto: "Tus pacientes eligen el día y un horario libre, y confirman con un código. Sin llamarte.",
    Dibujo: DibujoAgil,
  },
  {
    titulo: "Más ordenada",
    texto: "Agenda, pacientes y equipo en un solo lugar. Nunca dos turnos a la misma hora.",
    Dibujo: DibujoOrdenada,
  },
  {
    titulo: "Más visible",
    texto: "Tu página propia, con tu estilo, y un lugar en el buscador de clínicas.",
    Dibujo: DibujoVisible,
  },
  {
    titulo: "Más tranquila",
    texto: "Cada turno nuevo te llega como aviso al celular. Vos solo atendés.",
    Dibujo: DibujoTranquila,
  },
];

export function Ventajas() {
  return (
    <section id="como-funciona" aria-labelledby="ventajas-titulo" className="bg-marfil px-6 py-24 sm:px-10 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Revelar className="mx-auto mb-14 max-w-2xl text-center">
          <h2
            id="ventajas-titulo"
            className="rv text-balance font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.95] tracking-tight text-grafito sm:text-5xl"
          >
            Tu consultorio, más liviano.
          </h2>
        </Revelar>
        <Revelar como="ul" orden={1} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VENTAJAS.map(({ titulo, texto, Dibujo }, n) => (
            <li
              key={titulo}
              className="rv flex flex-col items-center gap-3 rounded-card border-[0.5px] border-arena bg-hueso px-6 pb-8 pt-4 text-center"
              style={{ "--i": n } as CSSProperties}
            >
              <Dibujo className="h-36 w-auto" />
              <h3 className="font-[family-name:var(--font-display)] text-2xl font-black uppercase tracking-tight text-salvia-oscuro">
                {titulo}
              </h3>
              <p className="text-[15px] leading-relaxed text-grafito/75">{texto}</p>
            </li>
          ))}
        </Revelar>
      </div>
    </section>
  );
}
