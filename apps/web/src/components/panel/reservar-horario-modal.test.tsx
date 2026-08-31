import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { crearBloqueoActionMock, editarBloqueoActionMock } = vi.hoisted(() => ({
  crearBloqueoActionMock: vi.fn(),
  editarBloqueoActionMock: vi.fn(),
}));
vi.mock("@/app/actions/calendario-config", () => ({
  crearBloqueoAction: crearBloqueoActionMock,
  editarBloqueoAction: editarBloqueoActionMock,
}));

const { ReservarHorarioModal } = await import("./reservar-horario-modal");

// ReservarHorarioModal — acceso rápido desde la pantalla principal del
// calendario (pedido explícito del cliente, 2026-09-04): "agregar un
// acceso rápido a reservar horario... al lado de agregar turno, donde te
// dé las 2 opciones, reserva general y específica, explicar más o menos
// para qué sirven y su diferencia, le doy a agregar y sin ir al panel
// poder agregarlos por el acceso rápido".
describe("ReservarHorarioModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra las dos opciones con su explicación", () => {
    render(<ReservarHorarioModal onClose={vi.fn()} onGuardada={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Reservar horario" })).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText(/Se repite: elegís un día de la semana/)).toBeInTheDocument();
    expect(screen.getByText("Específica")).toBeInTheDocument();
    expect(screen.getByText(/Una sola fecha puntual/)).toBeInTheDocument();
  });

  it("la X del paso 1 cierra el acceso rápido", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ReservarHorarioModal onClose={onClose} onGuardada={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("'Agregar general' abre el formulario de horario reservado general", async () => {
    const user = userEvent.setup();
    render(<ReservarHorarioModal onClose={vi.fn()} onGuardada={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Agregar general" }));
    expect(screen.getByRole("dialog", { name: "Agregar horario reservado general" })).toBeInTheDocument();
    expect(screen.queryByText("Reservar horario")).not.toBeInTheDocument();
  });

  it("'Agregar específica' abre el formulario de horario reservado específico", async () => {
    const user = userEvent.setup();
    render(<ReservarHorarioModal onClose={vi.fn()} onGuardada={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Agregar específica" }));
    expect(screen.getByRole("dialog", { name: "Agregar horario reservado específico" })).toBeInTheDocument();
  });

  it("guardar con éxito llama a onGuardada con el bloqueo y cierra todo el acceso rápido", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onGuardada = vi.fn();
    crearBloqueoActionMock.mockResolvedValue({
      bloqueo: { id: "b-1", especifico: false, diaSemana: 1, alcance: "semana", horaDesde: "07:00", horaHasta: "08:00", tipoRegla: "bloquear_horario" },
    });
    render(<ReservarHorarioModal onClose={onClose} onGuardada={onGuardada} />);

    await user.click(screen.getByRole("button", { name: "Agregar general" }));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "07:00" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "08:00" } });
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(crearBloqueoActionMock).toHaveBeenCalled();
    expect(onGuardada).toHaveBeenCalledWith(expect.objectContaining({ id: "b-1" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cerrar el formulario del paso 2 (X) cierra todo el acceso rápido, no vuelve al paso 1", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ReservarHorarioModal onClose={onClose} onGuardada={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Agregar específica" }));
    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
