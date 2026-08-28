import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PacientesTable } from "./pacientes-table";

// Cada fila es un ClickableTableRow (TR-023 en docs/tradeoffs.md), que usa
// useRouter() internamente — mismo mock que clickable-table-row.test.tsx.
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const paciente = {
  id: "p-1",
  nombre: "Bruno",
  apellido: "Iglesias",
  dni: "30111222",
  telefono: "3511234567",
  email: "bruno@example.com",
  createdAt: new Date().toISOString(),
};

describe("PacientesTable", () => {
  it("muestra nombre, teléfono, DNI y email como columnas", () => {
    render(<PacientesTable pacientes={[paciente]} />);
    expect(screen.getByText("Bruno Iglesias")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "3511234567" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "30111222" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "bruno@example.com" })).toBeInTheDocument();
  });

  // El sticky vive en cada `th` (`.panel-th-sticky`), no en thead/tr —
  // bug de Safari de iOS con rebote elástico (2026-08-28): WebKit no
  // recalcula bien el sticky en thead/tr durante el overscroll.
  it("cada th del encabezado tiene la clase sticky (no el thead)", () => {
    const { container } = render(<PacientesTable pacientes={[paciente]} />);
    const thead = container.querySelector("thead")!;
    expect(thead.className).toBe("");
    const ths = container.querySelectorAll("thead th");
    expect(ths.length).toBeGreaterThan(0);
    ths.forEach((th) => expect(th).toHaveClass("panel-th-sticky"));
  });

  // Pedido explícito del cliente, 2026-08-27: "el DNI se sigue viendo
  // pequeño en los datos, debe estar como dato desplegable no debajo del
  // nombre" — ya no hay ningún subtítulo de DNI pegado al nombre.
  it("no muestra el DNI como subtítulo debajo del nombre", () => {
    render(<PacientesTable pacientes={[paciente]} />);
    expect(screen.queryByText(`DNI ${paciente.dni}`)).not.toBeInTheDocument();
  });

  it("sin email, la columna y el panel desplegable muestran —", async () => {
    const user = userEvent.setup();
    render(<PacientesTable pacientes={[{ ...paciente, email: null }]} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "Mostrar datos" }));
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("tocar el chevron despliega DNI/Email sin navegar, y tocar la fila sí navega", async () => {
    const user = userEvent.setup();
    render(<PacientesTable pacientes={[paciente]} />);

    await user.click(screen.getByRole("button", { name: "Mostrar datos" }));
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ocultar datos" })).toBeInTheDocument();

    await user.click(screen.getByText("Bruno Iglesias"));
    expect(pushMock).toHaveBeenCalledWith("/panel/pacientes/p-1");
  });

  it("el link 'Ver ficha' apunta a la ficha del paciente", () => {
    render(<PacientesTable pacientes={[paciente]} />);
    expect(screen.getByRole("link", { name: "Ver ficha →" })).toHaveAttribute("href", "/panel/pacientes/p-1");
  });
});
