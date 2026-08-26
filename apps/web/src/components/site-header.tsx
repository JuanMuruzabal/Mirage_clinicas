import { getSessionToken } from "@/lib/session";
import { apiMe } from "@/lib/api";
import { SiteHeaderChrome, type EstadoHeaderSesion } from "./site-header-chrome";

// Header global. Antes de completar el onboarding (spec §3) no hay sesión
// — se ve "Ingresar"/"Sumate". "Cerrar sesión" no vive acá, se muestra
// solo dentro de /perfil (pedido explícito del cliente, 2026-08-23).
//
// `estado` (prop de SiteHeaderChrome) tiene 3 valores — TR-058/TR-060 en
// docs/tradeoffs.md:
//   - "anonimo": sin sesión válida.
//   - "cuentaSinTerminar": mail verificado pero perfil/clínica sin
//     terminar — bug real reportado por el cliente (2026-08-26): con una
//     cuenta a medio sumar, los links de herramienta no llevan a nada
//     usable todavía (`/panel`/`/perfil`/`/personalizar-pagina` redirigen
//     de vuelta a /sumarse, ver requireOnboardingComplete en
//     lib/session.ts) — no deberían mostrarse como si la cuenta ya
//     estuviera lista.
//   - "completo": onboarding terminado del todo.
// SiteHeaderChrome decide con esto (+ la ruta actual, que este Server
// Component no puede leer) si muestra el botón de configuración, el
// botón único "Mi clínica", o Ingresar/Sumate — ver ese archivo.
export async function SiteHeader() {
  const token = await getSessionToken();
  const me = token ? await apiMe(token) : null;
  const emailVerificado = me?.ok === true && me.data.emailVerificado;
  const onboardingCompletado = me?.ok === true && me.data.onboardingCompletado;
  const estado: EstadoHeaderSesion = onboardingCompletado
    ? "completo"
    : emailVerificado
      ? "cuentaSinTerminar"
      : "anonimo";

  return <SiteHeaderChrome estado={estado} />;
}
