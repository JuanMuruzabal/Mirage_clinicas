import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// El paso "detalle" arranca con la fecha de hoy — como ya no se puede
// agendar un turno en el pasado (2026-08-23), cualquier test que confirme
// sin tocar la fecha corre el riesgo de que la hora por defecto ("09:00")
// ya haya pasado según la hora real a la que corre la suite. Se fija acá
// una fecha bien futura antes de confirmar, para que el test no dependa
// de a qué hora del día se ejecuta.
function fijarFechaFutura() {
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2030-01-01" } });
}

const { listTurnosActionMock, crearTurnoManualActionMock, agendarTurnoActionMock, listPacientesActionMock } = vi.hoisted(() => ({
  listTurnosActionMock: vi.fn(),
  crearTurnoManualActionMock: vi.fn(),
  agendarTurnoActionMock: vi.fn(),
  listPacientesActionMock: vi.fn(),
}));

vi.mock("@/app/actions/turnos", () => ({
  listTurnosAction: listTurnosActionMock,
  crearTurnoManualAction: crearTurnoManualActionMock,
  agendarTurnoAction: agendarTurnoActionMock,
}));
vi.mock("@/app/actions/pacientes", () => ({
  listPacientesAction: listPacientesActionMock,
}));

const { AgregarTurnoModal } = await import("./agregar-turno-modal");

const tiposConsulta = [
  { id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" },
  { id: "tc-2", nombre: "Urgencia", color: "#D6563A" },
];

const turnoPendiente = {
  id: "pend-1",
  estado: "pendiente" as const,
  origen: "pagina_publica" as const,
  nombreContacto: "Bruno",
  apellidoContacto: "Iglesias",
  dniContacto: "1",
  telefonoContacto: "1",
  emailContacto: "bruno@example.com",
  motivo: "Dolor de muela",
  createdAt: new Date().toISOString(),
};

describe("AgregarTurnoModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTurnosActionMock.mockResolvedValue([turnoPendiente]);
    listPacientesActionMock.mockResolvedValue([]);
  });

  it("lista los turnos pendientes al abrir", async () => {
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(await screen.findByText("Bruno Iglesias")).toBeInTheDocument();
    expect(listTurnosActionMock).toHaveBeenCalledWith({ estado: "pendiente" });
  });

  it("camino 'desde pendientes': elegir uno agenda con agendarTurnoAction", async () => {
    agendarTurnoActionMock.mockResolvedValue({ turno: { id: "pend-1", estado: "agendado" } });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={onSuccess} />);

    await user.click(await screen.findByText("Bruno Iglesias"));
    // Paso "detalle": el tipo de consulta ya viene con "Consulta general" por default.
    expect(screen.getByText(/Bruno Iglesias/)).toBeInTheDocument();
    fijarFechaFutura();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(agendarTurnoActionMock).toHaveBeenCalledTimes(1));
    const [turnoId, payload] = agendarTurnoActionMock.mock.calls[0];
    expect(turnoId).toBe("pend-1");
    expect(payload.tipoConsultaId).toBe("tc-1");
    expect(onSuccess).toHaveBeenCalledWith({ id: "pend-1", estado: "agendado" });
  });

  it("camino 'paciente nuevo': crea con crearTurnoManualAction", async () => {
    crearTurnoManualActionMock.mockResolvedValue({ turno: { id: "nuevo-1", estado: "agendado" } });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={onSuccess} />);

    await screen.findByText("Bruno Iglesias");
    await user.click(screen.getByRole("button", { name: "Paciente nuevo" }));

    await user.type(screen.getByLabelText("Nombre"), "Julián");
    await user.type(screen.getByLabelText("Apellido"), "Ortiz");
    await user.type(screen.getByLabelText("DNI"), "30222333");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511111111");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    fijarFechaFutura();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(crearTurnoManualActionMock).toHaveBeenCalledTimes(1));
    const [payload] = crearTurnoManualActionMock.mock.calls[0];
    expect(payload.nombreContacto).toBe("Julián");
    expect(payload.dniContacto).toBe("30222333");
    expect(onSuccess).toHaveBeenCalledWith({ id: "nuevo-1", estado: "agendado" });
  });

  it("paciente nuevo: exige nombre/apellido/DNI/teléfono antes de continuar", async () => {
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByText("Bruno Iglesias");
    await user.click(screen.getByRole("button", { name: "Paciente nuevo" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("obligatorios");
  });

  it("T2.5: muestra el error de solapamiento devuelto por la Server Action, sin cerrar el modal", async () => {
    agendarTurnoActionMock.mockResolvedValue({ error: "ese horario se superpone con otro turno ya agendado" });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={onSuccess} />);

    await user.click(await screen.findByText("Bruno Iglesias"));
    fijarFechaFutura();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("se superpone");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("se cierra con el botón X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={onClose} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("muestra 'sin turnos pendientes' cuando la lista viene vacía", async () => {
    listTurnosActionMock.mockResolvedValue([]);
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(await screen.findByText(/No hay turnos pendientes/)).toBeInTheDocument();
  });

  it("T3.4: con turnoPendienteInicial, arranca directo en 'detalle' sin pedir elegir paciente", async () => {
    agendarTurnoActionMock.mockResolvedValue({ turno: { id: "pend-1", estado: "agendado" } });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <AgregarTurnoModal
        tiposConsulta={tiposConsulta}
        onClose={vi.fn()}
        onSuccess={onSuccess}
        turnoPendienteInicial={turnoPendiente}
      />,
    );

    expect(screen.getByText(/Bruno Iglesias/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Paciente nuevo" })).not.toBeInTheDocument();
    fijarFechaFutura();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(agendarTurnoActionMock).toHaveBeenCalledTimes(1));
    expect(agendarTurnoActionMock.mock.calls[0][0]).toBe("pend-1");
    expect(onSuccess).toHaveBeenCalledWith({ id: "pend-1", estado: "agendado" });
  });

  it("camino 'paciente conocido': carga la lista al abrir la pestaña, y elegir uno precarga sus datos y manda pacienteId", async () => {
    const pacienteConocido = {
      id: "pac-1",
      nombre: "Julián",
      apellido: "Ortiz",
      dni: "30222333",
      telefono: "+5493511111111",
      email: "julian@example.com",
      createdAt: new Date().toISOString(),
    };
    listPacientesActionMock.mockResolvedValue([pacienteConocido]);
    crearTurnoManualActionMock.mockResolvedValue({ turno: { id: "nuevo-2", estado: "agendado" } });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={onSuccess} />);

    await screen.findByText("Bruno Iglesias");
    await user.click(screen.getByRole("button", { name: "Paciente conocido" }));

    expect(await screen.findByText("Julián Ortiz")).toBeInTheDocument();
    expect(listPacientesActionMock).toHaveBeenCalledWith();

    await user.click(screen.getByText("Julián Ortiz"));
    // Paso "detalle": ya viene con los datos de Julián precargados.
    expect(screen.getByText(/Julián Ortiz/)).toBeInTheDocument();
    fijarFechaFutura();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(crearTurnoManualActionMock).toHaveBeenCalledTimes(1));
    const [payload] = crearTurnoManualActionMock.mock.calls[0];
    expect(payload.pacienteId).toBe("pac-1");
    expect(payload.dniContacto).toBe("30222333");
    expect(onSuccess).toHaveBeenCalledWith({ id: "nuevo-2", estado: "agendado" });
  });

  it("paciente conocido: buscar filtra la lista con el texto tipeado", async () => {
    listPacientesActionMock.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByText("Bruno Iglesias");
    await user.click(screen.getByRole("button", { name: "Paciente conocido" }));
    await screen.findByText(/No encontramos pacientes/);

    await user.type(screen.getByLabelText("Buscar paciente"), "Julián");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(listPacientesActionMock).toHaveBeenCalledWith("Julián"));
  });

  it("camino 'desde pendientes': el motivo del turno pendiente se precarga en 'detalle' y se puede editar antes de confirmar", async () => {
    agendarTurnoActionMock.mockResolvedValue({ turno: { id: "pend-1", estado: "agendado" } });
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(await screen.findByText("Bruno Iglesias"));
    const motivo = screen.getByLabelText("Motivo de consulta (opcional)");
    expect(motivo).toHaveValue("Dolor de muela");

    await user.clear(motivo);
    await user.type(motivo, "Control de rutina");
    fijarFechaFutura();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(agendarTurnoActionMock).toHaveBeenCalledTimes(1));
    const [, payload] = agendarTurnoActionMock.mock.calls[0];
    expect(payload.motivo).toBe("Control de rutina");
  });

  it("camino 'paciente nuevo': el motivo tipeado en el paso 1 llega a crearTurnoManualAction", async () => {
    crearTurnoManualActionMock.mockResolvedValue({ turno: { id: "nuevo-1", estado: "agendado" } });
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByText("Bruno Iglesias");
    await user.click(screen.getByRole("button", { name: "Paciente nuevo" }));
    await user.type(screen.getByLabelText("Nombre"), "Julián");
    await user.type(screen.getByLabelText("Apellido"), "Ortiz");
    await user.type(screen.getByLabelText("DNI"), "30222333");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511111111");
    await user.type(screen.getByLabelText("Motivo de consulta (opcional)"), "Dolor de muela");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    // En "detalle" el motivo ya viene precargado con lo tipeado en el paso 1.
    expect(screen.getByLabelText("Motivo de consulta (opcional)")).toHaveValue("Dolor de muela");
    fijarFechaFutura();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(crearTurnoManualActionMock).toHaveBeenCalledTimes(1));
    const [payload] = crearTurnoManualActionMock.mock.calls[0];
    expect(payload.motivo).toBe("Dolor de muela");
  });

  it("no permite confirmar un turno en una fecha pasada", async () => {
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(await screen.findByText("Bruno Iglesias"));
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2020-01-01" } });
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("fecha pasada");
    expect(agendarTurnoActionMock).not.toHaveBeenCalled();
  });

  it("muestra un texto explicando a qué se refiere cada pestaña", async () => {
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByText("Bruno Iglesias");
    expect(screen.getByText(/llegaron desde tu página pública/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Paciente nuevo" }));
    expect(screen.getByText(/nunca tuvo un turno con vos/)).toBeInTheDocument();
  });
});
