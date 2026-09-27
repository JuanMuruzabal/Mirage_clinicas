import type { CSSProperties, ReactNode } from "react";
import { QuadrantMark } from "@/components/quadrant-mark";
import { IconCheck } from "@/components/icons";
import { IconoCampana } from "./iconos-home";
import { Revelar } from "./revelar";

// Funciones — lo que PRISMA hace, en seis paneles. Cada uno trae una
// ilustración que se mueve mientras se la mira (`.lp-*` en app/home.css):
// no son capturas del producto sino su idea, dibujada con las mismas
// piezas (el bloque de turno con la marca de cuadrante, la campana, el
// botón de Publicar). Todo lo que se promete acá existe en el producto.

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

function Panel({
  orden,
  titulo,
  children,
  ilustracion,
}: {
  orden: number;
  titulo: string;
  children: ReactNode;
  ilustracion: ReactNode;
}) {
  return (
    <Revelar
      como="article"
      orden={orden % 3}
      className="rv flex flex-col overflow-hidden rounded-card border-[0.5px] border-arena bg-marfil shadow-soft"
    >
      <div
        aria-hidden="true"
        className="relative flex h-48 items-center justify-center overflow-hidden border-b-[0.5px] border-arena bg-hueso bg-[url('/textures/soft-cross.svg')] px-6"
      >
        {ilustracion}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-6">
        <h3 className="font-[family-name:var(--font-display)] text-2xl font-black uppercase leading-none tracking-tight text-grafito">
          {titulo}
        </h3>
        <p className="text-[15px] leading-relaxed text-grafito/75">{children}</p>
      </div>
    </Revelar>
  );
}

function PasosDelWizard() {
  const pasos = ["Tipo", "Profesional", "Día", "Horario"];
  return (
    <div className="flex w-full max-w-[19rem] flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between gap-1.5">
        {pasos.map((p, n) => (
          <span
            key={p}
            className="lp-paso flex-1 rounded-full border border-linea bg-marfil py-1.5 text-center text-[11px] font-semibold text-grafito"
            style={v({ "--i": n })}
          >
            {p}
          </span>
        ))}
      </div>
      <div className="flex w-full items-center gap-2 rounded-field border border-linea bg-marfil px-3 py-2 text-[12px] text-grafito/70">
        <span className="font-[family-name:var(--font-mono)] text-salvia-oscuro">10:30</span>
        <span className="h-3 w-px bg-arena" />
        <span className="truncate">Limpieza con la Dra. Ferrer</span>
      </div>
    </div>
  );
}

function AgendaSinChoques() {
  return (
    <div className="relative w-full max-w-[17rem]">
      {["10:00", "10:30", "11:00"].map((h, n) => (
        <div key={h} className="flex h-[46px] items-start gap-3" style={{ opacity: n === 2 ? 0.6 : 1 }}>
          <span className="w-10 pt-0.5 font-[family-name:var(--font-mono)] text-[11px] text-grafito/45">{h}</span>
          <span className="mt-2 h-px flex-1 bg-arena" />
        </div>
      ))}
      <div className="absolute left-[3.25rem] right-0 top-[4px] flex h-[38px] items-center gap-2 rounded-field border border-salvia/40 bg-salvia-claro px-3 text-[12px] font-semibold text-salvia-oscuro">
        <QuadrantMark estado="agendado" className="text-[0.7rem]" />
        Lucía · Limpieza
      </div>
      <div className="lp-choque absolute left-[3.25rem] right-0 top-[4px] flex h-[38px] items-center gap-2 rounded-field border border-acero/40 bg-acero-claro px-3 text-[12px] font-semibold text-acero-oscuro shadow-soft">
        <QuadrantMark estado="agendado" className="text-[0.7rem]" />
        Martín · Consulta general
      </div>
      <span className="lp-choque-aviso absolute -top-3 right-0 rounded-full bg-terracota-oscuro px-2.5 py-1 text-[10.5px] font-semibold text-marfil">
        10:00 ya está ocupado
      </span>
    </div>
  );
}

function PaginaPropia() {
  return (
    <div className="flex items-end gap-4">
      <div className="w-[12.5rem] overflow-hidden rounded-[12px] border border-linea bg-marfil shadow-soft">
        <div className="flex gap-1 border-b border-linea px-2.5 py-2">
          {[0, 1, 2].map((n) => (
            <span key={n} className="h-1.5 w-1.5 rounded-full bg-arena" />
          ))}
        </div>
        <div className="lp-portada flex h-16 items-end bg-salvia-oscuro px-3 pb-2">
          <span className="font-[family-name:var(--font-display)] text-sm font-black uppercase tracking-tight text-marfil">
            Clínica Ferrer
          </span>
        </div>
        <div className="flex flex-col gap-1.5 p-3">
          <span className="h-1.5 w-4/5 rounded-full bg-arena" />
          <span className="h-1.5 w-3/5 rounded-full bg-arena" />
          <span className="mt-1 self-start rounded-full bg-grafito px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wider text-marfil">
            Pedir turno
          </span>
        </div>
      </div>
      <span className="lp-publicar mb-1 rounded-full bg-salvia-oscuro px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-marfil">
        Publicar
      </span>
    </div>
  );
}

function LinkCompartido() {
  return (
    <div className="flex w-full max-w-[18rem] flex-col gap-3">
      <div className="lp-link self-start rounded-full border border-linea bg-marfil px-3 py-1.5 font-[family-name:var(--font-mono)] text-[11px] text-acero-oscuro shadow-soft">
        prisma/clinica-ferrer?enlace=…
      </div>
      {/* La animación va en la burbuja entera: en el texto solo, la burbuja
          verde quedaba vacía mientras él aparecía. */}
      <div className="lp-recibido flex items-center gap-1.5 self-end rounded-[16px] rounded-tr-none bg-salvia-claro px-3 py-2 text-[12px] font-semibold text-salvia-oscuro">
        <IconCheck className="h-3.5 w-3.5" />
        Turno reservado
      </div>
      <p className="font-[family-name:var(--font-mono)] text-[10.5px] uppercase tracking-[0.14em] text-grafito/50">
        Vence en 1 hora · para vos o tu familia
      </p>
    </div>
  );
}

function Equipo() {
  const columnas = [
    { nombre: "Dra. Ferrer", bloques: [0, 2] },
    { nombre: "Dr. Paz", bloques: [1] },
    { nombre: "Dra. Soto", bloques: [0, 1] },
  ];
  return (
    <div className="relative grid w-full max-w-[17rem] grid-cols-3 gap-2">
      {columnas.map((c) => (
        <div key={c.nombre} className="flex flex-col gap-1.5">
          <span className="truncate text-center font-[family-name:var(--font-mono)] text-[9.5px] uppercase tracking-wider text-grafito/55">
            {c.nombre}
          </span>
          {[0, 1, 2].map((fila) => (
            <span
              key={fila}
              className={`h-6 rounded-[6px] ${
                c.bloques.includes(fila) ? "border border-salvia/40 bg-salvia-claro" : "border border-dashed border-arena"
              }`}
            />
          ))}
        </div>
      ))}
      {/* La mirada de recepción: recorre las tres agendas. */}
      <span className="pointer-events-none absolute -bottom-1 -top-1 left-0 w-1/3 pr-1.5">
        <span className="lp-foco block h-full w-full rounded-[8px] ring-2 ring-acero-oscuro/70" />
      </span>
      <span className="absolute -bottom-7 left-0 font-[family-name:var(--font-mono)] text-[9.5px] uppercase tracking-wider text-acero-oscuro">
        Recepción ve las tres
      </span>
    </div>
  );
}

function AvisoAlCelular() {
  return (
    <div className="flex w-full max-w-[18rem] flex-col items-end gap-3">
      <span className="lp-campana relative flex h-11 w-11 items-center justify-center rounded-full bg-marfil text-grafito shadow-soft">
        <IconoCampana className="h-5 w-5" />
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-terracota-oscuro px-1 font-[family-name:var(--font-mono)] text-[10px] font-semibold text-marfil ring-2 ring-hueso">
          3
        </span>
      </span>
      <div className="lp-push flex w-full items-start gap-2.5 rounded-[14px] border border-linea bg-marfil p-2.5 shadow-soft">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] bg-acero-oscuro text-marfil">
          <IconoCampana className="h-4 w-4" />
        </span>
        <span className="min-w-0 text-[11.5px] leading-snug text-grafito">
          <span className="block font-semibold">Turno nuevo · vie 16/10 10:30</span>
          <span className="block truncate text-grafito/60">Lucía Fernández · Limpieza</span>
        </span>
      </div>
    </div>
  );
}

export function Funciones() {
  return (
    <section id="como-funciona" aria-labelledby="funciones-titulo" className="bg-marfil px-6 py-24 sm:px-10 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Revelar className="mb-14 flex max-w-3xl flex-col gap-4">
          <p className="rv font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-salvia-oscuro">
            Qué hace PRISMA
          </p>
          <h2
            id="funciones-titulo"
            className="rv text-balance font-[family-name:var(--font-display)] text-5xl font-black uppercase leading-[0.9] tracking-tight text-grafito sm:text-6xl"
            style={v({ "--i": 1 })}
          >
            Todo lo que pasa mientras vos atendés.
          </h2>
        </Revelar>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Panel orden={0} titulo="Turnos que se piden solos" ilustracion={<PasosDelWizard />}>
            Tu paciente elige el tipo de consulta, con quién, el día y un horario que de verdad está libre. Sin
            llamarte ni escribirte.
          </Panel>
          <Panel orden={1} titulo="Nunca dos a la misma hora" ilustracion={<AgendaSinChoques />}>
            La agenda no deja pisar un turno con otro, ni siquiera si atendés en dos consultorios. Lo controla el
            sistema, no la memoria de nadie.
          </Panel>
          <Panel orden={2} titulo="Tu página, con tu cara" ilustracion={<PaginaPropia />}>
            Elegí un estilo, subí tus fotos y publicala. Aparecés en el buscador de clínicas y tus pacientes piden
            turno desde ahí.
          </Panel>
          <Panel orden={3} titulo="Un link para quien te escribe" ilustracion={<LinkCompartido />}>
            ¿Te escribieron igual? Mandales un link que vence en una hora y reservan ellos, para sí o para alguien de
            su familia.
          </Panel>
          <Panel orden={4} titulo="Todo el equipo, cada uno con lo suyo" ilustracion={<Equipo />}>
            Cada profesional ve su agenda y sus pacientes. Recepción ve la de todos y carga turnos donde haga falta.
          </Panel>
          <Panel orden={5} titulo="Te enterás en el momento" ilustracion={<AvisoAlCelular />}>
            Cada turno nuevo te avisa en la campana y en el celular, aunque tengas PRISMA cerrado.
          </Panel>
        </div>
      </div>
    </section>
  );
}
