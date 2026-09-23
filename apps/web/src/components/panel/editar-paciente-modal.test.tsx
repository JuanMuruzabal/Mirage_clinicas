import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Paciente } from "@dental-mirage/shared-types";

const { editarPacienteActionMock } = vi.hoisted(() => ({ editarPacienteActionMock: vi.fn() }));
vi.mock("@/app/actions/pacientes", () => ({ editarPacienteAction: editarPacienteActionMock }));

const { EditarPacienteModal } = await import("./editar-paciente-modal");

const paciente: Paciente = {
  id: "pac-1",
  nombre: "Bruno",
  apellido: "Iglesias",
  dni: "30111222",
  telefono: "+5493511234567",
  email: "bruno@example.com",
  createdAt: new Date().toISOString(),
};

const conAlternativos: Paciente = {
  ...paciente,
  emailsAlternativos: ["viejo@example.com", "otro@example.com"],
  telefonosAlternativos: ["+5493519999999"],
};

const conTutor: Paciente = {
  ...paciente,
  telefono: null,
  email: null,
  tutores: [
    {
      id: "tutor-1",
      relacion: "familiar",
      nombre: "Julián Ortiz",
      telefono: "+5493511111111",
      email: "julian@example.com",
      telefonosAlternativos: ["+5493512222222"],
    },
  ],
};

function ultimoPayload() {
  return editarPacienteActionMock.mock.calls.at(-1)![1];
}

describe("EditarPacienteModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editarPacienteActionMock.mockResolvedValue({ paciente });
  });

  it("precarga DNI y los principales, y el mail ya no dice 'opcional'", () => {
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByLabelText("DNI")).toHaveValue("30111222");
    expect(screen.getByLabelText("Teléfono principal")).toHaveValue("+5493511234567");
    expect(screen.getByLabelText("Mail principal")).toHaveValue("bruno@example.com");
    expect(screen.queryByText(/opcional/i)).not.toBeInTheDocument();
  });

  it("sin alternativos no hay listas", () => {
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByRole("list", { name: "Otros teléfonos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Otros mails" })).not.toBeInTheDocument();
  });

  it("con alternativos, los lista debajo del principal", () => {
    render(<EditarPacienteModal paciente={conAlternativos} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const mails = screen.getByRole("list", { name: "Otros mails" });
    expect(within(mails).getByText("viejo@example.com")).toBeInTheDocument();
    expect(within(mails).getByText("otro@example.com")).toBeInTheDocument();
    const telefonos = screen.getByRole("list", { name: "Otros teléfonos" });
    expect(within(telefonos).getByText("+5493519999999")).toBeInTheDocument();
  });

  it("'Hacer principal' intercambia: el elegido sube y el principal baja a la lista", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={conAlternativos} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Hacer principal otro@example.com" }));
    expect(screen.getByLabelText("Mail principal")).toHaveValue("otro@example.com");
    expect(within(screen.getByRole("list", { name: "Otros mails" })).getByText("bruno@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(ultimoPayload()).toMatchObject({
      email: "otro@example.com",
      emailsAlternativos: ["viejo@example.com", "bruno@example.com"],
    });
  });

  it("sin principal, 'Hacer principal' solo saca al elegido de la lista", async () => {
    const user = userEvent.setup();
    render(
      <EditarPacienteModal paciente={{ ...conTutor, emailsAlternativos: ["solo@example.com"] }} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Hacer principal solo@example.com" }));
    expect(screen.getByLabelText("Mail principal")).toHaveValue("solo@example.com");
    expect(screen.queryByRole("list", { name: "Otros mails" })).not.toBeInTheDocument();
  });

  it("'Quitar' saca el dato, y con el último se va la lista", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={conAlternativos} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Quitar +5493519999999" }));
    expect(screen.queryByRole("list", { name: "Otros teléfonos" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(ultimoPayload()).toMatchObject({ telefonosAlternativos: [] });
  });

  it("'Editar' corrige un alternativo en el lugar", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={conAlternativos} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Editar viejo@example.com" }));
    const campo = screen.getByLabelText("Editar dato 1 de otros mails");
    await user.clear(campo);
    await user.type(campo, "corregido@example.com");
    await user.click(screen.getByRole("button", { name: "Listo" }));
    expect(within(screen.getByRole("list", { name: "Otros mails" })).getByText("corregido@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(ultimoPayload()).toMatchObject({ emailsAlternativos: ["corregido@example.com", "otro@example.com"] });
  });

  it("valida el formato de un teléfono alternativo antes de llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={conAlternativos} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Editar +5493519999999" }));
    const campo = screen.getByLabelText("Editar dato 1 de otros teléfonos");
    await user.clear(campo);
    await user.type(campo, "123");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El teléfono 123 no tiene un formato válido.");
    expect(editarPacienteActionMock).not.toHaveBeenCalled();
  });

  it("valida el formato de un mail alternativo", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={conAlternativos} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Editar otro@example.com" }));
    const campo = screen.getByLabelText("Editar dato 2 de otros mails");
    await user.clear(campo);
    await user.type(campo, "sin-arroba");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El mail sin-arroba no tiene un formato válido.");
  });

  it("con otros mails, exige un principal", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={{ ...conTutor, emailsAlternativos: ["a@example.com"] }} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.clear(screen.getByLabelText("Mail principal"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Si tiene más de un mail, elegí cuál es el principal.");
  });

  it("con otros teléfonos, exige un principal", async () => {
    const user = userEvent.setup();
    render(
      <EditarPacienteModal paciente={{ ...conTutor, telefonosAlternativos: ["+5493510000000"] }} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Si tiene más de un teléfono, elegí cuál es el principal.");
  });

  it("valida el formato del DNI antes de llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.clear(screen.getByLabelText("DNI"));
    await user.type(screen.getByLabelText("DNI"), "123");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/DNI debe tener 7 u 8 dígitos/);
    expect(editarPacienteActionMock).not.toHaveBeenCalled();
  });

  it("valida el formato del teléfono antes de llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.clear(screen.getByLabelText("Teléfono principal"));
    await user.type(screen.getByLabelText("Teléfono principal"), "123");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/teléfono no tiene un formato válido/);
    expect(editarPacienteActionMock).not.toHaveBeenCalled();
  });

  it("sin tutor, teléfono y mail son obligatorios (TR-147)", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.clear(screen.getByLabelText("Teléfono principal"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El teléfono es obligatorio.");

    await user.type(screen.getByLabelText("Teléfono principal"), "+5493511234567");
    await user.clear(screen.getByLabelText("Mail principal"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El mail es obligatorio.");

    await user.type(screen.getByLabelText("Mail principal"), "mal");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El mail no tiene un formato válido.");
    expect(editarPacienteActionMock).not.toHaveBeenCalled();
  });

  it("con tutor, el paciente puede quedar sin mail ni teléfono propios, y el tutor viaja con su id", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={conTutor} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(editarPacienteActionMock).toHaveBeenCalledWith("pac-1", {
      dni: "30111222",
      telefono: "",
      email: "",
      telefonosAlternativos: [],
      emailsAlternativos: [],
      tutores: [
        {
          id: "tutor-1",
          email: "julian@example.com",
          telefono: "+5493511111111",
          telefonosAlternativos: ["+5493512222222"],
        },
      ],
    });
  });

  it("el tutor: mail editable sin lista, y teléfonos con principal y lista", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={conTutor} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.queryByRole("list", { name: /Otros mails de/ })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Mail de Julián Ortiz"));
    await user.type(screen.getByLabelText("Mail de Julián Ortiz"), "julian.nuevo@example.com");
    await user.click(screen.getByRole("button", { name: "Hacer principal +5493512222222" }));
    expect(screen.getByLabelText("Teléfono principal de Julián Ortiz")).toHaveValue("+5493512222222");

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(ultimoPayload().tutores).toEqual([
      {
        id: "tutor-1",
        email: "julian.nuevo@example.com",
        telefono: "+5493512222222",
        telefonosAlternativos: ["+5493511111111"],
      },
    ]);
  });

  it("valida los datos del tutor", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={conTutor} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const guardar = () => user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await user.clear(screen.getByLabelText("Mail de Julián Ortiz"));
    await guardar();
    expect(await screen.findByRole("alert")).toHaveTextContent("El mail de Julián Ortiz es obligatorio.");

    await user.type(screen.getByLabelText("Mail de Julián Ortiz"), "mal");
    await guardar();
    expect(await screen.findByRole("alert")).toHaveTextContent("El mail de Julián Ortiz no tiene un formato válido.");

    await user.clear(screen.getByLabelText("Mail de Julián Ortiz"));
    await user.type(screen.getByLabelText("Mail de Julián Ortiz"), "julian@example.com");
    await user.clear(screen.getByLabelText("Teléfono principal de Julián Ortiz"));
    await guardar();
    expect(await screen.findByRole("alert")).toHaveTextContent("El teléfono de Julián Ortiz es obligatorio.");

    await user.type(screen.getByLabelText("Teléfono principal de Julián Ortiz"), "12");
    await guardar();
    expect(await screen.findByRole("alert")).toHaveTextContent("El teléfono de Julián Ortiz no tiene un formato válido.");

    await user.clear(screen.getByLabelText("Teléfono principal de Julián Ortiz"));
    await user.type(screen.getByLabelText("Teléfono principal de Julián Ortiz"), "+5493511111111");
    await user.click(screen.getByRole("button", { name: "Editar +5493512222222" }));
    await user.clear(screen.getByLabelText(/Editar dato 1 de otros teléfonos de/));
    await user.type(screen.getByLabelText(/Editar dato 1 de otros teléfonos de/), "99");
    await guardar();
    expect(await screen.findByRole("alert")).toHaveTextContent("El teléfono 99 de Julián Ortiz no tiene un formato válido.");
    expect(editarPacienteActionMock).not.toHaveBeenCalled();
  });

  it("guarda cambios y llama a onSuccess con el paciente actualizado", async () => {
    editarPacienteActionMock.mockResolvedValue({ paciente: { ...paciente, dni: "30222333" } });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={onSuccess} />);

    await user.clear(screen.getByLabelText("DNI"));
    await user.type(screen.getByLabelText("DNI"), "30222333");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(editarPacienteActionMock).toHaveBeenCalledWith("pac-1", {
      dni: "30222333",
      telefono: "+5493511234567",
      email: "bruno@example.com",
      telefonosAlternativos: [],
      emailsAlternativos: [],
    });
    expect(onSuccess).toHaveBeenCalledWith({ ...paciente, dni: "30222333" });
  });

  it("muestra el error que devuelve la acción", async () => {
    editarPacienteActionMock.mockResolvedValue({ error: "paciente no encontrado" });
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("paciente no encontrado");
  });

  it("se cierra con Cancelar, con la X y clickeando afuera", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={paciente} onClose={onClose} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
