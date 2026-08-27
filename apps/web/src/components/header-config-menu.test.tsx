import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeaderConfigMenu } from "./header-config-menu";

// TR-075 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-27):
// reducido a Tu perfil + Cerrar sesión — "Gestionar tu clínica" y
// "Personalizar tu página" quedaron redundantes con el sidebar/botón
// "Panel" (ver TR-060 para la versión original de 3 accesos).
describe("HeaderConfigMenu", () => {
  it("arranca cerrado: el botón existe pero el menú no está en el DOM", () => {
    render(<HeaderConfigMenu />);
    const boton = screen.getByRole("button", { name: "Accesos rápidos" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("clickear el botón despliega Tu perfil y Cerrar sesión", async () => {
    const user = userEvent.setup();
    render(<HeaderConfigMenu />);

    await user.click(screen.getByRole("button", { name: "Accesos rápidos" }));

    expect(screen.getByRole("button", { name: "Cerrar accesos rápidos" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Tu perfil" })).toHaveAttribute("href", "/perfil");
    const logout = screen.getByRole("button", { name: "Cerrar sesión" });
    expect(logout.closest("form")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Gestionar tu clínica" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Personalizar tu página" })).not.toBeInTheDocument();
  });

  it("clickear el botón de nuevo lo cierra (toggle)", async () => {
    const user = userEvent.setup();
    render(<HeaderConfigMenu />);

    await user.click(screen.getByRole("button", { name: "Accesos rápidos" }));
    await user.click(screen.getByRole("button", { name: "Cerrar accesos rápidos" }));

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("clickear uno de los accesos lo cierra", async () => {
    const user = userEvent.setup();
    render(<HeaderConfigMenu />);

    await user.click(screen.getByRole("button", { name: "Accesos rápidos" }));
    await user.click(screen.getByRole("link", { name: "Tu perfil" }));

    expect(screen.getByRole("button", { name: "Accesos rápidos" })).toHaveAttribute("aria-expanded", "false");
  });

  it("clickear afuera del menú lo cierra", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <HeaderConfigMenu />
        <button type="button">afuera</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Accesos rápidos" }));
    expect(screen.getByRole("navigation")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "afuera" }));
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
