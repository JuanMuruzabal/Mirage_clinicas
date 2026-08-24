import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { SiteFooterVisibility } = await import("./site-footer-visibility");

describe("SiteFooterVisibility", () => {
  it("muestra el footer en páginas públicas", () => {
    usePathnameMock.mockReturnValue("/");
    render(
      <SiteFooterVisibility>
        <p>Footer</p>
      </SiteFooterVisibility>,
    );
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  it("oculta el footer en páginas dedicadas al servicio para profesionales", () => {
    for (const pathname of ["/sumarse", "/ingresar", "/seleccionar-servicio", "/perfil", "/personalizar-pagina"]) {
      usePathnameMock.mockReturnValue(pathname);
      const { unmount } = render(
        <SiteFooterVisibility>
          <p>Footer</p>
        </SiteFooterVisibility>,
      );
      expect(screen.queryByText("Footer")).not.toBeInTheDocument();
      unmount();
    }
  });
});
