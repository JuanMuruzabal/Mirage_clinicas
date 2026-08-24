import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { listTurnosActionMock } = vi.hoisted(() => ({ listTurnosActionMock: vi.fn() }));
vi.mock("@/app/actions/turnos", () => ({
  listTurnosAction: listTurnosActionMock,
  crearTurnoManualAction: vi.fn(),
  agendarTurnoAction: vi.fn(),
}));

const { CalendarView } = await import("./calendar-view");

const tiposConsulta = [{ id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" }];

describe("CalendarView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTurnosActionMock.mockResolvedValue([]);
  });

  it("arranca en vista día (Hoy) — pedido explícito del cliente", () => {
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    expect(screen.getByRole("button", { name: "dia" })).toHaveClass("bg-salvia-oscuro");
  });

  it("el toolbar ofrece las vistas en orden día → semana → mes", () => {
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    const botones = screen.getAllByRole("button", { name: /^(dia|semana|mes)$/ });
    expect(botones.map((b) => b.textContent)).toEqual(["dia", "semana", "mes"]);
  });

  it("cambiar a vista mes pide los turnos de nuevo (rango distinto)", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    listTurnosActionMock.mockClear();

    await user.click(screen.getByRole("button", { name: "mes" }));

    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "mes" })).toHaveClass("bg-salvia-oscuro");
  });

  it("prev/next/Hoy navegan y vuelven a pedir datos", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("button", { name: "Hoy" }));
    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalledTimes(3));
  });

  it("el botón '+ Agregar turno' abre el modal", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);

    await user.click(screen.getByRole("button", { name: "+ Agregar turno" }));
    expect(await screen.findByRole("dialog", { name: "Agregar turno" })).toBeInTheDocument();
  });

  it("clickear un día en vista mes pasa a vista día", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    await user.click(screen.getByRole("button", { name: "mes" }));
    await waitFor(() => expect(screen.queryByText("Cargando…")).not.toBeInTheDocument());

    const hoy = new Date().getDate();
    await user.click(screen.getAllByText(String(hoy))[0]);

    await waitFor(() => expect(screen.getByRole("button", { name: "dia" })).toHaveClass("bg-salvia-oscuro"));
  });
});
