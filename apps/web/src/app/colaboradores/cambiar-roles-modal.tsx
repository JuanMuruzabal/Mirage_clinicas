"use client";

import { useState, useTransition } from "react";
import type { ClinicRole, MiembroDelEquipo } from "@dental-mirage/shared-types";
import { cambiarRolesAction } from "@/app/actions/equipo";
import { authErrorClass, authSecondaryButtonClass, authSubmitClass } from "@/components/auth/auth-shell";
import { ModalShell } from "@/components/auth/modal-shell";
import { TarjetaOpcion } from "@/components/auth/tarjeta-opcion";
import { IconCheck, IconClinic, IconPersonalize, IconUser } from "@/components/icons";

// Cambiar los roles de alguien que ya está en el equipo — Fase 3.2.4.
//
// Es la otra mitad de lo que el brief le da al creador: *"el responsable
// de asignar roles e invitar a sus colegas"*.
//
// Se manda el juego COMPLETO de roles, no un agregado: con roles
// excluyentes entre sí, "agregale profesional" a alguien que es recepción
// no tiene una respuesta obvia —¿reemplaza, falla, convive?— y las tres
// son defendibles. Elegir qué queda no deja lugar a la duda.
export function CambiarRolesModal({ miembro, onCerrar }: { miembro: MiembroDelEquipo; onCerrar: () => void }) {
  const [base, setBase] = useState<"profesional" | "recepcion">(
    miembro.roles.includes("recepcion") ? "recepcion" : "profesional",
  );
  const [admin, setAdmin] = useState(miembro.roles.includes("admin"));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function guardar() {
    const roles: ClinicRole[] = [base];
    if (admin) roles.push("admin");
    iniciar(async () => {
      setError(null);
      const resultado = await cambiarRolesAction(miembro.userId, roles);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      onCerrar();
    });
  }

  return (
    <ModalShell
      title="Cambiar rol"
      subtitle={miembro.nombre}
      footer={
        <>
          <button type="button" onClick={onCerrar} className={authSecondaryButtonClass}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={pendiente} className={authSubmitClass}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid items-stretch gap-3 sm:grid-cols-2">
          <TarjetaOpcion
            seleccionada={base === "profesional"}
            onClick={() => setBase("profesional")}
            icono={<IconUser className="h-5 w-5" />}
            titulo="Profesional"
            descripcion="Ve y atiende su propia agenda, y sus pacientes."
          />
          <TarjetaOpcion
            seleccionada={base === "recepcion"}
            onClick={() => setBase("recepcion")}
            icono={<IconClinic className="h-5 w-5" />}
            titulo="Recepcionista"
            descripcion="Maneja los turnos de toda la clínica."
          />
        </div>
        <p className="text-xs text-grafito/50">Profesional y recepción son excluyentes: nadie puede tener los dos.</p>

        {/* Administrador de página se SUMA al rol de arriba: son tags
            acumulables, y este habilita solo la web de la clínica. */}
        <button
          type="button"
          onClick={() => setAdmin((a) => !a)}
          aria-pressed={admin}
          className={`flex items-center gap-3 rounded-[10px] border p-4 text-left transition-colors ${
            admin ? "border-salvia-oscuro bg-salvia-claro" : "border-linea bg-marfil hover:border-salvia"
          }`}
        >
          <span className={admin ? "text-salvia-oscuro" : "text-grafito/40"}>
            <IconPersonalize className="h-5 w-5" />
          </span>
          <span className="flex flex-col">
            <span className="font-medium text-grafito">Administrador de página</span>
            <span className="text-sm text-grafito/60">Puede editar la página pública de la clínica.</span>
          </span>
          <span
            aria-hidden="true"
            className={`ml-auto flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
              admin ? "border-salvia-oscuro bg-salvia-oscuro text-marfil" : "border-linea"
            }`}
          >
            {admin && <IconCheck className="h-3.5 w-3.5" />}
          </span>
        </button>

        {error && <p className={authErrorClass}>{error}</p>}
      </div>
    </ModalShell>
  );
}
