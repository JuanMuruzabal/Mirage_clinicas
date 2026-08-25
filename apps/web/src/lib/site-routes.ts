/**
 * Rutas "dedicadas al servicio para profesionales" (pedido explícito del
 * cliente, 2026-08-22): el footer público no se muestra ahí — onboarding,
 * login y todo lo que vive detrás de sesión (perfil, panel de gestión,
 * editor de página) son herramienta, no la vidriera pública del sitio.
 * Mismo patrón que `lib/auth-routes.ts` de Marcuzzi_Madryn
 * (isAuthChromeHidden) — usado tanto por un Server Component (no puede
 * leer la ruta actual solo) como por su wrapper cliente.
 */
const PROFESSIONAL_ROUTE_PREFIXES = [
  "/sumarse",
  "/ingresar",
  "/recuperar-password",
  "/verificar-mail",
  "/seleccionar-servicio",
  "/perfil",
  "/panel",
  "/personalizar-pagina",
];

/**
 * Nombres de rutas propias de Mirage con un solo segmento — el resto de
 * cualquier URL de un solo segmento (`/clinica-x`) cae en `/[slug]`, la
 * página pública de una clínica (spec §5). Necesario para distinguir
 * "es una ruta nuestra" de "es la página de una clínica" sin poder leer
 * los route params acá (esto lo usan Client Components que solo tienen
 * el pathname).
 */
const RUTAS_PROPIAS_DE_UN_SEGMENTO = [
  "buscar",
  "ingresar",
  "sumarse",
  "perfil",
  "panel",
  "seleccionar-servicio",
  "personalizar-pagina",
  "recuperar-password",
  "verificar-mail",
];

export function isFooterHidden(pathname: string): boolean {
  return (
    PROFESSIONAL_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    isClinicaPublicaRoute(pathname)
  );
}

/**
 * La página pública de una clínica (`/{slug}`, spec §5) — pedido explícito
 * del cliente, 2026-08-23: "debería dejar de verse el header de la página
 * principal de mirage y ver el de la página del profesional... se abrirá
 * en una página aparte independiente del de la app, ya que la idea... es
 * que esté alojada en subdominios". Hasta que ese subdominio propio exista
 * de verdad (Fase 2, fuera de alcance del MVP), esta es la forma de que la
 * página de cada clínica se sienta independiente del resto del producto:
 * sin el header/footer globales de Mirage, con su propio "header básico"
 * (ver ClinicaPublicaTemplate).
 */
export function isClinicaPublicaRoute(pathname: string): boolean {
  const segmentos = pathname.split("/").filter(Boolean);
  if (segmentos.length !== 1) return false;
  return !RUTAS_PROPIAS_DE_UN_SEGMENTO.includes(segmentos[0]);
}

/**
 * Gestión de clínica (`/panel/**`) — usado por `PanelScrollLock` (rama
 * fix/mobile, TR-027 en docs/tradeoffs.md) para saber cuándo bloquear el
 * scroll del documento en mobile.
 */
export function isPanelRoute(pathname: string): boolean {
  return pathname === "/panel" || pathname.startsWith("/panel/");
}
