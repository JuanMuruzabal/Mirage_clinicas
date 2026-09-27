import Link from "next/link";
import type { CSSProperties } from "react";
import { QuadrantMark } from "@/components/quadrant-mark";
import { IconLock } from "@/components/icons";
import { IconoCodigo, IconoEquipo, IconoEscudo } from "./iconos-home";
import { Revelar } from "./revelar";

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

// Los números van porque son una secuencia de verdad: primero la cuenta,
// después la agenda, después la página.
const PASOS = [
  { titulo: "Creá tu cuenta", texto: "Con tu mail o con Google. Sin tarjeta." },
  { titulo: "Armá tu agenda", texto: "Tus horarios de atención, tus tipos de consulta y cuánto dura cada uno." },
  { titulo: "Publicá y compartí", texto: "Tu página queda online y el link, listo para pegar donde te escriben." },
];

export function Pasos() {
  return (
    <section aria-labelledby="pasos-titulo" className="home-claro px-6 py-24 sm:px-10 sm:py-28">
      <Revelar className="mx-auto max-w-6xl">
        <p className="rv font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-salvia-oscuro">
          Empezar
        </p>
        <h2
          id="pasos-titulo"
          className="rv mt-4 max-w-3xl text-balance font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.9] tracking-tight text-grafito sm:text-6xl"
          style={v({ "--i": 1 })}
        >
          Tres pasos y la agenda se llena sola.
        </h2>
        <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          <span
            aria-hidden="true"
            className="rv rv--linea-h absolute left-0 right-0 top-7 hidden h-px bg-grafito/20 md:block"
            style={v({ "--i": 2 })}
          />
          {PASOS.map((p, n) => (
            <li key={p.titulo} className="rv relative flex flex-col gap-3" style={v({ "--i": n + 2 })}>
              <span className="relative flex h-14 w-14 items-center justify-center bg-grafito font-[family-name:var(--font-display)] text-3xl font-black text-marfil">
                {n + 1}
              </span>
              <h3 className="font-[family-name:var(--font-display)] text-2xl font-black uppercase tracking-tight text-grafito">
                {p.titulo}
              </h3>
              <p className="max-w-xs text-[15px] leading-relaxed text-grafito/75">{p.texto}</p>
            </li>
          ))}
        </ol>
      </Revelar>
    </section>
  );
}

const CUIDADOS = [
  { Icono: IconoCodigo, texto: "Cada paciente confirma su mail con un código antes de reservar." },
  { Icono: IconoEscudo, texto: "Si alguien usa el DNI de otra persona, te avisamos y lo resolvés vos." },
  { Icono: IconoEquipo, texto: "Cada profesional ve solo lo suyo. La ficha de un paciente ajeno ni aparece." },
  { Icono: IconLock, texto: "Las contraseñas se guardan cifradas y las sesiones vencen solas." },
];

export function Confianza() {
  return (
    <section aria-labelledby="confianza-titulo" className="home-oscuro px-6 py-24 sm:px-10 sm:py-28">
      <Revelar className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="flex flex-col gap-4">
          <p className="rv font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-marfil/55">
            Seguridad
          </p>
          <h2
            id="confianza-titulo"
            className="rv text-balance font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.9] tracking-tight sm:text-6xl"
            style={v({ "--i": 1 })}
          >
            Tus pacientes, cuidados.
          </h2>
          <p className="rv max-w-md text-lg leading-relaxed text-marfil/75" style={v({ "--i": 2 })}>
            Una agenda que se llena sola tiene que saber quién está del otro lado.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {CUIDADOS.map(({ Icono, texto }, n) => (
            <li
              key={texto}
              className="rv flex flex-col gap-4 border border-marfil/15 bg-marfil/[0.04] p-6"
              style={v({ "--i": n + 2 })}
            >
              <Icono className="h-6 w-6 text-salvia-claro" />
              <p className="text-[15px] leading-relaxed text-marfil/85">{texto}</p>
            </li>
          ))}
        </ul>
      </Revelar>
    </section>
  );
}

export function ParaPacientes() {
  return (
    <section id="buscar" aria-labelledby="pacientes-titulo" className="bg-marfil px-6 py-20 sm:px-10">
      <Revelar className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-10 rounded-card border-[0.5px] border-arena bg-hueso bg-[url('/textures/soft-cross.svg')] p-8 sm:p-12 lg:flex-row lg:items-center">
        <div className="flex max-w-xl flex-col gap-4">
          <p className="rv font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-acero-oscuro">
            ¿Sos paciente?
          </p>
          <h2
            id="pacientes-titulo"
            className="rv text-balance font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.9] tracking-tight text-grafito sm:text-5xl"
            style={v({ "--i": 1 })}
          >
            Encontrá tu clínica y sacá turno sin llamar.
          </h2>
          <p className="rv text-base text-grafito/75" style={v({ "--i": 2 })}>
            Buscá por nombre, profesional, especialidad o ciudad.
          </p>
        </div>
        <Link
          href="/buscar"
          className="rv flex-shrink-0 rounded-full bg-acero-oscuro px-9 py-4 text-sm font-bold uppercase tracking-wider text-marfil transition hover:brightness-110"
          style={v({ "--i": 3 })}
        >
          Buscar clínicas
        </Link>
      </Revelar>
    </section>
  );
}

export function LlamadoFinal() {
  return (
    <section aria-labelledby="final-titulo" className="home-oscuro relative overflow-hidden px-6 py-28 sm:px-10 sm:py-36">
      {/* La marca de cuadrante, enorme y apenas visible: la firma de la
          página, al final. */}
      {/* En su propia caja: QuadrantMark se declara `relative`, y eso le
          ganaba al `absolute` —quedaba en el flujo, como cuatro cajas—. */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-20 -top-16 text-marfil/[0.05]">
        <QuadrantMark className="text-[24rem]" />
      </span>
      <Revelar className="relative mx-auto flex max-w-4xl flex-col items-center gap-8 text-center">
        <h2
          id="final-titulo"
          className="rv text-balance font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.88] tracking-tight sm:text-7xl"
        >
          Tu próximo turno,
          <span className="block text-salvia-claro">que lo saque tu paciente.</span>
        </h2>
        <div className="rv flex flex-wrap items-center justify-center gap-4" style={v({ "--i": 1 })}>
          <Link
            href="/sumarse"
            className="rounded-full bg-marfil px-9 py-4 text-sm font-bold uppercase tracking-wider text-grafito transition hover:bg-salvia-claro"
          >
            Sumate gratis
          </Link>
          <Link href="/ingresar" className="px-4 py-4 text-sm font-semibold text-marfil/80 transition hover:text-marfil">
            Ya tengo cuenta
          </Link>
        </div>
      </Revelar>
    </section>
  );
}
