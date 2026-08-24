import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { editarTurnoActionMock, reprogramarTurnoActionMock } = vi.hoisted(() => ({
  editarTurnoActionMock: vi.fn(),
  reprogramarTurnoActionMock: vi.fn(),
}));
vi.mock("@/app/actions/turnos", () => ({
  editarTurnoAction: editarTurnoActionMock,
  reprogramarTurnoAction: reprogramarTurnoActionMock,
}));

const { EditarTurnoModal } = await import("./editar-turno-modal");

const turnoPendiente = {
  id: "turno-1",
  estado: "pendiente" as const,
  origen: "pagina_publica" as const,
  nombreContacto: "Bruno",
  apellidoContacto: "Iglesias",
  dniContacto: "30111222",
  telefonoContacto: "+5493511234567",
  emailContacto: "bruno@example.com",
  motivo: "Dolor de muela",
  createdAt: new Date().toISOString(),
};

const turnoAgendado = {
  ...turnoPendiente,
  id: "turno-2",
  estado: "agendado" as const,
  origen: "manual" as const,
  horaInicio: "2026-09-01T13:00:00.000Z",
  horaFin: "2026-09-01T13:30:00.000Z",
};

describe("EditarTurnoModal — turno pendiente (edita todos los datos de contacto)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("precarga los campos con los datos actuales del turno", () => {
    render(<EditarTurnoModal turno={turnoPendiente} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByLabelText("Nombre")).toHaveValue("Bruno");
    expect(screen.getByLabelText("DNI")).toHaveValue("30111222");
  });

  it("guarda cambios y llama a onSuccess con el turno actualizado", async () => {
    editarTurnoActionMock.mockResolvedValue({ turno: { ...turnoPendiente, nombreContacto: "Brunito" } });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoPendiente} onClose={vi.fn()} onSuccess={onSuccess} />);

    await user.clear(screen.getByLabelText("Nombre"));
    await user.type(screen.getByLabelText("Nombre"), "Brunito");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(editarTurnoActionMock).toHaveBeenCalledWith(
      "turno-1",
      expect.objectContaining({ nombreContacto: "Brunito", dniContacto: "30111222" }),
    );
    expect(onSuccess).toHaveBeenCalledWith({ ...turnoPendiente, nombreContacto: "Brunito" });
  });

  it("exige nombre/apellido/DNI/teléfono", async () => {
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoPendiente} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.clear(screen.getByLabelText("DNI"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("obligatorios");
    expect(editarTurnoActionMock).not.toHaveBeenCalled();
  });

  it("muestra el error que devuelve la acción", async () => {
    editarTurnoActionMock.mockResolvedValue({ error: "turno no encontrado" });
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoPendiente} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("turno no encontrado");
  });

  it("se cierra con el botón Cancelar y con la X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoPendiente} onClose={onClose} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("EditarTurnoModal — turno agendado (solo edita el horario)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no muestra los campos de contacto", () => {
    render(<EditarTurnoModal turno={turnoAgendado} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("DNI")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    expect(screen.getByLabelText("Hora")).toBeInTheDocument();
  });

  it("precarga fecha/hora a partir del horario actual del turno", () => {
    render(<EditarTurnoModal turno={turnoAgendado} onClose={vi.fn()} onSuccess={vi.fn()} />);

    // horaInicio es 2026-09-01T13:00:00Z (UTC) — el valor mostrado depende
    // del timezone local del entorno de test, así que solo verificamos que
    // los inputs vienen con algo cargado, no un valor específico.
    expect(screen.getByLabelText("Fecha")).not.toHaveValue("");
    expect(screen.getByLabelText("Hora")).not.toHaveValue("");
  });

  it("guarda el nuevo horario con reprogramarTurnoAction y llama a onSuccess", async () => {
    reprogramarTurnoActionMock.mockResolvedValue({ turno: { ...turnoAgendado, horaInicio: "2026-09-02T13:00:00.000Z" } });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoAgendado} onClose={vi.fn()} onSuccess={onSuccess} />);

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(reprogramarTurnoActionMock).toHaveBeenCalledWith("turno-2", expect.objectContaining({
      horaInicio: expect.any(String),
      horaFin: expect.any(String),
    }));
    expect(onSuccess).toHaveBeenCalledWith({ ...turnoAgendado, horaInicio: "2026-09-02T13:00:00.000Z" });
  });

  it("precarga el motivo actual y permite editarlo antes de guardar", async () => {
    reprogramarTurnoActionMock.mockResolvedValue({ turno: turnoAgendado });
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoAgendado} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const motivo = screen.getByLabelText("Motivo de consulta (opcional)");
    expect(motivo).toHaveValue("Dolor de muela");

    await user.clear(motivo);
    await user.type(motivo, "Control de rutina");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(reprogramarTurnoActionMock).toHaveBeenCalledWith("turno-2", expect.objectContaining({ motivo: "Control de rutina" }));
  });

  it("muestra el error de solapamiento (T2.5) que devuelve la acción", async () => {
    reprogramarTurnoActionMock.mockResolvedValue({ error: "ese horario se superpone con otro turno ya agendado" });
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoAgendado} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("se superpone");
  });

  it("no permite mover el turno a una fecha pasada", async () => {
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoAgendado} onClose={vi.fn()} onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2020-01-01" } });
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("fecha pasada");
    expect(reprogramarTurnoActionMock).not.toHaveBeenCalled();
  });

  it("un turno ya resuelto (horario pasado) permite guardar sin tocar la fecha — solo corrige el motivo", async () => {
    const turnoResuelto = { ...turnoAgendado, horaInicio: "2020-01-01T13:00:00.000Z", horaFin: "2020-01-01T13:30:00.000Z" };
    reprogramarTurnoActionMock.mockResolvedValue({ turno: turnoResuelto });
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoResuelto} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const motivo = screen.getByLabelText("Motivo de consulta (opcional)");
    await user.clear(motivo);
    await user.type(motivo, "Motivo corregido");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(reprogramarTurnoActionMock).toHaveBeenCalledWith("turno-2", expect.objectContaining({ motivo: "Motivo corregido" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("se cierra con el botón Cancelar y con la X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoAgendado} onClose={onClose} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
