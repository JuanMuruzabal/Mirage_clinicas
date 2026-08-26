"use client";

import { useState } from "react";
import type { Me } from "@dental-mirage/shared-types";
import { AuthShell } from "@/components/auth/auth-shell";
import { Stepper, PASOS_SUMARSE } from "@/components/auth/stepper";
import { CrearCuentaForm } from "./crear-cuenta-form";
import { RevisaCorreo } from "./revisa-correo";

interface SumarseWizardProps {
  me: Me | null;
}

// Reestructuración del 2026-08-26 (pedido explícito del cliente, ver
// docs/tradeoffs.md TR-057): /sumarse pasa a tener SOLO 2 pasos — crear
// cuenta y confirmar el código. Perfil profesional y clínica ya no viven
// acá: una vez verificado el mail, se redirige a /seleccionar-servicio,
// que muestra esos dos pasos como un modal de "bienvenida" sobre esa
// misma página (ver bienvenida-overlay.tsx).
//
// `forzarPasoCuenta` es lo que resuelve el pedido explícito de "poder
// volver del paso de verificación al paso anterior": el estado del
// servidor (`me.emailVerificado === false`) por sí solo mostraría siempre
// la pantalla de código apenas hay una cuenta pendiente — este flag la
// fuerza a mostrar el formulario de nuevo para reintentar con otro mail u
// otra contraseña (el backend sobreescribe la cuenta sin verificar en vez
// de tratarla como "ya existe", TR-056).
export function SumarseWizard({ me }: SumarseWizardProps) {
  const [registroLocal, setRegistroLocal] = useState<string | null>(null);
  const [forzarPasoCuenta, setForzarPasoCuenta] = useState(false);

  const emailPendienteDeVerificar = forzarPasoCuenta
    ? null
    : (registroLocal ?? (me && !me.emailVerificado ? me.email : null));

  if (emailPendienteDeVerificar) {
    return (
      <AuthShell title="Revisá tu correo" onVolver={() => setForzarPasoCuenta(true)} volverLabel="Volver al paso anterior">
        <div className="flex flex-col gap-6">
          <Stepper pasos={PASOS_SUMARSE} actual="verificar" />
          <RevisaCorreo email={emailPendienteDeVerificar} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sumate a Dental Mirage">
      <div className="flex flex-col gap-6">
        <Stepper pasos={PASOS_SUMARSE} actual="cuenta" />
        <CrearCuentaForm
          onRegistrado={(email) => {
            setForzarPasoCuenta(false);
            setRegistroLocal(email);
          }}
        />
      </div>
    </AuthShell>
  );
}
