import type { CSSProperties } from "react";
import Link from "next/link";
import "./home.css";
import { AgendaViva } from "@/components/home/agenda-viva";
import { DiaEnMensajes } from "@/components/home/dia-en-mensajes";
import { DelChatALaAgenda } from "@/components/home/del-chat-a-la-agenda";
import { Funciones } from "@/components/home/funciones";
import { Confianza, LlamadoFinal, ParaPacientes, Pasos } from "@/components/home/cierre";
import { Revelar } from "@/components/home/revelar";

// La home pública — rediseño del 2026-09-26 (pedido del cliente, con
// ulifeon.com como referencia: "atacando el dolor del profesional, con
// animaciones bien pulidas, que demuestre el carácter de nuestra app y sus
// funcionalidades; una buena presentación vende el producto").
//
// Cuenta una historia, en este orden:
//   1. el producto en acción (la agenda que se llena sola);
//   2. el dolor: los mensajes de turnos que llegan a cualquier hora;
//   3. el giro: los mismos pedidos, ahora directo a la agenda;
//   4. qué hace PRISMA (#como-funciona, al que apunta el header);
//   5. cómo se empieza, y cómo se cuida a los pacientes;
//   6. la entrada para pacientes (#buscar, también del header) y el cierre.
//
// Reemplaza a la versión con dos fotos de fondo y tarjetas desplegables
// (T1.1, TR-015). Las ilustraciones son piezas del producto dibujadas con
// HTML, no capturas: se ven nítidas en cualquier pantalla y no hay que
// regenerarlas cuando cambia una pantalla. Las animaciones son CSS
// (app/home.css); ninguna esconde contenido hasta que la página hidrate.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section
        aria-labelledby="home-titulo"
        className="home-oscuro relative overflow-hidden px-6 pb-28 pt-[calc(var(--header-height)+3.5rem)] sm:px-10 lg:pb-36 lg:pt-[calc(var(--header-height)+5rem)]"
      >
        <div className="mx-auto grid max-w-6xl items-center gap-20 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
          <Revelar className="flex flex-col gap-7">
            <p className="rv font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-marfil/60">
              Agenda y página propia para odontólogos
            </p>
            <h1
              id="home-titulo"
              className="text-balance font-[family-name:var(--font-display)] text-[clamp(3.4rem,9vw,7.25rem)] font-black uppercase leading-[0.84] tracking-tight"
            >
              <span className="rv block" style={{ "--i": 1 } as CSSProperties}>
                Atendé pacientes,
              </span>
              <span className="rv block text-terracota" style={{ "--i": 2 } as CSSProperties}>
                no el WhatsApp.
              </span>
            </h1>
            <p className="rv max-w-lg text-lg leading-relaxed text-marfil/75" style={{ "--i": 3 } as CSSProperties}>
              Tus pacientes sacan turno solos desde tu página: eligen el día, el horario libre y confirman con un
              código. Vos te enterás con un aviso en el celular.
            </p>
            <div className="rv flex flex-wrap items-center gap-3" style={{ "--i": 4 } as CSSProperties}>
              <Link
                href="/sumarse"
                className="rounded-full bg-marfil px-9 py-4 text-sm font-bold uppercase tracking-wider text-grafito transition hover:bg-salvia-claro"
              >
                Sumate gratis
              </Link>
              <a
                href="#como-funciona"
                className="rounded-full px-6 py-4 text-sm font-semibold text-marfil/80 ring-1 ring-marfil/25 transition hover:text-marfil hover:ring-marfil/60"
              >
                Ver qué hace
              </a>
            </div>
          </Revelar>

          <div className="lg:pl-6">
            <AgendaViva />
          </div>
        </div>
      </section>

      <DiaEnMensajes />
      <DelChatALaAgenda />
      <Funciones />
      <Pasos />
      <Confianza />
      <ParaPacientes />
      <LlamadoFinal />
    </main>
  );
}
