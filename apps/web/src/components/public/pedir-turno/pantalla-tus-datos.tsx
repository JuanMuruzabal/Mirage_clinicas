"use client";

import type { ReactNode } from "react";
import { IconArrowRight, IconUsers } from "@/components/icons";
import { CampoTelefonoConPais } from "./campo-telefono";
import { BarraContexto, CampoSelect, CampoTexto, CampoTextarea, ModalFooter, ModalShell } from "./shared";

/**
 * [3a] Tus datos — para mí, primera vez (docs/Fases post MVP/Fase 2/turnero_pagina/rediseno-flujo-turnos.md
 * §5). Grilla de dos columnas (§2: `repeat(auto-fit, minmax(200px,1fr))`,
 * colapsa sola a una columna en mobile — acá implementada como
 * `sm:grid-cols-2` porque los campos de esta pantalla no necesitan más
 * de 2 columnas ni en desktop ancho).
 */

export interface DatosContacto {
  nombre: string;
  apellido: string;
  dni: string;
  paisTelefono: string;
  telefono: string;
  email: string;
  motivo: string;
}

export function PantallaTusDatos({
  values,
  onChange,
  onSubmit,
  onBack,
  onClose,
  paso,
  total,
  submitDisabled,
  extra,
}: {
  values: DatosContacto;
  onChange: <K extends keyof DatosContacto>(field: K, value: DatosContacto[K]) => void;
  onSubmit: () => void;
  onBack: () => void;
  onClose: () => void;
  paso: number;
  total: number;
  submitDisabled?: boolean;
  /** Slot para contenido que no forma parte del doc (ej. Turnstile) — este paso dispara el envío del código, así que necesita su captcha. */
  extra?: ReactNode;
}) {
  return (
    <ModalShell
      title="Tus datos"
      subtitle="Los usamos para confirmarte el turno y avisarte si hay cambios."
      onClose={onClose}
      maxWidthClassName="max-w-[520px]"
      footer={<ModalFooter paso={paso} total={total} actionLabel="Continuar" onBack={onBack} actionType="submit" formId="form-contacto" actionDisabled={submitDisabled} />}
    >
      <form
        id="form-contacto"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <CampoTexto id="cp-nombre" label="Nombre" placeholder="María" required value={values.nombre} onChange={(e) => onChange("nombre", e.target.value)} />
          <CampoTexto
            id="cp-apellido"
            label="Apellido"
            placeholder="Gómez"
            required
            value={values.apellido}
            onChange={(e) => onChange("apellido", e.target.value)}
          />
          <CampoTexto
            id="cp-dni"
            label="DNI"
            placeholder="30123456"
            hint="Sin puntos ni espacios"
            required
            inputMode="numeric"
            value={values.dni}
            onChange={(e) => onChange("dni", e.target.value)}
          />
          <CampoTelefonoConPais
            id="cp-telefono"
            label="Teléfono"
            hint="Te escribimos por WhatsApp"
            pais={values.paisTelefono}
            onPaisChange={(iso) => onChange("paisTelefono", iso)}
            valor={values.telefono}
            onValorChange={(v) => onChange("telefono", v)}
            required
          />
          <div className="sm:col-span-2">
            <CampoTexto
              id="cp-email"
              label="Email"
              type="email"
              placeholder="maria@gmail.com"
              required
              value={values.email}
              onChange={(e) => onChange("email", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <CampoTextarea
              id="cp-motivo"
              label="Motivo de consulta"
              opcional
              placeholder="Contanos brevemente qué te trae"
              value={values.motivo}
              onChange={(e) => onChange("motivo", e.target.value)}
            />
          </div>
        </div>

        {extra}
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------
// [3c] Tus datos — para otro, primera vez
// ---------------------------------------------------------------------

// RELACION_OPCIONES — el doc (§5, [3c]) pide 6 vínculos (madre/padre,
// hijo/a, pareja, familiar, tutor legal, otro + texto libre). El backend
// (`PacienteTutor.Relacion`, ya en dev) solo acepta 3 valores por check
// constraint (`familiar`/`amigo`/`otro`) — decisión explícita al cruzar
// el doc contra el esquema real: mantener las 3 opciones actuales en vez
// de ampliar el constraint, así que acá se muestran esas 3 (con mejor
// copy que el `<option>Amigo/a</option>` anterior) y se descarta el
// campo libre "Especificá el vínculo" — no hay dónde guardar ese texto
// hoy (`Relacion` es la única columna, varchar(20) acotado).
export interface DatosTutor {
  nombre: string;
  relacion: string;
  paisTelefono: string;
  telefono: string;
  email: string;
}

export function PantallaTusDatosTutor({
  values,
  onChange,
  onSubmit,
  onBack,
  onClose,
  onCambiarParaQuien,
  paso,
  total,
  submitDisabled,
  extra,
}: {
  values: DatosTutor;
  onChange: <K extends keyof DatosTutor>(field: K, value: DatosTutor[K]) => void;
  onSubmit: () => void;
  onBack: () => void;
  onClose: () => void;
  onCambiarParaQuien: () => void;
  paso: number;
  total: number;
  submitDisabled?: boolean;
  // Fase 3.1: el CAPTCHA y el error viven acá desde que este paso es el
  // que dispara el código de verificación (antes lo hacía el de datos del
  // paciente, ver pedir-turno-form.tsx).
  extra?: React.ReactNode;
}) {
  return (
    <ModalShell
      title="Primero, tus datos"
      subtitle="Te contactamos a vos por cualquier cambio en el turno."
      onClose={onClose}
      maxWidthClassName="max-w-[520px]"
      contextBar={
        <BarraContexto
          icon={<IconUsers />}
          texto="Reservás para otra persona · primera vez en la clínica"
          accionLabel="Cambiar"
          onAccion={onCambiarParaQuien}
        />
      }
      footer={<ModalFooter paso={paso} total={total} actionLabel="Continuar" onBack={onBack} actionType="submit" formId="form-otro-tutor" actionDisabled={submitDisabled} />}
    >
      <form
        id="form-otro-tutor"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <CampoTexto
            id="tu-nombre"
            label="Tu nombre completo"
            placeholder="Lucía Gómez"
            required
            value={values.nombre}
            onChange={(e) => onChange("nombre", e.target.value)}
          />
          <CampoSelect id="tu-relacion" label="Sos su…" required value={values.relacion} onChange={(e) => onChange("relacion", e.target.value)}>
            <option value="familiar">Familiar</option>
            <option value="amigo">Amigo o conocido</option>
            <option value="otro">Otro vínculo</option>
          </CampoSelect>
          <CampoTelefonoConPais
            id="tu-telefono"
            label="Tu teléfono"
            pais={values.paisTelefono}
            onPaisChange={(iso) => onChange("paisTelefono", iso)}
            valor={values.telefono}
            onValorChange={(v) => onChange("telefono", v)}
            required
          />
          <CampoTexto
            id="tu-email"
            label="Tu email"
            type="email"
            placeholder="lucia@gmail.com"
            hint="Acá te mandamos el código de confirmación"
            required
            value={values.email}
            onChange={(e) => onChange("email", e.target.value)}
          />
        </div>

        {/* El doc (§5, [3c]) suma acá un checkbox "Quiero recibir el
            recordatorio del turno por WhatsApp a este número" — se omite
            a propósito: los recordatorios automatizados por WhatsApp/SMS
            están fuera de alcance del MVP (CLAUDE.md, "Fuera de alcance
            salvo pedido explícito"), y un checkbox que promete algo que
            el sistema no hace todavía sería un control que miente. */}

        <div className="flex items-center gap-2 rounded-field bg-hueso px-3 py-2.5 text-[13px] text-grafito/70">
          <IconArrowRight className="h-4 w-4 shrink-0 text-salvia-oscuro" />
          Te mandamos un código para confirmar que sos vos, y después seguimos con la persona que se atiende.
        </div>

        {extra}
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------
// [3d] Datos del paciente — para otro, primera vez
// ---------------------------------------------------------------------

const RELACION_LABEL: Record<string, string> = {
  familiar: "familiar",
  amigo: "amigo/a",
  otro: "vínculo distinto",
};

// DatosPaciente — el doc (§5, [3d]) pide sacar teléfono/email propios
// del paciente ("el contacto es el de quien reserva, salvo que el
// negocio lo requiera"). Acá el negocio SÍ lo requiere: ya es una
// capacidad real y en uso del formulario actual (guarda el teléfono/mail
// propio del paciente en su ficha, aparte del contacto del tutor) — se
// mantienen como opcionales en vez de sacarlos, para no perder esa
// funcionalidad ya aprobada por el cliente.
export interface DatosPaciente {
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  email: string;
}

export function PantallaDatosPaciente({
  values,
  onChange,
  onSubmit,
  onBack,
  onClose,
  onEditarTutor,
  tutorNombre,
  tutorRelacion,
  paso,
  total,
  submitDisabled,
  extra,
}: {
  values: DatosPaciente;
  onChange: <K extends keyof DatosPaciente>(field: K, value: DatosPaciente[K]) => void;
  onSubmit: () => void;
  onBack: () => void;
  onClose: () => void;
  onEditarTutor: () => void;
  tutorNombre: string;
  tutorRelacion: string;
  paso: number;
  total: number;
  submitDisabled?: boolean;
  /** Este paso es el que dispara el envío del código (al mail del tutor) en el flujo real — necesita su propio Turnstile. */
  extra?: ReactNode;
}) {
  return (
    <ModalShell
      title="Datos de la persona que se atiende"
      onClose={onClose}
      maxWidthClassName="max-w-[520px]"
      contextBar={
        <BarraContexto
          icon={<IconUsers />}
          texto={`Reservás vos, ${tutorNombre} · ${RELACION_LABEL[tutorRelacion] ?? tutorRelacion}`}
          accionLabel="Editar"
          onAccion={onEditarTutor}
        />
      }
      footer={<ModalFooter paso={paso} total={total} actionLabel="Continuar" onBack={onBack} actionType="submit" formId="form-otro-paciente" actionDisabled={submitDisabled} />}
    >
      <form
        id="form-otro-paciente"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <CampoTexto id="pac-nombre" label="Nombre" placeholder="Tomás" required value={values.nombre} onChange={(e) => onChange("nombre", e.target.value)} />
          <CampoTexto
            id="pac-apellido"
            label="Apellido"
            placeholder="Gómez"
            required
            value={values.apellido}
            onChange={(e) => onChange("apellido", e.target.value)}
          />
          <CampoTexto
            id="pac-dni"
            label="DNI"
            placeholder="30123456"
            hint="Sin puntos ni espacios"
            required
            inputMode="numeric"
            value={values.dni}
            onChange={(e) => onChange("dni", e.target.value)}
          />
          <CampoTexto
            id="pac-telefono"
            label="Teléfono"
            opcional
            placeholder="+54 9 351…"
            value={values.telefono}
            onChange={(e) => onChange("telefono", e.target.value)}
          />
          <CampoTexto
            id="pac-email"
            label="Email"
            opcional
            type="email"
            placeholder="tomas@gmail.com"
            value={values.email}
            onChange={(e) => onChange("email", e.target.value)}
          />
        </div>

        {extra}
      </form>
    </ModalShell>
  );
}
