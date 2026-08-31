import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fechaISOLocal } from "@/lib/calendar-utils";

// Los inputs type="time"/"date" no se escriben de forma confiable
// carácter por carácter con userEvent.type en jsdom (mismo criterio que
// agregar-turno-modal.test.tsx) — se fija el valor directo con
// fireEvent.change.
function setValor(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const { crearBloqueoActionMock, editarBloqueoActionMock } = vi.hoisted(() => ({
  crearBloqueoActionMock: vi.fn(),
  editarBloqueoActionMock: vi.fn(),
}));
vi.mock("@/app/actions/calendario-config", () => ({
  crearBloqueoAction: crearBloqueoActionMock,
  editarBloqueoAction: editarBloqueoActionMock,
}));

const { AgregarReglaModal } = await import("./agregar-regla-modal");

describe("AgregarReglaModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("regla general: muestra alcance y día, sin fecha", () => {
    render(<AgregarReglaModal especifico={false} onClose={vi.fn()} onGuardada={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Agregar horario reservado general" })).toBeInTheDocument();
    expect(screen.getByLabelText("Alcance")).toBeInTheDocument();
    expect(screen.getByLabelText("Día")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fecha")).not.toBeInTheDocument();
  });

  it("regla específica: muestra fecha, sin alcance ni día", () => {
    render(<AgregarReglaModal especifico={true} onClose={vi.fn()} onGuardada={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Agregar horario reservado específico" })).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    expect(screen.queryByLabelText("Alcance")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Día")).not.toBeInTheDocument();
  });

  it("agrega una regla general con éxito y llama a onCreada", async () => {
    const user = userEvent.setup();
    const onCreada = vi.fn();
    crearBloqueoActionMock.mockResolvedValue({
      bloqueo: { id: "b-1", especifico: false, diaSemana: 1, alcance: "semana", horaDesde: "07:00", horaHasta: "08:00", tipoRegla: "bloquear_horario" },
    });

    render(<AgregarReglaModal especifico={false} onClose={vi.fn()} onGuardada={onCreada} />);
    setValor("Desde", "07:00");
    setValor("Hasta", "08:00");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(crearBloqueoActionMock).toHaveBeenCalledWith({
      especifico: false,
      alcance: "semana",
      diaSemana: 1,
      horaDesde: "07:00",
      horaHasta: "08:00",
      motivo: "",
    });
    expect(onCreada).toHaveBeenCalledWith(expect.objectContaining({ id: "b-1" }));
  });

  it("agrega una regla específica con éxito", async () => {
    const user = userEvent.setup();
    const onCreada = vi.fn();
    crearBloqueoActionMock.mockResolvedValue({
      bloqueo: { id: "b-2", especifico: true, fecha: "2026-12-25", horaDesde: "08:00", horaHasta: "12:00", tipoRegla: "bloquear_horario" },
    });

    render(<AgregarReglaModal especifico={true} onClose={vi.fn()} onGuardada={onCreada} />);
    setValor("Fecha", "2026-12-25");
    setValor("Desde", "08:00");
    setValor("Hasta", "12:00");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(crearBloqueoActionMock).toHaveBeenCalledWith({ especifico: true, fecha: "2026-12-25", horaDesde: "08:00", horaHasta: "12:00", motivo: "" });
    expect(onCreada).toHaveBeenCalled();
  });

  // Corrección de QA (F2.3): "poder ponerle motivo... limpieza semanal,
  // reposición de inventario etc".
  it("el motivo tipeado llega recortado a la Server Action", async () => {
    const user = userEvent.setup();
    crearBloqueoActionMock.mockResolvedValue({
      bloqueo: { id: "b-4", especifico: false, diaSemana: 1, alcance: "semana", horaDesde: "07:00", horaHasta: "08:00", tipoRegla: "bloquear_horario", motivo: "Limpieza semanal" },
    });

    render(<AgregarReglaModal especifico={false} onClose={vi.fn()} onGuardada={vi.fn()} />);
    setValor("Desde", "07:00");
    setValor("Hasta", "08:00");
    await user.type(screen.getByLabelText("Motivo (opcional)"), "  Limpieza semanal  ");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(crearBloqueoActionMock).toHaveBeenCalledWith(expect.objectContaining({ motivo: "Limpieza semanal" }));
  });

  it("muestra un error de validación si falta el horario", async () => {
    const user = userEvent.setup();
    render(<AgregarReglaModal especifico={false} onClose={vi.fn()} onGuardada={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Elegí desde y hasta qué hora bloquear.");
    expect(crearBloqueoActionMock).not.toHaveBeenCalled();
  });

  // Pedido explícito del cliente (2026-09-04): "no puedo reservar un
  // horario atrás en el tiempo, cosa que se puede ahora" — validación
  // adelantada en el cliente (el backend igual la vuelve a exigir).
  describe("no se puede reservar un horario en el pasado (2026-09-04)", () => {
    it("el input de fecha no permite elegir un día anterior a hoy (min)", () => {
      render(<AgregarReglaModal especifico={true} onClose={vi.fn()} onGuardada={vi.fn()} />);
      expect(screen.getByLabelText("Fecha")).toHaveAttribute("min", fechaISOLocal());
    });

    it("una fecha específica pasada muestra el error sin llamar a la Server Action", async () => {
      const user = userEvent.setup();
      render(<AgregarReglaModal especifico={true} onClose={vi.fn()} onGuardada={vi.fn()} />);

      setValor("Fecha", "2020-01-01");
      setValor("Desde", "08:00");
      setValor("Hasta", "09:00");
      await user.click(screen.getByRole("button", { name: "Agregar" }));

      expect(screen.getByRole("alert")).toHaveTextContent("No se puede reservar un horario en una fecha u hora que ya pasó.");
      expect(crearBloqueoActionMock).not.toHaveBeenCalled();
    });
  });

  it("muestra el error que devuelve el servidor", async () => {
    const user = userEvent.setup();
    crearBloqueoActionMock.mockResolvedValue({ error: "la hora de fin debe ser posterior a la de inicio" });

    render(<AgregarReglaModal especifico={false} onClose={vi.fn()} onGuardada={vi.fn()} />);
    setValor("Desde", "10:00");
    setValor("Hasta", "09:00");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("la hora de fin debe ser posterior a la de inicio");
  });

  it("cerrar sin haber tocado nada llama a onClose directo, sin cartel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AgregarReglaModal especifico={false} onClose={onClose} onGuardada={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Tenés cambios sin guardar en este horario reservado.")).not.toBeInTheDocument();
  });

  it("cerrar después de tocar un campo muestra el cartel de cambios pendientes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AgregarReglaModal especifico={false} onClose={onClose} onGuardada={vi.fn()} />);

    setValor("Desde", "07:00");
    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Tenés cambios sin guardar en este horario reservado.")).toBeInTheDocument();
  });

  it("'Seguir editando' vuelve al formulario sin cerrar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AgregarReglaModal especifico={false} onClose={onClose} onGuardada={vi.fn()} />);

    setValor("Desde", "07:00");
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await user.click(screen.getByRole("button", { name: "Seguir editando" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Desde")).toBeInTheDocument();
  });

  it("'Salir sin guardar' descarta y cierra sin llamar a la Server Action", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AgregarReglaModal especifico={false} onClose={onClose} onGuardada={vi.fn()} />);

    setValor("Desde", "07:00");
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await user.click(screen.getByRole("button", { name: "Salir sin guardar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(crearBloqueoActionMock).not.toHaveBeenCalled();
  });

  it("'Guardar y salir' crea la regla y cierra en éxito", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreada = vi.fn();
    crearBloqueoActionMock.mockResolvedValue({
      bloqueo: { id: "b-3", especifico: false, horaDesde: "07:00", horaHasta: "08:00", tipoRegla: "bloquear_horario" },
    });

    render(<AgregarReglaModal especifico={false} onClose={onClose} onGuardada={onCreada} />);
    setValor("Desde", "07:00");
    setValor("Hasta", "08:00");
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await user.click(screen.getByRole("button", { name: "Guardar y salir" }));

    expect(crearBloqueoActionMock).toHaveBeenCalled();
    expect(onCreada).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Corrección de QA (F2.3.6): "agregar la edición para reglas globales
  // y específicas" — antes solo se podía crear o borrar.
  describe("modo edición", () => {
    const reglaGeneral = {
      id: "gen-1", especifico: false as const, diaSemana: 2, alcance: "mes" as const, horaDesde: "09:00", horaHasta: "10:00", tipoRegla: "bloquear_horario",
    };
    const reglaEspecifica = {
      id: "esp-1", especifico: true as const, fecha: "2026-12-25", horaDesde: "08:00", horaHasta: "12:00", tipoRegla: "bloquear_horario",
    };

    it("precarga los valores de una regla general existente y el título dice 'Editar'", () => {
      render(<AgregarReglaModal especifico={false} reglaExistente={reglaGeneral} onClose={vi.fn()} onGuardada={vi.fn()} />);

      expect(screen.getByRole("dialog", { name: "Editar horario reservado general" })).toBeInTheDocument();
      expect(screen.getByLabelText("Alcance")).toHaveValue("mes");
      expect(screen.getByLabelText("Día")).toHaveValue("2");
      expect(screen.getByLabelText("Desde")).toHaveValue("09:00");
      expect(screen.getByLabelText("Hasta")).toHaveValue("10:00");
      expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    });

    it("precarga los valores de una regla específica existente", () => {
      render(<AgregarReglaModal especifico={true} reglaExistente={reglaEspecifica} onClose={vi.fn()} onGuardada={vi.fn()} />);

      expect(screen.getByRole("dialog", { name: "Editar horario reservado específico" })).toBeInTheDocument();
      expect(screen.getByLabelText("Fecha")).toHaveValue("2026-12-25");
      expect(screen.getByLabelText("Desde")).toHaveValue("08:00");
    });

    it("guardar llama a editarBloqueoAction con el id existente, no a crearBloqueoAction", async () => {
      const user = userEvent.setup();
      const onGuardada = vi.fn();
      editarBloqueoActionMock.mockResolvedValue({ bloqueo: { ...reglaGeneral, horaDesde: "11:00" } });

      render(<AgregarReglaModal especifico={false} reglaExistente={reglaGeneral} onClose={vi.fn()} onGuardada={onGuardada} />);
      setValor("Desde", "11:00");
      await user.click(screen.getByRole("button", { name: "Guardar" }));

      expect(editarBloqueoActionMock).toHaveBeenCalledWith(
        "gen-1",
        expect.objectContaining({ especifico: false, horaDesde: "11:00", horaHasta: "10:00" }),
      );
      expect(crearBloqueoActionMock).not.toHaveBeenCalled();
      expect(onGuardada).toHaveBeenCalled();
    });
  });
});
