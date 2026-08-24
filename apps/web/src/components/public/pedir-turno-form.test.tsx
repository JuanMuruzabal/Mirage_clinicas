import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { solicitarTurnoPublicoActionMock } = vi.hoisted(() => ({
  solicitarTurnoPublicoActionMock: vi.fn(),
}));
vi.mock("@/app/actions/turno-publico", () => ({ solicitarTurnoPublicoAction: solicitarTurnoPublicoActionMock }));

const { PedirTurnoForm } = await import("./pedir-turno-form");

async function completarCampos(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombre"), "Bruno");
  await user.type(screen.getByLabelText("Apellido"), "Iglesias");
  await user.type(screen.getByLabelText("DNI"), "30111222");
  await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
  await user.type(screen.getByLabelText("Email"), "bruno@example.com");
}

describe("PedirTurnoForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valida el DNI antes de llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica="+5493511234567" />);

    await user.type(screen.getByLabelText("Nombre"), "Bruno");
    await user.type(screen.getByLabelText("Apellido"), "Iglesias");
    await user.type(screen.getByLabelText("DNI"), "123");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
    await user.type(screen.getByLabelText("Email"), "bruno@example.com");
    await user.click(screen.getByRole("button", { name: "Pedir turno" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/DNI debe tener 7 u 8 dígitos/);
    expect(solicitarTurnoPublicoActionMock).not.toHaveBeenCalled();
  });

  it("en éxito con teléfono de clínica, muestra confirmación y el link de WhatsApp", async () => {
    solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1" });
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica="+549 351 123-4567" />);

    await completarCampos(user);
    await user.click(screen.getByRole("button", { name: "Pedir turno" }));

    expect(await screen.findByText(/¡Listo!/)).toBeInTheDocument();
    expect(solicitarTurnoPublicoActionMock).toHaveBeenCalledWith("clinica-x", {
      nombreContacto: "Bruno",
      apellidoContacto: "Iglesias",
      dniContacto: "30111222",
      telefonoContacto: "+5493511234567",
      emailContacto: "bruno@example.com",
      motivo: undefined,
    });
    const link = screen.getByRole("link", { name: "Escribir también por WhatsApp" });
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/5493511234567"));
  });

  it("en éxito sin teléfono de clínica, muestra confirmación sin link de WhatsApp", async () => {
    solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1" });
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await completarCampos(user);
    await user.click(screen.getByRole("button", { name: "Pedir turno" }));

    expect(await screen.findByText(/¡Listo!/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Escribir también por WhatsApp" })).not.toBeInTheDocument();
  });

  it("muestra el error que devuelve la acción", async () => {
    solicitarTurnoPublicoActionMock.mockResolvedValue({ error: "clínica no encontrada" });
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await completarCampos(user);
    await user.click(screen.getByRole("button", { name: "Pedir turno" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("clínica no encontrada");
  });
});
