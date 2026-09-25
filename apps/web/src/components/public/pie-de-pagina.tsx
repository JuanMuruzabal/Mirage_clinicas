import Link from "next/link";
import { REDES_SOCIALES, telefonoLegible } from "@dental-mirage/prisma-engine";
import { hrefDeTelefono, urlDeRedSocial } from "@/lib/pagina-publica/enlaces";

interface PieDePaginaProps {
  nombreClinica: string;
  direccion?: string | null;
  telefono?: string | null;
  redesSociales: Record<string, string>;
  /** Dentro del editor no es el pie de la página: un `<div>`, no un segundo landmark `contentinfo`. */
  vistaPrevia?: boolean;
}

const CLASE_LINK = "underline underline-offset-2 hover:opacity-80";

// PieDePagina (PP-7, H26) — la página terminaba en la última sección, sin
// cierre. No se configura: usa los datos que la clínica ya cargó (dirección,
// teléfono, redes) y lo que falte simplemente no aparece. "Hecho con PRISMA"
// lleva a la home del producto (decisión de Juan, 2026-09-25).
export function PieDePagina({ nombreClinica, direccion, telefono, redesSociales, vistaPrevia }: PieDePaginaProps) {
  const Tag = vistaPrevia ? "div" : "footer";
  const hrefTel = telefono ? hrefDeTelefono(telefono) : null;
  const redes = REDES_SOCIALES.map((r) => ({ ...r, href: urlDeRedSocial(r.id, redesSociales[r.id] ?? "") })).filter(
    (r): r is typeof r & { href: string } => r.href !== null,
  );

  return (
    <Tag className="mx-auto flex w-full max-w-[70rem] flex-col items-center gap-3 border-t border-(--pp-borde) pt-8 text-center text-sm text-(--pp-texto)/80">
      <p className="font-[family-name:var(--font-display)] text-base font-medium text-(--pp-texto)">{nombreClinica}</p>
      {(direccion || hrefTel) && (
        <p className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {direccion && <span>{direccion}</span>}
          {hrefTel && telefono && (
            <a href={hrefTel} className={CLASE_LINK}>
              {telefonoLegible(telefono)}
            </a>
          )}
        </p>
      )}
      {redes.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {redes.map((r) => (
            <li key={r.id}>
              <a href={r.href} target="_blank" rel="noopener noreferrer" className={CLASE_LINK}>
                {r.etiqueta}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-(--pp-texto)/75">
        {/* El año sale del reloj de quien renderiza: servidor y navegador
            pueden diferir solo en el cambio de año. */}
        © <span suppressHydrationWarning>{new Date().getFullYear()}</span> {nombreClinica} ·{" "}
        <Link href="/" className={CLASE_LINK}>
          Hecho con PRISMA
        </Link>
      </p>
    </Tag>
  );
}
