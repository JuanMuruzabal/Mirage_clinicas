"use client";

import type { PacienteVerificadoPublico } from "@/lib/api";
import { FilaPersona, ModalFooter, ModalShell } from "./shared";

/**
 * [5a]/[5b] — resultado de la búsqueda, ya con el código validado
 * (docs/Fases post MVP/Fase 2/turnero_pagina/rediseno-flujo-turnos.md §5). El backend solo expone
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

// [5b] — para otro: lista de fichas del tutor, ninguna preseleccionada.
// Sin scroll propio (a diferencia de la primera entrega): el CUERPO del
// modal ya scrollea solo (docs/Fases post MVP/Fase 2/turnero_pagina/prompt-claude-code-fecha-horario.md,
// punto 3) — un segundo scroll acá adentro sería scroll anidado.
//
// Fase 3.1: `onOtraPersona` destraba la fila "Otra persona" del doc, que
// hasta ahora quedaba afuera por una razón concreta — el camino "ya he
// venido antes" para tutor junta SOLO su mail, y dar de alta un paciente
// nuevo necesita además su nombre, teléfono y vínculo. Desde que esta
// pantalla también aparece en el camino "primera vez" (donde el tutor ya
// completó todo eso), el destino del botón depende de qué datos hay: a
// los datos del paciente si el tutor ya está completo, o de vuelta a sus
// datos si entró por "ya he venido antes". Esa decisión vive en el
// llamador; acá es un botón y nada más.
export function PantallaParaQuienLista({
  pacientes,
  seleccionado,
  onSeleccionar,
  onBack,
  onClose,
  onContinuar,
  onOtraPersona,
  paso,
  total,
}: {
  pacientes: PacienteVerificadoPublico[];
  seleccionado: string | null;
  onSeleccionar: (id: string) => void;
  onBack: () => void;
  onClose: () => void;
  onContinuar: () => void;
  onOtraPersona?: () => void;
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
        {onOtraPersona && (
          <button
            type="button"
            onClick={onOtraPersona}
            className="rounded-field border border-dashed border-grafito/25 px-3 py-2.5 text-left text-[14px] text-grafito/70 transition-colors hover:border-salvia-oscuro hover:text-grafito focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia-oscuro"
          >
            + Es para otra persona
          </button>
        )}
      </div>
    </ModalShell>
  );
}
