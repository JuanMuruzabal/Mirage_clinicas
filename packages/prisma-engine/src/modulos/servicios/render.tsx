import type { ReactNode } from "react";
import { CLASE_ALINEAR, CLASE_CHIP, CLASE_TARJETA, CLASE_TARJETA_CHICA, CLASE_TEXTO, CLASE_TEXTO_TENUE, Titulo } from "../../comunes";
import { listaDeConfig, textoDeConfig, varianteDeConfig } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, ServicioVista, SeccionPublica } from "../../tipos";
import { envolverSlots } from "../../efectos/envolver-slots";
import { SLOTS_SERVICIOS } from "./slots";
import { VARIANTES } from "./variantes";
import { claveServicio } from "./clave";

function duracion(servicio: ServicioVista): string {
  return servicio.duracionMinima === servicio.duracionMaxima
    ? `${servicio.duracionMinima} min`
    : `${servicio.duracionMinima}–${servicio.duracionMaxima} min`;
}

function Servicio({ servicio, variante, envolver, href }: {
  servicio: ServicioVista;
  variante: string;
  envolver: (slot: string, nodo: ReactNode) => ReactNode;
  href?: string;
}) {
  const contenido = (
    <div className="flex h-full flex-col items-start gap-3">
      <div>
        {envolver("titulo", <h3 className={`font-medium ${CLASE_TEXTO}`}>{servicio.nombre}</h3>)}
        <p className={`mt-1 text-xs ${CLASE_TEXTO_TENUE}`}>{duracion(servicio)}</p>
      </div>
      {href && envolver("boton", <a className={`${CLASE_CHIP} mt-auto inline-flex items-center px-3 py-1.5 text-xs font-medium`} href={href}>Pedir turno</a>)}
    </div>
  );

  if (variante === "compacto") return <li className="list-none">{envolver("tarjeta", <div className={`${CLASE_CHIP} inline-flex min-w-52 flex-col gap-2 rounded-field px-3 py-2`}>{contenido}</div>)}</li>;
  if (variante === "lista") return <li className="list-none border-b border-(--pp-borde) py-3 last:border-b-0">{contenido}</li>;
  return <li className="list-none">{envolver("tarjeta", <div className={`${CLASE_TARJETA_CHICA} h-full`}>{contenido}</div>)}</li>;
}

function Servicios({ modulo, contexto }: { modulo: ModuloBorrador; contexto: ContextoPublico }): ReactNode {
  const disponibles = contexto.contenido.servicios ?? [];
  const porNombre = new Map(disponibles.map((servicio) => [claveServicio(servicio.nombre), servicio]));
  const elegidos = listaDeConfig(modulo.config, "nombres")
    .map((nombre) => porNombre.get(claveServicio(nombre)))
    .filter((servicio): servicio is ServicioVista => servicio !== undefined);
  if (elegidos.length === 0) return null;

  const variante = varianteDeConfig(modulo.config, VARIANTES);
  const envolver = envolverSlots(modulo.config, contexto.estiloMovimiento, SLOTS_SERVICIOS);
  const filas = elegidos.map((servicio) => (
    <Servicio
      key={claveServicio(servicio.nombre)}
      servicio={servicio}
      variante={variante}
      envolver={envolver}
      href={contexto.utils.hrefPedirTurnoConTipo?.(servicio.nombre)}
    />
  ));
  const lista = variante === "lista"
    ? "flex flex-col"
    : variante === "compacto"
      ? "flex flex-wrap gap-2"
      : "grid grid-cols-1 gap-3 @lg:grid-cols-2";


  return (
    <div className={`flex flex-col gap-4 ${CLASE_ALINEAR}`}>
      {envolver("titulo", <Titulo>{textoDeConfig(modulo.config, "tituloPublico").trim() || "Servicios y tratamientos"}</Titulo>)}
      <ul className={lista}>{filas}</ul>
    </div>
  );
}

export function seccion(modulo: ModuloBorrador, indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = Servicios({ modulo, contexto });
  if (nodo === null) return null;
  return {
    id: `servicios-${indice + 1}`,
    etiqueta: textoDeConfig(modulo.config, "tituloPublico").trim() || "Servicios",
    ancho: "completo",
    contenido: nodo,
  };
}
