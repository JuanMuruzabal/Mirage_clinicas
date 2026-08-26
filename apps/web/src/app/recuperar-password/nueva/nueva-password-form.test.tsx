import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { resetPasswordActionMock } = vi.hoisted(() => ({ resetPasswordActionMock: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ resetPasswordAction: resetPasswordActionMock }));

const { NuevaPasswordForm } = await import("./nueva-password-form");

describe("NuevaPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valida que las contraseñas coincidan antes de llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<NuevaPasswordForm token="un-token" />);

    await user.type(screen.getByLabelText(/^Nueva contraseña/), "password123456");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "otra-password");
    await user.click(screen.getByRole("button", { name: "Guardar nueva contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no coinciden");
    expect(resetPasswordActionMock).not.toHaveBeenCalled();
  });

  it("en éxito, llama a resetPasswordAction con el token recibido por prop", async () => {
    resetPasswordActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<NuevaPasswordForm token="token-del-link" />);

    await user.type(screen.getByLabelText(/^Nueva contraseña/), "password123456");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "password123456");
    await user.click(screen.getByRole("button", { name: "Guardar nueva contraseña" }));

    expect(resetPasswordActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: "token-del-link", newPassword: "password123456" }),
    );
  });

  it("muestra el error que devuelve la acción (token vencido/usado)", async () => {
    resetPasswordActionMock.mockResolvedValue({ error: "este link venció — pedí uno nuevo" });
    const user = userEvent.setup();
    render(<NuevaPasswordForm token="un-token" />);

    await user.type(screen.getByLabelText(/^Nueva contraseña/), "password123456");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "password123456");
    await user.click(screen.getByRole("button", { name: "Guardar nueva contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("venció");
  });
});
