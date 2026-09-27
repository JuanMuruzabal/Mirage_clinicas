import type { CSSProperties } from "react";
import { Revelar } from "./revelar";

// DiaEnMensajes — el dolor, contado como lo vive el profesional: los
// mensajes de turnos que le llegan en un día, a cualquier hora, y dónde lo
// agarró cada uno. Es la sección que tiene que hacer decir "ese soy yo".
//
// Los mensajes son contenido (una lista que se lee), no una imagen: van
// en un <ol> y los lee un lector de pantalla. Entran en orden con la línea
// del día, y el contador sube con ellos.

export interface MensajeDelDia {
  hora: string;
  momento: string;
  texto: string;
}

export const MENSAJES_DEL_DIA: MensajeDelDia[] = [
  { hora: "07:12", momento: "desayunando", texto: "¡Hola! ¿Tenés un turnito para mañana?" },
  { hora: "08:05", momento: "manejando", texto: "Doc, ¿me pasás lo del jueves al viernes?" },
  { hora: "10:47", momento: "entre dos pacientes", texto: "¿Cuánto sale una limpieza?" },
  { hora: "13:20", momento: "almorzando", texto: "Perdón, hoy no llego al turno." },
  { hora: "16:55", momento: "con un paciente en el sillón", texto: "¿A qué hora era mi turno?" },
  { hora: "21:38", momento: "cenando", texto: "Perdón la hora, ¿mañana a las 10 puede ser?" },
  { hora: "23:04", momento: "ya en la cama", texto: "Hola, soy la mamá de Tomi. ¿Le sacás un turno?" },
];

export function DiaEnMensajes() {
  const total = MENSAJES_DEL_DIA.length;
  return (
    <section aria-labelledby="dolor-titulo" className="home-claro px-6 py-24 sm:px-10 sm:py-32">
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <Revelar className="flex flex-col gap-6 self-start lg:sticky lg:top-[calc(var(--header-height)+3rem)]">
          <p className="rv font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-terracota-oscuro">
            Un día cualquiera en el consultorio
          </p>
          <h2
            id="dolor-titulo"
            className="rv text-balance font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.9] tracking-tight text-grafito sm:text-6xl"
            style={{ "--i": 1 } as CSSProperties}
          >
            Tu consultorio cierra a las 20.
            <span className="block text-terracota-oscuro">Tu WhatsApp, nunca.</span>
          </h2>
          <p className="rv max-w-md text-lg leading-relaxed text-grafito/75" style={{ "--i": 2 } as CSSProperties}>
            Agendás, cambiás, recordás y confirmás. Entre paciente y paciente, en el auto, después de cenar. Y el turno
            queda anotado en un chat, en un cuaderno o en ningún lado.
          </p>
          <div
            className="rv flex items-center gap-5 self-start rounded-card border-[0.5px] border-arena bg-marfil px-6 py-5 shadow-soft"
            style={{ "--i": 3 } as CSSProperties}
          >
            <span
              aria-hidden="true"
              className="home-contador font-[family-name:var(--font-display)] text-6xl font-black leading-none text-terracota-oscuro tabular-nums"
              style={{ "--home-contador-final": total } as CSSProperties}
            />
            <p className="text-sm leading-snug text-grafito/75">
              <span className="sr-only">{total} </span>
              mensajes de turnos antes de dormir.
              <span className="block font-semibold text-grafito">Ninguno quedó en tu agenda.</span>
            </p>
          </div>
        </Revelar>

        <Revelar como="ol" orden={1} className="relative flex flex-col gap-5 pl-8">
          {/* La línea del día: baja con los mensajes. */}
          <span aria-hidden="true" className="rv rv--linea absolute bottom-2 left-[5px] top-2 w-px bg-grafito/20" />
          {MENSAJES_DEL_DIA.map((m, n) => (
            <li key={m.hora} className="rv rv--der relative" style={{ "--i": n + 1 } as CSSProperties}>
              <span
                aria-hidden="true"
                className="absolute -left-8 top-1.5 h-[11px] w-[11px] border-2 border-hueso bg-terracota-oscuro"
              />
              <p className="mb-1.5 font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.12em] text-grafito/55">
                <time>{m.hora}</time> · {m.momento}
              </p>
              <p className="relative inline-block max-w-[34rem] rounded-[18px] rounded-tl-none border-[0.5px] border-arena bg-marfil px-4 py-3 text-[15px] leading-snug text-grafito shadow-soft">
                {m.texto}
                <span className="ml-3 inline-flex translate-y-[-1px] items-center gap-1 whitespace-nowrap align-middle font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider text-terracota-oscuro">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-terracota" />
                  sin responder
                </span>
              </p>
            </li>
          ))}
        </Revelar>
      </div>
    </section>
  );
}
