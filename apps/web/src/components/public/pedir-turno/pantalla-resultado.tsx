"use client";

import type { PacienteVerificadoPublico } from "@/lib/api";
import { FilaPersona, ModalFooter, ModalShell } from "./shared";

/**
 * [5a]/[5b] — resultado de la búsqueda, ya con el código validado
 * (docs/Fase 2/turnero_pagina/rediseno-flujo-turnos.md §5). El backend solo expone
 * `{id, nombre, dni}` en `PacienteVerificadoPublico` (`lib/api.ts`) — sin
 * "última visita" ni vínculo, que el mockup del doc muestra en la
 * segunda línea de la fila de persona. No se inventan esos datos: la
 * segunda línea acá es el DNI (sin enmascarar, ya con la identidad
 * probada — mismo criterio que pide el doc para esta instancia).
 */

// [5a] — para mí, ya vine antes: un único resultado, preseleccionado.
export function PantallaSosVos({
  paciente,
  onNoSoyYo,
  onConfirmar,
  onClose,
  paso,
  total,
}: {
  paciente: PacienteVerificadoPublico;
  onNoSoyYo: () => void;
  onConfirmar: () => void;
  onClose: () => void;
  paso: number;
  total: number;
}) {
  return (
    <ModalShell
      title="¿Sos vos?"
      subtitle="Encontramos esta ficha con tus datos."
      onClose={onClose}
      footer={<ModalFooter paso={paso} total={total} backLabel="No soy yo" onBack={onNoSoyYo} actionLabel="Sí, soy yo" onAction={onConfirmar} />}
    >
      <FilaPersona nombre={paciente.nombre} secundaria={`DNI ${paciente.dni}`} selected onSelect={() => {}} />
    </ModalShell>
  );
}

// [5b] — para otro, ya vine antes: lista de fichas del tutor, ninguna
// preseleccionada. La fila "Otra persona" del doc queda afuera por ahora
// (§3e actual solo junta el mail del tutor, no nombre/teléfono/vínculo —
// datos que hacen falta para dar de alta un paciente nuevo bajo ese
// tutor; sumarlos a [3e] queda pendiente de una decisión aparte). Sin
// scroll propio (a diferencia de la primera entrega): el CUERPO del
// modal ya scrollea solo (docs/archivo/prompt-claude-code-fecha-horario.md,
// punto 3) — un segundo scroll acá adentro sería scroll anidado.
export function PantallaParaQuienLista({
  pacientes,
  seleccionado,
  onSeleccionar,
  onBack,
  onClose,
  onContinuar,
  paso,
  total,
}: {
  pacientes: PacienteVerificadoPublico[];
  seleccionado: string | null;
  onSeleccionar: (id: string) => void;
  onBack: () => void;
  onClose: () => void;
  onContinuar: () => void;
  paso: number;
  total: number;
}) {
  return (
    <ModalShell
      title="¿Para quién es el turno?"
      subtitle="Estas son las personas de tu cuenta."
      onClose={onClose}
      footer={<ModalFooter paso={paso} total={total} onBack={onBack} actionLabel="Continuar" onAction={onContinuar} actionDisabled={!seleccionado} />}
    >
      <div className="flex flex-col gap-2">
        {pacientes.map((p) => (
          <FilaPersona key={p.id} nombre={p.nombre} secundaria={`DNI ${p.dni}`} selected={seleccionado === p.id} onSelect={() => onSeleccionar(p.id)} />
        ))}
      </div>
    </ModalShell>
  );
}
