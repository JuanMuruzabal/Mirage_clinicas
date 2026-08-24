import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TurnoDetalle } from "./turno-detalle";

const tiposConsulta = [{ id: "tc-1", nombre: "Urgencia", color: "#D6563A" }];

const turno = {
  id: "t-1",
  estado: "agendado" as const,
  origen: "manual" as const,
  tipoConsultaId: "tc-1",
  horaInicio: new Date(2026, 8, 1, 9, 0).toISOString(),
  horaFin: new Date(2026, 8, 1, 9, 30).toISOString(),
  nombreContacto: "María",
  apellidoContacto: "Games",
  dniContacto: "1",
  telefonoContacto: "1",
  emailContacto: "",
  motivo: "Dolor de muela",
  createdAt: new Date().toISOString(),
};

describe("TurnoDetalle", () => {
  it("muestra hora, paciente y tipo de consulta (spec §4.3)", () => {
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);

    expect(screen.getByText("María Games")).toBeInTheDocument();
    expect(screen.getByText("Urgencia")).toBeInTheDocument();
    expect(screen.getByText(/09:00–09:30/)).toBeInTheDocument();
    expect(screen.getByText("Dolor de muela")).toBeInTheDocument();
  });

  it("se cierra al presionar la X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("se cierra al hacer click en el fondo (backdrop)", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={onClose} />);

    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });

  it("'Ver turno' enlaza a la vista Turnos filtrada por estado y DNI, con este turno para desplegar (deep-link)", () => {
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Ver turno →" })).toHaveAttribute(
      "href",
      "/panel/turnos?estado=agendado&q=1&turno=t-1",
    );
  });

  it("con pacienteId, muestra 'Ver paciente' hacia su ficha", () => {
    render(<TurnoDetalle turno={{ ...turno, pacienteId: "pac-1" }} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Ver paciente →" })).toHaveAttribute("href", "/panel/pacientes/pac-1");
  });

  it("sin pacienteId, no muestra 'Ver paciente'", () => {
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.queryByRole("link", { name: "Ver paciente →" })).not.toBeInTheDocument();
  });

  it("un turno con hora de fin pasada muestra la etiqueta 'Resuelto'", () => {
    const turnoPasado = { ...turno, horaInicio: "2020-01-01T09:00:00Z", horaFin: "2020-01-01T09:30:00Z" };
    render(<TurnoDetalle turno={turnoPasado} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.getByText("Resuelto")).toBeInTheDocument();
  });

  it("un turno futuro no muestra 'Resuelto'", () => {
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.queryByText("Resuelto")).not.toBeInTheDocument();
  });
});
