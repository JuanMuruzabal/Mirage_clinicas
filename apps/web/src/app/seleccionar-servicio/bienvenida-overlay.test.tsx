import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Me } from "@dental-mirage/shared-types";

const { onboardingPerfilActionMock, onboardingClinicaActionMock } = vi.hoisted(() => ({
  onboardingPerfilActionMock: vi.fn(),
  onboardingClinicaActionMock: vi.fn(),
}));

vi.mock("@/app/actions/auth", () => ({
  onboardingPerfilAction: onboardingPerfilActionMock,
  onboardingClinicaAction: onboardingClinicaActionMock,
}));

const { BienvenidaOverlay } = await import("./bienvenida-overlay");

const especialidades = [
  { id: "esp-1", nombre: "Ortodoncia" },
  { id: "esp-2", nombre: "Periodoncia" },
];

const mePerfil: Me = {
  id: "1",
  email: "maria@example.com",
  emailVerificado: true,
  onboardingStep: "perfil",
  onboardingCompletado: false,
};

const meClinica: Me = {
  id: "1",
  email: "maria@example.com",
  emailVerificado: true,
  onboardingStep: "clinica",
  onboardingCompletado: false,
  perfil: {
    nombre: "María",
    apellido: "Games",
    telefonoPrefijo: "+54",
    telefono: "+5493511234567",
    matriculaTipo: "nacional",
    matriculaNumero: "MP-1",
    especialidades: [{ id: "esp-1", nombre: "Ortodoncia" }],
  },
};

// TR-057 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-26):
// este modal reemplaza a los Paso 2/3 que antes vivían en /sumarse — se
// muestra por encima de /seleccionar-servicio mientras el perfil y/o la
// clínica no estén completos todavía.
describe("BienvenidaOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con onboardingStep='perfil', muestra el Paso 1 y llama a onboardingPerfilAction", async () => {
    onboardingPerfilActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BienvenidaOverlay me={mePerfil} especialidades={especialidades} />);

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

  it("con onboardingStep='perfil', no muestra ningún link para salir del modal", () => {
    render(<BienvenidaOverlay me={mePerfil} especialidades={especialidades} />);
    expect(screen.queryByRole("link", { name: /Volver/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Volver al inicio/ })).not.toBeInTheDocument();
  });

  it("con onboardingStep='clinica', muestra las dos tarjetas de tipo de clínica", () => {
    render(<BienvenidaOverlay me={meClinica} especialidades={especialidades} />);
    expect(screen.getByRole("button", { name: /Clínica individual/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Organización/ })).toBeInTheDocument();
  });

  it("Paso 2: elegir organización muestra el aviso de invitaciones futuras", async () => {
    const user = userEvent.setup();
    render(<BienvenidaOverlay me={meClinica} especialidades={especialidades} />);

    await user.click(screen.getByRole("button", { name: /Organización/ }));
    expect(screen.getByText(/próximamente/i)).toBeInTheDocument();
  });

  it("Paso 2: 'Atrás' vuelve al Paso 1 con los datos ya guardados precargados", async () => {
    const user = userEvent.setup();
    render(<BienvenidaOverlay me={meClinica} especialidades={especialidades} />);

    await user.click(screen.getByRole("button", { name: /Clínica individual/ }));
    await user.type(screen.getByLabelText("Nombre de tu clínica o consultorio"), "Clínica Games");
    await user.click(screen.getByRole("button", { name: "Atrás" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("María");
    expect(screen.getByLabelText("Apellido")).toHaveValue("Games");
  });

  it("Paso 2: crea la clínica y llama a onboardingClinicaAction", async () => {
    onboardingClinicaActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BienvenidaOverlay me={meClinica} especialidades={especialidades} />);

    await user.click(screen.getByRole("button", { name: /Clínica individual/ }));
    await user.type(screen.getByLabelText("Nombre de tu clínica o consultorio"), "Clínica Games");
    await user.click(screen.getByRole("button", { name: "Empezar a usar Dental Mirage" }));

    expect(onboardingClinicaActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "individual", nombre: "Clínica Games" }),
    );
  });
});
