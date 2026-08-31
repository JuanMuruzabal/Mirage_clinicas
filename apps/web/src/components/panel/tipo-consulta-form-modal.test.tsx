import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { crearTipoConsultaActionMock, editarTipoConsultaActionMock } = vi.hoisted(() => ({
  crearTipoConsultaActionMock: vi.fn(),
  editarTipoConsultaActionMock: vi.fn(),
}));
vi.mock("@/app/actions/calendario-config", () => ({
  crearTipoConsultaAction: crearTipoConsultaActionMock,
  editarTipoConsultaAction: editarTipoConsultaActionMock,
}));

const { TipoConsultaFormModal } = await import("./tipo-consulta-form-modal");

const tipoExistente = {
  id: "tc-1", nombre: "Consulta general", color: "#E7D9BE", duracionMinutos: 30, tiempoPostConsultaMinutos: 10, cantidadSesiones: 2,
};

describe("TipoConsultaFormModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("modo alta: título 'Agregar' y campos vacíos/default", () => {
    render(<TipoConsultaFormModal onClose={vi.fn()} onGuardado={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Agregar tipo de consulta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("");
    expect(screen.getByLabelText("Duración (minutos)")).toHaveValue(30);
  });

  it("modo edición: precarga los valores existentes", () => {
    render(<TipoConsultaFormModal tipoExistente={tipoExistente} onClose={vi.fn()} onGuardado={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Editar tipo de consulta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Consulta general");
    expect(screen.getByLabelText("Duración (minutos)")).toHaveValue(30);
    expect(screen.getByLabelText("Tiempo post-consulta (minutos)")).toHaveValue(10);
    expect(screen.getByLabelText("Cantidad de sesiones (opcional)")).toHaveValue(2);
  });

  it("alta: llama a crearTipoConsultaAction con el payload cargado", async () => {
    const user = userEvent.setup();
    const onGuardado = vi.fn();
    crearTipoConsultaActionMock.mockResolvedValue({
      tipoConsulta: { id: "tc-2", nombre: "Ortodoncia", color: "#E7D9BE", duracionMinutos: 30, tiempoPostConsultaMinutos: 0 },
    });

    render(<TipoConsultaFormModal onClose={vi.fn()} onGuardado={onGuardado} />);
    await user.type(screen.getByLabelText("Nombre"), "Ortodoncia");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(crearTipoConsultaActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Ortodoncia", duracionMinutos: 30, tiempoPostConsultaMinutos: 0, cantidadSesiones: null }),
    );
    expect(onGuardado).toHaveBeenCalled();
  });

  it("edición: llama a editarTipoConsultaAction con el id existente", async () => {
    const user = userEvent.setup();
    editarTipoConsultaActionMock.mockResolvedValue({ tipoConsulta: tipoExistente });

    render(<TipoConsultaFormModal tipoExistente={tipoExistente} onClose={vi.fn()} onGuardado={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(editarTipoConsultaActionMock).toHaveBeenCalledWith("tc-1", expect.objectContaining({ nombre: "Consulta general" }));
  });

  it("no guarda si el nombre está vacío", async () => {
    const user = userEvent.setup();
    render(<TipoConsultaFormModal onClose={vi.fn()} onGuardado={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("El nombre no puede estar vacío.");
    expect(crearTipoConsultaActionMock).not.toHaveBeenCalled();
  });

  it("muestra el error que devuelve el servidor", async () => {
    const user = userEvent.setup();
    crearTipoConsultaActionMock.mockResolvedValue({ error: "el color debe ser un hex de 6 dígitos" });

    render(<TipoConsultaFormModal onClose={vi.fn()} onGuardado={vi.fn()} />);
    await user.type(screen.getByLabelText("Nombre"), "X");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("el color debe ser un hex de 6 dígitos");
  });

  it("la X y el fondo cierran el modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TipoConsultaFormModal onClose={onClose} onGuardado={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
