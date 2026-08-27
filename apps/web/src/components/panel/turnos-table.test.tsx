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
  listPacientesActionMock,
} = vi.hoisted(() => ({
  cancelarTurnoActionMock: vi.fn(),
  listTurnosActionMock: vi.fn(),
  agendarTurnoActionMock: vi.fn(),
  crearTurnoManualActionMock: vi.fn(),
  editarTurnoActionMock: vi.fn(),
  reprogramarTurnoActionMock: vi.fn(),
  listPacientesActionMock: vi.fn(),
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
}));
vi.mock("@/app/actions/pacientes", () => ({
  listPacientesAction: listPacientesActionMock,
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

// TR-064 en docs/tradeoffs.md: desde esta corrección, ResponsiveTable
// renderiza la tabla de escritorio Y la lista de cards mobile al mismo
// tiempo en el DOM (jsdom no evalúa media queries — ninguna de las dos
// está "oculta" de verdad para una query). Este archivo prueba
// específicamente el comportamiento de la TABLA de escritorio (sin
// cambios de comportamiento respecto a antes de TR-064) — todas las
// queries de fila/botón se acotan a `tabla()` para no ambigüar contra la
// card mobile equivalente. La cobertura de la card mobile en sí vive en
// el describe "cards mobile" al final.
function tabla() {
  return within(screen.getByRole("table"));
}

// Las acciones (Confirmar/Editar/Cancelar) viven en un panel que se
// despliega al tocar la fila (pedido explícito del cliente, 2026-08-23) —
// se abre clickeando el nombre del paciente, que nunca es en sí mismo un
// botón/link.
async function desplegarFila(user: ReturnType<typeof userEvent.setup>, nombreCompleto: string) {
  await user.click(tabla().getByText(nombreCompleto));
}

describe("TurnosTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTurnosActionMock.mockResolvedValue([]);
    listPacientesActionMock.mockResolvedValue([]);
  });

  it("muestra un mensaje cuando no hay turnos", () => {
    render(<TurnosTable turnosIniciales={[]} tiposConsulta={tiposConsulta} filtros={{}} />);
    expect(screen.getByText("No hay turnos para este filtro.")).toBeInTheDocument();
  });

  it("las acciones no están visibles hasta que se despliega la fila", () => {
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);
    expect(tabla().queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(tabla().queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
  });

  it("clickear la fila la despliega y clickearla de nuevo la cierra", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    expect(tabla().getByRole("button", { name: "Editar" })).toBeInTheDocument();

    await desplegarFila(user, "Julián Ortiz");
    expect(tabla().queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("muestra 'Confirmar' solo para turnos pendientes, una vez desplegada la fila", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoPendiente]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Bruno Iglesias");
    expect(tabla().getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
  });

  it("no muestra 'Confirmar' para un turno ya agendado", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    expect(tabla().queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
  });

  it("Cancelar un turno PENDIENTE llama a la acción directo, sin pedir confirmación", async () => {
    cancelarTurnoActionMock.mockResolvedValue({ turno: { ...turnoPendiente, estado: "cancelada" } });
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoPendiente]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Bruno Iglesias");
    await user.click(tabla().getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog", { name: "Cancelar turno" })).not.toBeInTheDocument();
    await waitFor(() => expect(cancelarTurnoActionMock).toHaveBeenCalledWith("pend-1"));
  });

  it("Cancelar un turno AGENDADO abre el modal de confirmación extra, y no llama a la acción hasta confirmar", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(tabla().getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByRole("dialog", { name: "Cancelar turno" })).toBeInTheDocument();
    expect(cancelarTurnoActionMock).not.toHaveBeenCalled();
  });

  it("confirmar en el modal de cancelación llama a la acción y recarga la lista", async () => {
    cancelarTurnoActionMock.mockResolvedValue({ turno: { ...turnoAgendado, estado: "cancelada" } });
    listTurnosActionMock.mockResolvedValue([{ ...turnoAgendado, estado: "cancelada" }]);
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(tabla().getByRole("button", { name: "Cancelar" }));
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
    await user.click(tabla().getByRole("button", { name: "Cancelar" }));
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
    await user.click(tabla().getByRole("button", { name: "Cancelar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar turno" });
    await user.click(within(dialogo).getByRole("button", { name: "Sí, cancelar turno" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("turno no encontrado");
  });

  it("muestra el error de cancelación directa (pendiente) sin romper la tabla", async () => {
    cancelarTurnoActionMock.mockResolvedValue({ error: "turno no encontrado" });
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoPendiente]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Bruno Iglesias");
    await user.click(tabla().getByRole("button", { name: "Cancelar" }));

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
    expect(tabla().queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(tabla().queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("Editar abre el modal con los datos del turno", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(tabla().getByRole("button", { name: "Editar" }));

    expect(await screen.findByRole("dialog", { name: "Editar turno" })).toBeInTheDocument();
  });

  it("con abrirId, la fila correspondiente arranca desplegada (deep-link desde 'Ver turno')", () => {
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} abrirId="agen-1" />);
    expect(tabla().getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("T3.4: Confirmar abre '+ Agregar turno' con el paciente pendiente ya elegido, y al confirmar recarga la lista", async () => {
    agendarTurnoActionMock.mockResolvedValue({ turno: { ...turnoPendiente, estado: "agendado" } });
    listTurnosActionMock.mockResolvedValue([{ ...turnoPendiente, estado: "agendado" }]);
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoPendiente]} tiposConsulta={tiposConsulta} filtros={{ estado: "pendiente" }} />);

    await desplegarFila(user, "Bruno Iglesias");
    await user.click(tabla().getByRole("button", { name: "Confirmar" }));

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

// TR-064 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-26):
// debajo de `md` la tabla se reemplaza por una card por turno. No
// duplica cada test de arriba — cubre puntualmente lo que es propio de
// la card (contacto con truncate/break-all, motivo oculto si está vacío,
// badge de estado, origen + dropdown al pie).
describe("TurnosTable — cards mobile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTurnosActionMock.mockResolvedValue([]);
  });

  function cards() {
    // ResponsiveTable arma un Fragment: <div className="hidden md:block">
    // {tabla}</div><div className="... md:hidden">{cards}</div> — la
    // lista de cards es el HERMANO siguiente del wrapper que contiene la
    // tabla, sin depender de ningún texto puntual (funciona con cualquier
    // cantidad de turnos, incluido cero... salvo que ahí no hay <table>).
    const t = screen.getByRole("table");
    const desktopWrapper = t.parentElement!.parentElement!;
    return desktopWrapper.nextElementSibling as HTMLElement;
  }

  it("muestra teléfono y email del contacto (truncate/break-all para el email largo)", () => {
    const emailLargo = "unemaillargoquepodriaromperelanchodelacard@ejemplo-de-dominio-largo.com";
    render(
      <TurnosTable
        turnosIniciales={[{ ...turnoPendiente, emailContacto: emailLargo }]}
        tiposConsulta={tiposConsulta}
        filtros={{}}
      />,
    );
    const email = within(cards()).getByText(emailLargo);
    expect(email).toHaveClass("break-all");
    expect(within(cards()).getByText(turnoPendiente.telefonoContacto)).toHaveClass("truncate");
  });

  it("con motivo vacío, no muestra la fila de Motivo (pero sí Fecha y hora)", () => {
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);
    expect(within(cards()).queryByText("Motivo")).not.toBeInTheDocument();
    expect(within(cards()).getByText("Fecha y hora")).toBeInTheDocument();
  });

  it("con motivo presente, muestra el par label/valor", () => {
    render(<TurnosTable turnosIniciales={[turnoPendiente]} tiposConsulta={tiposConsulta} filtros={{}} />);
    expect(within(cards()).getByText("Motivo")).toBeInTheDocument();
    expect(within(cards()).getByText("Dolor de muela")).toBeInTheDocument();
  });

  it("muestra el origen y, al tocar el toggle de la card, despliega las acciones", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoPendiente]} tiposConsulta={tiposConsulta} filtros={{}} />);

    expect(within(cards()).getByText("Página pública")).toBeInTheDocument();
    expect(within(cards()).queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();

    await user.click(within(cards()).getByRole("button", { name: "Mostrar acciones" }));
    expect(within(cards()).getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
  });
});
