import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fechaISOLocal } from "@/lib/calendar-utils";

// Los inputs type="time"/"date" no se escriben de forma confiable
// carácter por carácter con userEvent.type en jsdom (mismo criterio que
// agregar-regla-modal.test.tsx) — se fija el valor directo con
// fireEvent.change.
function setValor(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const { crearHorarioAtencionActionMock, editarHorarioAtencionActionMock } = vi.hoisted(() => ({
  crearHorarioAtencionActionMock: vi.fn(),
  editarHorarioAtencionActionMock: vi.fn(),
}));
vi.mock("@/app/actions/calendario-config", () => ({
  crearHorarioAtencionAction: crearHorarioAtencionActionMock,
  editarHorarioAtencionAction: editarHorarioAtencionActionMock,
}));

const { AgregarHorarioAtencionModal } = await import("./agregar-horario-atencion-modal");

describe("AgregarHorarioAtencionModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("arranca con alcance 'semana' y sin campos de fecha", () => {
    render(<AgregarHorarioAtencionModal onClose={vi.fn()} onGuardado={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Agregar excepción de horario de atención" })).toBeInTheDocument();
    expect(screen.getByLabelText("Alcance")).toHaveValue("semana");
    expect(screen.queryByLabelText("Desde")).toHaveAttribute("type", "time");
  });

  it("alcance 'rango personalizado' muestra los selectores de fecha", async () => {
    const user = userEvent.setup();
    render(<AgregarHorarioAtencionModal onClose={vi.fn()} onGuardado={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Alcance"), "rango");

    expect(screen.getByLabelText("Fecha desde")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Fecha hasta")).toHaveAttribute("type", "date");
  });

  it("agrega una excepción con horario", async () => {
    const user = userEvent.setup();
    const onGuardado = vi.fn();
    crearHorarioAtencionActionMock.mockResolvedValue({
      horario: { id: "h-1", alcance: "semana", fechaDesde: "2026-09-01", fechaHasta: "2026-09-07", horaDesde: "09:00", horaHasta: "13:00" },
    });

    render(<AgregarHorarioAtencionModal onClose={vi.fn()} onGuardado={onGuardado} />);
    setValor("Desde", "09:00");
    setValor("Hasta", "13:00");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(crearHorarioAtencionActionMock).toHaveBeenCalledWith({ alcance: "semana", horaDesde: "09:00", horaHasta: "13:00" });
    expect(onGuardado).toHaveBeenCalledWith(expect.objectContaining({ id: "h-1" }));
  });

  it("'No trabajo este período' omite las horas y manda noTrabaja: true", async () => {
    const user = userEvent.setup();
    crearHorarioAtencionActionMock.mockResolvedValue({
      horario: { id: "h-2", alcance: "mes", fechaDesde: "2026-09-01", fechaHasta: "2026-09-30" },
    });

    render(<AgregarHorarioAtencionModal onClose={vi.fn()} onGuardado={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Alcance"), "mes");
    await user.click(screen.getByLabelText("No trabajo este período"));
    expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(crearHorarioAtencionActionMock).toHaveBeenCalledWith({ alcance: "mes", noTrabaja: true });
  });

  it("rango personalizado sin fechas muestra un error y no llama a la action", async () => {
    const user = userEvent.setup();
    render(<AgregarHorarioAtencionModal onClose={vi.fn()} onGuardado={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Alcance"), "rango");

    // El input date arranca con fechaISOLocal() (hoy) — se vacía a mano
    // para simular el caso sin elegir nada.
    setValor("Fecha desde", "");

    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Elegí desde y hasta qué fecha.");
    expect(crearHorarioAtencionActionMock).not.toHaveBeenCalled();
  });

  // Corrección de QA (2026-09-06): "desde mi iphone si puedo seleccionar
  // fechas pasadas... las exepciones" — usa el calendario nativo del
  // celular, que sí respeta `min` para no ofrecer días anteriores a hoy.
  it("rango personalizado: 'Fecha desde'/'Fecha hasta' no ofrecen días pasados", async () => {
    const user = userEvent.setup();
    render(<AgregarHorarioAtencionModal onClose={vi.fn()} onGuardado={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Alcance"), "rango");

    expect(screen.getByLabelText("Fecha desde")).toHaveAttribute("min", fechaISOLocal());
    expect(screen.getByLabelText("Fecha hasta")).toHaveAttribute("min", fechaISOLocal());
  });

  it("rango personalizado con fecha desde pasada muestra un error y no llama a la action", async () => {
    const user = userEvent.setup();
    render(<AgregarHorarioAtencionModal onClose={vi.fn()} onGuardado={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Alcance"), "rango");

    setValor("Fecha desde", "2020-01-01");
    setValor("Fecha hasta", "2020-01-07");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("No se puede elegir una fecha que ya pasó.");
    expect(crearHorarioAtencionActionMock).not.toHaveBeenCalled();
  });

  it("rango personalizado con 'hasta' anterior a 'desde' muestra un error y no llama a la action", async () => {
    const user = userEvent.setup();
    render(<AgregarHorarioAtencionModal onClose={vi.fn()} onGuardado={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Alcance"), "rango");

    setValor("Fecha desde", "2026-09-10");
    setValor("Fecha hasta", "2026-09-05");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByRole("alert")).toHaveTextContent('La fecha "hasta" no puede ser anterior a la fecha "desde".');
    expect(crearHorarioAtencionActionMock).not.toHaveBeenCalled();
  });

  it("sin horas ni 'no trabaja' muestra un error", async () => {
    const user = userEvent.setup();
    render(<AgregarHorarioAtencionModal onClose={vi.fn()} onGuardado={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByRole("alert")).toHaveTextContent('Elegí desde y hasta qué hora, o marcá "No trabajo este período".');
    expect(crearHorarioAtencionActionMock).not.toHaveBeenCalled();
  });

  it("edita una excepción existente con PATCH", async () => {
    const user = userEvent.setup();
    const existente = { id: "h-3", alcance: "semana" as const, fechaDesde: "2026-09-01", fechaHasta: "2026-09-07", horaDesde: "09:00", horaHasta: "13:00" };
    editarHorarioAtencionActionMock.mockResolvedValue({
      horario: { ...existente, horaDesde: "10:00" },
    });

    render(<AgregarHorarioAtencionModal horarioExistente={existente} onClose={vi.fn()} onGuardado={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Editar excepción de horario de atención" })).toBeInTheDocument();
    setValor("Desde", "10:00");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(editarHorarioAtencionActionMock).toHaveBeenCalledWith("h-3", { alcance: "semana", horaDesde: "10:00", horaHasta: "13:00" });
  });

  it("editar una excepción sin horario arranca con 'No trabajo este período' marcado", () => {
    const existente = { id: "h-4", alcance: "mes" as const, fechaDesde: "2026-09-01", fechaHasta: "2026-09-30" };
    render(<AgregarHorarioAtencionModal horarioExistente={existente} onClose={vi.fn()} onGuardado={vi.fn()} />);
    expect(screen.getByLabelText("No trabajo este período")).toBeChecked();
    expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();
  });

  it("con cambios sin guardar, cerrar pide confirmación", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AgregarHorarioAtencionModal onClose={onClose} onGuardado={vi.fn()} />);

    setValor("Desde", "09:00");
    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.getByText("Tenés cambios sin guardar en esta excepción de horario.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sin tocar nada, cerrar no pregunta", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AgregarHorarioAtencionModal onClose={onClose} onGuardado={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
