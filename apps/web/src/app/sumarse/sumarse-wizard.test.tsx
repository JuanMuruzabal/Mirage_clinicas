import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { registerActionMock } = vi.hoisted(() => ({ registerActionMock: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ registerAction: registerActionMock }));

const { SumarseWizard } = await import("./sumarse-wizard");

const especialidades = [
  { id: "esp-1", nombre: "Ortodoncia" },
  { id: "esp-2", nombre: "Periodoncia" },
];

async function completarPasoDatos(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombre y apellido"), "María Games");
  await user.type(screen.getByLabelText("Email"), "maria@example.com");
  await user.type(screen.getByLabelText("Contraseña"), "password123");
  await user.type(screen.getByLabelText("Confirmar contraseña"), "password123");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

describe("SumarseWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no avanza del paso 1 si las contraseñas no coinciden", async () => {
    const user = userEvent.setup();
    render(<SumarseWizard especialidades={especialidades} />);

    await user.type(screen.getByLabelText("Nombre y apellido"), "María Games");
    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "password123");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "otra-cosa");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no coinciden");
    // Sigue en el paso 1 — el campo de especialidades no está.
    expect(screen.queryByText("Ortodoncia")).not.toBeInTheDocument();
  });

  it("completa los 3 pasos y envía el payload combinado a registerAction", async () => {
    registerActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SumarseWizard especialidades={especialidades} />);

    await completarPasoDatos(user);

    // Paso 2: especialidades.
    await user.click(screen.getByRole("button", { name: "Ortodoncia" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    // Paso 3: nombre de clínica.
    await user.type(screen.getByLabelText("Nombre de tu clínica o consultorio"), "Consultorio Dr. Games");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(registerActionMock).toHaveBeenCalledWith({
      nombre: "María Games",
      email: "maria@example.com",
      password: "password123",
      telefono: undefined,
      nombreClinica: "Consultorio Dr. Games",
      especialidadIds: ["esp-1"],
    });
  });

  it("permite volver atrás entre pasos", async () => {
    const user = userEvent.setup();
    render(<SumarseWizard especialidades={especialidades} />);

    await completarPasoDatos(user);
    expect(screen.getByText("Ortodoncia")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Atrás" }));
    expect(screen.getByLabelText("Nombre y apellido")).toBeInTheDocument();
  });

  it("exige nombre de clínica antes de crear la cuenta", async () => {
    const user = userEvent.setup();
    render(<SumarseWizard especialidades={especialidades} />);

    await completarPasoDatos(user);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("obligatorio");
    expect(registerActionMock).not.toHaveBeenCalled();
  });

  it("muestra el error que devuelve registerAction", async () => {
    registerActionMock.mockResolvedValue({ error: "ya existe una cuenta con ese email" });
    const user = userEvent.setup();
    render(<SumarseWizard especialidades={especialidades} />);

    await completarPasoDatos(user);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.type(screen.getByLabelText("Nombre de tu clínica o consultorio"), "Clínica");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ya existe una cuenta");
  });
});
