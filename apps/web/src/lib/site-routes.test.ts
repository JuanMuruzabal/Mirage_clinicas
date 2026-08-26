import { describe, expect, it } from "vitest";
import { isAuthFlowRoute, isClinicaPublicaRoute, isFooterHidden, isHerramientaRoute } from "./site-routes";

describe("isFooterHidden", () => {
  it.each(["/sumarse", "/ingresar", "/seleccionar-servicio", "/perfil", "/panel", "/personalizar-pagina"])(
    "oculta el footer en %s",
    (pathname) => {
      expect(isFooterHidden(pathname)).toBe(true);
    },
  );

  // La página pública de una clínica (T4, pedido explícito del cliente,
  // 2026-08-23) también oculta el footer global — tiene el suyo propio
  // (o ninguno), no el de Mirage.
  it.each(["/alguna-clinica", "/clinica-sonrisas"])("oculta el footer en la página pública de una clínica (%s)", (pathname) => {
    expect(isFooterHidden(pathname)).toBe(true);
  });

  it.each(["/", "/buscar"])("muestra el footer en %s", (pathname) => {
    expect(isFooterHidden(pathname)).toBe(false);
  });

  // Bug real, 2026-08-26 (ver TR-050 en docs/tradeoffs.md): sin estar acá,
  // /terminos y /privacidad caían en la ruta dinámica de página pública de
  // clínica (isClinicaPublicaRoute las trataba como un slug de clínica) —
  // 404 real, no solo un footer/header equivocado.
  it.each(["/terminos", "/privacidad"])("muestra el footer en %s (páginas legales del sitio, no de una clínica)", (pathname) => {
    expect(isFooterHidden(pathname)).toBe(false);
  });
});

describe("isClinicaPublicaRoute", () => {
  it.each(["/alguna-clinica", "/clinica-sonrisas"])("%s es la página pública de una clínica", (pathname) => {
    expect(isClinicaPublicaRoute(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/buscar",
    "/ingresar",
    "/sumarse",
    "/perfil",
    "/panel",
    "/seleccionar-servicio",
    "/personalizar-pagina",
    "/panel/turnos",
    "/perfil/algo",
    "/terminos",
    "/privacidad",
  ])("%s NO es la página pública de una clínica (es una ruta propia de Mirage)", (pathname) => {
    expect(isClinicaPublicaRoute(pathname)).toBe(false);
  });
});

describe("isAuthFlowRoute", () => {
  it.each(["/sumarse", "/sumarse/algo", "/ingresar", "/recuperar-password", "/recuperar-password/nueva", "/verificar-mail"])(
    "%s es una ruta del flujo de auth",
    (pathname) => {
      expect(isAuthFlowRoute(pathname)).toBe(true);
    },
  );

  it.each(["/", "/buscar", "/panel", "/perfil", "/seleccionar-servicio", "/personalizar-pagina", "/terminos", "/privacidad"])(
    "%s NO es una ruta del flujo de auth",
    (pathname) => {
      expect(isAuthFlowRoute(pathname)).toBe(false);
    },
  );
});

// TR-060 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-26):
// estas 4 pantallas muestran el botón de configuración en el header en
// vez del botón único "Mi clínica".
describe("isHerramientaRoute", () => {
  it.each(["/seleccionar-servicio", "/perfil", "/perfil/algo", "/panel", "/panel/turnos", "/personalizar-pagina"])(
    "%s es una pantalla de herramienta",
    (pathname) => {
      expect(isHerramientaRoute(pathname)).toBe(true);
    },
  );

  it.each(["/", "/buscar", "/sumarse", "/ingresar", "/terminos", "/privacidad", "/alguna-clinica"])(
    "%s NO es una pantalla de herramienta",
    (pathname) => {
      expect(isHerramientaRoute(pathname)).toBe(false);
    },
  );
});
