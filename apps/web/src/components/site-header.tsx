import Link from "next/link";
import { getSessionToken } from "@/lib/session";
import { apiMe } from "@/lib/api";
import { QuadrantMark } from "./quadrant-mark";
import { HeaderFrame } from "./header-frame";
import { VolverAlInicioLink } from "./volver-al-inicio-link";
import { navLinkClass } from "@/lib/styles";

// Header global. Antes de completar el onboarding (spec §3) no hay sesión
// — se ve "Ingresar"/"Sumate". Una vez sumada la cuenta, el header pasa a
// mostrar los accesos a las dos áreas del producto ("Gestionar tu
// clínica"/"Editar tu página") + "Tu perfil", agrupados a la derecha
// (pedido explícito del cliente, 2026-08-23 — layout final confirmado:
// "<- volver al inicio -> dental mirage -> [Gestionar tu clínica  Editar
// tu página  tu perfil] (right)"). "Cerrar sesión" ya no vive acá, se
// muestra solo dentro de /perfil (mismo pedido).
export async function SiteHeader() {
  const token = await getSessionToken();
  const me = token ? await apiMe(token) : null;
  const loggedIn = me?.ok === true;
  // Con sesión, el logo lleva de vuelta a la pantalla de selección de
  // servicios, no a la home pública (esa es para visitantes sin cuenta) —
  // por eso existe VolverAlInicioLink (ver más abajo, solo visible en
  // /seleccionar-servicio), delante del wordmark.
  const brandHref = loggedIn ? "/seleccionar-servicio" : "/";

  return (
    <HeaderFrame>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          {loggedIn && <VolverAlInicioLink />}
          <Link href={brandHref} className="flex items-center gap-2 text-current">
            <QuadrantMark className="text-steel" />
            <span className="font-[family-name:var(--font-display)] text-lg font-black uppercase tracking-tight">
              Dental Mirage
            </span>
          </Link>
        </div>

        {/* Accesos directos a información dentro del Home (anclas, no
            rutas propias) — son para un VISITANTE sin cuenta todavía
            (pedido explícito: no tienen sentido para un profesional ya
            logueado, en /seleccionar-servicio o dentro de /panel — ese ya
            no está navegando el sitio público, está usando la
            herramienta). Se ocultan en mobile para no competir con
            Ingresar/Sumate. */}
        {!loggedIn && (
          <nav aria-label="Accesos directos" className="hidden items-center gap-7 md:flex">
            <Link href="/#buscar" className={navLinkClass}>
              Buscar clínicas
            </Link>
            <Link href="/#como-funciona" className={navLinkClass}>
              Servicios para profesionales
            </Link>
          </nav>
        )}

        <nav className="flex items-center gap-6">
          {loggedIn ? (
            <>
              <Link href="/panel" className={navLinkClass}>
                Gestionar tu clínica
              </Link>
              <Link href="/personalizar-pagina" className={navLinkClass}>
                Editar tu página
              </Link>
              <Link href="/perfil" className={navLinkClass}>
                Tu perfil
              </Link>
            </>
          ) : (
            <>
              <Link href="/ingresar" className={navLinkClass}>
                Ingresar
              </Link>
              {/* Único botón real del header — pedido explícito del
                  cliente, 2026-08-23: los botones adoptan la identidad
                  cálida (TR-013/TR-015) en todas las páginas, Home
                  incluido (los links de texto de al lado, en cambio,
                  siguen heredando el color del header vía `text-current`,
                  ver lib/styles.ts). */}
              <Link
                href="/sumarse"
                className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-marfil hover:brightness-95"
              >
                Sumate
              </Link>
            </>
          )}
        </nav>
      </div>
    </HeaderFrame>
  );
}
