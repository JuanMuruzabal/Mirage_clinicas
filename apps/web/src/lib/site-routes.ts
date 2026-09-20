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
  "/clinicas",
  "/seleccionar-servicio",
  "/perfil",
  "/panel",
  "/personalizar-pagina",
  "/colaboradores",
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
  "clinicas",
  "colaboradores",
  "seleccionar-servicio",
  "personalizar-pagina",
  "recuperar-password",
  "verificar-mail",
  "terminos",
  "privacidad",
];

export function isFooterHidden(pathname: string): boolean {
  return (
    PROFESSIONAL_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    isClinicaPublicaRoute(pathname)
  );
}

/**
 * Rutas del flujo de autenticación (sumarse/ingresar/recuperar-password/
 * verificar-mail) — bug real reportado por el cliente, 2026-08-26: el
 * header global (con "Ingresar"/"Sumate", o peor, "Gestionar tu clínica"/
 * "Editar tu página"/"Tu perfil" si ya había una sesión a medio onboarding)
 * no tiene sentido en estas pantallas — son la puerta de entrada, no
 * páginas del sitio a navegar. `AuthShell` (components/auth/auth-shell.tsx)
 * ya trae su propio link "Volver al inicio", mismo criterio que
 * AuthShell de Marcuzzi_Madryn. NO incluye `/panel`, `/perfil`,
 * `/personalizar-pagina`, `/seleccionar-servicio` — esas SÍ siguen
 * mostrando el header global (con sesión ya completa).
 */
const AUTH_FLOW_ROUTE_PREFIXES = ["/sumarse", "/ingresar", "/recuperar-password", "/verificar-mail"];

export function isAuthFlowRoute(pathname: string): boolean {
  return AUTH_FLOW_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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
 * fix/mobile, TR-027 en docs/Arquitectura y base/tradeoffs.md) para saber cuándo bloquear el
 * scroll del documento en mobile.
 */
export function isPanelRoute(pathname: string): boolean {
  return pathname === "/panel" || pathname.startsWith("/panel/");
}

/**
 * Las 4 pantallas "de herramienta" con sesión ya completa (seleccionar
 * servicio + las 3 que ese menú lista) — TR-060 en docs/Arquitectura y base/tradeoffs.md,
 * pedido explícito del cliente, 2026-08-26: acá el header muestra el
 * botón de configuración (acceso rápido a Perfil/Gestionar tu clínica/
 * Personalizar tu página) en vez del botón único "Mi clínica" que se ve
 * en el resto del sitio (Home, buscador, etc.) para una cuenta logueada.
 */
// "/clinicas" se suma en la Fase 3.2.3: es la pantalla de partida de toda
// sesión, así que es tan "de herramienta" como las otras cuatro — y no
// puede caer en `/[slug]` como si fuera la página pública de una clínica.
const HERRAMIENTA_ROUTE_PREFIXES = [
  "/clinicas",
  "/seleccionar-servicio",
  "/perfil",
  "/panel",
  "/personalizar-pagina",
  "/colaboradores",
];

/**
 * Dónde se muestra el componente de colaboradores del header (2026-09-19,
 * pedido del cliente: "el componente se extiende ahora hasta la página de
 * /seleccionar-servicio reemplazando el ícono de tuerca", y después "el
 * header de /colaboradores y /personalizar-pagina tiene que ser igual al
 * header del /panel").
 *
 * Son las pantallas donde ya se está parado DENTRO de una clínica: el
 * panel, "¿Qué necesitás hoy?", Colaboradores y el editor de la página.
 *
 * Las dos que quedan afuera, y por qué:
 *
 * - `/clinicas` — todavía no se eligió ninguna clínica, así que no hay
 *   equipo del que hablar. Conserva el menú de cuenta con su propio
 *   ícono.
 * - `/perfil` — es la pantalla a la que lleva ese menú; ofrecerlo ahí es
 *   ofrecer ir donde ya se está.
 *
 * (Sin negrita en esos dos: `**` seguido de `/` cierra el comentario de
 * bloque y todo lo de abajo pasa a ser código. Pasó de verdad.)
 *
 * El SELECTOR de clínica no sigue esta regla y se queda en /panel/**:
 * /seleccionar-servicio ya tiene el suyo en el cuerpo de la página.
 */
export function mostrarColaboradoresEnHeader(pathname: string): boolean {
  return (
    isPanelRoute(pathname) ||
    pathname === "/seleccionar-servicio" ||
    pathname === "/colaboradores" ||
    pathname.startsWith("/colaboradores/") ||
    pathname === "/personalizar-pagina"
  );
}

export function isHerramientaRoute(pathname: string): boolean {
  return HERRAMIENTA_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
