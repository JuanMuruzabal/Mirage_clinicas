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

  it("solo permite dígitos en el código y lo trunca a 6 caracteres", async () => {
    const user = userEvent.setup();
    render(<ConfirmarCodigoForm email="maria@example.com" />);

    const input = screen.getByLabelText("Código de confirmación");
    await user.type(input, "ab12cd34ef");

    expect(input).toHaveValue("1234");
  });

  it("el botón de confirmar queda deshabilitado hasta completar los 6 dígitos", async () => {
    const user = userEvent.setup();
    render(<ConfirmarCodigoForm email="maria@example.com" />);

    const boton = screen.getByRole("button", { name: "Confirmar mi cuenta" });
    expect(boton).toBeDisabled();

    await user.type(screen.getByLabelText("Código de confirmación"), "482913");
    expect(boton).toBeEnabled();
  });

  it("al confirmar, llama a verificarEmailAction con el email y el código", async () => {
    verificarEmailActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ConfirmarCodigoForm email="maria@example.com" />);

    await user.type(screen.getByLabelText("Código de confirmación"), "482913");
    await user.click(screen.getByRole("button", { name: "Confirmar mi cuenta" }));

    expect(verificarEmailActionMock).toHaveBeenCalledWith({ email: "maria@example.com", codigo: "482913" });
  });

  it("muestra el error que devuelve verificarEmailAction", async () => {
    verificarEmailActionMock.mockResolvedValue({ error: "código incorrecto o vencido" });
    const user = userEvent.setup();
    render(<ConfirmarCodigoForm email="maria@example.com" />);

    await user.type(screen.getByLabelText("Código de confirmación"), "000000");
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
