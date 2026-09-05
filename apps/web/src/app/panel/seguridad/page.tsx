import type { Metadata } from "next";
import { apiListBloqueosSeguridad } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { SeguridadBloqueos } from "@/components/panel/seguridad-bloqueos";

export const metadata: Metadata = { title: "Seguridad — Dental Mirage" };

// /panel/seguridad (corrección de seguridad, Fase 2.4.1) — pedido
// textual del cliente: "el apartado de auditoría de turnos de bloqueos,
// donde muestre los mails bloqueados etc, por las dudas de algún
// malentendido". Uso ocasional, no un flujo diario — página propia fuera
// de la navegación principal, junto a Tu página/Tu perfil en el sidebar.
export default async function SeguridadPage() {
  const token = await getSessionToken();
  const result = token ? await apiListBloqueosSeguridad(token) : null;
  const bloqueos = result?.ok ? result.data : { mailsBloqueados: [], ipsBloqueadas: [], auditoria: [] };

  return (
    <div className="flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]">
          Seguridad
        </h1>
        <p className="mt-1 text-sm text-grafito/60">
          Mails e IPs que el sistema bloqueó solo por un patrón de abuso en el formulario público de turnos, y el registro de qué se
          borró en cada caso.
        </p>
      </div>
      <SeguridadBloqueos inicial={bloqueos} />
    </div>
  );
}
