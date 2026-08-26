"use client";

import { useState } from "react";
import type { Especialidad, Me } from "@dental-mirage/shared-types";
import { AuthShell } from "@/components/auth/auth-shell";
import { Stepper, PASOS_BIENVENIDA } from "@/components/auth/stepper";
import { OnboardingPerfilForm } from "@/app/sumarse/onboarding-perfil-form";
import { OnboardingClinicaForm } from "@/app/sumarse/onboarding-clinica-form";

interface BienvenidaOverlayProps {
  me: Me;
  especialidades: Especialidad[];
}

// Modal de "bienvenida" — TR-057 en docs/tradeoffs.md, pedido explícito
// del cliente (2026-08-26): una vez confirmada la cuenta, el destino
// siempre es /seleccionar-servicio; si perfil/clínica todavía no están
// completos, este modal se muestra POR ENCIMA de esa página (que queda
// desenfocada de fondo, ver page.tsx) con los dos pasos que antes vivían
// en /sumarse. Nunca se puede cerrar/saltear sin completar — no hay
// "volver al inicio" ni "volver a sumarse" acá (sinVolver en AuthShell):
// la cuenta ya está creada y verificada, no tiene sentido salir a
// ningún lado, solo terminar de cargar los datos.
export function BienvenidaOverlay({ me, especialidades }: BienvenidaOverlayProps) {
  const [vistaManual, setVistaManual] = useState<"perfil" | "clinica" | null>(null);
  const pasoServidor = me.onboardingStep === "perfil" ? "perfil" : "clinica";
  const paso = vistaManual ?? pasoServidor;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-grafito/50 p-4 py-10">
      <div className="w-full max-w-lg">
        <AuthShell
          title={paso === "perfil" ? "Creá tu perfil profesional" : "Ahora, tu clínica"}
          subtitle="Un último paso antes de empezar a usar Dental Mirage."
          sinVolver
        >
          <div className="flex flex-col gap-6">
            <Stepper pasos={PASOS_BIENVENIDA} actual={paso} />
            {paso === "perfil" ? (
              <OnboardingPerfilForm especialidades={especialidades} perfilInicial={me.perfil} />
            ) : (
              <OnboardingClinicaForm onAtras={() => setVistaManual("perfil")} />
            )}
          </div>
        </AuthShell>
      </div>
    </div>
  );
}
