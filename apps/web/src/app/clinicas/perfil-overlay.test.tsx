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

    expect(screen.getByRole("heading", { name: "Creá tu perfil" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nombre"), "María");
    await user.type(screen.getByLabelText("Apellido"), "Games");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
    await user.selectOptions(screen.getByLabelText("Matrícula — tipo"), "nacional");
    await user.type(screen.getByLabelText("Matrícula — número"), "MP-1");
    await user.click(screen.getByRole("button", { name: "Ortodoncia" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    // El segundo argumento es el modo de redirección (Fase 3.2.3): acá
    // el alta termina en /clinicas, así que la acción sí redirige.
    expect(onboardingPerfilActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tipoPerfil: "profesional", nombre: "María", apellido: "Games", especialidadIds: ["esp-1"] }),
      { redirigir: true },
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

  // Ronda de QA del 2026-09-13: el botón vive en el pie FIJO, fuera del
  // <form>, y se asocia con el atributo `form=`. Si esa asociación se
  // rompe, el modal queda sin forma de enviarse y no lo nota nadie hasta
  // probarlo a mano.
  it("el botón del pie sigue asociado al formulario", () => {
    render(<PerfilOverlay me={me} especialidades={especialidades} />);

    const boton = screen.getByRole("button", { name: "Continuar" });
    const form = document.querySelector("form")!;
    expect(boton).toHaveAttribute("form", form.id);
    expect(form.contains(boton)).toBe(false);
  });

  it("agrupa los campos en datos personales y profesionales", () => {
    render(<PerfilOverlay me={me} especialidades={especialidades} />);

    expect(screen.getByText("Datos personales")).toBeInTheDocument();
    expect(screen.getByText("Datos profesionales")).toBeInTheDocument();
  });

  // El país era un campo de texto editable: se podía borrar el "+54" o
  // escribir cualquier cosa.
  it("el país es un select, no un campo de texto", () => {
    render(<PerfilOverlay me={me} especialidades={especialidades} />);

    const pais = screen.getByLabelText("País");
    expect(pais.tagName).toBe("SELECT");
    expect(pais).toHaveValue("+54");
  });

  it("las especialidades elegidas quedan como chips que se pueden quitar", async () => {
    const user = userEvent.setup();
    render(<PerfilOverlay me={me} especialidades={especialidades} />);

    await user.click(screen.getByRole("button", { name: "Ortodoncia" }));
    const chip = screen.getByRole("button", { name: "Quitar Ortodoncia" });

    await user.click(chip);
    expect(screen.queryByRole("button", { name: "Quitar Ortodoncia" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ortodoncia" })).toBeInTheDocument();
  });

  it("la búsqueda filtra las que todavía no se eligieron", async () => {
    const user = userEvent.setup();
    render(<PerfilOverlay me={me} especialidades={especialidades} />);

    await user.type(screen.getByLabelText("Buscar especialidad"), "perio");

    expect(screen.getByRole("button", { name: "Periodoncia" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ortodoncia" })).not.toBeInTheDocument();
  });

  // --- Tipo de perfil (Fase 3.2.3) ---
  //
  // No todo el que entra a la app atiende pacientes: un recepcionista o
  // quien administra la página no tiene matrícula. Pedírsela como
  // obligatoria lo dejaba afuera, y con las invitaciones por mail (3.2.4)
  // ese caso pasa a ser corriente.

  it("con 'Actividades de la clínica' no se piden matrícula ni especialidades", async () => {
    const user = userEvent.setup();
    render(<PerfilOverlay me={me} especialidades={especialidades} />);

    // Arranca en "Profesional", que es lo que era el alta hasta ahora.
    expect(screen.getByLabelText("Matrícula — tipo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Actividades de la clínica/ }));

    expect(screen.queryByLabelText("Matrícula — tipo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Matrícula — número")).not.toBeInTheDocument();
    expect(screen.queryByText("Especialidades")).not.toBeInTheDocument();
  });

  it("guarda el perfil de quien no atiende sin pedirle matrícula", async () => {
    onboardingPerfilActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PerfilOverlay me={me} especialidades={especialidades} />);

    await user.click(screen.getByRole("button", { name: /Actividades de la clínica/ }));
    await user.type(screen.getByLabelText("Nombre"), "Lucía");
    await user.type(screen.getByLabelText("Apellido"), "Mostrador");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(onboardingPerfilActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tipoPerfil: "actividades", nombre: "Lucía" }),
      { redirigir: true },
    );
  });

  // El camino de siempre no se aflojó.
  it("como profesional, la matrícula sigue siendo obligatoria", async () => {
    const user = userEvent.setup();
    render(<PerfilOverlay me={me} especialidades={especialidades} />);

    await user.type(screen.getByLabelText("Nombre"), "María");
    await user.type(screen.getByLabelText("Apellido"), "Games");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("La matrícula es obligatoria.")).toBeInTheDocument();
    expect(onboardingPerfilActionMock).not.toHaveBeenCalled();
  });
});

