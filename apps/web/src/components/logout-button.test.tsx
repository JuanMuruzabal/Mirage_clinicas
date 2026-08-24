import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LogoutButton } from "./logout-button";

describe("LogoutButton", () => {
  it("renderiza un form con botón 'Cerrar sesión'", () => {
    render(<LogoutButton />);
    const button = screen.getByRole("button", { name: "Cerrar sesión" });
    expect(button).toBeInTheDocument();
    expect(button.closest("form")).toBeInTheDocument();
  });
});
