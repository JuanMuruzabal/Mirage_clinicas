import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { updateMeActionMock } = vi.hoisted(() => ({ updateMeActionMock: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ updateMeAction: updateMeActionMock }));

const { PerfilForm } = await import("./perfil-form");

const profesional = {
  id: "1",
  nombre: "María Games",
  email: "maria@example.com",
  telefono: "+5493511234567",
  nombreClinica: "Consultorio Dr. Games",
  slug: "consultorio-dr-games",
  especialidades: [{ id: "esp-1", nombre: "Ortodoncia" }],
};

const catalogo = [
  { id: "esp-1", nombre: "Ortodoncia" },
  { id: "esp-2", nombre: "Periodoncia" },
];

describe("PerfilForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("precarga los datos y las especialidades actuales del profesional", () => {
    render(<PerfilForm profesional={profesional} catalogo={catalogo} />);

    expect(screen.getByLabelText("Nombre y apellido")).toHaveValue("María Games");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("+5493511234567");
    expect(screen.getByRole("button", { name: "Ortodoncia" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Periodoncia" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("maria@example.com")).toBeInTheDocument();
    expect(screen.getByText("Consultorio Dr. Games")).toBeInTheDocument();
  });

  it("envía los cambios y muestra confirmación", async () => {
    updateMeActionMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PerfilForm profesional={profesional} catalogo={catalogo} />);

    await user.clear(screen.getByLabelText("Nombre y apellido"));
    await user.type(screen.getByLabelText("Nombre y apellido"), "María Editado");
    await user.click(screen.getByRole("button", { name: "Periodoncia" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(updateMeActionMock).toHaveBeenCalledWith({
      nombre: "María Editado",
      telefono: "+5493511234567",
      especialidadIds: ["esp-1", "esp-2"],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Cambios guardados");
  });

  it("muestra el error que devuelve updateMeAction", async () => {
    updateMeActionMock.mockResolvedValue({ error: "el nombre es obligatorio" });
    const user = userEvent.setup();
    render(<PerfilForm profesional={profesional} catalogo={catalogo} />);

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("el nombre es obligatorio");
  });
});
