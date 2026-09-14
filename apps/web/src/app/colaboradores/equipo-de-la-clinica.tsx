"use client";

import { useState, useTransition } from "react";
import type { ClinicRole, Equipo, InvitacionPendiente, MiembroDelEquipo } from "@dental-mirage/shared-types";
import {
  cancelarInvitacionAction,
  quitarColaboradorAction,
  reenviarInvitacionAction,
} from "@/app/actions/equipo";
import { IconUserPlus } from "@/components/icons";
import { CambiarRolesModal } from "./cambiar-roles-modal";
import { InvitarColaboradorModal } from "./invitar-colaborador-modal";
import { MenuAcciones } from "./menu-acciones";

// Cada tipo de tag tiene su propio color, asignado por NOMBRE y no por
// posición — rediseño del 2026-09-14. Con todos del mismo gris, la fila
// de roles se leía como un bloque indistinto.
const ETIQUETA_ROL: Record<string, { texto: string; clase: string }> = {
  owner: { texto: "Titular", clase: "tag-rol--titular" },
  admin: { texto: "Administrador de página", clase: "tag-rol--admin" },
  profesional: { texto: "Profesional", clase: "tag-rol--profesional" },
  recepcion: { texto: "Recepción", clase: "tag-rol--recepcion" },
};

function TagRol({ rol }: { rol: ClinicRole }) {
  const etiqueta = ETIQUETA_ROL[rol];
  return <li className={`tag-rol ${etiqueta?.clase ?? "tag-rol--vos"}`}>{etiqueta?.texto ?? rol}</li>;
}

// El equipo de la clínica — Fase 3.2.4, mockup `colaboradores.html` y
// rediseño del 2026-09-14.
//
// El orden de los grupos lo pide el brief: "primero el creador, luego
// recepcionistas, y al final las tarjetas de los colegas". No es estético
// — es el orden en que alguien busca a una persona cuando entra acá.
export function EquipoDeLaClinica({ equipo }: { equipo: Equipo }) {
  const [invitando, setInvitando] = useState(false);
  const [cambiandoRoles, setCambiandoRoles] = useState<MiembroDelEquipo | null>(null);

  const titular = equipo.miembros.find((m) => m.esTitular);
  const recepcion = equipo.miembros.filter((m) => !m.esTitular && m.roles.includes("recepcion"));
  const profesionales = equipo.miembros.filter((m) => !m.esTitular && !m.roles.includes("recepcion"));

  return (
    <div className="flex flex-col">
      {titular && (
        <Grupo titulo="Titular">
          <TarjetaMiembro miembro={titular} puedeGestionar={false} />
        </Grupo>
      )}

      <Grupo titulo="Recepción" cuantos={recepcion.length}>
        {recepcion.length === 0 ? (
          <Vacio onInvitar={equipo.puedeInvitar ? () => setInvitando(true) : undefined}>
            Todavía no hay nadie en recepción.
          </Vacio>
        ) : (
          recepcion.map((m) => (
            <TarjetaMiembro
              key={m.userId}
              miembro={m}
              puedeGestionar={equipo.puedeInvitar}
              onCambiarRol={() => setCambiandoRoles(m)}
            />
          ))
        )}
      </Grupo>

      <Grupo titulo="Profesionales" cuantos={profesionales.length}>
        {profesionales.length === 0 ? (
          <Vacio onInvitar={equipo.puedeInvitar ? () => setInvitando(true) : undefined}>
            Todavía no hay otros profesionales en la clínica.
          </Vacio>
        ) : (
          profesionales.map((m) => (
            <TarjetaMiembro
              key={m.userId}
              miembro={m}
              puedeGestionar={equipo.puedeInvitar}
              onCambiarRol={() => setCambiandoRoles(m)}
            />
          ))
        )}
      </Grupo>

      {equipo.pendientes.length > 0 && (
        <Grupo titulo="Invitaciones pendientes" cuantos={equipo.pendientes.length}>
          {equipo.pendientes.map((inv) => (
            <TarjetaPendiente key={inv.id} invitacion={inv} puedeGestionar={equipo.puedeInvitar} />
          ))}
        </Grupo>
      )}

      <p className="pt-2 text-sm text-grafito/50">
        Solo el titular puede invitar, cambiar roles y quitar a alguien del equipo.
      </p>

      {invitando && <InvitarColaboradorModal onCerrar={() => setInvitando(false)} />}
      {cambiandoRoles && (
        <CambiarRolesModal miembro={cambiandoRoles} onCerrar={() => setCambiandoRoles(null)} />
      )}
    </div>
  );
}

// EncabezadoEquipo — el botón vive en la misma fila que el título
// (rediseño del 2026-09-14): en una fila propia dejaba una banda vacía de
// cien píxeles antes de la primera tarjeta.
export function EncabezadoEquipo({ puedeInvitar, children }: { puedeInvitar: boolean; children: React.ReactNode }) {
  const [invitando, setInvitando] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-6">
        {children}
        {puedeInvitar && (
          <button
            type="button"
            onClick={() => setInvitando(true)}
            className="flex flex-shrink-0 items-center gap-2 rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95"
          >
            <IconUserPlus className="h-[18px] w-[18px]" />
            Invitar colaborador
          </button>
        )}
      </div>
      {invitando && <InvitarColaboradorModal onCerrar={() => setInvitando(false)} />}
    </>
  );
}

function Grupo({ titulo, cuantos, children }: { titulo: string; cuantos?: number; children: React.ReactNode }) {
  return (
    <section className="mb-10 flex flex-col gap-4">
      {/* El conteo va AL LADO del título, no empujado al extremo
          derecho: pertenece al título, no a la fila. */}
      <h2 className="flex items-baseline gap-3">
        <span className="font-[family-name:var(--font-mono)] text-sm uppercase tracking-[0.15em] text-grafito/60">
          {titulo}
        </span>
        {cuantos !== undefined && (
          <span className="text-sm text-grafito/45">{cuantos === 1 ? "1 persona" : `${cuantos} personas`}</span>
        )}
      </h2>
      <div className="flex flex-col gap-[0.9rem]">{children}</div>
    </section>
  );
}

// Vacio — del alto de una tarjeta chica, con el texto a la izquierda y el
// atajo a la derecha. Antes era una caja punteada de cien píxeles para
// decir una sola frase.
function Vacio({ children, onInvitar }: { children: React.ReactNode; onInvitar?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-linea bg-marfil px-5 py-3.5">
      <span className="text-sm text-grafito/60">{children}</span>
      {onInvitar && (
        <button type="button" onClick={onInvitar} className="text-sm font-medium text-salvia-oscuro hover:underline">
          Invitar a alguien
        </button>
      )}
    </div>
  );
}

function iniciales(nombre: string) {
  const partes = nombre.replace(/^(Dra?\.)\s*/, "").trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

function TarjetaMiembro({
  miembro,
  puedeGestionar,
  onCambiarRol,
}: {
  miembro: MiembroDelEquipo;
  puedeGestionar: boolean;
  onCambiarRol?: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const acciones = [];
  if (onCambiarRol) acciones.push({ label: "Cambiar rol", onClick: onCambiarRol });
  acciones.push({
    label: "Quitar del equipo",
    peligrosa: true,
    onClick: () =>
      iniciar(async () => {
        setError(null);
        const resultado = await quitarColaboradorAction(miembro.userId);
        if (resultado.error) setError(resultado.error);
      }),
  });

  return (
    <article className="flex flex-col gap-3 rounded-card border border-linea bg-marfil p-6 shadow-soft">
      <div className="flex items-start gap-4">
        {/* Avatar en verde SÓLIDO: el verde pálido sobre blanco era otra
            capa que no se distinguía del fondo. */}
        <span
          aria-hidden="true"
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-salvia-oscuro text-base font-semibold text-marfil"
        >
          {iniciales(miembro.nombre)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-[family-name:var(--font-display)] text-[22px] font-medium text-grafito">
            {miembro.nombre}
          </h3>
          <p className="truncate text-[15.5px] text-grafito/60">{miembro.email}</p>
        </div>
        {puedeGestionar && !miembro.esVos && <MenuAcciones nombre={miembro.nombre} acciones={acciones} />}
      </div>

      <ul className="mt-2 flex flex-wrap gap-2">
        {miembro.roles.map((rol) => (
          <TagRol key={rol} rol={rol} />
        ))}
        {/* "La tarjeta del titular... lleva un tag gris 'Sos vos'" —
            brief. Va en neutro: es una aclaración, no un rol. */}
        {miembro.esVos && <li className="tag-rol tag-rol--vos">Sos vos</li>}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
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

  const acciones = [
    {
      label: "Reenviar invitación",
      onClick: () => correr(() => reenviarInvitacionAction(invitacion.id), () => setReenviada(true)),
    },
    { label: "Cancelar invitación", peligrosa: true, onClick: () => correr(() => cancelarInvitacionAction(invitacion.id)) },
  ];

  return (
    <article className="flex flex-col gap-3 rounded-card border border-linea bg-marfil p-6 shadow-soft">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#c9922f] text-base font-semibold text-marfil"
        >
          {invitacion.email.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-[family-name:var(--font-display)] text-[22px] font-medium text-grafito">
            {invitacion.email}
          </h3>
          <p className="text-[15.5px] text-grafito/60">
            Invitación enviada. Va a figurar acá hasta que la persona la confirme.
          </p>
        </div>
        {puedeGestionar && <MenuAcciones nombre={invitacion.email} acciones={acciones} />}
      </div>

      <ul className="mt-2 flex flex-wrap gap-2">
        <TagRol rol={invitacion.rol} />
        <li className="tag-rol tag-rol--pendiente">Pendiente</li>
      </ul>

      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}
      {reenviada && <p className="text-sm text-salvia-oscuro">Invitación reenviada.</p>}
    </article>
  );
}
