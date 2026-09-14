"use client";

import { useState, useTransition } from "react";
import type { ClinicRole } from "@dental-mirage/shared-types";
import { invitarColaboradorAction } from "@/app/actions/equipo";
import {
  AuthField,
  CampoConIcono,
  authErrorClass,
  authInputConIconoClass,
  authSecondaryButtonClass,
  authSubmitClass,
} from "@/components/auth/auth-shell";
import { ModalShell } from "@/components/auth/modal-shell";
import { TarjetaOpcion } from "@/components/auth/tarjeta-opcion";
import { IconClinic, IconMail, IconUser } from "@/components/icons";

// Invitar colaborador — Fase 3.2.4, mockup `colaboradores.html`.
//
// Dos pasos, como pide el brief: *"se abrirá una pantalla por encima,
// donde pedirá primero el rol, luego donde se ingresará el token/código
// de la persona o el mail"*.
//
// El orden no es arbitrario: el rol es lo que decide qué va a poder ver
// esa persona, así que se elige antes de nombrarla. Al revés, el rol
// termina siendo un detalle que se completa apurado sobre el final.
export function InvitarColaboradorModal({ onCerrar }: { onCerrar: () => void }) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [rol, setRol] = useState<ClinicRole | null>(null);
  const [metodo, setMetodo] = useState<"codigo" | "mail">("codigo");
  const [codigo, setCodigo] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [pendiente, iniciar] = useTransition();

  function continuar() {
    if (!rol) {
      setError("Elegí un rol para seguir.");
      return;
    }
    setError(null);
    setPaso(2);
  }

  function invitar() {
    if (!rol) return;
    const valor = metodo === "codigo" ? codigo.trim().toUpperCase() : email.trim();
    if (!valor) {
      setError(metodo === "codigo" ? "Pegá el código que te pasaron." : "Escribí el mail de la persona.");
      return;
    }
    iniciar(async () => {
      setError(null);
      const resultado = await invitarColaboradorAction({
        rol,
        ...(metodo === "codigo" ? { codigo: valor } : { email: valor }),
      });
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setListo(true);
    });
  }

  if (listo) {
    return (
      <ModalShell
        title="Invitación enviada"
        subtitle="Va a figurar como pendiente hasta que la persona la confirme."
        footer={
          <button type="button" onClick={onCerrar} className={authSubmitClass}>
            Listo
          </button>
        }
      >
        <p className="text-sm text-grafito/70">
          {/* Que quede claro que NADIE entró todavía: el brief original
              decía que el código sumaba al instante, y el cliente lo
              cambió — compartir un código es ofrecerse, no aceptar. */}
          Le avisamos por mail. Hasta que confirme desde su pantalla de clínicas, no ve nada de la tuya.
        </p>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="Invitar colaborador"
      subtitle={paso === 1 ? "Paso 1 de 2 · ¿Qué rol va a tener?" : `Paso 2 de 2 · ¿Cómo lo agregás?`}
      footer={
        paso === 1 ? (
          <>
            <button type="button" onClick={onCerrar} className={authSecondaryButtonClass}>
              Cancelar
            </button>
            <button type="button" onClick={continuar} className={authSubmitClass}>
              Continuar
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setPaso(1)} className={authSecondaryButtonClass}>
              Volver
            </button>
            <button type="button" onClick={invitar} disabled={pendiente} className={authSubmitClass}>
              {pendiente ? "Enviando…" : metodo === "codigo" ? "Agregar" : "Enviar invitación"}
            </button>
          </>
        )
      }
    >
      {paso === 1 ? (
        <div className="flex flex-col gap-4">
          <div className="grid items-stretch gap-3 sm:grid-cols-2">
            <TarjetaOpcion
              seleccionada={rol === "profesional"}
              onClick={() => setRol("profesional")}
              icono={<IconUser className="h-5 w-5" />}
              titulo="Profesional"
              descripcion="Ve y atiende su propia agenda, y sus pacientes."
            />
            <TarjetaOpcion
              seleccionada={rol === "recepcion"}
              onClick={() => setRol("recepcion")}
              icono={<IconClinic className="h-5 w-5" />}
              titulo="Recepcionista"
              descripcion="Maneja los turnos de toda la clínica."
            />
          </div>
          {/* Los dos son excluyentes entre sí — no por una regla de la
              pantalla sino del modelo (TR-137), y el motor lo impide
              aunque alguien llegue por otro lado. */}
          <p className="text-xs text-grafito/50">Profesional y recepción son excluyentes: nadie puede tener los dos.</p>
          {error && <p className={authErrorClass}>{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2" role="tablist">
            <BotonMetodo activo={metodo === "codigo"} onClick={() => setMetodo("codigo")}>
              Código de perfil
            </BotonMetodo>
            <BotonMetodo activo={metodo === "mail"} onClick={() => setMetodo("mail")}>
              Correo electrónico
            </BotonMetodo>
          </div>

          {metodo === "codigo" ? (
            <>
              <AuthField label="Código de perfil">
                <CampoConIcono icono={<IconUser className="h-[18px] w-[18px]" />}>
                  <input
                    value={codigo}
                    onChange={(e) => {
                      setCodigo(e.target.value);
                      setError(null);
                    }}
                    placeholder="PR-XXXX-XXXX"
                    className={`${authInputConIconoClass} uppercase`}
                  />
                </CampoConIcono>
              </AuthField>
              <p className="text-xs text-grafito/50">
                Es el código que la persona generó desde su pantalla de clínicas. Como identifica a alguien y no a una
                dirección, por acá no hay error de tipeo posible.
              </p>
            </>
          ) : (
            <>
              <AuthField label="Correo electrónico">
                <CampoConIcono icono={<IconMail className="h-[18px] w-[18px]" />}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="nombre@correo.com"
                    className={authInputConIconoClass}
                  />
                </CampoConIcono>
              </AuthField>
              <p className="text-xs text-grafito/50">
                Le mandamos una invitación. Si todavía no tiene cuenta, la va a encontrar esperándola apenas se registre
                con ese mismo mail.
              </p>
            </>
          )}

          {error && <p className={authErrorClass}>{error}</p>}
        </div>
      )}
    </ModalShell>
  );
}

function BotonMetodo({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activo}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        activo ? "bg-salvia-claro text-salvia-oscuro" : "text-grafito/60 hover:bg-hueso"
      }`}
    >
      {children}
    </button>
  );
}
