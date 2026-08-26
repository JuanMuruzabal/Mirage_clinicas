import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { verificarEmailActionMock } = vi.hoisted(() => ({ verificarEmailActionMock: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ verificarEmailAction: verificarEmailActionMock }));

const { ConfirmarMailButton } = await import("./confirmar-mail-button");

describe("ConfirmarMailButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("el clic dispara la verificación con el token recibido por prop — nunca se verifica solo", async () => {
    verificarEmailActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ConfirmarMailButton token="token-del-link" />);

    expect(verificarEmailActionMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar mi cuenta" }));

    expect(verificarEmailActionMock).toHaveBeenCalledWith("token-del-link");
  });

  it("muestra el error si el token es inválido/usado/vencido", async () => {
    verificarEmailActionMock.mockResolvedValue({ error: "este link ya fue usado" });
    const user = userEvent.setup();
    render(<ConfirmarMailButton token="un-token" />);

    await user.click(screen.getByRole("button", { name: "Confirmar mi cuenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ya fue usado");
  });

  it("deshabilita el botón mientras confirma", async () => {
    let resolver: (value: undefined) => void = () => {};
    verificarEmailActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<ConfirmarMailButton token="un-token" />);

    await user.click(screen.getByRole("button", { name: "Confirmar mi cuenta" }));
    expect(screen.getByRole("button", { name: "Confirmando…" })).toBeDisabled();

    resolver(undefined);
  });
});
