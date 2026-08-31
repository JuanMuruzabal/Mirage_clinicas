import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  cancelarTurnoActionMock,
  listTurnosActionMock,
  agendarTurnoActionMock,
  crearTurnoManualActionMock,
  editarTurnoActionMock,
  reprogramarTurnoActionMock,
  marcarAsistenciaActionMock,
  listPacientesActionMock,
  listDisponibilidadActionMock,
} = vi.hoisted(() => ({
  cancelarTurnoActionMock: vi.fn(),
  listTurnosActionMock: vi.fn(),
  agendarTurnoActionMock: vi.fn(),
  crearTurnoManualActionMock: vi.fn(),
  editarTurnoActionMock: vi.fn(),
  reprogramarTurnoActionMock: vi.fn(),
  marcarAsistenciaActionMock: vi.fn(),
  listPacientesActionMock: vi.fn(),
  listDisponibilidadActionMock: vi.fn(),
}));

// TurnosTable renderiza AgregarTurnoModal/EditarTurnoModal (mismos módulos
// que sus propios tests) — mockeamos todas las acciones que esos
// componentes importan, no solo las que usa TurnosTable directamente.
vi.mock("@/app/actions/turnos", () => ({
  cancelarTurnoAction: cancelarTurnoActionMock,
  listTurnosAction: listTurnosActionMock,
  agendarTurnoAction: agendarTurnoActionMock,
  crearTurnoManualAction: crearTurnoManualActionMock,
  editarTurnoAction: editarTurnoActionMock,
  reprogramarTurnoAction: reprogramarTurnoActionMock,
  marcarAsistenciaAction: marcarAsistenciaActionMock,
}));
vi.mock("@/app/actions/pacientes", () => ({
  listPacientesAction: listPacientesActionMock,
}));
vi.mock("@/app/actions/calendario-config", () => ({
  listDisponibilidadAction: listDisponibilidadActionMock,
}));

const { TurnosTable } = await import("./turnos-table");

const tiposConsulta = [{ id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" }];

const turnoPendiente = {
  id: "pend-1",
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
  id: "agen-1",
  estado: "agendado" as const,
  origen: "manual" as const,
  nombreContacto: "Julián",
  apellidoContacto: "Ortiz",
  dniContacto: "30222333",
  telefonoContacto: "+5493511111111",
  emailContacto: "julian@example.com",
  motivo: "",
  horaInicio: "2026-09-01T09:00:00Z",
  horaFin: "2026-09-01T09:30:00Z",
  createdAt: new Date().toISOString(),
};

// Las acciones (Confirmar/Editar/Cancelar) viven en un panel que se
// despliega al tocar la fila (pedido explícito del cliente, 2026-08-23) —
// se abre clickeando el nombre del paciente, que nunca es en sí mismo un
// botón/link.
async function desplegarFila(user: ReturnType<typeof userEvent.setup>, nombreCompleto: string) {
  await user.click(screen.getByText(nombreCompleto));
}

describe("TurnosTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTurnosActionMock.mockResolvedValue([]);
    listPacientesActionMock.mockResolvedValue([]);
    listDisponibilidadActionMock.mockResolvedValue({ slots: ["09:00", "09:15", "09:30"] });
  });

  it("muestra un mensaje cuando no hay turnos", () => {
    render(<TurnosTable turnosIniciales={[]} tiposConsulta={tiposConsulta} filtros={{}} />);
    expect(screen.getByText("No hay turnos para este filtro.")).toBeInTheDocument();
  });

  // El sticky vive en cada `th` (`.panel-th-sticky`), no en thead/tr —
  // bug de Safari de iOS con rebote elástico (2026-08-28): WebKit no
  // recalcula bien el sticky en thead/tr durante el overscroll.
  it("cada th del encabezado tiene la clase sticky (no el thead)", () => {
    const { container } = render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);
    const thead = container.querySelector("thead")!;
    expect(thead.className).toBe("");
    const ths = container.querySelectorAll("thead th");
    expect(ths.length).toBeGreaterThan(0);
    ths.forEach((th) => expect(th).toHaveClass("panel-th-sticky"));
  });

  it("las acciones no están visibles hasta que se despliega la fila", () => {
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
  });

  it("clickear la fila la despliega y clickearla de nuevo la cierra", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();

    await desplegarFila(user, "Julián Ortiz");
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("muestra 'Confirmar' solo para turnos pendientes, una vez desplegada la fila", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoPendiente]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Bruno Iglesias");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
  });

  it("no muestra 'Confirmar' para un turno ya agendado", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
  });

  it("Cancelar un turno PENDIENTE llama a la acción directo, sin pedir confirmación", async () => {
    cancelarTurnoActionMock.mockResolvedValue({ turno: { ...turnoPendiente, estado: "cancelada" } });
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoPendiente]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Bruno Iglesias");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog", { name: "Cancelar turno" })).not.toBeInTheDocument();
    await waitFor(() => expect(cancelarTurnoActionMock).toHaveBeenCalledWith("pend-1"));
  });

  it("Cancelar un turno AGENDADO abre el modal de confirmación extra, y no llama a la acción hasta confirmar", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByRole("dialog", { name: "Cancelar turno" })).toBeInTheDocument();
    expect(cancelarTurnoActionMock).not.toHaveBeenCalled();
  });

  it("confirmar en el modal de cancelación llama a la acción y recarga la lista", async () => {
    cancelarTurnoActionMock.mockResolvedValue({ turno: { ...turnoAgendado, estado: "cancelada" } });
    listTurnosActionMock.mockResolvedValue([{ ...turnoAgendado, estado: "cancelada" }]);
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar turno" });
    await user.click(within(dialogo).getByRole("button", { name: "Sí, cancelar turno" }));

    await waitFor(() => expect(cancelarTurnoActionMock).toHaveBeenCalledWith("agen-1"));
    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalledWith({}));
    expect(screen.queryByRole("dialog", { name: "Cancelar turno" })).not.toBeInTheDocument();
  });

  it("'Volver' en el modal de cancelación cierra sin llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar turno" });
    await user.click(within(dialogo).getByRole("button", { name: "Volver" }));

    expect(screen.queryByRole("dialog", { name: "Cancelar turno" })).not.toBeInTheDocument();
    expect(cancelarTurnoActionMock).not.toHaveBeenCalled();
  });

  it("muestra el error de cancelación dentro del modal, sin cerrarlo", async () => {
    cancelarTurnoActionMock.mockResolvedValue({ error: "turno no encontrado" });
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar turno" });
    await user.click(within(dialogo).getByRole("button", { name: "Sí, cancelar turno" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("turno no encontrado");
  });

  it("muestra el error de cancelación directa (pendiente) sin romper la tabla", async () => {
    cancelarTurnoActionMock.mockResolvedValue({ error: "turno no encontrado" });
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoPendiente]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Bruno Iglesias");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("turno no encontrado");
  });

  it("no muestra 'Cancelar' ni 'Editar' para turnos ya cancelados", async () => {
    const user = userEvent.setup();
    render(
      <TurnosTable
        turnosIniciales={[{ ...turnoAgendado, estado: "cancelada" }]}
        tiposConsulta={tiposConsulta}
        filtros={{}}
      />,
    );
    await desplegarFila(user, "Julián Ortiz");
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  // TR-074 en docs/tradeoffs.md (pedido explícito del cliente): un turno
  // agendado con horaFin ya pasado ("resuelto") debe mostrar "Resuelto",
  // no "Confirmado", y no debe poder confirmarse/editarse/cancelarse —
  // solo lectura.
  it("un turno resuelto (agendado + horaFin pasado) muestra Resuelto y no ofrece acciones de edición", async () => {
    const user = userEvent.setup();
    const resuelto = { ...turnoAgendado, horaFin: "2020-01-01T09:30:00Z" };
    render(<TurnosTable turnosIniciales={[resuelto]} tiposConsulta={tiposConsulta} filtros={{}} />);

    expect(screen.getByText("Resuelto")).toBeInTheDocument();
    expect(screen.queryByText("Confirmado")).not.toBeInTheDocument();

    await desplegarFila(user, "Julián Ortiz");
    expect(screen.getByText("Turno ya resuelto — sin acciones de edición disponibles.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
  });

  // Paso 2b (pedido explícito del cliente, 2026-09-04): "los turnos
  // resueltos ahora tienen la opción... de marcar asistidos o ausente...
  // tanto en el calendario, como de la sección de turnos resueltos en la
  // pestaña de turnos". Irreversible (corrección de QA, 2026-09-04,
  // textual): "me debe aparecer un aviso que la elección es irreversible
  // y confirmar esto" — tocar el botón solo pide confirmación, la Server
  // Action recién se llama al confirmar.
  describe("marcar asistencia en un turno resuelto (irreversible)", () => {
    const resuelto = { ...turnoAgendado, horaFin: "2020-01-01T09:30:00Z" };

    it("tocar 'Asistió' NO llama a la Server Action todavía — pide confirmación con el aviso de irreversibilidad", async () => {
      const user = userEvent.setup();
      render(<TurnosTable turnosIniciales={[resuelto]} tiposConsulta={tiposConsulta} filtros={{}} />);

      await desplegarFila(user, "Julián Ortiz");
      await user.click(screen.getByRole("button", { name: "Asistió" }));

      expect(marcarAsistenciaActionMock).not.toHaveBeenCalled();
      expect(screen.getByText(/Esta elección es irreversible/)).toBeInTheDocument();
    });

    it("'Cancelar' en la confirmación vuelve a los dos botones sin llamar a la acción", async () => {
      const user = userEvent.setup();
      render(<TurnosTable turnosIniciales={[resuelto]} tiposConsulta={tiposConsulta} filtros={{}} />);

      await desplegarFila(user, "Julián Ortiz");
      await user.click(screen.getByRole("button", { name: "Asistió" }));
      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(marcarAsistenciaActionMock).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Asistió" })).toBeInTheDocument();
    });

    it("'Confirmar' llama a marcarAsistenciaAction con el turno correcto y deja la marca fija", async () => {
      const user = userEvent.setup();
      marcarAsistenciaActionMock.mockResolvedValue({ turno: { ...resuelto, asistencia: "asistio" } });
      listTurnosActionMock.mockResolvedValue([{ ...resuelto, asistencia: "asistio" }]);
      render(<TurnosTable turnosIniciales={[resuelto]} tiposConsulta={tiposConsulta} filtros={{}} />);

      await desplegarFila(user, "Julián Ortiz");
      await user.click(screen.getByRole("button", { name: "Asistió" }));
      await user.click(screen.getByRole("button", { name: "Confirmar" }));

      expect(marcarAsistenciaActionMock).toHaveBeenCalledWith(resuelto.id, "asistio");
      expect(await screen.findByText("No se puede modificar.")).toBeInTheDocument();
    });

    it("un turno que ya llega marcado muestra la etiqueta fija, sin botones", async () => {
      const user = userEvent.setup();
      const yaMarcado = { ...resuelto, asistencia: "ausente" as const };
      render(<TurnosTable turnosIniciales={[yaMarcado]} tiposConsulta={tiposConsulta} filtros={{}} />);

      await desplegarFila(user, "Julián Ortiz");
      expect(screen.getByText("Ausente")).toBeInTheDocument();
      expect(screen.getByText("No se puede modificar.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Asistió" })).not.toBeInTheDocument();
    });

    it("muestra el error si falla al confirmar la asistencia", async () => {
      const user = userEvent.setup();
      marcarAsistenciaActionMock.mockResolvedValue({ error: "no se pudo guardar la asistencia" });
      render(<TurnosTable turnosIniciales={[resuelto]} tiposConsulta={tiposConsulta} filtros={{}} />);

      await desplegarFila(user, "Julián Ortiz");
      await user.click(screen.getByRole("button", { name: "Asistió" }));
      await user.click(screen.getByRole("button", { name: "Confirmar" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("no se pudo guardar la asistencia");
    });
  });

  it("Editar abre el modal con los datos del turno", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(await screen.findByRole("dialog", { name: "Editar turno" })).toBeInTheDocument();
  });

  it("con abrirId, la fila correspondiente arranca desplegada (deep-link desde 'Ver turno')", () => {
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} abrirId="agen-1" />);
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  // Bug reportado 2026-08-28: "si toco Ver turno... y este turno está muy
  // debajo de la tabla, tengo que bajar manualmente para ver el turno
  // desplegado" — la fila ya arrancaba desplegada, pero nada la traía a
  // la vista.
  it("con abrirId, la fila correspondiente se trae a la vista con scrollIntoView", () => {
    const scrollIntoViewMock = vi.fn();
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(scrollIntoViewMock);

    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} abrirId="agen-1" />);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("T3.4: Confirmar abre '+ Agregar turno' con el paciente pendiente ya elegido, y al confirmar recarga la lista", async () => {
    agendarTurnoActionMock.mockResolvedValue({ turno: { ...turnoPendiente, estado: "agendado" } });
    listTurnosActionMock.mockResolvedValue([{ ...turnoPendiente, estado: "agendado" }]);
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoPendiente]} tiposConsulta={tiposConsulta} filtros={{ estado: "pendiente" }} />);

    await desplegarFila(user, "Bruno Iglesias");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    const dialogo = await screen.findByRole("dialog", { name: "Agregar turno" });
    expect(within(dialogo).queryByRole("button", { name: "Paciente nuevo" })).not.toBeInTheDocument();
    // La fecha por defecto es "hoy" — se fija una futura para que el test
    // no dependa de a qué hora del día corre (ya no se puede agendar en
    // el pasado, 2026-08-23).
    fireEvent.change(within(dialogo).getByLabelText("Fecha"), { target: { value: "2030-01-01" } });
    await user.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(agendarTurnoActionMock).toHaveBeenCalledWith("pend-1", expect.any(Object)));
    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalledWith({ estado: "pendiente" }));
    expect(screen.queryByRole("dialog", { name: "Agregar turno" })).not.toBeInTheDocument();
  });
});
