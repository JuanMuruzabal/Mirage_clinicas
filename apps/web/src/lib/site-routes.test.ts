import { describe, expect, it } from "vitest";
import { isClinicaPublicaRoute, isFooterHidden } from "./site-routes";

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
  ])("%s NO es la página pública de una clínica (es una ruta propia de Mirage)", (pathname) => {
    expect(isClinicaPublicaRoute(pathname)).toBe(false);
  });
});
