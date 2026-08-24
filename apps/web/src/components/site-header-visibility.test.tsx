import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { SiteHeaderVisibility } = await import("./site-header-visibility");

describe("SiteHeaderVisibility", () => {
  it("muestra el header de Mirage en las rutas propias del producto", () => {
    for (const pathname of ["/", "/buscar", "/ingresar", "/panel", "/perfil", "/seleccionar-servicio", "/personalizar-pagina"]) {
      usePathnameMock.mockReturnValue(pathname);
      const { unmount } = render(
        <SiteHeaderVisibility>
          <header>Header de Mirage</header>
        </SiteHeaderVisibility>,
      );
      expect(screen.getByText("Header de Mirage")).toBeInTheDocument();
      unmount();
    }
  });

  it("oculta el header de Mirage en la página pública de una clínica (pedido explícito del cliente, 2026-08-23)", () => {
    for (const pathname of ["/clinica-sonrisas", "/alguna-clinica"]) {
      usePathnameMock.mockReturnValue(pathname);
      const { unmount } = render(
        <SiteHeaderVisibility>
          <header>Header de Mirage</header>
        </SiteHeaderVisibility>,
      );
      expect(screen.queryByText("Header de Mirage")).not.toBeInTheDocument();
      unmount();
    }
  });
});
