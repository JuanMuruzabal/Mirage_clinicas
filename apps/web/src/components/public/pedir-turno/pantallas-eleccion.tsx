"use client";

import { IconUser, IconUserCheck, IconUserPlus, IconUsers } from "@/components/icons";
import { BarraContexto, GrillaOpciones, ModalFooter, ModalShell, TarjetaOpcion } from "./shared";

/**
 * Pantallas [1] y [2] del rediseño del wizard (docs/rediseno-flujo-
 * turnos.md §5) — las dos primeras del flujo, antes de que se abra
 * cualquier rama. Presentacionales: el estado (selección, navegación,
 * total de pasos según la rama) lo maneja el orquestador del wizard
 * (pedir-turno-form.tsx), no wiredas ahí todavía — paso 2 del orden
 * sugerido por el propio doc (§9), pensado para validar tarjeta/pie
 * antes de tocar el resto del flujo.
 */

export type ParaQuien = "mi" | "otro";
export type YaAtendiste = "primera-vez" | "ya-vine";

// [1] ¿Para quién es el turno? — primer paso, sin "Atrás" (§5).
export function PantallaParaQuien({
  value,
  onChange,
  onContinuar,
  onClose,
}: {
  value: ParaQuien | null;
  onChange: (v: ParaQuien) => void;
  onContinuar: () => void;
  onClose: () => void;
}) {
  // Total de pasos todavía no está decidido en esta pantalla (depende de
  // la propia elección que se hace acá) — "para mí" son 4, "para otro"
  // son 5 (§4). Antes de elegir, se muestra el mínimo común (4).
  const total = value === "otro" ? 5 : 4;

  return (
    <ModalShell
      title="¿Para quién es el turno?"
      subtitle="Podés reservar a tu nombre o a nombre de otra persona."
      onClose={onClose}
      footer={<ModalFooter paso={1} total={total} actionLabel="Continuar" onAction={onContinuar} actionDisabled={value === null} />}
    >
      <GrillaOpciones>
        <TarjetaOpcion
          icon={<IconUser />}
          titulo="Para mí"
          descripcion="Usamos tus datos guardados"
          selected={value === "mi"}
          onSelect={() => onChange("mi")}
        />
        <TarjetaOpcion
          icon={<IconUsers />}
          titulo="Para otra persona"
          descripcion="Vas a cargar sus datos"
          selected={value === "otro"}
          onSelect={() => onChange("otro")}
        />
      </GrillaOpciones>
    </ModalShell>
  );
}

// [2] ¿Ya te atendiste con nosotros? — misma pareja de tarjetas para las
// dos ramas ("para mí" / "para otro"); la barra de contexto es lo único
// que cambia entre ellas, y solo aparece del lado "para otro" porque
// recién ahí hay algo que mostrar (§3.7: "solo puede mostrar datos que
// ya existen en ese punto del flujo" — del lado "para mí" no hay nada
// que contextualizar todavía).
export function PantallaYaAtendiste({
  paraQuien,
  value,
  onChange,
  onContinuar,
  onBack,
  onClose,
  onCambiarParaQuien,
}: {
  paraQuien: ParaQuien;
  value: YaAtendiste | null;
  onChange: (v: YaAtendiste) => void;
  onContinuar: () => void;
  onBack: () => void;
  onClose: () => void;
  onCambiarParaQuien: () => void;
}) {
  const total = paraQuien === "otro" ? 5 : 4;

  return (
    <ModalShell
      title="¿Ya te atendiste con nosotros?"
      subtitle="Si ya viniste, buscamos tu ficha y salteás varios pasos."
      onClose={onClose}
      contextBar={
        paraQuien === "otro" ? (
          <BarraContexto icon={<IconUsers />} texto="Reservás para otra persona" accionLabel="Cambiar" onAccion={onCambiarParaQuien} />
        ) : undefined
      }
      footer={<ModalFooter paso={2} total={total} actionLabel="Continuar" onAction={onContinuar} onBack={onBack} actionDisabled={value === null} />}
    >
      <GrillaOpciones>
        <TarjetaOpcion
          icon={<IconUserPlus />}
          titulo="Es mi primera vez"
          descripcion="Creamos tu ficha ahora"
          selected={value === "primera-vez"}
          onSelect={() => onChange("primera-vez")}
        />
        <TarjetaOpcion
          icon={<IconUserCheck />}
          titulo="Ya vine antes"
          descripcion="Buscamos tus datos"
          selected={value === "ya-vine"}
          onSelect={() => onChange("ya-vine")}
        />
      </GrillaOpciones>
    </ModalShell>
  );
}
