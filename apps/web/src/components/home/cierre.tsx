import Link from "next/link";
import type { CSSProperties } from "react";
import { DibujoTranquila } from "./dibujos";
import { Revelar } from "./revelar";

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

// La entrada para pacientes: el destino de "Buscar clínicas" del header
// (#buscar). Una frase y un botón.
export function ParaPacientes() {
  return (
    <section id="buscar" aria-labelledby="pacientes-titulo" className="home-fondo px-6 py-16 sm:px-10">
      <Revelar className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
        <div className="rv flex flex-col gap-1">
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-acero-oscuro">
            ¿Sos paciente?
          </p>
          <h2
            id="pacientes-titulo"
            className="text-balance font-[family-name:var(--font-display)] text-3xl font-black uppercase tracking-tight text-grafito sm:text-4xl"
          >
            Encontrá tu clínica y sacá turno sin llamar.
          </h2>
        </div>
        <Link
          href="/buscar"
          className="rv flex-shrink-0 rounded-full bg-acero-oscuro px-8 py-4 text-sm font-bold uppercase tracking-wider text-marfil transition hover:brightness-110"
          style={v({ "--i": 1 })}
        >
          Buscar clínicas
        </Link>
      </Revelar>
    </section>
  );
}

// El cierre: el mate de nuevo, caliente, y el llamado.
export function LlamadoFinal() {
  return (
    <section aria-labelledby="final-titulo" className="bg-marfil px-6 py-24 sm:px-10 sm:py-28">
      <Revelar className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <DibujoTranquila className="rv rv--escala h-40 w-auto" />
        <h2
          id="final-titulo"
          className="rv text-balance font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.95] tracking-tight text-grafito sm:text-6xl"
          style={v({ "--i": 1 })}
        >
          Tu próximo turno, que lo saque tu paciente.
        </h2>
        <div className="rv flex flex-wrap items-center justify-center gap-3" style={v({ "--i": 2 })}>
          <Link
            href="/sumarse"
            className="rounded-full bg-salvia-oscuro px-9 py-4 text-sm font-bold uppercase tracking-wider text-marfil transition hover:brightness-110"
          >
            Sumate gratis
          </Link>
          <Link href="/ingresar" className="px-4 py-4 text-sm font-semibold text-grafito/70 transition hover:text-grafito">
            Ya tengo cuenta
          </Link>
        </div>
      </Revelar>
    </section>
  );
}
