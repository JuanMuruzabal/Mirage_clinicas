import { getSessionToken } from "@/lib/session";
import { apiMe } from "@/lib/api";
import { SiteHeaderChrome } from "./site-header-chrome";

// Header global. Antes de completar el onboarding (spec §3) no hay sesión
// — se ve "Ingresar"/"Sumate". Una vez sumada la cuenta, el header pasa a
// mostrar los accesos a las dos áreas del producto ("Gestionar tu
// clínica"/"Editar tu página") + "Tu perfil", agrupados a la derecha
// (pedido explícito del cliente, 2026-08-23 — layout final confirmado:
// "<- volver al inicio -> dental mirage -> [Gestionar tu clínica  Editar
// tu página  tu perfil] (right)"). "Cerrar sesión" ya no vive acá, se
// muestra solo dentro de /perfil (mismo pedido).
//
// Este Server Component solo resuelve la sesión — toda la interactividad
// (scroll, menú mobile) vive en SiteHeaderChrome (Client Component,
// 2026-08-24), que recibe `loggedIn`/`brandHref` como los únicos dos
// primitivos serializables que necesita cruzar el límite Server→Client.
export async function SiteHeader() {
  const token = await getSessionToken();
  const me = token ? await apiMe(token) : null;
  const loggedIn = me?.ok === true;
  // Con sesión, el logo lleva de vuelta a la pantalla de selección de
  // servicios, no a la home pública (esa es para visitantes sin cuenta).
  const brandHref = loggedIn ? "/seleccionar-servicio" : "/";

  return <SiteHeaderChrome loggedIn={loggedIn} brandHref={brandHref} />;
}
