import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TurnosFiltros } from "./turnos-filtros";

const { pushMock, listTurnosActionMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  listTurnosActionMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/app/actions/turnos", () => ({ listTurnosAction: listTurnosActionMock }));

const tiposConsulta = [
  { id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" },
  { id: "tc-2", nombre: "Urgencia", color: "#D6563A" },
];

describe("TurnosFiltros", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el botón 'Filtros' sin abrir la hoja todavía", () => {
    listTurnosActionMock.mockResolvedValue([]);
    render(<TurnosFiltros tab="agendado" tiposConsulta={tiposConsulta} />);
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al abrir, pide el conteo en vivo y lo muestra en el botón de confirmar", async () => {
    listTurnosActionMock.mockResolvedValue(new Array(4).fill({}));
    const user = userEvent.setup();
    render(<TurnosFiltros tab="agendado" tiposConsulta={tiposConsulta} />);

    await user.click(screen.getByRole("button", { name: "Filtros" }));

    expect(await screen.findByRole("button", { name: "Ver 4 turnos" }, { timeout: 2000 })).toBeInTheDocument();
  });

  it("en singular cuando el conteo da exactamente 1", async () => {
    listTurnosActionMock.mockResolvedValue([{}]);
    const user = userEvent.setup();
    render(<TurnosFiltros tab="agendado" tiposConsulta={tiposConsulta} />);

    await user.click(screen.getByRole("button", { name: "Filtros" }));

    expect(await screen.findByRole("button", { name: "Ver 1 turno" }, { timeout: 2000 })).toBeInTheDocument();
  });

  it("cambiar el tipo de consulta vuelve a pedir el conteo con el borrador nuevo", async () => {
    listTurnosActionMock.mockResolvedValue([{}, {}]);
    const user = userEvent.setup();
    render(<TurnosFiltros tab="agendado" tiposConsulta={tiposConsulta} />);

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await screen.findByRole("button", { name: "Ver 2 turnos" }, { timeout: 2000 });

    listTurnosActionMock.mockResolvedValue([{}]);
    await user.selectOptions(screen.getByLabelText("Tipo de consulta"), "tc-1");

    await waitFor(
      () => {
        expect(listTurnosActionMock).toHaveBeenLastCalledWith(expect.objectContaining({ tipoConsultaId: "tc-1" }));
      },
      { timeout: 2000 },
    );
  });

  it("tocar 'Ver X turnos' navega a /panel/turnos con los filtros del borrador", async () => {
    listTurnosActionMock.mockResolvedValue([{}, {}, {}]);
    const user = userEvent.setup();
    render(<TurnosFiltros tab="agendado" q="bruno" tiposConsulta={tiposConsulta} />);

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.selectOptions(screen.getByLabelText("Tipo de consulta"), "tc-2");
    const boton = await screen.findByRole("button", { name: /^Ver \d+ turnos?$/ }, { timeout: 2000 });
    await user.click(boton);

    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = new URL(pushMock.mock.calls[0][0], "http://x");
    expect(url.searchParams.get("estado")).toBe("agendado");
    expect(url.searchParams.get("q")).toBe("bruno");
    expect(url.searchParams.get("tipoConsultaId")).toBe("tc-2");
  });

  it("el botón 'Filtros' muestra el punto indicador cuando ya hay un filtro aplicado por props", () => {
    listTurnosActionMock.mockResolvedValue([]);
    const { container } = render(<TurnosFiltros tab="agendado" tiposConsulta={tiposConsulta} tipoConsultaId="tc-1" />);
    expect(container.querySelector('span[aria-hidden="true"].bg-salvia-oscuro')).toBeInTheDocument();
  });

  it("'Limpiar filtros' resetea el borrador sin navegar solo", async () => {
    listTurnosActionMock.mockResolvedValue([{}]);
    const user = userEvent.setup();
    render(<TurnosFiltros tab="agendado" tiposConsulta={tiposConsulta} desde="2030-01-01" hasta="2030-01-31" />);

    await user.click(screen.getByRole("button", { name: /Filtros/ }));
    expect(screen.getByLabelText("Desde")).toHaveValue("2030-01-01");

    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect(screen.getByLabelText("Desde")).toHaveValue("");
    expect(pushMock).not.toHaveBeenCalled();
  });
});
