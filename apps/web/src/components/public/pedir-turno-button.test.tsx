import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { listTiposConsultaPublicoActionMock, listDisponibilidadPublicaActionMock } = vi.hoisted(() => ({
  listTiposConsultaPublicoActionMock: vi.fn(),
  listDisponibilidadPublicaActionMock: vi.fn(),
}));
// PedirTurnoForm (montado adentro del modal) pide esto al montarse — sin
// mock, la Server Action real fallaría en jsdom (mismo mock que
// pedir-turno-form.test.tsx).
vi.mock("@/app/actions/turno-publico", () => ({
  solicitarTurnoPublicoAction: vi.fn(),
  listTiposConsultaPublicoAction: listTiposConsultaPublicoActionMock,
  listDisponibilidadPublicaAction: listDisponibilidadPublicaActionMock,
  enviarVerificacionEmailAction: vi.fn(),
  confirmarVerificacionEmailAction: vi.fn(),
  pacienteVerificadoPublicoAction: vi.fn(),
}));

const { PedirTurnoButton } = await import("./pedir-turno-button");

describe("PedirTurnoButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTiposConsultaPublicoActionMock.mockResolvedValue([]);
    listDisponibilidadPublicaActionMock.mockResolvedValue({ slots: [] });
  });

  it("muestra el botón 'Pedir turno' sin abrir el wizard todavía", () => {
    render(<PedirTurnoButton slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    expect(screen.getByRole("button", { name: "Pedir turno" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al tocar el botón, abre el wizard en un modal por encima de la página", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoButton slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await user.click(screen.getByRole("button", { name: "Pedir turno" }));

    const dialogo = screen.getByRole("dialog", { name: "Pedir turno" });
    expect(dialogo).toBeInTheDocument();
    // "como ya se hace en otras pantallas" — mismo fondo con blur que los
    // modales del panel.
    expect(dialogo).toHaveClass("backdrop-blur-sm");
    expect(screen.getByText("¿Para quién es el turno?")).toBeInTheDocument();
  });

  it("cierra al tocar la X", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoButton slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await user.click(screen.getByRole("button", { name: "Pedir turno" }));
    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cierra al tocar afuera del wizard (el fondo)", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoButton slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await user.click(screen.getByRole("button", { name: "Pedir turno" }));
    await user.click(screen.getByRole("dialog", { name: "Pedir turno" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
