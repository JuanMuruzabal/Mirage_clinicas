import type { CSSProperties } from "react";
import { QuadrantMark } from "@/components/quadrant-mark";
import { IconArrowRight } from "@/components/icons";
import { IconoCampana, IconoCodigo, IconoReloj } from "./iconos-home";
import { Revelar } from "./revelar";

// DelChatALaAgenda — el giro de la historia: los mismos pedidos del día
// anterior siguen llegando, pero ya no al WhatsApp. Cada mensaje de la
// izquierda se apaga y se tacha, y a la derecha aparece lo que pasa con
// PRISMA. Todo lo que se muestra existe en el producto: el paciente saca
// su turno desde la página, una mamá lo saca como tutora (Fase 2.4.2) y
// quien quiere saber a qué hora era lo mira en "Mis turnos".

const PARES = [
  {
    antes: "¡Hola! ¿Tenés un turnito para mañana?",
    cuando: "Jue 15 · 09:30",
    quien: "Lucía Fernández",
    que: "Limpieza",
    como: "Lo sacó ella, desde tu página",
  },
  {
    antes: "Hola, soy la mamá de Tomi. ¿Le sacás un turno?",
    cuando: "Vie 16 · 17:00",
    quien: "Tomás Aguirre",
    que: "Control",
    como: "Lo sacó su mamá, como tutora",
  },
  {
    antes: "¿A qué hora era mi turno?",
    cuando: "Mis turnos",
    quien: "Valentina Ríos",
    que: "lo consultó sola",
    como: "No te escribió",
  },
];

const PUNTOS = [
  {
    Icono: IconoReloj,
    texto: "Eligen el tipo de consulta, el profesional, el día y un horario que de verdad está libre.",
  },
  { Icono: IconoCodigo, texto: "Confirman que son ellos con un código que les llega al mail." },
  { Icono: IconoCampana, texto: "Te llega un aviso al celular, y el turno ya está en tu agenda." },
];

export function DelChatALaAgenda() {
  return (
    <section aria-labelledby="giro-titulo" className="home-calma px-6 py-24 sm:px-10 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Revelar className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <p className="rv font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-salvia-claro/80">
            Hasta que un día
          </p>
          <h2
            id="giro-titulo"
            className="rv text-balance font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.9] tracking-tight sm:text-7xl"
            style={{ "--i": 1 } as CSSProperties}
          >
            Compartiste un link.
          </h2>
          <p className="rv max-w-xl text-lg leading-relaxed text-marfil/80" style={{ "--i": 2 } as CSSProperties}>
            Los mismos pedidos siguen llegando. Pero ya no te buscan a vos: van directo a tu agenda.
          </p>
        </Revelar>

        <Revelar orden={1} className="mt-16 grid gap-4">
          <div className="hidden grid-cols-[1fr_auto_1.25fr] items-center gap-6 px-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-marfil/55 md:grid">
            <span>Antes, en tu WhatsApp</span>
            <span />
            <span>Ahora, en PRISMA</span>
          </div>
          {PARES.map((p, n) => (
            <div
              key={p.quien}
              className="grid items-center gap-3 md:grid-cols-[1fr_auto_1.25fr] md:gap-6"
            >
              <p className="rv--apagar rv relative justify-self-start rounded-[18px] rounded-tl-none bg-marfil/10 px-4 py-3 text-[15px] text-marfil ring-1 ring-marfil/15" style={{ "--i": n * 2 } as CSSProperties}>
                {p.antes}
                <span
                  aria-hidden="true"
                  className="rv rv--tachar absolute left-3 right-3 top-1/2 h-[1.5px] bg-marfil/70"
                  style={{ "--i": n * 2 + 1 } as CSSProperties}
                />
              </p>
              <IconArrowRight className="hidden h-5 w-5 text-salvia-claro/70 md:block" />
              <div
                className="rv rv--izq flex items-center gap-4 rounded-card bg-marfil px-5 py-4 text-grafito shadow-[0_18px_40px_-24px_rgb(0_0_0/0.6)]"
                style={{ "--i": n * 2 + 1 } as CSSProperties}
              >
                <QuadrantMark estado="agendado" className="flex-shrink-0 text-[1.1rem] text-salvia-oscuro" />
                <div className="min-w-0 flex-1">
                  <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em] text-grafito/55">
                    {p.cuando}
                  </p>
                  <p className="truncate font-semibold">
                    {p.quien} <span className="font-normal text-grafito/60">· {p.que}</span>
                  </p>
                </div>
                <span className="hidden flex-shrink-0 rounded-full bg-salvia-claro px-3 py-1 text-xs font-semibold text-salvia-oscuro sm:inline">
                  {p.como}
                </span>
              </div>
            </div>
          ))}
        </Revelar>

        <Revelar como="ul" orden={2} className="mt-16 grid gap-8 border-t border-marfil/15 pt-12 md:grid-cols-3">
          {PUNTOS.map(({ Icono, texto }, n) => (
            <li key={texto} className="rv flex gap-4" style={{ "--i": n } as CSSProperties}>
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center bg-marfil/10 text-salvia-claro ring-1 ring-marfil/15">
                <Icono className="h-5 w-5" />
              </span>
              <p className="text-[15px] leading-relaxed text-marfil/85">{texto}</p>
            </li>
          ))}
        </Revelar>
      </div>
    </section>
  );
}
