import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { misTurnoPublicoActionMock } = vi.hoisted(() => ({
  misTurnoPublicoActionMock: vi.fn(),
}));
vi.mock("@/app/actions/turno-publico", () => ({
  misTurnoPublicoAction: misTurnoPublicoActionMock,
}));

const { MisTurnosButton } = await import("./mis-turnos-button");

describe("MisTurnosButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el botón 'Mis turnos' sin abrir el modal todavía", () => {
    render(<MisTurnosButton slug="clinica-x" />);
    expect(screen.getByRole("button", { name: "Mis turnos" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al tocar el botón, abre el modal con el formulario de DNI y mail", async () => {
    const user = userEvent.setup();
    render(<MisTurnosButton slug="clinica-x" />);

    await user.click(screen.getByRole("button", { name: "Mis turnos" }));

    expect(screen.getByRole("dialog", { name: "Mis turnos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buscar mi turno" })).toBeInTheDocument();
  });

  it("con un turno activo que coincide, lo muestra como tarjeta", async () => {
    misTurnoPublicoActionMock.mockResolvedValue({
      turno: {
        fecha: "8 de septiembre de 2026",
        horaInicio: "08:00",
        horaFin: "08:30",
        tipoConsultaNombre: "Consulta general",
        nombreContacto: "Bruno",
        apellidoContacto: "Iglesias",
      },
    });
    const user = userEvent.setup();
    render(<MisTurnosButton slug="clinica-x" />);
    await user.click(screen.getByRole("button", { name: "Mis turnos" }));

    const dialogo = screen.getByRole("dialog", { name: "Mis turnos" });
    await user.type(dialogo.querySelector("input[inputmode='numeric']")!, "30111222");
    await user.type(screen.getByRole("dialog").querySelector("input[type='email']")!, "bruno@example.com");
    await user.click(screen.getByRole("button", { name: "Buscar mi turno" }));

    expect(await screen.findByText("Consulta general")).toBeInTheDocument();
    expect(screen.getByText("08:00–08:30")).toBeInTheDocument();
    expect(screen.getByText("Bruno Iglesias")).toBeInTheDocument();
    expect(misTurnoPublicoActionMock).toHaveBeenCalledWith("clinica-x", "30111222", "bruno@example.com");
  });

  it("sin ningún turno que coincida, muestra el error del backend", async () => {
    misTurnoPublicoActionMock.mockResolvedValue({ error: "no encontramos ningún turno activo con esos datos" });
    const user = userEvent.setup();
    render(<MisTurnosButton slug="clinica-x" />);
    await user.click(screen.getByRole("button", { name: "Mis turnos" }));

    const dialogo = screen.getByRole("dialog", { name: "Mis turnos" });
    await user.type(dialogo.querySelector("input[inputmode='numeric']")!, "30111222");
    await user.type(dialogo.querySelector("input[type='email']")!, "nadie@example.com");
    await user.click(screen.getByRole("button", { name: "Buscar mi turno" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no encontramos ningún turno activo con esos datos");
  });

  it("cierra al tocar la X y limpia el estado", async () => {
    const user = userEvent.setup();
    render(<MisTurnosButton slug="clinica-x" />);

    await user.click(screen.getByRole("button", { name: "Mis turnos" }));
    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cierra al tocar afuera del modal (el fondo)", async () => {
    const user = userEvent.setup();
    render(<MisTurnosButton slug="clinica-x" />);

    await user.click(screen.getByRole("button", { name: "Mis turnos" }));
    await user.click(screen.getByRole("dialog", { name: "Mis turnos" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
