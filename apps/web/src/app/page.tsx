import type { CSSProperties } from "react";
import Link from "next/link";
import "./home.css";
import { EscenaCalma, EscenaEscritorio, EscenaLink, EscenaNoche } from "@/components/home/dibujos";
import { Historia } from "@/components/home/historia";
import { Ventajas } from "@/components/home/ventajas";
import { LlamadoFinal, ParaPacientes } from "@/components/home/cierre";
import { Revelar } from "@/components/home/revelar";

// La home pública (TR-181). Segunda versión, 2026-09-27 — pedido del
// cliente: "le falta animaciones, dibujos agradables, simplicidad; ahora está
// muy cargada, debe ser simple y al pie como el ejemplo" (ulifeon.com).
//
// Cinco partes, y cada una dice UNA cosa:
//   1. qué es, con un dibujo que lo muestra (el escritorio tranquilo);
//   2. la historia de Lucía en tres escenas (el WhatsApp de noche → el link
//      → la calma);
//   3. lo que cambia, en cuatro tarjetas (#como-funciona);
//   4. la entrada para pacientes (#buscar);
//   5. el llamado final.
// Los dibujos son objetos del día del profesional —el mate, el celular, el
// calendario— dibujados en SVG (components/home/dibujos.tsx).
const v = (vars: Record<string, string | number>) => vars as CSSProperties;

const ESCENAS = [
  {
    dibujo: <EscenaNoche className="h-auto w-full" />,
    texto:
      "Lucía es odontóloga. Contesta turnos por WhatsApp al despertarse, entre paciente y paciente, y hasta antes de dormir.",
  },
  {
    dibujo: <EscenaLink className="h-auto w-full" />,
    texto: "Un día armó su agenda en PRISMA y les compartió el link a sus pacientes.",
  },
  {
    dibujo: <EscenaCalma className="h-auto w-full" />,
    texto: "Ahora sacan turno solos. Lucía atiende tranquila, y el celular le avisa cada turno nuevo.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section
        aria-labelledby="home-titulo"
        className="bg-marfil px-6 pb-20 pt-[calc(var(--header-height)+3rem)] sm:px-10 lg:pb-28 lg:pt-[calc(var(--header-height)+4.5rem)]"
      >
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <Revelar className="flex flex-col items-start gap-6">
            <h1
              id="home-titulo"
              className="rv text-balance font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.9] tracking-tight text-grafito sm:text-7xl"
            >
              Atendé pacientes,
              <span className="block text-salvia-oscuro">no el WhatsApp.</span>
            </h1>
            <p className="rv max-w-md text-lg leading-relaxed text-grafito/75" style={v({ "--i": 1 })}>
              Tus pacientes sacan turno solos desde tu página. Vos atendés, y te avisamos cada turno nuevo.
            </p>
            <div className="rv flex flex-wrap items-center gap-x-6 gap-y-3" style={v({ "--i": 2 })}>
              <Link
                href="/sumarse"
                className="rounded-full bg-salvia-oscuro px-9 py-4 text-sm font-bold uppercase tracking-wider text-marfil transition hover:brightness-110"
              >
                Sumate gratis
              </Link>
              <Link href="/buscar" className="text-sm font-semibold text-grafito/70 underline-offset-4 transition hover:text-grafito hover:underline">
                Busco turno como paciente
              </Link>
            </div>
          </Revelar>
          <Revelar orden={1}>
            <EscenaEscritorio className="rv rv--escala h-auto w-full" />
          </Revelar>
        </div>
      </section>

      <section className="home-fondo px-6 py-20 sm:px-10 sm:py-24">
        <Revelar className="rv mx-auto max-w-4xl rounded-[28px] border-[0.5px] border-arena bg-marfil px-6 py-10 shadow-soft sm:px-12 sm:py-14">
          <Historia escenas={ESCENAS} />
        </Revelar>
      </section>

      <Ventajas />
      <ParaPacientes />
      <LlamadoFinal />
    </main>
  );
}
