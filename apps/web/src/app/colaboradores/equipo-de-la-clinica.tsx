"use client";

import { useState, useTransition } from "react";
import type { Equipo, InvitacionPendiente, MiembroDelEquipo } from "@dental-mirage/shared-types";
import {
  cancelarInvitacionAction,
  quitarColaboradorAction,
  reenviarInvitacionAction,
} from "@/app/actions/equipo";
import { IconUserPlus } from "@/components/icons";
import { InvitarColaboradorModal } from "./invitar-colaborador-modal";

const ETIQUETA_ROL: Record<string, string> = {
  owner: "Titular",
  admin: "Administrador de página",
  profesional: "Profesional",
  recepcion: "Recepción",
};

// El equipo de la clínica — Fase 3.2.4, mockup `colaboradores.html`.
//
// El orden lo pide el brief: "primero el creador, luego recepcionistas, y
// al final las tarjetas de los colegas". No es estético — es el orden en
// que alguien busca a una persona cuando entra a esta pantalla: primero
// se ubica a sí mismo, después a quien atiende el teléfono, después al
// resto.
export function EquipoDeLaClinica({ equipo }: { equipo: Equipo }) {
  const [invitando, setInvitando] = useState(false);

  const titular = equipo.miembros.find((m) => m.esTitular);
  const recepcion = equipo.miembros.filter((m) => !m.esTitular && m.roles.includes("recepcion"));
  const profesionales = equipo.miembros.filter((m) => !m.esTitular && !m.roles.includes("recepcion"));

  return (
    <div className="flex flex-col gap-10">
      {equipo.puedeInvitar && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setInvitando(true)}
            className="flex items-center gap-2 rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95"
          >
            <IconUserPlus className="h-[18px] w-[18px]" />
            Invitar colaborador
          </button>
        </div>
      )}

      {titular && (
        <Seccion titulo="Titular">
          <TarjetaMiembro miembro={titular} puedeQuitar={false} />
        </Seccion>
      )}

      <Seccion titulo="Recepción" cuantos={recepcion.length}>
        {recepcion.length === 0 ? (
          <Vacio>Todavía no hay nadie en recepción.</Vacio>
        ) : (
          recepcion.map((m) => <TarjetaMiembro key={m.userId} miembro={m} puedeQuitar={equipo.puedeInvitar} />)
        )}
      </Seccion>

      <Seccion titulo="Profesionales" cuantos={profesionales.length}>
        {profesionales.length === 0 ? (
          <Vacio>Todavía no hay otros profesionales en la clínica.</Vacio>
        ) : (
          profesionales.map((m) => <TarjetaMiembro key={m.userId} miembro={m} puedeQuitar={equipo.puedeInvitar} />)
        )}
      </Seccion>

      {equipo.pendientes.length > 0 && (
        <Seccion titulo="Invitaciones pendientes" cuantos={equipo.pendientes.length}>
          {equipo.pendientes.map((inv) => (
            <TarjetaPendiente key={inv.id} invitacion={inv} puedeGestionar={equipo.puedeInvitar} />
          ))}
        </Seccion>
      )}

      {invitando && <InvitarColaboradorModal onCerrar={() => setInvitando(false)} />}
    </div>
  );
}

function Seccion({ titulo, cuantos, children }: { titulo: string; cuantos?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">{titulo}</h2>
        {cuantos !== undefined && (
          <span className="text-sm text-grafito/50">{cuantos === 1 ? "1 persona" : `${cuantos} personas`}</span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-card border-[0.5px] border-dashed border-arena px-5 py-6 text-sm text-grafito/60 sm:col-span-2">
      {children}
    </p>
  );
}

function iniciales(nombre: string) {
  const partes = nombre.replace(/^(Dra?\.)\s*/, "").trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

function TarjetaMiembro({ miembro, puedeQuitar }: { miembro: MiembroDelEquipo; puedeQuitar: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <article className="flex flex-col gap-3 rounded-card border-[0.5px] border-arena bg-marfil p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-salvia-claro text-sm font-semibold text-salvia-oscuro"
        >
          {iniciales(miembro.nombre)}
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-[family-name:var(--font-display)] text-lg font-medium text-grafito">
            {miembro.nombre}
          </h3>
          <p className="truncate text-sm text-grafito/60">{miembro.email}</p>
        </div>
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {miembro.roles.map((rol) => (
          <li key={rol} className="rounded-full bg-hueso px-2.5 py-1 text-xs text-grafito/70">
            {ETIQUETA_ROL[rol] ?? rol}
          </li>
        ))}
        {/* "La tarjeta del titular... lleva un tag gris 'Sos vos'" — brief. */}
        {miembro.esVos && <li className="rounded-full bg-arena px-2.5 py-1 text-xs text-grafito/70">Sos vos</li>}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      {puedeQuitar && !miembro.esVos && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              setError(null);
              const resultado = await quitarColaboradorAction(miembro.userId);
              if (resultado.error) {
                setError(resultado.error);
              }
            })
          }
          className="self-start text-sm font-medium text-terracota-oscuro hover:underline disabled:opacity-60"
        >
          {pendiente ? "Quitando…" : "Quitar de la clínica"}
        </button>
      )}
    </article>
  );
}

function TarjetaPendiente({
  invitacion,
  puedeGestionar,
}: {
  invitacion: InvitacionPendiente;
  puedeGestionar: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reenviada, setReenviada] = useState(false);

  function correr(accion: () => Promise<{ error?: string }>, alVolver?: () => void) {
    iniciar(async () => {
      setError(null);
      const resultado = await accion();
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      alVolver?.();
    });
  }

  return (
    <article className="flex flex-col gap-3 rounded-card border-[0.5px] border-dashed border-arena bg-transparent p-5">
      <div className="min-w-0">
        <h3 className="truncate font-[family-name:var(--font-display)] text-lg font-medium text-grafito">
          {invitacion.email}
        </h3>
        <p className="text-sm text-grafito/60">
          Invitación enviada como {ETIQUETA_ROL[invitacion.rol] ?? invitacion.rol}. Va a figurar acá hasta que la acepte.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}
      {reenviada && <p className="text-sm text-salvia-oscuro">Invitación reenviada.</p>}

      {puedeGestionar && (
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => reenviarInvitacionAction(invitacion.id), () => setReenviada(true))}
            className="text-sm font-medium text-salvia-oscuro hover:underline disabled:opacity-60"
          >
            Reenviar invitación
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => cancelarInvitacionAction(invitacion.id))}
            className="text-sm font-medium text-terracota-oscuro hover:underline disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      )}
    </article>
  );
}
