import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/buscar") }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { SiteHeaderChrome } = await import("./site-header-chrome");

// Corrección post-entrega (2026-08-24, pedido explícito del cliente: "el
// header cuando se acumulan componentes se ve espantoso [en mobile]...
// aplicar la misma solucion que alojamientos madryn... una barra
// desplegable"). site-header.test.tsx ya cubre qué links aparecen según
// `loggedIn` (probando SiteHeader completo, siempre con el menú cerrado
// por default); este archivo cubre puntualmente el comportamiento nuevo
// del toggle mobile — abrir/cerrar, y que se cierra solo al navegar.
describe("SiteHeaderChrome — menú mobile", () => {
  it("arranca cerrado: el botón de menú existe pero el dropdown no está en el DOM", () => {
    render(<SiteHeaderChrome loggedIn brandHref="/seleccionar-servicio" />);

    const boton = screen.getByRole("button", { name: "Abrir menú" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Menú" })).not.toBeInTheDocument();
  });

  it("clickear el botón abre el dropdown con Gestionar tu clínica/Editar tu página/Tu perfil (con sesión)", async () => {
    const user = userEvent.setup();
    render(<SiteHeaderChrome loggedIn brandHref="/seleccionar-servicio" />);

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
    render(<SiteHeaderChrome loggedIn={false} brandHref="/" />);

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));

    const dropdown = screen.getByRole("navigation", { name: "Menú y accesos directos" });
    const textos = Array.from(dropdown.querySelectorAll("a")).map((a) => a.textContent);
    expect(textos).toEqual(["Buscar clínicas", "Servicios para profesionales", "Ingresar", "Sumate"]);
  });

  it("clickear un link del dropdown lo cierra", async () => {
    const user = userEvent.setup();
    render(<SiteHeaderChrome loggedIn={false} brandHref="/" />);

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
    render(<SiteHeaderChrome loggedIn={false} brandHref="/" />);

    const boton = screen.getByRole("button", { name: "Abrir menú" });
    await user.click(boton);
    await user.click(screen.getByRole("button", { name: "Cerrar menú" }));

    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });

  it("cambiar de ruta cierra el menú aunque no se haya clickeado nada adentro", () => {
    usePathnameMock.mockReturnValue("/buscar");
    const { rerender } = render(<SiteHeaderChrome loggedIn brandHref="/seleccionar-servicio" />);

    // No hay forma directa de "abrir y después cambiar de pathname" sin
    // pasar por un click real (el estado vive adentro del componente) —
    // se simula clickeando para abrir y luego re-renderizando con una
    // ruta distinta, que es lo que un cambio de página real dispara.
    return userEvent.setup().click(screen.getByRole("button", { name: "Abrir menú" })).then(() => {
      expect(screen.getByRole("button", { name: "Cerrar menú" })).toBeInTheDocument();
      usePathnameMock.mockReturnValue("/panel");
      rerender(<SiteHeaderChrome loggedIn brandHref="/seleccionar-servicio" />);
      expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("con el menú abierto, el header queda sólido incluso en el Home sin scrollear", async () => {
    usePathnameMock.mockReturnValue("/");
    const user = userEvent.setup();
    const { container } = render(<SiteHeaderChrome loggedIn={false} brandHref="/" />);

    expect(container.querySelector("header")).toHaveClass("bg-transparent");
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(container.querySelector("header")).toHaveClass("bg-porcelain");
  });
});
