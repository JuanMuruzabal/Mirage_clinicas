"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ModalPortal } from "@/components/panel/modal-portal";
import { validarEnlaceTurnoPublicoAction } from "@/app/actions/turno-publico";
import { PedirTurnoForm } from "./pedir-turno-form";

interface PedirTurnoButtonProps {
  slug: string;
  nombreClinica: string;
  telefonoClinica?: string | null;
}

const SELECTOR_FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// PedirTurnoButton — Fase 2.4.1, pedido explícito del cliente (corrección
// de QA sobre la primera entrega de F4.1.6): "en la página de la clínica
// cambiar el formulario actual... por un botón bien llamativo que diga
// PEDIR TURNO, y abrirá el wizard... por encima de la página con la
// pantalla de fondo con blur, como ya se hace en otras pantallas". Antes
// el wizard vivía embebido directo en la sección "Pedí tu turno" de la
// página pública — ahora esa sección es solo este botón, y el wizard
// (PedirTurnoForm, sin cambios internos) se abre en un overlay — mismo
// patrón que los modales del panel (ModalPortal + `backdrop-blur-sm`,
// cierre al tocar afuera).
export function PedirTurnoButton({ slug, nombreClinica, telefonoClinica }: PedirTurnoButtonProps) {
  const searchParams = useSearchParams();
  const enlaceToken = searchParams.get("enlace") ?? undefined;

  const [abierto, setAbierto] = useState(false);
  // estadoEnlace — Fase 2, ítem 5 ("compartir calendario"): con
  // `?enlace=` en la URL, el modal se abre solo apenas la página carga
  // (el profesional ya mandó el link, no hace falta que la persona
  // busque un botón). "validando" evita mostrar el wizard completo un
  // instante antes de saber si el link sigue vigente.
  const [estadoEnlace, setEstadoEnlace] = useState<"validando" | "valido" | "invalido" | null>(enlaceToken ? "validando" : null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const focoAnteriorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enlaceToken) return;
    let activo = true;
    validarEnlaceTurnoPublicoAction(slug, enlaceToken).then((valido) => {
      if (!activo) return;
      setEstadoEnlace(valido ? "valido" : "invalido");
      if (valido) setAbierto(true);
    });
    return () => {
      activo = false;
    };
    // Solo al montar — el token viene de la URL con la que se abrió la
    // página, no cambia durante la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bloquear el scroll del body mientras el modal está abierto (docs/
  // prompt-claude-code-fecha-horario.md, punto 3: "bloqueá el scroll del
  // body de la página mientras el modal está abierto, y mantené el foco
  // atrapado dentro del modal") + foco atrapado — ninguno de los dos
  // estaba implementado (era un pendiente ya señalado, sin resolver, del
  // propio §6 de docs/Fases post MVP/Fase 2/turnero_pagina/rediseno-flujo-turnos.md).
  useEffect(() => {
    if (!abierto) return;

    focoAnteriorRef.current = document.activeElement as HTMLElement | null;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    dialogRef.current?.querySelector<HTMLElement>(SELECTOR_FOCUSABLE)?.focus();

    function manejarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setAbierto(false);
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // Se recalcula en cada Tab (no una vez al abrir): el contenido
      // real cambia de paso a paso dentro del wizard, así que el primer/
      // último elemento tocable de "ahora" puede no ser el de cuando se
      // abrió el modal.
      const focosables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(SELECTOR_FOCUSABLE));
      if (focosables.length === 0) return;
      const primero = focosables[0];
      const ultimo = focosables[focosables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", manejarTecla);
    return () => {
      document.removeEventListener("keydown", manejarTecla);
      document.body.style.overflow = overflowPrevio;
      // El foco vuelve al botón que abrió el modal (§6) — no a donde sea
      // que haya quedado el `document.activeElement` tras desmontar el
      // wizard (normalmente `<body>`).
      focoAnteriorRef.current?.focus();
    };
  }, [abierto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-full bg-salvia-oscuro px-10 py-4 text-base font-semibold text-marfil shadow-soft hover:brightness-95"
      >
        Pedir turno
      </button>

      {/* Link inválido/vencido (Fase 2, ítem 5) — la persona llegó acá
          desde un link compartido que ya no sirve; se le avisa en vez de
          dejarla completar todo el wizard para recién ahí fallar, y se
          le ofrece el camino normal (sin enlace) como salida. */}
      {estadoEnlace === "invalido" && (
        <p role="alert" className="mt-3 text-sm text-terracota-oscuro">
          Este link ya no es válido — puede haber vencido o ya haberse usado. Tocá &quot;Pedir turno&quot; para
          reservar por el camino habitual.
        </p>
      )}

      {abierto && (
        <ModalPortal>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Pedir turno"
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-grafito/50 p-4 py-8 backdrop-blur-sm sm:items-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAbierto(false);
            }}
          >
            <PedirTurnoForm
              slug={slug}
              nombreClinica={nombreClinica}
              telefonoClinica={telefonoClinica}
              onClose={() => setAbierto(false)}
              enlaceToken={estadoEnlace === "valido" ? enlaceToken : undefined}
            />
          </div>
        </ModalPortal>
      )}
    </>
  );
}
