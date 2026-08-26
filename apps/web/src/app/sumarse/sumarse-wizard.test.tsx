import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Me } from "@dental-mirage/shared-types";

const {
  registerActionMock,
  onboardingPerfilActionMock,
  onboardingClinicaActionMock,
  reenviarVerificacionActionMock,
  verificarEmailActionMock,
} = vi.hoisted(() => ({
  registerActionMock: vi.fn(),
  onboardingPerfilActionMock: vi.fn(),
  onboardingClinicaActionMock: vi.fn(),
  reenviarVerificacionActionMock: vi.fn(),
  verificarEmailActionMock: vi.fn(),
}));

vi.mock("@/app/actions/auth", () => ({
  registerAction: registerActionMock,
  onboardingPerfilAction: onboardingPerfilActionMock,
  onboardingClinicaAction: onboardingClinicaActionMock,
  reenviarVerificacionAction: reenviarVerificacionActionMock,
  verificarEmailAction: verificarEmailActionMock,
}));

const { SumarseWizard } = await import("./sumarse-wizard");

const especialidades = [
  { id: "esp-1", nombre: "Ortodoncia" },
  { id: "esp-2", nombre: "Periodoncia" },
];

const meCuentaSinVerificar: Me = {
  id: "1",
  email: "maria@example.com",
  emailVerificado: false,
  onboardingStep: "cuenta",
  onboardingCompletado: false,
};

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

describe("SumarseWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin sesión (me=null), muestra el Paso 1: crear cuenta", () => {
    render(<SumarseWizard me={null} especialidades={especialidades} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("registro exitoso muestra 'Revisá tu correo' sin necesitar una recarga", async () => {
    registerActionMock.mockResolvedValue({ mensaje: "revisá tu correo" });
    const user = userEvent.setup();
    render(<SumarseWizard me={null} especialidades={especialidades} />);

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
    render(<SumarseWizard me={meCuentaSinVerificar} especialidades={especialidades} />);
    expect(screen.getByText(/maria@example.com/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toBeInTheDocument();
  });

  it("con me.onboardingStep='perfil', muestra el Paso 2 y llama a onboardingPerfilAction", async () => {
    onboardingPerfilActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SumarseWizard me={mePerfil} especialidades={especialidades} />);

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

  it("con me.onboardingStep='clinica', muestra las dos tarjetas de tipo de clínica", () => {
    render(<SumarseWizard me={meClinica} especialidades={especialidades} />);
    expect(screen.getByRole("button", { name: /Clínica individual/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Organización/ })).toBeInTheDocument();
  });

  it("Paso 3: elegir organización muestra el aviso de invitaciones futuras", async () => {
    const user = userEvent.setup();
    render(<SumarseWizard me={meClinica} especialidades={especialidades} />);

    await user.click(screen.getByRole("button", { name: /Organización/ }));
    // La descripción de la tarjeta también menciona "invitar colaboradores"
    // — se matchea el texto específico del aviso informativo (que solo
    // aparece tras elegir "organización"), no la descripción de la tarjeta
    // (que está siempre visible).
    expect(screen.getByText(/próximamente/i)).toBeInTheDocument();
  });

  it("Paso 3: 'Atrás' vuelve al Paso 2 con los datos ya guardados precargados", async () => {
    const user = userEvent.setup();
    render(<SumarseWizard me={meClinica} especialidades={especialidades} />);

    await user.click(screen.getByRole("button", { name: /Clínica individual/ }));
    await user.type(screen.getByLabelText("Nombre de tu clínica o consultorio"), "Clínica Games");
    await user.click(screen.getByRole("button", { name: "Atrás" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("María");
    expect(screen.getByLabelText("Apellido")).toHaveValue("Games");
  });

  it("Paso 3: crea la clínica y llama a onboardingClinicaAction", async () => {
    onboardingClinicaActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SumarseWizard me={meClinica} especialidades={especialidades} />);

    await user.click(screen.getByRole("button", { name: /Clínica individual/ }));
    await user.type(screen.getByLabelText("Nombre de tu clínica o consultorio"), "Clínica Games");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(onboardingClinicaActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "individual", nombre: "Clínica Games" }),
    );
  });
});
