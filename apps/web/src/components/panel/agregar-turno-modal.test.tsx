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

const {
  listTurnosActionMock,
  crearTurnoManualActionMock,
  agendarTurnoActionMock,
  listPacientesActionMock,
  listDisponibilidadActionMock,
} = vi.hoisted(() => ({
  listTurnosActionMock: vi.fn(),
  crearTurnoManualActionMock: vi.fn(),
  agendarTurnoActionMock: vi.fn(),
  listPacientesActionMock: vi.fn(),
  listDisponibilidadActionMock: vi.fn(),
}));

vi.mock("@/app/actions/turnos", () => ({
  listTurnosAction: listTurnosActionMock,
  crearTurnoManualAction: crearTurnoManualActionMock,
  agendarTurnoAction: agendarTurnoActionMock,
}));
vi.mock("@/app/actions/pacientes", () => ({
  listPacientesAction: listPacientesActionMock,
}));
// F2.3 (corrección de QA): el modal ya no arma la lista de horarios con un
// <input type="time"> + horario de atención propio — pide los horarios
// YA calculados como disponibles a /disponibilidad (vía Server Action).
// Sin este mock, el useEffect llama a la Server Action de verdad, que
// explota fuera de un request real de Next.js (unhandled rejection).
vi.mock("@/app/actions/calendario-config", () => ({
  listDisponibilidadAction: listDisponibilidadActionMock,
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
    // Lista fija de horarios "disponibles" — no interfiere con los tests
    // existentes, que no ejercitan el cálculo de disponibilidad en sí
    // (eso lo cubre disponibilidad_test.go, contra el backend real).
    listDisponibilidadActionMock.mockResolvedValue({ slots: ["09:00", "09:15", "09:30"] });
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

  // Corrección de bug reportado por el cliente: "desde el calendario me
  // deja crear paciente nuevo con un DNI que ya existe... se genera un
  // turno con un paciente que no está en el apartado pacientes, no hay
  // verificación en este lugar" — el backend ya reusaba la ficha existente
  // (E5.1), pero en silencio; ahora se verifica ANTES de avanzar de paso.
  it("paciente nuevo: bloquea si el DNI ya pertenece a otro paciente", async () => {
    const existente = {
      id: "pac-existente",
      nombre: "Julián",
      apellido: "Ortiz",
      dni: "30222333",
      telefono: "+5493511111111",
      email: "julian@example.com",
      createdAt: new Date().toISOString(),
    };
    listPacientesActionMock.mockResolvedValue([existente]);
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByText("Bruno Iglesias");
    await user.click(screen.getByRole("button", { name: "Paciente nuevo" }));
    await user.type(screen.getByLabelText("Nombre"), "Otro Nombre");
    await user.type(screen.getByLabelText("Apellido"), "Otro Apellido");
    await user.type(screen.getByLabelText("DNI"), "30222333");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511111111");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo generar el turno: el paciente con DNI 30222333 ya existe y es Julián Ortiz");
    // No avanzó al paso "detalle" — el select de tipo de consulta no aparece.
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(crearTurnoManualActionMock).not.toHaveBeenCalled();
  });

  it("paciente nuevo con DNI duplicado: 'Usar este paciente' salta a conocido con esos datos", async () => {
    const existente = {
      id: "pac-existente",
      nombre: "Julián",
      apellido: "Ortiz",
      dni: "30222333",
      telefono: "+5493511111111",
      email: "julian@example.com",
      createdAt: new Date().toISOString(),
    };
    listPacientesActionMock.mockResolvedValue([existente]);
    crearTurnoManualActionMock.mockResolvedValue({ turno: { id: "nuevo-3", estado: "agendado" } });
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByText("Bruno Iglesias");
    await user.click(screen.getByRole("button", { name: "Paciente nuevo" }));
    await user.type(screen.getByLabelText("Nombre"), "Otro Nombre");
    await user.type(screen.getByLabelText("Apellido"), "Otro Apellido");
    await user.type(screen.getByLabelText("DNI"), "30222333");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511111111");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await user.click(await screen.findByRole("button", { name: "Usar este paciente" }));
    expect(screen.getByText(/Julián Ortiz/)).toBeInTheDocument();
    fijarFechaFutura();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(crearTurnoManualActionMock).toHaveBeenCalledTimes(1));
    const [payload] = crearTurnoManualActionMock.mock.calls[0];
    expect(payload.pacienteId).toBe("pac-existente");
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

  // Extra 2.3.5 (E5.4, fix de bug): volver de "paciente conocido" a "paciente
  // nuevo" no debe dejar precargados los datos del conocido — antes de este
  // fix, elegir un paciente conocido, volver con "Atrás" y tocar "Paciente
  // nuevo" mostraba el formulario ya lleno con los datos de ese paciente.
  it("volver de 'paciente conocido' a 'paciente nuevo' no deja precargados los datos del conocido", async () => {
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
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByText("Bruno Iglesias");
    await user.click(screen.getByRole("button", { name: "Paciente conocido" }));
    await user.click(await screen.findByText("Julián Ortiz"));

    // Paso "detalle" con Julián precargado — vuelve atrás y cambia a "nuevo".
    await user.click(screen.getByRole("button", { name: "Atrás" }));
    await user.click(screen.getByRole("button", { name: "Paciente nuevo" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("");
    expect(screen.getByLabelText("Apellido")).toHaveValue("");
    expect(screen.getByLabelText("DNI")).toHaveValue("");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("");
    expect(screen.getByLabelText("Email (opcional)")).toHaveValue("");
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

  // F2.3 (corrección de QA): "solo me tiene que salir seleccionables los
  // horarios que entran en mi agenda" — el selector de hora se llena con
  // los slots que YA vienen calculados por el backend (/disponibilidad),
  // nunca con horas libres tipeadas a mano.
  it("el selector de hora arranca colapsado, mostrando el horario ya elegido", async () => {
    listDisponibilidadActionMock.mockResolvedValue({ slots: ["10:00", "10:30"] });
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Bruno Iglesias"));

    expect(await screen.findByRole("button", { name: "Hora: 10:00" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // Corrección de QA (F2.3): "el seleccionar hora se escapa de la
  // pantalla... que se vean algunos en pantalla e ir scrolleando" — ya
  // no es un <select> nativo (HoraPicker, lista inline con scroll propio
  // acotado), ver hora-picker.test.tsx para el detalle de ese componente.
  // También corrección de QA: "quiero que aparezca colapsada primero...
  // y una vez que la apriete se vean los horarios".
  it("tocar el selector de hora despliega una lista inline con scroll propio, no un <select> nativo", async () => {
    listDisponibilidadActionMock.mockResolvedValue({ slots: ["10:00", "10:30"] });
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Bruno Iglesias"));

    await user.click(await screen.findByRole("button", { name: "Hora: 10:00" }));
    const lista = screen.getByRole("listbox", { name: "Hora" });
    expect(lista.tagName).not.toBe("SELECT");
    expect(screen.getByRole("option", { name: "10:30" })).toBeInTheDocument();
  });

  it("no permite confirmar sin ningún horario disponible", async () => {
    listDisponibilidadActionMock.mockResolvedValue({ slots: [] });
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(await screen.findByText("Bruno Iglesias"));
    await waitFor(() => expect(screen.getByText("No hay horarios disponibles")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Elegí un horario disponible");
    expect(agendarTurnoActionMock).not.toHaveBeenCalled();
  });

  it("pide de nuevo la disponibilidad cuando cambia el tipo de consulta o la fecha", async () => {
    const user = userEvent.setup();
    render(<AgregarTurnoModal tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(await screen.findByText("Bruno Iglesias"));
    await waitFor(() => expect(listDisponibilidadActionMock).toHaveBeenCalledWith("tc-1", expect.any(String)));

    listDisponibilidadActionMock.mockClear();
    await user.selectOptions(screen.getByLabelText("Tipo de consulta"), "tc-2");
    await waitFor(() => expect(listDisponibilidadActionMock).toHaveBeenCalledWith("tc-2", expect.any(String)));
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
