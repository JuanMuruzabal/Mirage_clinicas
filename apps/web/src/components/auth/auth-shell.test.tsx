import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthShell } from "./auth-shell";

// TR-059 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-26):
// los formularios de perfil/clínica dentro del modal de bienvenida son
// largos y "se salían de la página" — `ancho="xl"` les da más lugar
// horizontal y `scrollInterno` limita la altura de la tarjeta al viewport
// en vez de dejarla crecer sin límite (que es lo que causaba el overflow).
describe("AuthShell", () => {
  it("por default usa un ancho angosto (max-w-md) y sin límite de altura", () => {
    const { container } = render(<AuthShell title="Ingresar">contenido</AuthShell>);
    const tarjeta = container.firstElementChild as HTMLElement;
    expect(tarjeta.className).toContain("max-w-md");
    expect(tarjeta.className).not.toContain("max-w-xl");
    expect(tarjeta.className).not.toContain("overflow-y-auto");
  });

  it("con ancho='xl', la tarjeta usa max-w-xl en vez de max-w-md", () => {
    const { container } = render(
      <AuthShell title="Creá tu perfil" ancho="xl">
        contenido
      </AuthShell>,
    );
    const tarjeta = container.firstElementChild as HTMLElement;
    expect(tarjeta.className).toContain("max-w-xl");
    expect(tarjeta.className).not.toContain("max-w-md");
  });

  it("con scrollInterno, la tarjeta limita su altura y scrollea puertas adentro", () => {
    const { container } = render(
      <AuthShell title="Creá tu perfil" scrollInterno>
        contenido
      </AuthShell>,
    );
    const tarjeta = container.firstElementChild as HTMLElement;
    expect(tarjeta.className).toContain("max-h-[85vh]");
    expect(tarjeta.className).toContain("overflow-y-auto");
  });

  it("sinVolver oculta el link/botón de volver", () => {
    render(
      <AuthShell title="Creá tu perfil" sinVolver>
        contenido
      </AuthShell>,
    );
    expect(screen.queryByRole("link", { name: /Volver/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Volver/ })).not.toBeInTheDocument();
  });
});
