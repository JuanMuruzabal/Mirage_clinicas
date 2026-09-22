import type { ReactNode } from "react";
import { CLASE_ALINEAR, CLASE_CHIP, CLASE_JUSTIFICAR_FLEX, CLASE_TARJETA, CLASE_TARJETA_CHICA, CLASE_TEXTO, Titulo } from "../../comunes";
import { tituloPublicoDe, varianteDeConfig } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { VARIANTES } from "./variantes";
import { envolverSlots } from "../../efectos/envolver-slots";
import { SLOTS_TARJETA } from "../../efectos/slots";

function Marca() {
  return <span aria-hidden="true" className="inline-block h-2 w-2 flex-none rounded-full bg-[var(--pp-acento,var(--color-salvia))]" />;
}

function Especialidades({ especialidades, config, estiloMovimiento }: { especialidades: string[]; config: Record<string, unknown>; estiloMovimiento?: ContextoPublico["estiloMovimiento"] }): ReactNode {
  if (especialidades.length === 0) return null;
  const titulo = <Titulo className="mb-3">{tituloPublicoDe(config, "Especialidades")}</Titulo>;
  const envolver = envolverSlots(config, estiloMovimiento, SLOTS_TARJETA);
  const variante = varianteDeConfig(config, VARIANTES);

  if (variante === "tarjetas") {
    return (
      <div className={CLASE_ALINEAR}>
        {envolver("titulo", titulo)}
        <ul className="grid grid-cols-2 gap-2">
          {especialidades.map((esp) => (
            <li key={esp} className={`${CLASE_TARJETA_CHICA} flex items-center gap-2 text-left ${CLASE_TEXTO}`}>
              <Marca />
              {esp}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (variante === "lista") {
    return (
      <div className={`${CLASE_TARJETA} ${CLASE_ALINEAR}`}>
        {envolver("titulo", titulo)}
        <ul className="flex flex-col text-left">
          {especialidades.map((esp) => (
            <li key={esp} className={`flex items-center gap-2 border-b-[0.5px] border-(--pp-borde) py-2 last:border-b-0 ${CLASE_TEXTO}`}>
              <Marca />
              {esp}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className={CLASE_ALINEAR}>
        {envolver("titulo", titulo)}
      <div className={`flex flex-wrap gap-2 ${CLASE_JUSTIFICAR_FLEX}`}>
        {especialidades.map((esp) => (
          <span key={esp} className={`${CLASE_CHIP} px-2.5 py-1 text-xs`}>
            {esp}
          </span>
        ))}
      </div>
    </div>
  );
}

export function seccion(modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = Especialidades({ especialidades: contexto.especialidades, config: modulo.config, estiloMovimiento: contexto.estiloMovimiento });
  if (nodo === null) return null;
  return { id: "especialidades", etiqueta: tituloPublicoDe(modulo.config, "Especialidades"), ancho: "medio", contenido: nodo };
}
