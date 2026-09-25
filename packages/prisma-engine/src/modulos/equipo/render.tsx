import type { ReactNode } from "react";
import { CLASE_ALINEAR, CLASE_FOTO, CLASE_JUSTIFICAR_FLEX, CLASE_JUSTIFICAR_FLEX_SEGURO, CLASE_TARJETA, CLASE_TARJETA_CHICA, CLASE_TEXTO, CLASE_TEXTO_TENUE, Foto, Titulo } from "../../comunes";
import { listaDeConfig, textoDeConfig, varianteDeConfig } from "../../lectura-config";
import type { ContextoPublico, EquipoIntegranteVista, ModuloBorrador, SeccionPublica } from "../../tipos";
import { envolverSlots } from "../../efectos/envolver-slots";
import { VARIANTES } from "./variantes";
import { SLOTS_EQUIPO } from "./slots";

function booleano(config: Record<string, unknown>, campo: string, porDefecto: boolean): boolean {
  return typeof config[campo] === "boolean" ? (config[campo] as boolean) : porDefecto;
}

function Retrato({ persona, nombre, variante, contexto }: { persona: EquipoIntegranteVista; nombre: string; variante: string; contexto: ContextoPublico }): ReactNode {
  const fotoUrl = persona.fotoUrl && contexto.utils.esUrlDeFotoSegura(persona.fotoUrl) ? persona.fotoUrl : null;
  const forma = variante === "avatares" || variante === "carrusel-sin-nombre" ? "aspect-square rounded-full" : "aspect-[4/3] rounded-(--pp-radio)";
  const imagen = fotoUrl ? (
    <Foto src={fotoUrl} alt={`Foto de ${nombre}`} className={`h-full w-full ${forma} ${CLASE_FOTO}`} />
  ) : (
    <span role="img" aria-label={`Sin foto de ${nombre}`} className={`flex h-full w-full items-center justify-center border border-(--pp-borde) bg-[var(--pp-acento-suave,var(--color-marfil))] ${forma}`}>
      <svg aria-hidden="true" viewBox="0 0 48 48" className="h-2/3 w-2/3 text-[var(--pp-acento-texto,var(--color-grafito))]" fill="currentColor">
        <circle cx="24" cy="16" r="9" />
        <path d="M7 43c0-9.4 7.6-17 17-17s17 7.6 17 17H7Z" />
      </svg>
    </span>
  );
  return <span className="block w-full">{imagen}</span>;
}

function TarjetaVolteable({ persona, contexto, mostrarNombre, mostrarDescripcion, envolver }: {
  persona: EquipoIntegranteVista;
  contexto: ContextoPublico;
  mostrarNombre: boolean;
  mostrarDescripcion: boolean;
  envolver: (slot: string, nodo: ReactNode) => ReactNode;
}) {
  const nombre = persona.nombre.trim();
  const descripcion = persona.descripcion?.trim();
  return (
    <details className="group [perspective:1000px]">
      <summary aria-label={`Ver información de ${nombre}`} className={`block cursor-pointer list-none rounded-(--pp-radio) ${CLASE_ALINEAR} [&::-webkit-details-marker]:hidden`}>
        <div className={`relative min-h-52 ${CLASE_TARJETA} [transform-style:preserve-3d] transition-transform duration-500 group-open:[transform:rotateY(180deg)] motion-reduce:transition-none`}>
          <div className="[backface-visibility:hidden]">
            {envolver("imagen", <Retrato persona={persona} nombre={nombre} variante="tarjeta-volteable" contexto={contexto} />)}
            {mostrarNombre && envolver("titulo", <p className={`mt-3 font-medium ${CLASE_TEXTO}`}>{nombre}</p>)}
            <span className={`${CLASE_TEXTO_TENUE} mt-2 block text-xs`}>Tocá para ver más</span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            {mostrarDescripcion && descripcion ? envolver("texto", <p className={`whitespace-pre-line ${CLASE_TEXTO}`}>{descripcion}</p>) : <p className={CLASE_TEXTO_TENUE}>{nombre}</p>}
          </div>
        </div>
      </summary>
    </details>
  );
}

function tarjetaDePersona(persona: EquipoIntegranteVista, indice: number, variante: string, config: Record<string, unknown>, contexto: ContextoPublico, envolver: (slot: string, nodo: ReactNode) => ReactNode): ReactNode {
  const nombre = persona.nombre.trim();
  const descripcion = persona.descripcion?.trim();
  const mostrarNombre = booleano(config, "mostrarNombre", true);
  const permiteDescripcion = variante === "foto-descripcion" || variante === "carrusel-nombre" || variante === "tarjeta-volteable";
  const mostrarDescripcion = permiteDescripcion && booleano(config, "mostrarDescripcion", true);

  if (variante === "tarjeta-volteable") {
    return envolver("tarjeta", <li key={`${nombre}-${indice}`}><TarjetaVolteable persona={persona} contexto={contexto} mostrarNombre={mostrarNombre} mostrarDescripcion={mostrarDescripcion} envolver={envolver} /></li>);
  }

  const avatar = envolver("imagen", <Retrato persona={persona} nombre={nombre} variante={variante} contexto={contexto} />);
  if (variante === "avatares" || variante === "carrusel-sin-nombre") {
    const etiqueta = mostrarNombre ? (
      variante === "carrusel-sin-nombre" ? (
        <details className="group mt-2 text-center">
          <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">Ver nombre</summary>
          {envolver("titulo", <p className={`mt-1 ${CLASE_TEXTO}`}>{nombre}</p>)}
        </details>
      ) : envolver("titulo", <p className={`mt-2 text-center text-sm font-medium ${CLASE_TEXTO}`}>{nombre}</p>)
    ) : null;
    return envolver("tarjeta", <li key={`${nombre}-${indice}`} className="w-28 shrink-0">{avatar}{etiqueta}</li>);
  }

  const contenido = (
    <div className={`${CLASE_TARJETA_CHICA} h-full ${CLASE_ALINEAR}`}>
      {avatar}
      {mostrarNombre && envolver("titulo", <p className="mt-3 font-medium">{nombre}</p>)}
      {mostrarDescripcion && descripcion && envolver("texto", <p className={`mt-2 whitespace-pre-line ${CLASE_TEXTO}`}>{descripcion}</p>)}
    </div>
  );
  const foco = variante === "carrusel-nombre" ? "w-64 shrink-0 snap-start" : "";
  return envolver("tarjeta", <li key={`${nombre}-${indice}`} className={foco}>{contenido}</li>);
}

function Equipo({ modulo, contexto }: { modulo: ModuloBorrador; contexto: ContextoPublico }): ReactNode {
  const equipo = modulo.datosVista?.equipo ?? [];
  if (equipo.length === 0) return null;

  const variante = varianteDeConfig(modulo.config, VARIANTES);
  const titulo = <Titulo>{textoDeConfig(modulo.config, "tituloPublico").trim() || "Nuestro equipo"}</Titulo>;
  const envolver = envolverSlots(modulo.config, contexto.estiloMovimiento, SLOTS_EQUIPO);
  const personas = equipo.map((persona, indice) => tarjetaDePersona(persona, indice, variante, modulo.config, contexto, envolver));
  const fila = variante === "avatares" || variante === "carrusel-sin-nombre" || variante === "carrusel-nombre";
  // Grilla de columnas de ancho acotado que se acomodan al CONTENEDOR (no a
  // la ventana: con `sm:`/`lg:` la vista previa "Móvil" mostraba tres
  // columnas). Con menos personas que columnas, las vacías se colapsan
  // (auto-fit) y el grupo se alinea como la sección (PP-7, H25): antes
  // quedaba siempre a la izquierda bajo un título centrado.
  const claseLista = fila
    ? `flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 ${CLASE_JUSTIFICAR_FLEX_SEGURO} focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--pp-acento)`
    : `grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),20rem))] gap-4 ${CLASE_JUSTIFICAR_FLEX}`;

  return (
    <div className={`flex flex-col gap-4 ${CLASE_ALINEAR}`}>
      {envolver("titulo", titulo)}
      {/* Una fila con scroll horizontal tiene que poder recorrerse con el
          teclado (PP-1, H8): foco propio y un nombre, como el carrusel de
          la galería. */}
      <ul className={claseLista} {...(fila ? { tabIndex: 0, "aria-label": "Equipo: deslizá para ver a todos" } : {})}>{personas}</ul>

    </div>
  );
}

export function seccion(modulo: ModuloBorrador, indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = Equipo({ modulo, contexto });
  if (nodo === null) return null;
  return { id: `equipo-${indice + 1}`, etiqueta: textoDeConfig(modulo.config, "tituloPublico").trim() || "Equipo", ancho: "completo", contenido: nodo };
}
