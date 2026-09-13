import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Me } from "@dental-mirage/shared-types";

const { onboardingPerfilActionMock } = vi.hoisted(() => ({ onboardingPerfilActionMock: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ onboardingPerfilAction: onboardingPerfilActionMock }));

const { PerfilOverlay } = await import("./perfil-overlay");

const especialidades = [
  { id: "esp-1", nombre: "Ortodoncia" },
  { id: "esp-2", nombre: "Periodoncia" },
];

const me: Me = {
  id: "1",
  email: "maria@example.com",
  emailVerificado: true,
  onboardingStep: "perfil",
  onboardingCompletado: false,
};

// Fase 3.2.3 — lo que queda del modal de bienvenida (TR-057), que tenía
// dos pasos. El de la clínica se fue a "¿Dónde trabajás hoy?" como una
// opción más, porque crear una clínica dejó de ser obligatorio: a la app
// también se entra porque un colega te sumó a la suya.
describe("PerfilOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el paso de perfil y llama a onboardingPerfilAction", async () => {
    onboardingPerfilActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PerfilOverlay me={me} especialidades={especialidades} />);

    expect(screen.getByRole("heading", { name: "Creá tu perfil profesional" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nombre"), "María");
    await user.type(screen.getByLabelText("Apellido"), "Games");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
    await user.selectOptions(screen.getByLabelText("Matrícula — tipo"), "nacional");
    await user.type(screen.getByLabelText("Matrícula — número"), "MP-1");
    await user.click(screen.getByRole("button", { name: "Ortodoncia" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(onboardingPerfilActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "María", apellido: "Games", especialidadIds: ["esp-1"] }),
    );
  });

  // Sin nombre ni matrícula no hay nada que mostrarle a un paciente: este
  // paso sigue sin poder cerrarse ni saltearse.
  it("no ofrece ninguna salida del modal", () => {
    render(<PerfilOverlay me={me} especialidades={especialidades} />);

    expect(screen.queryByRole("link", { name: /Volver/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Volver al inicio/ })).not.toBeInTheDocument();
  });

  // Lo que este modal ya NO hace: pedir la clínica. Con el de dos pasos,
  // alguien invitado por un colega quedaba encerrado creando una clínica
  // que no quería para poder llegar a la pantalla donde aceptar.
  it("no pide la clínica", () => {
    render(<PerfilOverlay me={me} especialidades={especialidades} />);

    expect(screen.queryByRole("button", { name: /Clínica individual/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Organización/ })).not.toBeInTheDocument();
  });
});
