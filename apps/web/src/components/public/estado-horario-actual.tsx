"use client";

import { useAhora } from "@/lib/reloj";
import type { HorariosClinicaVista } from "@dental-mirage/prisma-engine";

const RELOJ_CORDOBA = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Argentina/Cordoba",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DIA_NUMERO: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function estaAbierto(horarios: HorariosClinicaVista, instante: number): boolean {
  const partes = RELOJ_CORDOBA.formatToParts(instante);
  const diaSemana = DIA_NUMERO[partes.find((p) => p.type === "weekday")?.value ?? ""];
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  const minutosActuales = hora * 60 + minuto;
  const dia = horarios.dias.find((d) => d.diaSemana === diaSemana);
  return !!dia && !dia.cerrado && dia.franjas.some((f) => {
    const [desdeH, desdeM] = f.desde.split(":").map(Number);
    const [hastaH, hastaM] = f.hasta.split(":").map(Number);
    return minutosActuales >= desdeH * 60 + desdeM && minutosActuales < hastaH * 60 + hastaM;
  });
}

export function EstadoHorarioActual({ horarios }: { horarios: HorariosClinicaVista }) {
  const ahora = useAhora(30_000);
  const abierto = ahora === null ? horarios.abiertoAhora : estaAbierto(horarios, ahora);
  return (
    <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${abierto ? "bg-[var(--pp-acento-suave,var(--color-salvia-claro))] text-[var(--pp-acento-texto,var(--color-grafito))]" : "border border-(--pp-borde) text-(--pp-texto)"}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${abierto ? "bg-[var(--pp-acento,var(--color-salvia))]" : "bg-(--pp-borde)"}`} />
      {abierto ? "Abierto ahora" : "Cerrado ahora"}
    </p>
  );
}
