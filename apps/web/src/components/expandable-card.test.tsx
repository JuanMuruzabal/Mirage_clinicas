import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExpandableCard } from "./expandable-card";

const props = {
  eyebrow: "Gestión de clínica",
  titulo: "El día a día, ordenado",
  descripcion: "Calendario simple por consulta.",
  detalle: ["Punto uno", "Punto dos"],
};

describe("ExpandableCard", () => {
  it("arranca cerrada: no muestra el detalle y dice 'Ver más'", () => {
    render(<ExpandableCard {...props} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Ver más")).toBeInTheDocument();
    expect(screen.queryByText("Punto uno")).not.toBeInTheDocument();
  });

  it("al presionarla, se despliega y muestra el detalle", async () => {
    const user = userEvent.setup();
    render(<ExpandableCard {...props} />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Punto uno")).toBeInTheDocument();
    expect(screen.getByText("Punto dos")).toBeInTheDocument();
    expect(screen.getByText("Ver menos")).toBeInTheDocument();
  });

  it("presionarla de nuevo la vuelve a cerrar", async () => {
    const user = userEvent.setup();
    render(<ExpandableCard {...props} />);

    const button = screen.getByRole("button");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Ver más")).toBeInTheDocument();
  });
});
