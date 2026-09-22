import type { ReactNode } from "react";
import { REDES_SOCIALES } from "../../constantes";
import { CLASE_TARJETA, Titulo } from "../../comunes";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";

function Contacto({ contexto }: { contexto: ContextoPublico }): ReactNode {
  const { contenido, telefono, utils } = contexto;
  const direccion = contenido.direccion?.trim() || null;
  const hrefTel = telefono ? utils.hrefDeTelefono(telefono) : null;
  const redes = REDES_SOCIALES.map((r) => ({ ...r, href: utils.urlDeRedSocial(r.id, contenido.redesSociales[r.id] ?? "") })).filter(
    (r): r is typeof r & { href: string } => r.href !== null,
  );
  if (!direccion && !hrefTel && redes.length === 0) return null;

  return (
    <div className={`${CLASE_TARJETA} flex flex-col gap-4 text-center`}>
      <Titulo>Contacto</Titulo>
      {direccion && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-grafito/80">{direccion}</p>
          {contenido.mostrarMapa && (
            <iframe
              title={`Mapa: ${direccion}`}
              src={utils.urlDeMapaEmbebido(direccion)}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="aspect-[16/10] w-full rounded-field border-[0.5px] border-arena"
            />
          )}
          <a
            href={utils.urlDeComoLlegar(direccion)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-[var(--pp-acento-texto,var(--color-salvia-oscuro))] underline underline-offset-2"
          >
            Cómo llegar
          </a>
        </div>
      )}
      {hrefTel && (
        <p className="text-sm text-grafito/80">
          Teléfono:{" "}
          <a href={hrefTel} className="font-medium text-[var(--pp-acento-texto,var(--color-salvia-oscuro))] underline underline-offset-2">
            {telefono}
          </a>
        </p>
      )}
      {redes.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2">
          {redes.map((r) => (
            <li key={r.id}>
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border-[0.5px] border-arena bg-[var(--pp-acento-suave,var(--color-marfil))] px-3 py-1.5 text-xs font-medium text-[var(--pp-acento-texto,var(--color-grafito))] hover:border-[var(--pp-acento,var(--color-salvia))]"
              >
                {r.etiqueta}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function seccion(_modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = Contacto({ contexto });
  if (nodo === null) return null;
  return { id: "contacto", etiqueta: "Contacto", ancho: "completo", contenido: nodo };
}
