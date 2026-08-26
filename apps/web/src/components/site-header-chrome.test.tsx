import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/buscar") }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { SiteHeaderChrome } = await import("./site-header-chrome");

// Corrección post-entrega (2026-08-24, pedido explícito del cliente: "el
// header cuando se acumulan componentes se ve espantoso [en mobile]...
// aplicar la misma solucion que alojamientos madryn... una barra
// desplegable"). Este archivo cubre el toggle mobile del estado anónimo
// (único que lo necesita) y — TR-058/TR-060 en docs/tradeoffs.md — qué
// aparece en el header en cada combinación de `estado` × ruta.
describe("SiteHeaderChrome — menú mobile (estado anónimo)", () => {
  it("arranca cerrado: el botón de menú existe pero el dropdown no está en el DOM", () => {
    usePathnameMock.mockReturnValue("/");
    render(<SiteHeaderChrome estado="anonimo" />);

    const boton = screen.getByRole("button", { name: "Abrir menú" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Menú y accesos directos" })).not.toBeInTheDocument();
  });

  it("clickear el botón abre el dropdown con Buscar clínicas/Servicios/Ingresar/Sumate", async () => {
    usePathnameMock.mockReturnValue("/");
    const user = userEvent.setup();
    render(<SiteHeaderChrome estado="anonimo" />);

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));

    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
    const dropdown = screen.getByRole("navigation", { name: "Menú y accesos directos" });
    const textos = Array.from(dropdown.querySelectorAll("a")).map((a) => a.textContent);
    expect(textos).toEqual(["Buscar clínicas", "Servicios para profesionales", "Ingresar", "Sumate"]);
  });

  it("clickear un link del dropdown lo cierra", async () => {
    usePathnameMock.mockReturnValue("/");
    const user = userEvent.setup();
    render(<SiteHeaderChrome estado="anonimo" />);

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const dropdown = screen.getByRole("navigation", { name: "Menú y accesos directos" });
    await user.click(within(dropdown).getByRole("link", { name: "Ingresar" }));

    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });

  it("clickear el botón de nuevo lo cierra (toggle)", async () => {
    usePathnameMock.mockReturnValue("/");
    const user = userEvent.setup();
    render(<SiteHeaderChrome estado="anonimo" />);

    const boton = screen.getByRole("button", { name: "Abrir menú" });
    await user.click(boton);
    await user.click(screen.getByRole("button", { name: "Cerrar menú" }));

    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });

  it("cambiar de ruta cierra el menú aunque no se haya clickeado nada adentro", async () => {
    usePathnameMock.mockReturnValue("/buscar");
    const { rerender } = render(<SiteHeaderChrome estado="anonimo" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toBeInTheDocument();

    usePathnameMock.mockReturnValue("/panel");
    rerender(<SiteHeaderChrome estado="anonimo" />);
    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });

  it("con el menú abierto, el header queda sólido incluso en el Home sin scrollear", async () => {
    usePathnameMock.mockReturnValue("/");
    const user = userEvent.setup();
    const { container } = render(<SiteHeaderChrome estado="anonimo" />);

    expect(container.querySelector("header")).toHaveClass("bg-transparent");
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(container.querySelector("header")).toHaveClass("bg-porcelain");
  });

  it("no muestra el botón de menú mobile en los otros dos estados (un solo botón compacto, nunca desborda)", () => {
    usePathnameMock.mockReturnValue("/");
    const { rerender } = render(<SiteHeaderChrome estado="completo" />);
    expect(screen.queryByRole("button", { name: /menú/i })).not.toBeInTheDocument();

    rerender(<SiteHeaderChrome estado="cuentaSinTerminar" />);
    expect(screen.queryByRole("button", { name: /menú/i })).not.toBeInTheDocument();
  });
});

// El logo siempre vuelve a la home pública (pedido explícito del
// cliente, 2026-08-26) — antes, con onboarding completo, llevaba a
// /seleccionar-servicio.
describe("SiteHeaderChrome — logo", () => {
  it.each(["anonimo", "cuentaSinTerminar", "completo"] as const)(
    "con estado=%s, el logo linkea a / siempre",
    (estado) => {
      usePathnameMock.mockReturnValue("/panel");
      render(<SiteHeaderChrome estado={estado} />);
      expect(screen.getByRole("link", { name: /Dental Mirage/ })).toHaveAttribute("href", "/");
    },
  );
});

// TR-060 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-26):
// en una pantalla de herramienta con onboarding completo, el botón de
// configuración reemplaza a los tres links sueltos de antes.
describe("SiteHeaderChrome — botón de configuración (estado completo, pantalla de herramienta)", () => {
  it.each(["/seleccionar-servicio", "/panel", "/panel/turnos", "/perfil", "/personalizar-pagina"])(
    "en %s con estado completo, muestra el botón de configuración y no 'Mi clínica'",
    (pathname) => {
      usePathnameMock.mockReturnValue(pathname);
      render(<SiteHeaderChrome estado="completo" />);
      expect(screen.getByRole("button", { name: "Accesos rápidos" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Mi clínica" })).not.toBeInTheDocument();
    },
  );

  it("en /seleccionar-servicio con estado completo, también muestra 'Volver al inicio'", () => {
    usePathnameMock.mockReturnValue("/seleccionar-servicio");
    render(<SiteHeaderChrome estado="completo" />);
    expect(screen.getByRole("link", { name: /Volver al inicio/ })).toBeInTheDocument();
  });

  it("fuera de una pantalla de herramienta (Home), con estado completo NO muestra el botón de configuración", () => {
    usePathnameMock.mockReturnValue("/");
    render(<SiteHeaderChrome estado="completo" />);
    expect(screen.queryByRole("button", { name: "Accesos rápidos" })).not.toBeInTheDocument();
  });
});

// TR-058/TR-060: "Mi clínica" es el botón único para cualquier sesión
// autenticada que no esté viendo el menú de configuración — Home,
// buscador, o una pantalla de herramienta con el onboarding todavía sin
// terminar (bloqueada por el modal de bienvenida). Pedido explícito del
// cliente, 2026-08-26: "sigue persistiendo que se ve el header del home
// por detrás del formulario... y no el header correspondiente a esa
// sección" — ya no hay excepción de ruta para /seleccionar-servicio acá.
describe("SiteHeaderChrome — botón único 'Mi clínica'", () => {
  it.each(["/", "/buscar"])("con estado completo en %s (fuera de una herramienta), muestra 'Mi clínica'", (pathname) => {
    usePathnameMock.mockReturnValue(pathname);
    render(<SiteHeaderChrome estado="completo" />);
    expect(screen.getByRole("link", { name: "Mi clínica" })).toHaveAttribute("href", "/seleccionar-servicio");
  });

  it.each(["/", "/buscar", "/seleccionar-servicio"])(
    "con estado cuentaSinTerminar en %s, muestra 'Mi clínica' (sin excepción de ruta)",
    (pathname) => {
      usePathnameMock.mockReturnValue(pathname);
      render(<SiteHeaderChrome estado="cuentaSinTerminar" />);
      expect(screen.getByRole("link", { name: "Mi clínica" })).toHaveAttribute("href", "/seleccionar-servicio");
      expect(screen.queryByRole("link", { name: "Ingresar" })).not.toBeInTheDocument();
    },
  );

  it("con estado anónimo, nunca muestra 'Mi clínica'", () => {
    usePathnameMock.mockReturnValue("/");
    render(<SiteHeaderChrome estado="anonimo" />);
    expect(screen.queryByRole("link", { name: "Mi clínica" })).not.toBeInTheDocument();
  });
});
