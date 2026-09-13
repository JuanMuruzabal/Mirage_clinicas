import type { Especialidad, Me } from "@dental-mirage/shared-types";
import { AuthShell } from "@/components/auth/auth-shell";
import { OnboardingPerfilForm } from "@/app/sumarse/onboarding-perfil-form";

interface PerfilOverlayProps {
  me: Me;
  especialidades: Especialidad[];
}

// El único paso que queda del onboarding — Fase 3.2.3.
//
// Hasta acá el modal de bienvenida (TR-057) tenía DOS pasos, perfil y
// clínica, y no se podía salir sin completar los dos. El brief de la Fase
// 3 lo deshace: "el wizard de 2 pasos queda deconstruido en un paso, se
// crea perfil, y lo lleva a esta página donde decidirá entre armar su
// clínica o unirse a otra".
//
// El motivo es que crear una clínica dejó de ser obligatorio: a la app
// también se entra porque un colega te sumó a la suya. Con el modal viejo,
// esa persona quedaba encerrada creando una clínica que no quería para
// poder llegar a la pantalla donde aceptar la invitación.
//
// Lo que NO cambia es el perfil profesional: sin nombre ni matrícula no
// hay nada que mostrarle a un paciente, así que este paso sigue sin
// poderse cerrar ni saltear (`sinVolver`).
export function PerfilOverlay({ me, especialidades }: PerfilOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-grafito/50 p-3 py-6 sm:p-4 sm:py-10">
      <div className="w-full max-w-xl">
        <AuthShell
          title="Creá tu perfil profesional"
          subtitle="Un último paso antes de empezar a usar PRISMA."
          sinVolver
          ancho="xl"
          scrollInterno
        >
          <OnboardingPerfilForm especialidades={especialidades} perfilInicial={me.perfil} />
        </AuthShell>
      </div>
    </div>
  );
}
