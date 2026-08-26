import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Me } from "@dental-mirage/shared-types";

const { registerActionMock, reenviarVerificacionActionMock, verificarEmailActionMock } = vi.hoisted(() => ({
  registerActionMock: vi.fn(),
  reenviarVerificacionActionMock: vi.fn(),
  verificarEmailActionMock: vi.fn(),
}));

vi.mock("@/app/actions/auth", () => ({
  registerAction: registerActionMock,
  reenviarVerificacionAction: reenviarVerificacionActionMock,
  verificarEmailAction: verificarEmailActionMock,
}));

const { SumarseWizard } = await import("./sumarse-wizard");

const meCuentaSinVerificar: Me = {
  id: "1",
  email: "maria@example.com",
  emailVerificado: false,
  onboardingStep: "cuenta",
  onboardingCompletado: false,
};

// Reestructuración del 2026-08-26 (docs/tradeoffs.md TR-057): /sumarse
// pasa a tener SOLO 2 pasos (crear cuenta, confirmar código) — perfil y
// clínica se mudaron a bienvenida-overlay.test.tsx, sobre
// /seleccionar-servicio.
describe("SumarseWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin sesión (me=null), muestra el Paso 1: crear cuenta", () => {
    render(<SumarseWizard me={null} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("el Paso 1 muestra 'Volver al inicio' hacia la home pública", () => {
    render(<SumarseWizard me={null} />);
    expect(screen.getByRole("link", { name: /Volver al inicio/ })).toHaveAttribute("href", "/");
  });

  it("registro exitoso muestra 'Revisá tu correo' sin necesitar una recarga", async () => {
    registerActionMock.mockResolvedValue({ mensaje: "revisá tu correo" });
    const user = userEvent.setup();
    render(<SumarseWizard me={null} />);

    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    // El label de "Contraseña" incluye el hint "Mínimo 12 caracteres." en su
    // nombre accesible (mismo <label>) — match por prefijo para no
    // depender del texto exacto del hint, y distinguirlo de "Confirmar
    // contraseña" (que no empieza con "Contraseña").
    await user.type(screen.getByLabelText(/^Contraseña/), "password123456");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "password123456");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText(/maria@example.com/)).toBeInTheDocument();
    expect(registerActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "maria@example.com", aceptaTerminos: true }),
    );
  });

  it("con me.onboardingStep='cuenta' y mail sin verificar, muestra 'Revisá tu correo' con el mail de la sesión", () => {
    render(<SumarseWizard me={meCuentaSinVerificar} />);
    expect(screen.getByText(/maria@example.com/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toBeInTheDocument();
  });

  // Pedido explícito del cliente (2026-08-26): "si llego al paso de
  // verificación poder volver al paso anterior y volver a completar los
  // datos de entrada" — nunca queda softlockeado en el código.
  it("en el paso de verificación, muestra 'Volver al paso anterior' (no 'Volver al inicio')", () => {
    render(<SumarseWizard me={meCuentaSinVerificar} />);
    expect(screen.getByRole("button", { name: /Volver al paso anterior/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Volver al inicio/ })).not.toBeInTheDocument();
  });

  it("'Volver al paso anterior' muestra de nuevo el formulario de crear cuenta", async () => {
    const user = userEvent.setup();
    render(<SumarseWizard me={meCuentaSinVerificar} />);

    await user.click(screen.getByRole("button", { name: /Volver al paso anterior/ }));

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Volver al inicio/ })).toBeInTheDocument();
  });

  it("tras volver atrás y registrarse con otro mail, muestra 'Revisá tu correo' con el mail nuevo", async () => {
    registerActionMock.mockResolvedValue({ mensaje: "revisá tu correo" });
    const user = userEvent.setup();
    render(<SumarseWizard me={meCuentaSinVerificar} />);

    await user.click(screen.getByRole("button", { name: /Volver al paso anterior/ }));
    await user.type(screen.getByLabelText("Email"), "otro@example.com");
    await user.type(screen.getByLabelText(/^Contraseña/), "password123456");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "password123456");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText(/otro@example.com/)).toBeInTheDocument();
  });

  // TR-062 en docs/tradeoffs.md (pedido explícito del cliente,
  // 2026-08-26): si el mail ya tiene cuenta verificada, se lo dice
  // derecho en vez de mandar al paso de código — "no es el estándar".
  it("con un mail que ya tiene cuenta verificada, muestra el aviso con links a ingresar/recuperar contraseña, sin avanzar al paso de código", async () => {
    registerActionMock.mockResolvedValue({ cuentaExistente: true });
    const user = userEvent.setup();
    render(<SumarseWizard me={null} />);

    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    await user.type(screen.getByLabelText(/^Contraseña/), "password123456");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "password123456");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText(/Ese mail ya tiene una cuenta/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciá sesión" })).toHaveAttribute("href", "/ingresar");
    expect(screen.getByRole("link", { name: /recuperá tu contraseña/ })).toHaveAttribute("href", "/recuperar-password");
    // Sigue en el Paso 1 — nunca avanza al paso de código para este caso.
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
