import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { crearPacienteActionMock, sumarPacienteAMiListaActionMock, listPacientesActionMock } = vi.hoisted(() => ({
  crearPacienteActionMock: vi.fn(),
  sumarPacienteAMiListaActionMock: vi.fn(),
  listPacientesActionMock: vi.fn(),
}));
vi.mock("@/app/actions/pacientes", () => ({
  crearPacienteAction: crearPacienteActionMock,
  sumarPacienteAMiListaAction: sumarPacienteAMiListaActionMock,
  // BuscadorPacientes (la pestaña "De la clínica") la llama al montarse.
  // Sin mockearla corre la Server Action de verdad y `cookies()` explota
  // fuera de un request: los tests pasan pero vitest falla la corrida.
  listPacientesAction: listPacientesActionMock,
}));

const { AgregarPacienteModal } = await import("./agregar-paciente-modal");

const nuevoPaciente = {
  id: "pac-1",
  nombre: "Bruno",
  apellido: "Iglesias",
  dni: "30111222",
  telefono: "+5493511234567",
  email: "bruno@example.com",
  createdAt: new Date().toISOString(),
};

// El modal abre en "De la clínica" desde el 2026-09-19, con el mismo
// criterio que "+ Agregar turno" (que abre en "Paciente conocido"): mirar
// primero si la persona ya está cargada evita duplicarla. El formulario
// de alta vive ahora detrás de la otra pestaña.
async function irAPacienteNuevo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Paciente nuevo" }));
}

async function completarCampos(user: ReturnType<typeof userEvent.setup>) {
  await irAPacienteNuevo(user);
  await user.type(screen.getByLabelText("Nombre"), "Bruno");
  await user.type(screen.getByLabelText("Apellido"), "Iglesias");
  await user.type(screen.getByLabelText("DNI"), "30111222");
  await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
  // El mail es obligatorio sin tutor (2026-09-15): una ficha manual sin
  // mail no se puede reconocer cuando esa persona pida turno por la
  // página, y cada pedido termina abriendo un conflicto de identidad.
  await user.type(screen.getByLabelText("Email"), "bruno@example.com");
}

describe("AgregarPacienteModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPacientesActionMock.mockResolvedValue([]);
  });

  it("nombre y apellido son obligatorios", async () => {
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await irAPacienteNuevo(user);

    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Nombre y apellido son obligatorios/);
    expect(crearPacienteActionMock).not.toHaveBeenCalled();
  });

  it("valida el formato del DNI antes de llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await irAPacienteNuevo(user);

    await user.type(screen.getByLabelText("Nombre"), "Bruno");
    await user.type(screen.getByLabelText("Apellido"), "Iglesias");
    await user.type(screen.getByLabelText("DNI"), "123");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/DNI debe tener 7 u 8 dígitos/);
    expect(crearPacienteActionMock).not.toHaveBeenCalled();
  });

  it("valida el formato del teléfono antes de llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await irAPacienteNuevo(user);

    await user.type(screen.getByLabelText("Nombre"), "Bruno");
    await user.type(screen.getByLabelText("Apellido"), "Iglesias");
    await user.type(screen.getByLabelText("DNI"), "30111222");
    await user.type(screen.getByLabelText("Teléfono"), "123");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/teléfono no tiene un formato válido/);
    expect(crearPacienteActionMock).not.toHaveBeenCalled();
  });

  it("crea el paciente y llama a onSuccess", async () => {
    crearPacienteActionMock.mockResolvedValue({ paciente: nuevoPaciente });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={onSuccess} />);

    await completarCampos(user);
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(crearPacienteActionMock).toHaveBeenCalledWith({
      nombre: "Bruno",
      apellido: "Iglesias",
      dni: "30111222",
      telefono: "+5493511234567",
      email: "bruno@example.com",
    });
    expect(onSuccess).toHaveBeenCalledWith(nuevoPaciente);
  });

  it("muestra el error que devuelve la acción (p. ej. DNI ya existe)", async () => {
    crearPacienteActionMock.mockResolvedValue({ error: "ya existe un paciente con ese DNI" });
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    await completarCampos(user);
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ya existe un paciente con ese DNI");
  });

  it("se cierra con Cancelar y con la X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={onClose} onSuccess={vi.fn()} />);
    await irAPacienteNuevo(user);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // "De la clínica" (2026-09-19, pedido del cliente): la ficha ya existe
  // —la cargó un colega, o la persona pidió turno con él— y este
  // profesional la suma a SU lista sin inventarle un turno, que era la
  // única forma de conseguirlo.
  describe("pestaña 'De la clínica'", () => {
    const deLaClinica = [
      { id: "pac-9", nombre: "Muru", apellido: "Zabal", dni: "44020992", telefono: "+549", email: "muru@example.com", esMio: false },
      { id: "pac-1", nombre: "Bruno", apellido: "Iglesias", dni: "30111222", telefono: "+549", email: "b@example.com", esMio: true },
    ];

    it("solo ofrece las fichas que NO están en mi lista", async () => {
      listPacientesActionMock.mockResolvedValue(deLaClinica);
      render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={vi.fn()} />);

      expect(await screen.findByRole("button", { name: /Muru Zabal/ })).toBeInTheDocument();
      // Bruno ya es mío: ofrecer sumarlo no haría nada.
      expect(screen.queryByRole("button", { name: /Bruno Iglesias/ })).not.toBeInTheDocument();
    });

    it("al elegir una, la suma a mi lista y cierra", async () => {
      listPacientesActionMock.mockResolvedValue(deLaClinica);
      sumarPacienteAMiListaActionMock.mockResolvedValue({ ok: true });
      const onSuccess = vi.fn();
      const user = userEvent.setup();
      render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={onSuccess} />);

      await user.click(await screen.findByRole("button", { name: /Muru Zabal/ }));

      expect(sumarPacienteAMiListaActionMock).toHaveBeenCalledWith("pac-9");
      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: "pac-9", nombre: "Muru" }));
    });

    it("si el backend rechaza, lo dice y no cierra", async () => {
      listPacientesActionMock.mockResolvedValue(deLaClinica);
      sumarPacienteAMiListaActionMock.mockResolvedValue({ error: "paciente no encontrado" });
      const onSuccess = vi.fn();
      const user = userEvent.setup();
      render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={onSuccess} />);

      await user.click(await screen.findByRole("button", { name: /Muru Zabal/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent("paciente no encontrado");
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
});
