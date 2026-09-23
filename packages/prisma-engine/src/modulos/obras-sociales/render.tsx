import type { ReactNode } from "react";
import { CLASE_ALINEAR, CLASE_CHIP, CLASE_JUSTIFICAR_FLEX, CLASE_TARJETA, CLASE_TEXTO, Titulo } from "../../comunes";
import { listaDeConfig, tituloPublicoDe } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { envolverSlots } from "../../efectos/envolver-slots";
import { CATALOGO_COBERTURAS, NOMBRE_COBERTURA } from "./catalogo";
import { SLOTS_COBERTURAS } from "./variantes";

function ObrasSociales({ modulo, contexto }: { modulo: ModuloBorrador; contexto: ContextoPublico }): ReactNode {
  const permitidas = new Set<string>(CATALOGO_COBERTURAS.map(({ id }) => id));
  const coberturas = listaDeConfig(modulo.config, "coberturas").filter((id) => permitidas.has(id));
  const consultaPorOtras = modulo.config.consultaPorOtras === true;
  if (coberturas.length === 0 && !consultaPorOtras) return null;

  const envolver = envolverSlots(modulo.config, contexto.estiloMovimiento, SLOTS_COBERTURAS);
  const titulo = tituloPublicoDe(modulo.config, "Obras sociales y prepagas");
  return (
    <div className={`${CLASE_TARJETA} ${CLASE_ALINEAR}`}>
      {envolver("titulo", <Titulo className="mb-3">{titulo}</Titulo>)}
      {coberturas.length > 0 && (
        <ul className={`flex flex-wrap gap-2 ${CLASE_JUSTIFICAR_FLEX}`}>
          {coberturas.map((id) => envolver("tarjeta", (
            <li key={id} className={`${CLASE_CHIP} px-3 py-1.5 text-xs font-medium`}>
              {NOMBRE_COBERTURA[id]}
            </li>
          )))}
        </ul>
      )}
      {consultaPorOtras && <p className={`mt-3 ${CLASE_TEXTO}`}>Consultanos por otras coberturas.</p>}
    </div>
  );
}

export function seccion(modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const contenido = ObrasSociales({ modulo, contexto });
  if (contenido === null) return null;
  return {
    id: "obras-sociales",
    etiqueta: tituloPublicoDe(modulo.config, "Obras sociales y prepagas"),
    ancho: "completo",
    contenido,
  };
}
