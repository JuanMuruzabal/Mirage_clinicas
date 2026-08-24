import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { loginActionMock } = vi.hoisted(() => ({ loginActionMock: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ loginAction: loginActionMock }));

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
});
