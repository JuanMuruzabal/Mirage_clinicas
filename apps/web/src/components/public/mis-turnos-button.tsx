"use client";

import { useState } from "react";
import { ModalPortal } from "@/components/panel/modal-portal";
import { misTurnoPublicoAction } from "@/app/actions/turno-publico";
import type { MisTurnoPublico } from "@/lib/api";

interface MisTurnosButtonProps {
  slug: string;
}

// MisTurnosButton — pedido textual del cliente: "agregar un botón debajo
// de sacar turno de la página que sea MIS TURNOS, que pida dni y mail, si
// coincide con un turno activo mostrarlo en forma de tarjeta". A
// diferencia de PedirTurnoButton (wizard completo), acá es DNI+mail
// directo sin código de verificación — mismo patrón de overlay
// (ModalPortal + backdrop-blur) que el resto de la página pública.
export function MisTurnosButton({ slug }: MisTurnosButtonProps) {
  const [abierto, setAbierto] = useState(false);
  const [dni, setDni] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turno, setTurno] = useState<MisTurnoPublico | null>(null);

  function cerrar() {
    setAbierto(false);
    setDni("");
    setEmail("");
    setError(null);
    setTurno(null);
  }

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await misTurnoPublicoAction(slug, dni.trim(), email.trim());
    setPending(false);
    if (result.error) {
      setError(result.error);
      setTurno(null);
      return;
    }
    setTurno(result.turno ?? null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm font-medium text-grafito/70 underline decoration-arena underline-offset-4 hover:text-salvia-oscuro"
      >
        Mis turnos
      </button>

      {abierto && (
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mis turnos"
            className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) cerrar();
            }}
          >
            <div className="w-full max-w-sm rounded-card border-[0.5px] border-arena bg-marfil p-6 shadow-soft">
              <div className="flex items-center justify-between pb-4">
                <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Mis turnos</h2>
                <button type="button" onClick={cerrar} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
                  ×
                </button>
              </div>

              {turno ? (
                <div className="flex flex-col gap-3 text-sm">
                  <p className="text-xs uppercase tracking-widest text-grafito/50">{turno.tipoConsultaNombre}</p>
                  <p className="text-grafito">{turno.fecha}</p>
                  <p className="font-[family-name:var(--font-mono)] text-2xl font-semibold text-grafito">
                    {turno.horaInicio}–{turno.horaFin}
                  </p>
                  <p className="text-grafito/70">
                    {turno.nombreContacto} {turno.apellidoContacto}
                  </p>
                  <button
                    type="button"
                    onClick={cerrar}
                    className="mt-2 self-start rounded-full border-[0.5px] border-arena px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                <form onSubmit={buscar} className="flex flex-col gap-3">
                  <p className="text-sm text-grafito/70">Ingresá tu DNI y el mail con el que pediste el turno.</p>
                  <label className="flex flex-col gap-1 text-xs font-medium text-grafito/70">
                    DNI
                    <input
                      value={dni}
                      onChange={(e) => setDni(e.target.value)}
                      inputMode="numeric"
                      required
                      className="rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-sm text-grafito outline-none focus:border-salvia"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-grafito/70">
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-sm text-grafito outline-none focus:border-salvia"
                    />
                  </label>
                  {error && (
                    <p role="alert" className="text-sm text-terracota-oscuro">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
                  >
                    {pending ? "Buscando…" : "Buscar mi turno"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
