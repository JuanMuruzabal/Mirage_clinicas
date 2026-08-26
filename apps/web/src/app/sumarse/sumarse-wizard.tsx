"use client";

import { useState } from "react";
import type { Especialidad, Me } from "@dental-mirage/shared-types";
import { AuthShell } from "@/components/auth/auth-shell";
import { Stepper, type PasoWizard } from "@/components/auth/stepper";
import { CrearCuentaForm } from "./crear-cuenta-form";
import { RevisaCorreo } from "./revisa-correo";
import { OnboardingPerfilForm } from "./onboarding-perfil-form";
import { OnboardingClinicaForm } from "./onboarding-clinica-form";

interface SumarseWizardProps {
  me: Me | null;
  especialidades: Especialidad[];
}

// Orquesta los 3 pasos del wizard (spec §4) a partir del estado REAL del
// servidor (`me.onboardingStep`/`me.emailVerificado`) — cada paso persiste
// al avanzar contra apps/api (onboardingPerfilAction/onboardingClinicaAction),
// que redirige de vuelta a /sumarse: la próxima carga de este componente ya
// refleja el paso siguiente. Esto es lo que hace que "cerrar el navegador y
// volver" retome exactamente donde quedó, sin guardar nada en el cliente.
//
// La única excepción es "Atrás" desde el Paso 3: en vez de un viaje al
// servidor, muestra el Paso 2 pre-cargado con los datos ya guardados
// (`me.perfil`, disponible aunque `onboardingStep` ya avanzó a "clinica" —
// GET /me lo incluye en cuanto la fila existe, no solo mientras el paso
// está "activo") — permite "volver atrás y editar sin perder datos" sin
// necesitar un estado de wizard propio del lado del cliente.
export function SumarseWizard({ me, especialidades }: SumarseWizardProps) {
  const [registroLocal, setRegistroLocal] = useState<string | null>(null);
  const [vistaManual, setVistaManual] = useState<PasoWizard | null>(null);

  const emailPendienteDeVerificar = registroLocal ?? (me && !me.emailVerificado ? me.email : null);

  let pasoServidor: PasoWizard;
  if (!me || emailPendienteDeVerificar) {
    pasoServidor = "cuenta";
  } else if (me.onboardingStep === "perfil") {
    pasoServidor = "perfil";
  } else {
    // "clinica" y "completo" (este último no debería llegar acá, el guard
    // del Server Component ya lo manda a /seleccionar-servicio antes).
    pasoServidor = "clinica";
  }

  const paso = vistaManual ?? pasoServidor;

  return (
    <AuthShell title={tituloPorPaso(paso, !!emailPendienteDeVerificar)}>
      <div className="flex flex-col gap-6">
        <Stepper actual={paso} />

        {paso === "cuenta" &&
          (emailPendienteDeVerificar ? (
            <RevisaCorreo email={emailPendienteDeVerificar} />
          ) : (
            <CrearCuentaForm onRegistrado={setRegistroLocal} />
          ))}

        {paso === "perfil" && (
          <OnboardingPerfilForm especialidades={especialidades} perfilInicial={me?.perfil} />
        )}

        {paso === "clinica" && <OnboardingClinicaForm onAtras={() => setVistaManual("perfil")} />}
      </div>
    </AuthShell>
  );
}

function tituloPorPaso(paso: PasoWizard, revisandoCorreo: boolean): string {
  if (paso === "cuenta") return revisandoCorreo ? "Revisá tu correo" : "Sumate a Dental Mirage";
  if (paso === "perfil") return "Tu perfil profesional";
  return "Tu clínica";
}
