import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { loginActionMock, reenviarVerificacionActionMock, verificarEmailActionMock } = vi.hoisted(() => ({
  loginActionMock: vi.fn(),
  reenviarVerificacionActionMock: vi.fn(),
  verificarEmailActionMock: vi.fn(),
}));
vi.mock("@/app/actions/auth", () => ({
  loginAction: loginActionMock,
  reenviarVerificacionAction: reenviarVerificacionActionMock,
  verificarEmailAction: verificarEmailActionMock,
}));

const { LoginForm } = await import("./login-form");

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envía email y contraseña a loginAction", async () => {
    loginActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "password123");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(loginActionMock).toHaveBeenCalledWith({ email: "maria@example.com", password: "password123" });
  });

  it("muestra el error que devuelve loginAction", async () => {
    loginActionMock.mockResolvedValue({ error: "email o contraseña incorrectos" });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "mala");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("email o contraseña incorrectos");
  });

  it("con mail sin verificar, muestra la acción de reenvío en vez de un error genérico", async () => {
    loginActionMock.mockResolvedValue({ mensaje: "confirmá tu mail antes de iniciar sesión" });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "sinverificar@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "password123");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("button", { name: /Reenviar código/ })).toBeInTheDocument();
  });

  it("el botón de reenvío llama a reenviarVerificacionAction con el email tipeado", async () => {
    loginActionMock.mockResolvedValue({ mensaje: "confirmá tu mail antes de iniciar sesión" });
    reenviarVerificacionActionMock.mockResolvedValue({ mensaje: "te reenviamos el link" });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "sinverificar@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "password123");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    await user.click(await screen.findByRole("button", { name: /Reenviar código/ }));

    expect(reenviarVerificacionActionMock).toHaveBeenCalledWith("sinverificar@example.com");
    expect(await screen.findByText("te reenviamos el link")).toBeInTheDocument();
  });
});
