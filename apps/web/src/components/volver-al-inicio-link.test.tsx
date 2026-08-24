import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { VolverAlInicioLink } = await import("./volver-al-inicio-link");

describe("VolverAlInicioLink", () => {
  it("en /seleccionar-servicio, muestra el link hacia la home pública", () => {
    usePathnameMock.mockReturnValue("/seleccionar-servicio");
    render(<VolverAlInicioLink />);
    expect(screen.getByRole("link", { name: "← Volver al inicio" })).toHaveAttribute("href", "/");
  });

  it.each(["/", "/panel", "/perfil", "/personalizar-pagina"])(
    "fuera de /seleccionar-servicio (%s), no muestra nada (pedido explícito: 'solo... se vera de /seleccionar-servicio')",
    (pathname) => {
      usePathnameMock.mockReturnValue(pathname);
      const { container } = render(<VolverAlInicioLink />);
      expect(container).toBeEmptyDOMElement();
    },
  );
});
