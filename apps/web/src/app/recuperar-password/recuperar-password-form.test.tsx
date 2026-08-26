import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { recuperarPasswordActionMock } = vi.hoisted(() => ({ recuperarPasswordActionMock: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ recuperarPasswordAction: recuperarPasswordActionMock }));

const { RecuperarPasswordForm } = await import("./recuperar-password-form");

describe("RecuperarPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envía el mail y muestra el mensaje genérico de la API", async () => {
    recuperarPasswordActionMock.mockResolvedValue({ mensaje: "si el mail está registrado, te enviamos las instrucciones" });
    const user = userEvent.setup();
    render(<RecuperarPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    expect(await screen.findByText(/te enviamos las instrucciones/)).toBeInTheDocument();
    expect(recuperarPasswordActionMock).toHaveBeenCalledWith(expect.objectContaining({ email: "maria@example.com" }));
  });

  it("muestra el error si la API falla", async () => {
    recuperarPasswordActionMock.mockResolvedValue({ error: "no se pudo conectar con el servidor" });
    const user = userEvent.setup();
    render(<RecuperarPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no se pudo conectar");
  });

  it("valida el formato de email antes de llamar a la API", async () => {
    const user = userEvent.setup();
    render(<RecuperarPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "no-es-un-email");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/formato válido/);
    expect(recuperarPasswordActionMock).not.toHaveBeenCalled();
  });
});
