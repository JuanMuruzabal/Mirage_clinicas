import type { ReactNode } from "react";
import { REDES_SOCIALES } from "../../constantes";
import {
  CLASE_ALINEAR,
  CLASE_ALINEAR_FLEX,
  CLASE_CHIP,
  CLASE_JUSTIFICAR_FLEX,
  CLASE_TARJETA,
  CLASE_TEXTO,
  Titulo,
} from "../../comunes";
import { tituloPublicoDe, varianteDeConfig } from "../../lectura-config";
import { telefonoLegible } from "../../telefono";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { VARIANTES } from "./variantes";
import { envolverSlots } from "../../efectos/envolver-slots";
import { SLOTS_CONTACTO } from "../../efectos/slots";

// `inline-flex min-h-6`: 24 px de alto como mínimo para el dedo (WCAG 2.2
// 2.5.8, PP-1 H14) sin agrandar la letra — "Cómo llegar" medía 15 px.
const CLASE_LINK = "inline-flex min-h-6 items-center font-medium text-[var(--pp-acento-texto,var(--color-salvia-oscuro))] underline underline-offset-2";


function Contacto({ modulo, contexto }: { modulo: ModuloBorrador; contexto: ContextoPublico }): ReactNode {
  const { contenido, telefono, utils } = contexto;
  const direccion = contenido.direccion?.trim() || null;
  const hrefTel = telefono ? utils.hrefDeTelefono(telefono) : null;
  const redes = REDES_SOCIALES.map((r) => ({ ...r, href: utils.urlDeRedSocial(r.id, contenido.redesSociales[r.id] ?? "") })).filter(
    (r): r is typeof r & { href: string } => r.href !== null,
  );
  if (!direccion && !hrefTel && redes.length === 0) return null;
  const envolver = envolverSlots(modulo.config, contexto.estiloMovimiento, SLOTS_CONTACTO);

  const mapa =
    direccion && contenido.mostrarMapa ? (
      <iframe
        title={`Mapa: ${direccion}`}
        src={utils.urlDeMapaEmbebido(direccion)}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="aspect-[16/10] w-full rounded-field border-[0.5px] border-(--pp-borde)"
      />
    ) : null;
  // "dividido" sin mapa no tiene qué poner a un costado: se dibuja como tarjeta.
  const dividido = varianteDeConfig(modulo.config, VARIANTES) === "dividido" && mapa !== null;

  const datos = (
    <>
      {envolver("titulo", <Titulo>{tituloPublicoDe(modulo.config, "Contacto")}</Titulo>)}
      {direccion && (
        <div className={`flex flex-col gap-2 ${CLASE_ALINEAR_FLEX}`}>
          {envolver("texto", <p className={CLASE_TEXTO}>{direccion}</p>)}
          {!dividido && mapa}
          {envolver("boton", <a href={utils.urlDeComoLlegar(direccion)} target="_blank" rel="noopener noreferrer" className={`text-xs ${CLASE_LINK}`}>
            Cómo llegar
          </a>)}
        </div>
      )}
      {hrefTel && (
        envolver("texto", <p className={CLASE_TEXTO}>
          Teléfono:{" "}
          <a href={hrefTel} className={CLASE_LINK}>
            {telefonoLegible(telefono ?? "")}
          </a>
        </p>)
      )}
      {redes.length > 0 && (
        <ul className={`flex flex-wrap gap-2 ${CLASE_JUSTIFICAR_FLEX}`}>
          {redes.map((r) => (
            <li key={r.id}>
              {envolver("boton", <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${CLASE_CHIP} px-3 py-1.5 text-xs font-medium hover:border-[var(--pp-acento,var(--color-salvia))]`}
              >
                {r.etiqueta}
              </a>)}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (dividido) {
    return envolver("tarjeta", (
      <div className={`${CLASE_TARJETA} grid grid-cols-1 items-center gap-6 @xl:grid-cols-2`}>
        {mapa}
        <div className={`flex flex-col gap-4 ${CLASE_ALINEAR}`}>{datos}</div>
      </div>
    ));
  }
  return envolver("tarjeta", <div className={`${CLASE_TARJETA} flex flex-col gap-4 ${CLASE_ALINEAR}`}>{datos}</div>);
}

export function seccion(modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = Contacto({ modulo, contexto });
  if (nodo === null) return null;
  return { id: "contacto", etiqueta: tituloPublicoDe(modulo.config, "Contacto"), ancho: "completo", contenido: nodo };
}
