import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { listTiposConsultaPublicoActionMock, listDisponibilidadPublicaActionMock, validarEnlaceTurnoPublicoActionMock, searchParamsMock } = vi.hoisted(() => ({
  listTiposConsultaPublicoActionMock: vi.fn(),
  listDisponibilidadPublicaActionMock: vi.fn(),
  validarEnlaceTurnoPublicoActionMock: vi.fn(),
  // searchParamsMock — objeto mutable que cada test ajusta ANTES de
  // renderizar (ver conEnlace() más abajo) para simular `?enlace=...`
  // en la URL, sin depender de un router real.
  searchParamsMock: {
    get: (key: string): string | null => {
      void key;
      return null;
    },
  },
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
  validarEnlaceTurnoPublicoAction: validarEnlaceTurnoPublicoActionMock,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock,
}));

const { PedirTurnoButton } = await import("./pedir-turno-button");

// conEnlace — Fase 2, ítem 5: simula haber llegado a la página con
// `?enlace=<token>` en la URL.
function conEnlace(token: string | null) {
  searchParamsMock.get = (key: string) => (key === "enlace" ? token : null);
}

describe("PedirTurnoButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTiposConsultaPublicoActionMock.mockResolvedValue([]);
    listDisponibilidadPublicaActionMock.mockResolvedValue({ slots: [] });
    conEnlace(null);
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

  // docs/prompt-claude-code-fecha-horario.md, punto 3: "bloqueá el scroll
  // del body... y mantené el foco atrapado dentro del modal" — pendiente
  // sin resolver desde el propio §6 de docs/rediseno-flujo-turnos.md.
  it("bloquea el scroll del body mientras está abierto y lo restaura al cerrar", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoButton slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    expect(document.body.style.overflow).not.toBe("hidden");
    await user.click(screen.getByRole("button", { name: "Pedir turno" }));
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("Escape cierra el modal", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoButton slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await user.click(screen.getByRole("button", { name: "Pedir turno" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al cerrar, el foco vuelve al botón 'Pedir turno'", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoButton slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    const boton = screen.getByRole("button", { name: "Pedir turno" });
    await user.click(boton);
    await user.keyboard("{Escape}");

    expect(boton).toHaveFocus();
  });

  // Fase 2, ítem 5 ("compartir calendario") — el modal se abre solo
  // apenas la página carga con `?enlace=`, sin que la persona tenga que
  // tocar el botón.
  describe("con ?enlace= en la URL", () => {
    it("un link válido abre el wizard solo, sin tocar el botón", async () => {
      conEnlace("token-valido");
      validarEnlaceTurnoPublicoActionMock.mockResolvedValue(true);
      render(<PedirTurnoButton slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      expect(await screen.findByRole("dialog", { name: "Pedir turno" })).toBeInTheDocument();
      expect(validarEnlaceTurnoPublicoActionMock).toHaveBeenCalledWith("clinica-x", "token-valido");
    });

    it("un link inválido NO abre el wizard solo y muestra el aviso", async () => {
      conEnlace("token-vencido");
      validarEnlaceTurnoPublicoActionMock.mockResolvedValue(false);
      render(<PedirTurnoButton slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      expect(await screen.findByRole("alert")).toHaveTextContent(/ya no es válido/);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("sin ?enlace=, nunca llama a la validación", () => {
      render(<PedirTurnoButton slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);
      expect(validarEnlaceTurnoPublicoActionMock).not.toHaveBeenCalled();
    });
  });
});
