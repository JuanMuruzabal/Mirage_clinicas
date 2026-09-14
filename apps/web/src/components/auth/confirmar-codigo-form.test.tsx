import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { verificarEmailActionMock, reenviarVerificacionActionMock } = vi.hoisted(() => ({
  verificarEmailActionMock: vi.fn(),
  reenviarVerificacionActionMock: vi.fn(),
}));
vi.mock("@/app/actions/auth", () => ({
  verificarEmailAction: verificarEmailActionMock,
  reenviarVerificacionAction: reenviarVerificacionActionMock,
}));

const { ConfirmarCodigoForm } = await import("./confirmar-codigo-form");

// Las seis casillas se completan de a un dígito, como lo haría una
// persona: el foco salta solo.
async function escribirCodigo(user: ReturnType<typeof userEvent.setup>, codigo: string) {
  const casillas = screen.getAllByLabelText(/^Dígito /);
  for (let i = 0; i < codigo.length; i++) {
    await user.type(casillas[i], codigo[i]);
  }
}

describe("ConfirmarCodigoForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con emailFijo (default), muestra el mail como texto, no como input", () => {
    render(<ConfirmarCodigoForm email="maria@example.com" />);
    expect(screen.getByText("maria@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("con emailFijo=false, el mail es un input editable", () => {
    render(<ConfirmarCodigoForm email="" emailFijo={false} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  // Desde la ronda de QA del 2026-09-13 el código se carga en las mismas
  // seis casillas que el wizard público de sacar turno (CasillasCodigo),
  // no en un campo de texto único con placeholder "000000".
  it("son seis casillas y solo aceptan dígitos", async () => {
    const user = userEvent.setup();
    render(<ConfirmarCodigoForm email="maria@example.com" />);

    const casillas = screen.getAllByLabelText(/^Dígito /);
    expect(casillas).toHaveLength(6);

    await user.type(casillas[0], "a");
    expect(casillas[0]).toHaveValue("");

    await user.type(casillas[0], "4");
    expect(casillas[0]).toHaveValue("4");
    // Y el foco salta sola a la siguiente.
    expect(casillas[1]).toHaveFocus();
  });

  it("el botón de confirmar queda deshabilitado hasta completar los 6 dígitos", async () => {
    const user = userEvent.setup();
    render(<ConfirmarCodigoForm email="maria@example.com" />);

    const boton = screen.getByRole("button", { name: "Confirmar mi cuenta" });
    expect(boton).toBeDisabled();

    await escribirCodigo(user, "482913");
    expect(boton).toBeEnabled();
  });

  it("al confirmar, llama a verificarEmailAction con el email y el código", async () => {
    verificarEmailActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ConfirmarCodigoForm email="maria@example.com" />);

    await escribirCodigo(user, "482913");
    await user.click(screen.getByRole("button", { name: "Confirmar mi cuenta" }));

    expect(verificarEmailActionMock).toHaveBeenCalledWith({ email: "maria@example.com", codigo: "482913" });
  });

  it("muestra el error que devuelve verificarEmailAction", async () => {
    verificarEmailActionMock.mockResolvedValue({ error: "código incorrecto o vencido" });
    const user = userEvent.setup();
    render(<ConfirmarCodigoForm email="maria@example.com" />);

    await escribirCodigo(user, "000000");
    await user.click(screen.getByRole("button", { name: "Confirmar mi cuenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("código incorrecto o vencido");
  });

  it("reenviar código llama a reenviarVerificacionAction con el mail y muestra el mensaje", async () => {
    reenviarVerificacionActionMock.mockResolvedValue({ mensaje: "te mandamos un código nuevo" });
    const user = userEvent.setup();
    render(<ConfirmarCodigoForm email="maria@example.com" />);

    await user.click(screen.getByRole("button", { name: "Reenviar código" }));

    expect(reenviarVerificacionActionMock).toHaveBeenCalledWith("maria@example.com");
    expect(await screen.findByText("te mandamos un código nuevo")).toBeInTheDocument();
  });

  it("reenviar código con error lo muestra en vez del mensaje", async () => {
    reenviarVerificacionActionMock.mockResolvedValue({ error: "esperá un minuto antes de pedir otro reenvío" });
    const user = userEvent.setup();
    render(<ConfirmarCodigoForm email="maria@example.com" />);

    await user.click(screen.getByRole("button", { name: "Reenviar código" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("esperá un minuto antes de pedir otro reenvío");
  });
});
