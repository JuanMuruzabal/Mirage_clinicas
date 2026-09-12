"use client";

import { useState } from "react";
import type { Paciente } from "@dental-mirage/shared-types";
import { textoEsLargo } from "@/lib/texto-largo";
import { IconMail, IconPhone } from "@/components/icons";
import { VerTextoBoton } from "../ver-texto-boton";
import { AvatarIniciales } from "./avatar-iniciales";
import { EditarPacienteModal } from "./editar-paciente-modal";

interface PacienteDatosProps {
  pacienteInicial: Paciente;
  // emailsAlternativos/telefonosAlternativos (Fase 2.4.1, corrección de
  // QA) — vienen de PacienteDetalle (GET /pacientes/{id}), sumados a esta
  // ficha VERIFICADA al resolver un conflicto de pacientes con "el mail
  // es de la persona verificada". Quedan afuera del estado que actualiza
  // "Editar datos": esa acción solo toca DNI/teléfono/email principal,
  // nunca esta lista.
  emailsAlternativos?: string[];
  telefonosAlternativos?: string[];
}

// PacienteDatos — bloque de DNI/teléfono/email de la ficha (T3.6),
// envuelto en Client Component solo porque necesita abrir el modal de
// edición (pedido explícito del cliente, 2026-08-23) — el resto de la
// página de detalle sigue siendo Server Component.
export function PacienteDatos({ pacienteInicial, emailsAlternativos = [], telefonosAlternativos = [] }: PacienteDatosProps) {
  const [paciente, setPaciente] = useState(pacienteInicial);
  const [modalAbierto, setModalAbierto] = useState(false);

  // Fase 2.4.1, corrección de QA: "sumar ya sea mail o teléfono que
  // estaba en conflicto con la info del paciente, deberá aparecer un
  // botón con ver mails →, ver teléfonos →" — el principal siempre va
  // primero, seguido de los alternativos migrados por una resolución de
  // conflicto anterior. Con más de uno, se agrupan detrás del botón; con
  // uno solo, se muestra igual que siempre.
  const todosLosMails = [paciente.email, ...emailsAlternativos].filter((m): m is string => Boolean(m));
  const todosLosTelefonos = [paciente.telefono, ...telefonosAlternativos].filter((t): t is string => Boolean(t));

  return (
    <>
    <section className="flex flex-col gap-4 rounded-card border-[0.5px] border-arena bg-marfil p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Datos de contacto</h2>
        <button type="button" onClick={() => setModalAbierto(true)} className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
          Editar datos
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Dato label="DNI" valor={paciente.dni} />
        <Dato
          icon={<IconPhone className="h-3.5 w-3.5" />}
          label="Teléfono"
          valor={
            todosLosTelefonos.length > 1 ? (
              <VerTextoBoton titulo="Teléfonos" texto={todosLosTelefonos.join("\n")} />
            ) : (
              todosLosTelefonos[0] || "—"
            )
          }
        />
        {/* Corrección de QA: mismo "Ver mail" que ya aplica en la tabla
            de Pacientes (Extra 2.3.4/E4.1) — acá faltaba, en la sección
            "Datos de contacto" de la ficha.
            Bug real reportado por el cliente, 2026-09-05: "se migró todo
            menos el mail" — al resolver un conflicto donde la ficha
            verificada no tenía mail propio, el mail migrado quedaba como
            único elemento de `todosLosMails`, así que nunca entraba en la
            rama "> 1" de abajo; la rama de respaldo usaba `paciente.email`
            directo (vacío) en vez de `todosLosMails[0]` (que si tiene el
            mail migrado) — se veía "—" aunque el mail SÍ se había
            migrado de verdad. Fase 2.4.2: `paciente.telefono` deja de ser
            obligatorio (antes nunca vacío, así que Teléfono no podía
            mostrar este bug) — la rama de Teléfono de arriba ahora usa el
            mismo criterio (`todosLosTelefonos[0]`, no `paciente.telefono`
            directo) para no reproducirlo. */}
        <Dato
          icon={<IconMail className="h-3.5 w-3.5" />}
          label="Email"
          valor={
            todosLosMails.length > 1 ? (
              <VerTextoBoton titulo="Mails" texto={todosLosMails.join("\n")} />
            ) : textoEsLargo(todosLosMails[0]) ? (
              <VerTextoBoton titulo="Email" texto={todosLosMails[0]!} />
            ) : (
              todosLosMails[0] || "—"
            )
          }
        />
      </div>

      {modalAbierto && (
        <EditarPacienteModal
          paciente={paciente}
          onClose={() => setModalAbierto(false)}
          onSuccess={(actualizado) => {
            setPaciente(actualizado);
            setModalAbierto(false);
          }}
        />
      )}
    </section>

    {/* Datos de tutores (Fase 2.4.2) — tarjeta APARTE, nunca mezclada con
        "Datos de contacto" de arriba (que son del PACIENTE): pedido de
        diseño explícito, `docs/Fases post MVP/Fase 2/turnero_pagina/ArquitecturaPeticionesTurno.md` 3.7bis —
        "para que quede claro a simple vista cuál dato es de quién".
        Ausente del todo si la ficha se cargó "para mí" (sin tutor).
        Rediseñado en la ronda de correcciones (2026-09-06): un paciente
        puede tener MÁS de un tutor a lo largo del tiempo (mamá, papá, una
        abuela...) — cada uno aparece como una FILA compacta dentro de
        esta sección (foto de referencia "fichadiseño1.png": avatar +
        nombre + pill de relación arriba, teléfono/email con ícono abajo,
        separador entre tutores) en vez de la tarjeta con grid de campos
        de antes. Sin DNI (pedido textual del cliente: "no es tan útil y
        agrega complejidad") y sin acciones de agregar/editar tutor — ese
        alcance sigue siendo exclusivo del flujo público de conflictos
        (ver TR-116 en docs/Arquitectura y base/tradeoffs.md), esta sección es de solo
        lectura. */}
    {paciente.tutores && paciente.tutores.length > 0 && (
      <section className="flex flex-col gap-4 rounded-card border-[0.5px] border-arena bg-marfil p-6 shadow-soft">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Datos de tutores</h2>
        <div className="flex flex-col">
          {paciente.tutores.map((tutor, i) => {
            const [nombreTutor, ...restoTutor] = tutor.nombre.trim().split(/\s+/);
            const apellidoTutor = restoTutor.join(" ");
            return (
              <div
                key={`${tutor.email}-${i}`}
                className={`flex items-start gap-3 py-3 ${i > 0 ? "border-t-[0.5px] border-arena" : ""}`}
              >
                <AvatarIniciales nombre={nombreTutor} apellido={apellidoTutor} />
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-[family-name:var(--font-display)] text-base font-medium text-grafito">{tutor.nombre}</span>
                    <span className="rounded-full bg-salvia-claro px-2.5 py-0.5 text-xs font-medium text-salvia-oscuro">
                      {TUTOR_RELACION_LABEL[tutor.relacion] ?? tutor.relacion}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-grafito/70">
                    <span className="flex items-center gap-1.5">
                      <IconPhone className="h-3.5 w-3.5 text-grafito/40" />
                      {/* Cuarta ronda de correcciones (2026-09-06):
                          teléfonos alternativos del tutor (mismo botón
                          "Ver teléfonos" que ya usa el propio del
                          paciente) — se ACUMULAN, no reemplazan al
                          principal. */}
                      {tutor.telefonosAlternativos && tutor.telefonosAlternativos.length > 0 ? (
                        <VerTextoBoton
                          titulo="Teléfonos del tutor"
                          texto={[tutor.telefono, ...tutor.telefonosAlternativos].filter(Boolean).join("\n")}
                        />
                      ) : (
                        tutor.telefono || "—"
                      )}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <IconMail className="h-3.5 w-3.5 text-grafito/40" />
                      {textoEsLargo(tutor.email) ? <VerTextoBoton titulo="Email del tutor" texto={tutor.email} /> : tutor.email || "—"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    )}
    </>
  );
}

// TUTOR_RELACION_LABEL — mismas 3 opciones que el wizard público
// (pedir-turno-form.tsx), acá solo para mostrar el valor guardado con
// mayúscula inicial en vez del value crudo del select ("familiar").
const TUTOR_RELACION_LABEL: Record<string, string> = {
  familiar: "Familiar",
  amigo: "Amigo/a",
  otro: "Otro",
};

function Dato({ label, valor, icon }: { label: string; valor: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-grafito/50">{label}</span>
      <span className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-grafito">
        {icon && <span className="text-grafito/40">{icon}</span>}
        {valor}
      </span>
    </div>
  );
}
