"use client";

import { useState } from "react";
import type { BloqueosSeguridad } from "@dental-mirage/shared-types";
import { desbloquearIPAction, desbloquearMailAction, listBloqueosSeguridadAction } from "@/app/actions/seguridad";
import { formatFechaHora } from "@/lib/turno-format";

interface SeguridadBloqueosProps {
  inicial: BloqueosSeguridad;
}

const MOTIVO_LABEL: Record<string, string> = {
  mail_muchos_dnis: "Mismo mail, muchos DNIs distintos",
  ip_rotacion: "Rotación de mail y DNI desde la misma IP",
  dni_tipo_tope: "Tope de turnos sin verificar por DNI",
};

// SeguridadBloqueos — corrección de seguridad (Fase 2.4.1), pedido
// textual del cliente: "el apartado de auditoría de turnos de bloqueos,
// donde muestre los mails bloqueados etc, por las dudas de algún
// malentendido". Tres secciones: mails/IPs bloqueados ahora mismo (con
// botón para desbloquear, por si fue un falso positivo) y la auditoría
// completa (qué se borró y por qué — los turnos en sí no vuelven, esto
// es solo para entender qué pasó).
export function SeguridadBloqueos({ inicial }: SeguridadBloqueosProps) {
  const [datos, setDatos] = useState(inicial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function recargar() {
    listBloqueosSeguridadAction().then(setDatos);
  }

  async function desbloquearMail(id: string) {
    setError(null);
    setPendingId(id);
    const result = await desbloquearMailAction(id);
    setPendingId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    recargar();
  }

  async function desbloquearIP(id: string) {
    setError(null);
    setPendingId(id);
    const result = await desbloquearIPAction(id);
    setPendingId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    recargar();
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="rounded-card border-[0.5px] border-terracota bg-terracota-claro px-4 py-3 text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Mails bloqueados</h2>
        {datos.mailsBloqueados.length === 0 ? (
          <p className="text-sm text-grafito/60">No hay ningún mail bloqueado en este momento.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-[0.5px] border-arena text-xs font-semibold uppercase tracking-wide text-grafito/60">
                  <th className="px-4 py-3">Mail</th>
                  <th className="px-4 py-3">Bloqueado hasta</th>
                  <th className="px-4 py-3" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {datos.mailsBloqueados.map((m) => (
                  <tr key={m.id} className="border-b-[0.5px] border-arena last:border-b-0">
                    <td className="px-4 py-3 text-grafito">{m.email}</td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito/70">{formatFechaHora(m.bloqueadoHasta)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => desbloquearMail(m.id)}
                        disabled={pendingId === m.id}
                        className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro disabled:opacity-60"
                      >
                        {pendingId === m.id ? "Desbloqueando…" : "Desbloquear"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">IPs bloqueadas</h2>
        {datos.ipsBloqueadas.length === 0 ? (
          <p className="text-sm text-grafito/60">No hay ninguna IP bloqueada en este momento.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-[0.5px] border-arena text-xs font-semibold uppercase tracking-wide text-grafito/60">
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Bloqueada hasta</th>
                  <th className="px-4 py-3" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {datos.ipsBloqueadas.map((ipRow) => (
                  <tr key={ipRow.id} className="border-b-[0.5px] border-arena last:border-b-0">
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{ipRow.ip}</td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito/70">{formatFechaHora(ipRow.bloqueadoHasta)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => desbloquearIP(ipRow.id)}
                        disabled={pendingId === ipRow.id}
                        className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro disabled:opacity-60"
                      >
                        {pendingId === ipRow.id ? "Desbloqueando…" : "Desbloquear"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Auditoría</h2>
        <p className="text-sm text-grafito/60">
          Turnos borrados automáticamente por un patrón de abuso detectado — no se pueden recuperar, esto es solo un registro de qué pasó.
          Una fila marcada <span className="font-semibold text-grafito">Simulado</span> no bloqueó ni borró nada de verdad — es el modo de
          prueba en desarrollo local.
        </p>
        {datos.auditoria.length === 0 ? (
          <p className="text-sm text-grafito/60">Todavía no se registró ningún bloqueo.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-[0.5px] border-arena text-xs font-semibold uppercase tracking-wide text-grafito/60">
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3">Mail / IP</th>
                  <th className="px-4 py-3">DNIs</th>
                  <th className="px-4 py-3">Turnos borrados</th>
                  <th className="px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {datos.auditoria.map((a) => (
                  <tr key={a.id} className="border-b-[0.5px] border-arena last:border-b-0">
                    <td className="px-4 py-3 text-grafito">
                      <div className="flex items-center gap-2">
                        <span>{MOTIVO_LABEL[a.motivo] ?? a.motivo}</span>
                        {a.simulado && (
                          <span className="rounded-full border-[0.5px] border-salvia bg-salvia-claro px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-salvia-oscuro">
                            Simulado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-grafito/70">
                      {a.email && <div>{a.email}</div>}
                      {a.ip && <div className="font-[family-name:var(--font-mono)]">{a.ip}</div>}
                    </td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-xs text-grafito/70">{a.dnis || "—"}</td>
                    <td className="px-4 py-3 text-grafito">{a.turnosBorrados}</td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito/70">{formatFechaHora(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
