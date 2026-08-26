import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/buscar") }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { SiteHeaderChrome } = await import("./site-header-chrome");

// Corrección post-entrega (2026-08-24, pedido explícito del cliente: "el
// header cuando se acumulan componentes se ve espantoso [en mobile]...
// aplicar la misma solucion que alojamientos madryn... una barra
// desplegable"). Este archivo cubre el toggle mobile — abrir/cerrar, y
// que se cierra solo al navegar — y (TR-058 en docs/tradeoffs.md) qué
// aparece en cada uno de los tres `estado`, incluida la excepción de
// /seleccionar-servicio.
describe("SiteHeaderChrome — menú mobile", () => {
  it("arranca cerrado: el botón de menú existe pero el dropdown no está en el DOM", () => {
    render(<SiteHeaderChrome estado="completo" brandHref="/seleccionar-servicio" />);

    const boton = screen.getByRole("button", { name: "Abrir menú" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Menú" })).not.toBeInTheDocument();
  });

  it("clickear el botón abre el dropdown con Gestionar tu clínica/Editar tu página/Tu perfil (con sesión)", async () => {
    const user = userEvent.setup();
    render(<SiteHeaderChrome estado="completo" brandHref="/seleccionar-servicio" />);

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));

    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
    const dropdown = screen.getByRole("navigation", { name: "Menú" });
    expect(dropdown).toBeInTheDocument();
    // Los tres links de sesión aparecen dos veces en el DOM (la copia
    // hidden md:flex de escritorio + la del dropdown mobile) — jsdom no
    // aplica CSS, así que ambas instancias son "visibles" para la query;
    // alcanza con confirmar que la del dropdown está presente.
    const dentroDelDropdown = dropdown.querySelectorAll("a");
    const textos = Array.from(dentroDelDropdown).map((a) => a.textContent);
    expect(textos).toContain("Gestionar tu clínica");
    expect(textos).toContain("Editar tu página");
    expect(textos).toContain("Tu perfil");
  });

  it("sin sesión, el dropdown lista Buscar clínicas/Servicios/Ingresar/Sumate", async () => {
    const user = userEvent.setup();
    render(<SiteHeaderChrome estado="anonimo" brandHref="/" />);

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));

    const dropdown = screen.getByRole("navigation", { name: "Menú y accesos directos" });
    const textos = Array.from(dropdown.querySelectorAll("a")).map((a) => a.textContent);
    expect(textos).toEqual(["Buscar clínicas", "Servicios para profesionales", "Ingresar", "Sumate"]);
  });

  it("clickear un link del dropdown lo cierra", async () => {
    const user = userEvent.setup();
    render(<SiteHeaderChrome estado="anonimo" brandHref="/" />);

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const dropdown = screen.getByRole("navigation", { name: "Menú y accesos directos" });
    // El link "Ingresar" existe dos veces en el DOM (la copia hidden
    // md:flex de escritorio, siempre montada, + la del dropdown) — jsdom
    // no aplica CSS, así que ambas son "visibles" para una query global;
    // hay que acotar la búsqueda al dropdown para clickear la correcta.
    await user.click(within(dropdown).getByRole("link", { name: "Ingresar" }));

    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });

  it("clickear el botón de nuevo lo cierra (toggle)", async () => {
    const user = userEvent.setup();
    render(<SiteHeaderChrome estado="anonimo" brandHref="/" />);

    const boton = screen.getByRole("button", { name: "Abrir menú" });
    await user.click(boton);
    await user.click(screen.getByRole("button", { name: "Cerrar menú" }));

    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });

  it("cambiar de ruta cierra el menú aunque no se haya clickeado nada adentro", () => {
    usePathnameMock.mockReturnValue("/buscar");
    const { rerender } = render(<SiteHeaderChrome estado="completo" brandHref="/seleccionar-servicio" />);

    // No hay forma directa de "abrir y después cambiar de pathname" sin
    // pasar por un click real (el estado vive adentro del componente) —
    // se simula clickeando para abrir y luego re-renderizando con una
    // ruta distinta, que es lo que un cambio de página real dispara.
    return userEvent.setup().click(screen.getByRole("button", { name: "Abrir menú" })).then(() => {
      expect(screen.getByRole("button", { name: "Cerrar menú" })).toBeInTheDocument();
      usePathnameMock.mockReturnValue("/panel");
      rerender(<SiteHeaderChrome estado="completo" brandHref="/seleccionar-servicio" />);
      expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("con el menú abierto, el header queda sólido incluso en el Home sin scrollear", async () => {
    usePathnameMock.mockReturnValue("/");
    const user = userEvent.setup();
    const { container } = render(<SiteHeaderChrome estado="anonimo" brandHref="/" />);

    expect(container.querySelector("header")).toHaveClass("bg-transparent");
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(container.querySelector("header")).toHaveClass("bg-porcelain");
  });
});

// TR-057/TR-058 en docs/tradeoffs.md (pedido explícito del cliente,
// 2026-08-26): cuenta creada y mail verificado, pero perfil/clínica
// todavía sin terminar. En el Home (o cualquier otra página que no sea
// /seleccionar-servicio) esto muestra un único link "Tu clínica" — nunca
// "Ingresar"/"Sumate" (ya tiene cuenta) ni los tres links de herramientas
// (no llevan a nada usable todavía). En la propia /seleccionar-servicio
// el header debe quedar exactamente como estaba: "Ingresar"/"Sumate".
describe("SiteHeaderChrome — estado 'cuentaSinTerminar'", () => {
  it("en el Home, muestra un único link 'Tu clínica' hacia /seleccionar-servicio", () => {
    usePathnameMock.mockReturnValue("/");
    render(<SiteHeaderChrome estado="cuentaSinTerminar" brandHref="/" />);

    expect(screen.getByRole("link", { name: "Tu clínica" })).toHaveAttribute("href", "/seleccionar-servicio");
    expect(screen.queryByRole("link", { name: "Ingresar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sumate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Gestionar tu clínica" })).not.toBeInTheDocument();
  });

  it("en el Home, no muestra los accesos directos de un visitante anónimo", () => {
    usePathnameMock.mockReturnValue("/");
    render(<SiteHeaderChrome estado="cuentaSinTerminar" brandHref="/" />);

    expect(screen.queryByRole("link", { name: "Buscar clínicas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Servicios para profesionales" })).not.toBeInTheDocument();
  });

  it("en /seleccionar-servicio, el header queda igual que antes: Ingresar/Sumate, no 'Tu clínica'", () => {
    usePathnameMock.mockReturnValue("/seleccionar-servicio");
    render(<SiteHeaderChrome estado="cuentaSinTerminar" brandHref="/" />);

    expect(screen.getByRole("link", { name: "Ingresar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sumate" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tu clínica" })).not.toBeInTheDocument();
  });

  it("el dropdown mobile en el Home lista solo 'Tu clínica'", async () => {
    usePathnameMock.mockReturnValue("/");
    const user = userEvent.setup();
    render(<SiteHeaderChrome estado="cuentaSinTerminar" brandHref="/" />);

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const dropdown = screen.getByRole("navigation", { name: "Menú" });
    const textos = Array.from(dropdown.querySelectorAll("a")).map((a) => a.textContent);
    expect(textos).toEqual(["Tu clínica"]);
  });
});
