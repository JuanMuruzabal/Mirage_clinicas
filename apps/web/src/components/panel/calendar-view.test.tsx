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

  // Bug reportado 2026-08-27: "tocar 2 veces el botón lo traba" —
  // tocar una vista YA activa dejaba `cargando` trabado en `true` para
  // siempre (`setVista` con el mismo valor es un no-op para React, el
  // efecto que apaga el loading nunca se disparaba de nuevo).
  it("tocar una vista ya activa no deja el calendario trabado en 'Cargando…'", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    await waitFor(() => expect(screen.queryByText("Cargando…")).not.toBeInTheDocument());

    // "dia" ya es la vista activa de entrada (ver el primer test) —
    // tocarla de nuevo no debería iniciar (ni trabar) ninguna carga.
    await user.click(screen.getByRole("button", { name: "dia" }));

    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
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

  // F2.2 (docs/implementation-plan.md §11, pedido explícito del
  // cliente, 2026-08-29, corregido tras QA): un solo botón toggle (no
  // "Horizontal" + "Salir" separados) que cambia de nombre según el
  // estado, y "+ Agregar turno" sigue disponible en modo rotado.
  it("el mismo botón alterna entre 'Horizontal' y 'Vertical', sin perder '+ Agregar turno'", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);

    expect(screen.getByRole("button", { name: "Ver el calendario en horizontal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Agregar turno" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver el calendario en horizontal" }));
    expect(screen.getByRole("button", { name: "Volver a la vista vertical" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver el calendario en horizontal" })).not.toBeInTheDocument();
    // "+ Agregar turno" sigue disponible en modo rotado — corrección de
    // QA: "que el usuario pueda cargar turnos en este modo".
    expect(screen.getByRole("button", { name: "+ Agregar turno" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Volver a la vista vertical" }));
    expect(screen.getByRole("button", { name: "Ver el calendario en horizontal" })).toBeInTheDocument();
  });
});
