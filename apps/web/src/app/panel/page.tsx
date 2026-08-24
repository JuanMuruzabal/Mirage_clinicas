import type { Metadata } from "next";
import Link from "next/link";
import { apiResumenPanel } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

export const metadata: Metadata = { title: "General — Dental Mirage" };

// Dashboard General (T2.2, spec §4.2) — vista resumida: turnos pendientes
// (→ Turnos) y turnos próximos (→ Calendario), cada tarjeta clickeable.
// "Turnos próximos" (pedido explícito del cliente, 2026-08-23) — el
// backend ya cuenta solo agendado sin resolver (GET /panel/resumen, ver
// internal/http/turnos.go); la tarjeta antes decía "Agenda" arriba del
// número, ambiguo respecto de qué se estaba contando — ahora dice "Turnos
// próximos" tanto arriba como en el link de abajo.
export default async function PanelGeneralPage() {
  const token = await getSessionToken();
  const resumenResult = token ? await apiResumenPanel(token) : null;
  const resumen = resumenResult?.ok ? resumenResult.data : { turnosPendientes: 0, turnosConfirmados: 0 };

  return (
    <div className="flex flex-col gap-8 p-8">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">General</h1>

      <div className="grid gap-6 sm:grid-cols-2">
        <ResumenCard
          href="/panel/turnos"
          eyebrow="Pedidos entrantes"
          titulo="Turnos pendientes"
          valor={resumen.turnosPendientes}
        />
        <ResumenCard
          href="/panel/calendario"
          eyebrow="Turnos próximos"
          titulo="Ver calendario"
          valor={resumen.turnosConfirmados}
          // "Ok"/confirmado se lee en salvia — el resto de los números del
          // dashboard queda en grafito neutro (TR-013 en docs/tradeoffs.md,
          // "color con significado, no decorativo").
          acento
        />
      </div>
    </div>
  );
}

function ResumenCard({
  href,
  eyebrow,
  titulo,
  valor,
  acento = false,
}: {
  href: string;
  eyebrow: string;
  titulo: string;
  valor: number;
  acento?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-card border-[0.5px] border-arena bg-marfil p-8 shadow-soft transition-colors duration-300 hover:bg-arena"
    >
      <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">{eyebrow}</p>
      <p className={`font-[family-name:var(--font-display)] text-6xl font-medium ${acento ? "text-salvia-oscuro" : "text-grafito"}`}>
        {valor}
      </p>
      <p className="text-sm font-medium text-salvia-oscuro group-hover:text-grafito">{titulo} →</p>
    </Link>
  );
}
