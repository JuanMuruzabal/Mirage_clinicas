import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CancelarTurnoModal } from "./cancelar-turno-modal";

const turno = {
  id: "turno-1",
  estado: "agendado" as const,
  origen: "manual" as const,
  nombreContacto: "Julián",
  apellidoContacto: "Ortiz",
  dniContacto: "1",
  telefonoContacto: "1",
  emailContacto: "",
  motivo: "",
  createdAt: new Date().toISOString(),
};

describe("CancelarTurnoModal", () => {
  it("muestra el nombre del paciente en el mensaje de confirmación", () => {
    render(<CancelarTurnoModal turno={turno} pending={false} error={null} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/Julián Ortiz/)).toBeInTheDocument();
  });

  it("'Sí, cancelar turno' llama a onConfirm", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<CancelarTurnoModal turno={turno} pending={false} error={null} onClose={vi.fn()} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Sí, cancelar turno" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("'Volver' y la X llaman a onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CancelarTurnoModal turno={turno} pending={false} error={null} onClose={onClose} onConfirm={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("deshabilita el botón de confirmar mientras pending", () => {
    render(<CancelarTurnoModal turno={turno} pending={true} error={null} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Cancelando…" })).toBeDisabled();
  });

  it("muestra el error si viene uno", () => {
    render(<CancelarTurnoModal turno={turno} pending={false} error="turno no encontrado" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("turno no encontrado");
  });
});
