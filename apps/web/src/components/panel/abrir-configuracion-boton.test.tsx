import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ConfiguracionCalendarioModal pide estas Server Actions al montar (F2.3.5/
// F2.3.7) — sin mockearlas, explotan como unhandled rejection fuera de un
// request real de Next.js (mismo criterio que calendar-view.test.tsx).
const {
  listHorarioAtencionActionMock,
  listBloqueosActionMock,
  listTiposConsultaActionMock,
} = vi.hoisted(() => ({
  listHorarioAtencionActionMock: vi.fn(),
  listBloqueosActionMock: vi.fn(),
  listTiposConsultaActionMock: vi.fn(),
}));
vi.mock("@/app/actions/calendario-config", () => ({
  listHorarioAtencionAction: listHorarioAtencionActionMock,
  listBloqueosAction: listBloqueosActionMock,
  listTiposConsultaAction: listTiposConsultaActionMock,
  crearBloqueoAction: vi.fn(),
  editarBloqueoAction: vi.fn(),
  eliminarBloqueoAction: vi.fn(),
  crearHorarioAtencionAction: vi.fn(),
  editarHorarioAtencionAction: vi.fn(),
  eliminarHorarioAtencionAction: vi.fn(),
  putHorarioAtencionGeneralAction: vi.fn(),
  crearTipoConsultaAction: vi.fn(),
  editarTipoConsultaAction: vi.fn(),
  eliminarTipoConsultaAction: vi.fn(),
}));

const { AbrirConfiguracionBoton } = await import("./abrir-configuracion-boton");

describe("AbrirConfiguracionBoton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listHorarioAtencionActionMock.mockResolvedValue([]);
    listBloqueosActionMock.mockResolvedValue([]);
    listTiposConsultaActionMock.mockResolvedValue([]);
  });

  it("arranca sin el modal abierto", () => {
    render(<AbrirConfiguracionBoton />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al tocar el botón, abre Configuración de calendario", async () => {
    const user = userEvent.setup();
    render(<AbrirConfiguracionBoton />);

    await user.click(screen.getByRole("button", { name: "Ver horarios reservados →" }));

    expect(await screen.findByRole("dialog", { name: "Configuración de calendario" })).toBeInTheDocument();
  });

  it("cerrar el modal (X) vuelve a dejarlo cerrado", async () => {
    const user = userEvent.setup();
    render(<AbrirConfiguracionBoton />);

    await user.click(screen.getByRole("button", { name: "Ver horarios reservados →" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
