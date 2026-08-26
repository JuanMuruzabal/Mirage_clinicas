import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SesionCompleta } from "@/lib/session";

const { updateMeActionMock } = vi.hoisted(() => ({ updateMeActionMock: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ updateMeAction: updateMeActionMock }));

const { PerfilForm } = await import("./perfil-form");

const sesion: SesionCompleta = {
  id: "1",
  email: "maria@example.com",
  nombre: "María",
  apellido: "Games",
  telefonoPrefijo: "+54",
  telefono: "+5493511234567",
  matriculaTipo: "nacional",
  matriculaNumero: "MP-1",
  especialidades: [{ id: "esp-1", nombre: "Ortodoncia" }],
  nombreClinica: "Consultorio Dr. Games",
  slug: "consultorio-dr-games",
  clinicaId: "c1",
  clinicaTipo: "individual",
  rol: "owner",
};

const catalogo = [
  { id: "esp-1", nombre: "Ortodoncia" },
  { id: "esp-2", nombre: "Periodoncia" },
];

describe("PerfilForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("precarga los datos y las especialidades actuales de la sesión", () => {
    render(<PerfilForm sesion={sesion} catalogo={catalogo} />);

    expect(screen.getByLabelText("Nombre")).toHaveValue("María");
    expect(screen.getByLabelText("Apellido")).toHaveValue("Games");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("+5493511234567");
    expect(screen.getByRole("button", { name: "Ortodoncia" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Periodoncia" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("maria@example.com")).toBeInTheDocument();
    expect(screen.getByText("Consultorio Dr. Games")).toBeInTheDocument();
  });

  it("envía los cambios y muestra confirmación", async () => {
    updateMeActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PerfilForm sesion={sesion} catalogo={catalogo} />);

    await user.clear(screen.getByLabelText("Apellido"));
    await user.type(screen.getByLabelText("Apellido"), "Editado");
    await user.click(screen.getByRole("button", { name: "Periodoncia" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(updateMeActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: "María",
        apellido: "Editado",
        telefono: "+5493511234567",
        matriculaTipo: "nacional",
        matriculaNumero: "MP-1",
        especialidadIds: ["esp-1", "esp-2"],
      }),
    );
    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
  });

  it("muestra el error que devuelve updateMeAction", async () => {
    updateMeActionMock.mockResolvedValue({ error: "el nombre es obligatorio" });
    const user = userEvent.setup();
    render(<PerfilForm sesion={sesion} catalogo={catalogo} />);

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("el nombre es obligatorio");
  });
});
