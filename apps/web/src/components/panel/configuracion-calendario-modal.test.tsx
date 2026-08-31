import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  listHorarioAtencionActionMock,
  putHorarioAtencionGeneralActionMock,
  crearHorarioAtencionActionMock,
  editarHorarioAtencionActionMock,
  eliminarHorarioAtencionActionMock,
  listBloqueosActionMock,
  eliminarBloqueoActionMock,
  crearBloqueoActionMock,
  listTiposConsultaActionMock,
  crearTipoConsultaActionMock,
  editarTipoConsultaActionMock,
  eliminarTipoConsultaActionMock,
} = vi.hoisted(() => ({
  listHorarioAtencionActionMock: vi.fn(),
  putHorarioAtencionGeneralActionMock: vi.fn(),
  crearHorarioAtencionActionMock: vi.fn(),
  editarHorarioAtencionActionMock: vi.fn(),
  eliminarHorarioAtencionActionMock: vi.fn(),
  listBloqueosActionMock: vi.fn(),
  eliminarBloqueoActionMock: vi.fn(),
  crearBloqueoActionMock: vi.fn(),
  listTiposConsultaActionMock: vi.fn(),
  crearTipoConsultaActionMock: vi.fn(),
  editarTipoConsultaActionMock: vi.fn(),
  eliminarTipoConsultaActionMock: vi.fn(),
}));

vi.mock("@/app/actions/calendario-config", () => ({
  listHorarioAtencionAction: listHorarioAtencionActionMock,
  putHorarioAtencionGeneralAction: putHorarioAtencionGeneralActionMock,
  crearHorarioAtencionAction: crearHorarioAtencionActionMock,
  editarHorarioAtencionAction: editarHorarioAtencionActionMock,
  eliminarHorarioAtencionAction: eliminarHorarioAtencionActionMock,
  listBloqueosAction: listBloqueosActionMock,
  eliminarBloqueoAction: eliminarBloqueoActionMock,
  crearBloqueoAction: crearBloqueoActionMock,
  listTiposConsultaAction: listTiposConsultaActionMock,
  crearTipoConsultaAction: crearTipoConsultaActionMock,
  editarTipoConsultaAction: editarTipoConsultaActionMock,
  eliminarTipoConsultaAction: eliminarTipoConsultaActionMock,
}));

const { ConfiguracionCalendarioModal } = await import("./configuracion-calendario-modal");

const reglaGeneral = {
  id: "gen-1", especifico: false, diaSemana: 2, alcance: "semana" as const, horaDesde: "07:00", horaHasta: "08:00", tipoRegla: "bloquear_horario",
};
const reglaEspecifica = {
  id: "esp-1", especifico: true, fecha: "2026-12-25", horaDesde: "08:00", horaHasta: "12:00", tipoRegla: "bloquear_horario",
};
const tipoConsulta = {
  id: "tc-1", nombre: "Consulta general", color: "#E7D9BE", duracionMinutos: 30, tiempoPostConsultaMinutos: 10,
};

describe("ConfiguracionCalendarioModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listHorarioAtencionActionMock.mockResolvedValue([{ id: "gen-h", alcance: "general", horaDesde: "08:00", horaHasta: "18:00" }]);
    listBloqueosActionMock.mockImplementation((especifico?: boolean) =>
      Promise.resolve(especifico ? [reglaEspecifica] : [reglaGeneral]),
    );
    listTiposConsultaActionMock.mockResolvedValue([tipoConsulta]);
    // jsdom no implementa scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("carga y muestra el horario de atención general", async () => {
    render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
    expect(await screen.findByDisplayValue("08:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("18:00")).toBeInTheDocument();
  });

  it("lista las reglas generales y específicas en sus tablas", async () => {
    render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);

    expect(await screen.findByText("Martes")).toBeInTheDocument();
    expect(screen.getByText("Esta semana")).toBeInTheDocument();
    expect(screen.getByText("2026-12-25")).toBeInTheDocument();
  });

  it("muestra el mensaje de vacío cuando no hay reglas", async () => {
    listBloqueosActionMock.mockResolvedValue([]);
    render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);

    expect(await screen.findByText("Todavía no cargaste ningún horario reservado general.")).toBeInTheDocument();
    expect(screen.getByText("Todavía no cargaste ningún horario reservado específico.")).toBeInTheDocument();
  });

  it("guarda el horario de atención general editado", async () => {
    const user = userEvent.setup();
    putHorarioAtencionGeneralActionMock.mockResolvedValue({ horario: { id: "gen-h", alcance: "general", horaDesde: "09:00", horaHasta: "17:00" } });

    render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
    await screen.findByDisplayValue("08:00");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "17:00" } });
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(putHorarioAtencionGeneralActionMock).toHaveBeenCalledWith({ horaDesde: "09:00", horaHasta: "17:00" });
    expect(await screen.findByDisplayValue("09:00")).toBeInTheDocument();
  });

  it("no guarda si la hora de fin no es posterior a la de inicio", async () => {
    const user = userEvent.setup();
    render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
    await screen.findByDisplayValue("08:00");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "08:00" } });
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("La hora de fin debe ser posterior a la de inicio.");
    expect(putHorarioAtencionGeneralActionMock).not.toHaveBeenCalled();
  });

  // Corrección de QA (2026-09-01): "puede que un profesional tenga
  // horarios de atención variable" — excepciones temporales (esta
  // semana/este mes/un rango a mano), tabla y modal aparte del form
  // simple de la general.
  describe("Excepciones de horario", () => {
    // reglaGeneral (Horarios reservados generales) también tiene
    // alcance "semana" ("Esta semana") — hay que buscar SIEMPRE dentro
    // de esta sección para no chocar con esa otra tabla.
    function seccionExcepciones() {
      return within(screen.getByText("Excepciones de horario").closest("section")!);
    }

    it("lista las excepciones vigentes", async () => {
      listHorarioAtencionActionMock.mockResolvedValue([
        { id: "gen-h", alcance: "general", horaDesde: "08:00", horaHasta: "18:00" },
        { id: "exc-1", alcance: "semana", fechaDesde: "2026-09-01", fechaHasta: "2026-09-07", horaDesde: "09:00", horaHasta: "13:00" },
      ]);
      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);

      expect(await seccionExcepciones().findByText("Esta semana")).toBeInTheDocument();
      expect(seccionExcepciones().getByText("09:00–13:00")).toBeInTheDocument();
    });

    it("una excepción sin horario se muestra como 'No trabaja'", async () => {
      listHorarioAtencionActionMock.mockResolvedValue([
        { id: "gen-h", alcance: "general", horaDesde: "08:00", horaHasta: "18:00" },
        { id: "exc-1", alcance: "mes", fechaDesde: "2026-09-01", fechaHasta: "2026-09-30" },
      ]);
      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);

      expect(await screen.findByText("No trabaja")).toBeInTheDocument();
    });

    it("muestra el mensaje de vacío sin excepciones", async () => {
      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      expect(await screen.findByText("Todavía no cargaste ninguna excepción de horario.")).toBeInTheDocument();
    });

    it("agrega una excepción nueva", async () => {
      const user = userEvent.setup();
      crearHorarioAtencionActionMock.mockResolvedValue({
        horario: { id: "exc-2", alcance: "semana", fechaDesde: "2026-09-01", fechaHasta: "2026-09-07", horaDesde: "09:00", horaHasta: "13:00" },
      });

      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      await screen.findByText("Todavía no cargaste ninguna excepción de horario.");

      await user.click(seccionExcepciones().getByRole("button", { name: "+ Excepción" }));
      const subModal = within(screen.getByRole("dialog", { name: "Agregar excepción de horario de atención" }));
      fireEvent.change(subModal.getByLabelText("Desde"), { target: { value: "09:00" } });
      fireEvent.change(subModal.getByLabelText("Hasta"), { target: { value: "13:00" } });
      await user.click(subModal.getByRole("button", { name: "Agregar" }));

      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Agregar excepción de horario de atención" })).not.toBeInTheDocument(),
      );
      expect(seccionExcepciones().getByText("Esta semana")).toBeInTheDocument();
    });

    it("marca 'No trabajo este período' y agrega una excepción sin horario", async () => {
      const user = userEvent.setup();
      crearHorarioAtencionActionMock.mockResolvedValue({
        horario: { id: "exc-3", alcance: "semana", fechaDesde: "2026-09-01", fechaHasta: "2026-09-07" },
      });

      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      await screen.findByText("Todavía no cargaste ninguna excepción de horario.");

      await user.click(seccionExcepciones().getByRole("button", { name: "+ Excepción" }));
      const subModal = within(screen.getByRole("dialog", { name: "Agregar excepción de horario de atención" }));
      await user.click(subModal.getByLabelText("No trabajo este período"));
      await user.click(subModal.getByRole("button", { name: "Agregar" }));

      expect(crearHorarioAtencionActionMock).toHaveBeenCalledWith({ alcance: "semana", noTrabaja: true });
      expect(await screen.findByText("No trabaja")).toBeInTheDocument();
    });

    // Corrección de QA (2026-09-05): "para eliminar un horario
    // reservado te pide confirmacion ahora, tambien para tipo de
    // consulta, y excepciones" — ya no borra directo al primer click.
    it("elimina una excepción, pidiendo confirmación primero", async () => {
      const user = userEvent.setup();
      listHorarioAtencionActionMock.mockResolvedValue([
        { id: "gen-h", alcance: "general", horaDesde: "08:00", horaHasta: "18:00" },
        { id: "exc-1", alcance: "semana", fechaDesde: "2026-09-01", fechaHasta: "2026-09-07", horaDesde: "09:00", horaHasta: "13:00" },
      ]);
      eliminarHorarioAtencionActionMock.mockResolvedValue({ ok: true });

      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      await seccionExcepciones().findByText("Esta semana");

      const filaExcepcion = seccionExcepciones().getByText("Esta semana").closest("tr")!;
      await user.click(within(filaExcepcion).getByRole("button", { name: "Eliminar excepción de horario" }));
      expect(eliminarHorarioAtencionActionMock).not.toHaveBeenCalled();

      await user.click(within(filaExcepcion).getByRole("button", { name: "Sí, eliminar" }));
      expect(eliminarHorarioAtencionActionMock).toHaveBeenCalledWith("exc-1");
      await waitFor(() => expect(seccionExcepciones().queryByText("Esta semana")).not.toBeInTheDocument());
    });

    it("'Cancelar' en la confirmación de eliminar una excepción no llama a la acción", async () => {
      const user = userEvent.setup();
      listHorarioAtencionActionMock.mockResolvedValue([
        { id: "gen-h", alcance: "general", horaDesde: "08:00", horaHasta: "18:00" },
        { id: "exc-1", alcance: "semana", fechaDesde: "2026-09-01", fechaHasta: "2026-09-07", horaDesde: "09:00", horaHasta: "13:00" },
      ]);

      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      await seccionExcepciones().findByText("Esta semana");

      const filaExcepcion = seccionExcepciones().getByText("Esta semana").closest("tr")!;
      await user.click(within(filaExcepcion).getByRole("button", { name: "Eliminar excepción de horario" }));
      await user.click(within(filaExcepcion).getByRole("button", { name: "Cancelar" }));

      expect(eliminarHorarioAtencionActionMock).not.toHaveBeenCalled();
      expect(within(filaExcepcion).getByRole("button", { name: "Eliminar excepción de horario" })).toBeInTheDocument();
    });
  });

  // Corrección de QA (2026-08-30): "el desplegable... sigue siendo hacia
  // el costado, no hacia abajo como se había dicho" — tocar la fila
  // agrega una SEGUNDA fila justo debajo con las acciones (mismo criterio
  // que TurnosTable), no extiende la fila existente hacia el costado.
  it("tocar una fila en mobile agrega una fila de acciones debajo, no la extiende hacia el costado", async () => {
    const user = userEvent.setup();
    render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
    await screen.findByText("Martes");

    const filaGeneral = screen.getByText("Martes").closest("tr")!;
    // Antes de tocar, la fila de acciones desplegable no existe todavía.
    expect(within(filaGeneral.parentElement!).getAllByRole("row")).toHaveLength(1);

    await user.click(filaGeneral);

    // Después de tocar, aparece una fila NUEVA (hermana, no la misma que
    // se agranda) con sus propias acciones.
    const filas = within(filaGeneral.parentElement!).getAllByRole("row");
    expect(filas).toHaveLength(2);
    const filaAcciones = filas[1];
    expect(filaAcciones).not.toBe(filaGeneral);
    expect(within(filaAcciones).getByRole("button", { name: "Editar horario reservado" })).toBeInTheDocument();
    expect(within(filaAcciones).getByRole("cell")).toHaveAttribute("colspan", "5");
  });

  // Corrección de QA (2026-09-05): "para mobile los botones de eliminar y
  // editar del panel de configuracion del calendario deben ser similares
  // a los que se manejan con turno, misma apariencia" — pastilla con
  // borde (mismo criterio que TurnosTable), no el link de texto simple
  // que sigue usando la fila principal en escritorio.
  it("en mobile, Editar/Eliminar tienen la misma apariencia de pastilla que TurnosTable", async () => {
    const user = userEvent.setup();
    render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
    await screen.findByText("Martes");

    const filaGeneral = screen.getByText("Martes").closest("tr")!;
    await user.click(filaGeneral);
    const filaAcciones = within(filaGeneral.parentElement!).getAllByRole("row")[1];
    const editar = within(filaAcciones).getByRole("button", { name: "Editar horario reservado" });
    const eliminar = within(filaAcciones).getByRole("button", { name: "Eliminar horario reservado" });

    expect(editar.className).toContain("rounded-full");
    expect(editar.className).toContain("border-arena");
    expect(eliminar.className).toContain("rounded-full");
    expect(eliminar.className).toContain("border-terracota");
  });

  it("elimina un horario reservado general de la tabla, pidiendo confirmación primero", async () => {
    const user = userEvent.setup();
    eliminarBloqueoActionMock.mockResolvedValue({ ok: true });

    render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
    await screen.findByText("Martes");

    const filaGeneral = screen.getByText("Martes").closest("tr")!;
    await user.click(within(filaGeneral).getByRole("button", { name: "Eliminar horario reservado" }));
    expect(eliminarBloqueoActionMock).not.toHaveBeenCalled();

    await user.click(within(filaGeneral).getByRole("button", { name: "Sí, eliminar" }));
    expect(eliminarBloqueoActionMock).toHaveBeenCalledWith("gen-1");
    await waitFor(() => expect(screen.queryByText("Martes")).not.toBeInTheDocument());
  });

  it("abre el sub-modal de 'Agregar horario reservado' general y agrega una fila a la tabla", async () => {
    const user = userEvent.setup();
    crearBloqueoActionMock.mockResolvedValue({
      bloqueo: { id: "gen-2", especifico: false, diaSemana: 0, alcance: "todos", horaDesde: "06:00", horaHasta: "07:00", tipoRegla: "bloquear_horario" },
    });

    render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
    await screen.findByText("Martes");

    const seccionGenerales = screen.getByText("Horarios reservados generales").closest("section")!;
    await user.click(within(seccionGenerales).getByRole("button", { name: "+ Horario" }));

    const subModal = within(screen.getByRole("dialog", { name: "Agregar horario reservado general" }));
    fireEvent.change(subModal.getByLabelText("Desde"), { target: { value: "06:00" } });
    fireEvent.change(subModal.getByLabelText("Hasta"), { target: { value: "07:00" } });
    await user.click(subModal.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Agregar horario reservado general" })).not.toBeInTheDocument());
    expect(screen.getByText("Domingo")).toBeInTheDocument();
  });

  it("la X y el fondo cierran el modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConfiguracionCalendarioModal onClose={onClose} />);
    await screen.findByDisplayValue("08:00");

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resalta y scrollea hasta la regla pedida por reglaAFocalizarId", async () => {
    render(<ConfiguracionCalendarioModal onClose={vi.fn()} reglaAFocalizarId="gen-1" />);

    const fila = await screen.findByText("Martes").then((td) => td.closest("tr")!);
    expect(fila).toHaveClass("bg-salvia-claro");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  // F2.3.7 (docs/implementation-plan.md §11.3) — gestión de tipos de
  // consulta dentro del modal de configuración.
  describe("Tipos de consulta", () => {
    it("lista los tipos de consulta existentes", async () => {
      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      expect(await screen.findByText("Consulta general")).toBeInTheDocument();
      expect(screen.getByText(/30 min/)).toBeInTheDocument();
    });

    it("muestra el mensaje de vacío sin tipos de consulta", async () => {
      listTiposConsultaActionMock.mockResolvedValue([]);
      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      expect(await screen.findByText("Todavía no cargaste ningún tipo de consulta.")).toBeInTheDocument();
    });

    it("agrega un tipo de consulta nuevo", async () => {
      const user = userEvent.setup();
      crearTipoConsultaActionMock.mockResolvedValue({
        tipoConsulta: { id: "tc-2", nombre: "Ortodoncia", color: "#123ABC", duracionMinutos: 45, tiempoPostConsultaMinutos: 0 },
      });

      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      await screen.findByText("Consulta general");

      await user.click(screen.getByRole("button", { name: "+ Agregar tipo" }));
      const subModal = within(screen.getByRole("dialog", { name: "Agregar tipo de consulta" }));
      await user.clear(subModal.getByLabelText("Nombre"));
      await user.type(subModal.getByLabelText("Nombre"), "Ortodoncia");
      await user.click(subModal.getByRole("button", { name: "Guardar" }));

      expect(crearTipoConsultaActionMock).toHaveBeenCalled();
      expect(await screen.findByText("Ortodoncia")).toBeInTheDocument();
    });

    it("edita un tipo de consulta existente", async () => {
      const user = userEvent.setup();
      editarTipoConsultaActionMock.mockResolvedValue({
        tipoConsulta: { ...tipoConsulta, nombre: "Consulta general (editada)" },
      });

      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      await screen.findByText("Consulta general");

      await user.click(screen.getByRole("button", { name: "Editar tipo de consulta" }));
      const subModal = within(screen.getByRole("dialog", { name: "Editar tipo de consulta" }));
      expect(subModal.getByLabelText("Nombre")).toHaveValue("Consulta general");
      await user.click(subModal.getByRole("button", { name: "Guardar" }));

      expect(editarTipoConsultaActionMock).toHaveBeenCalledWith("tc-1", expect.any(Object));
      expect(await screen.findByText("Consulta general (editada)")).toBeInTheDocument();
    });

    // Corrección de QA (2026-09-05): "para eliminar... tambien para tipo
    // de consulta" — ya no borra directo al primer click.
    it("elimina un tipo de consulta, pidiendo confirmación primero", async () => {
      const user = userEvent.setup();
      eliminarTipoConsultaActionMock.mockResolvedValue({ ok: true });

      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      await screen.findByText("Consulta general");

      await user.click(screen.getByRole("button", { name: "Eliminar tipo de consulta" }));
      expect(eliminarTipoConsultaActionMock).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));
      expect(eliminarTipoConsultaActionMock).toHaveBeenCalledWith("tc-1");
      await waitFor(() => expect(screen.queryByText("Consulta general")).not.toBeInTheDocument());
    });

    it("'Cancelar' en la confirmación de eliminar un tipo de consulta no llama a la acción", async () => {
      const user = userEvent.setup();
      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      await screen.findByText("Consulta general");

      await user.click(screen.getByRole("button", { name: "Eliminar tipo de consulta" }));
      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(eliminarTipoConsultaActionMock).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Eliminar tipo de consulta" })).toBeInTheDocument();
    });

    it("muestra el error si no se puede eliminar (turnos asociados)", async () => {
      const user = userEvent.setup();
      eliminarTipoConsultaActionMock.mockResolvedValue({
        error: "no se puede eliminar un tipo de consulta con turnos asociados",
      });

      render(<ConfiguracionCalendarioModal onClose={vi.fn()} />);
      await screen.findByText("Consulta general");

      await user.click(screen.getByRole("button", { name: "Eliminar tipo de consulta" }));
      await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("no se puede eliminar un tipo de consulta con turnos asociados");
      expect(screen.getByText("Consulta general")).toBeInTheDocument();
    });
  });
});
