import Link from "next/link";
import { CONTACTO_EMAIL, getCurrentYear } from "@/lib/contacto";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Para pacientes",
    links: [{ label: "Buscar clínicas", href: "/buscar" }],
  },
  {
    title: "Para profesionales",
    links: [
      { label: "Sumate", href: "/sumarse" },
      { label: "Ingresar", href: "/ingresar" },
    ],
  },
];

// Footer público — mismo criterio estructural que Marcuzzi_Madryn
// (site-footer.tsx de ese proyecto): título centrado, línea divisoria,
// columnas de links + contacto, copyright. Fondo oscuro, no blanco — el
// blanco quedaba demasiado prominente contra el resto de la página
// (pedido explícito). Identidad cálida (TR-015): `grafito` en vez de
// `ink` — mismo criterio de "cambio de piel" que el resto del sitio, un
// tono oscuro por otro, sin tocar la estructura. Oculto en las páginas
// dedicadas al servicio para profesionales — ver site-footer-visibility.tsx.
export function SiteFooter() {
  const year = getCurrentYear();

  return (
    <footer className="bg-grafito">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
        {/* Wordmark sin tocar tipografía (font-black uppercase) — identidad
            de marca, no de sección, mismo criterio que el header (TR-013). */}
        <p className="text-center font-[family-name:var(--font-display)] text-2xl font-black uppercase tracking-tight text-marfil">
          Dental Mirage
        </p>

        <div className="my-10 border-t border-marfil/15" />

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="mb-4 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-marfil/50">
                {col.title}
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {col.links.map((link) => (
                  <li key={link.href}>
                    {/* salvia-claro, no salvia (tono medio) — contra
                        grafito el tono medio da ~3.6:1, no llega al 4.5:1
                        de AA para texto normal (verificado a mano, mismo
                        criterio de TR-013: el tono medio nunca lleva
                        texto). salvia-claro da ~10.6:1. */}
                    <Link href={link.href} className="text-marfil hover:text-salvia-claro">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="col-span-2 sm:col-span-1">
            <p className="mb-4 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-marfil/50">
              Contacto
            </p>
            <ul className="flex flex-col gap-2 text-sm text-marfil/70">
              <li>Córdoba, Argentina</li>
              <li>{CONTACTO_EMAIL}</li>
            </ul>
          </div>
        </div>

        <p className="mt-14 text-center text-xs text-marfil/50">© {year} Dental Mirage. Córdoba, Argentina.</p>
      </div>
    </footer>
  );
}
