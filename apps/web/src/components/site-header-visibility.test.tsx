import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { SiteHeaderVisibility } = await import("./site-header-visibility");

describe("SiteHeaderVisibility", () => {
  it("muestra el header de Mirage en las rutas propias del producto", () => {
    for (const pathname of ["/", "/buscar", "/panel", "/perfil", "/seleccionar-servicio", "/personalizar-pagina"]) {
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

  // Bug real reportado por el cliente (2026-08-26): el header global no
  // aporta nada en el flujo de auth (y podía mostrar "Gestionar tu
  // clínica"/etc. con una sesión a medio onboarding) — AuthShell trae su
  // propio "Volver al inicio" en su lugar (ver components/auth/auth-shell.tsx).
  it("oculta el header de Mirage en el flujo de auth (sumarse/ingresar/recuperar-password/verificar-mail)", () => {
    for (const pathname of [
      "/sumarse",
      "/ingresar",
      "/recuperar-password",
      "/recuperar-password/nueva",
      "/verificar-mail",
    ]) {
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
