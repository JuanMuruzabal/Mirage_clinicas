"use client";

import { CLASE_AYUDA, definicionDeModulo, type CamposDePagina, type ModuloBorrador } from "@dental-mirage/prisma-engine";
import type { Borrador } from "@/lib/pagina-publica/borrador";
import { SubirFoto } from "./subir-foto";

interface EditorDeModuloProps {
  modulo: ModuloBorrador;
  borrador: Borrador;
  /** La dirección de la clínica: es lo que se muestra si no hay override. */
  direccionClinica?: string | null;
  /** El teléfono viene del perfil; acá solo se muestra cuál va a aparecer. */
  telefono: string;
  onConfig: (config: Record<string, unknown>) => void;
  onBorrador: (parcial: Partial<Borrador>) => void;
}

function camposDePagina(b: Borrador): CamposDePagina {
  return { bio: b.bio, direccionOverride: b.direccionOverride, mostrarMapa: b.mostrarMapa, redes: b.redes };
}

// EditorDeModulo (Fase 4.4, PE-1) — el formulario de UN módulo: un lookup en
// el registro único (@dental-mirage/prisma-engine), sin `switch`. Edita el
// borrador, nunca llama al backend: guardar es una sola acción, en la barra
// de arriba. Los campos que son de la PÁGINA y no del módulo (la bio, las
// redes, el mapa) se editan desde el módulo que los muestra — ver
// CamposDePagina en el paquete.
export function EditorDeModulo({ modulo, borrador, direccionClinica, telefono, onConfig, onBorrador }: EditorDeModuloProps) {
  const definicion = definicionDeModulo(modulo.tipo);
  if (!definicion) return <p className={CLASE_AYUDA}>Este módulo todavía no se puede editar acá.</p>;

  return (
    <definicion.Editor
      modulo={modulo}
      pagina={camposDePagina(borrador)}
      direccionClinica={direccionClinica}
      telefono={telefono}
      onConfig={onConfig}
      onPagina={onBorrador}
      componentes={{ SubirFoto }}
    />
  );
}
