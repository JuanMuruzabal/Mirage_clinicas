import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TipoConsultaDeColega } from "@dental-mirage/shared-types";

const listarMock = vi.fn();
const incluirMock = vi.fn();
vi.mock("@/app/actions/calendario-config", () => ({
  listTiposConsultaDeColegasAction: () => listarMock(),
  incluirTipoConsultaDeColegaAction: (id: string) => incluirMock(id),
}));

const { IncluirTipoDeColegaModal } = await import("./incluir-tipo-de-colega-modal");

function tipo(over: Partial<TipoConsultaDeColega> = {}): TipoConsultaDeColega {
  return {
    id: "t1",
    nombre: "Conducto",
    color: "#E7D9BE",
    duracionMinutos: 60,
    tiempoPostConsultaMinutos: 0,
    deUserId: "u2",
    deNombre: "Lucía Ferrer",
    yaTenesUnoParecido: false,
    ...over,
  };
}

beforeEach(() => {
  listarMock.mockReset();
  incluirMock.mockReset();
  listarMock.mockResolvedValue([tipo()]);
});

describe("IncluirTipoDeColegaModal", () => {
  it("dice de quién es cada tipo: dos iguales de dos colegas son indistinguibles sin eso", async () => {
    render(<IncluirTipoDeColegaModal onCerrar={vi.fn()} onIncluido={vi.fn()} />);

    expect(await screen.findByText("Conducto")).toBeInTheDocument();
    expect(screen.getByText(/de Lucía Ferrer/)).toBeInTheDocument();
  });

  // El texto importa tanto como la función: si alguien creyera que
  // comparte la fila, esperaría que cambiar la duración se la cambiara
  // también al colega — y espera lo contrario de lo que pasa.
  it("avisa que incluir crea una copia", async () => {
    render(<IncluirTipoDeColegaModal onCerrar={vi.fn()} onIncluido={vi.fn()} />);

    expect(await screen.findByText(/crea una copia tuya/i)).toBeInTheDocument();
  });

  it("avisa cuando ya tenés uno parecido, sin impedir incluirlo", async () => {
    listarMock.mockResolvedValue([tipo({ yaTenesUnoParecido: true })]);
    incluirMock.mockResolvedValue({ tipoConsulta: { id: "nuevo" } });
    const onIncluido = vi.fn();

    render(<IncluirTipoDeColegaModal onCerrar={vi.fn()} onIncluido={onIncluido} />);

    expect(await screen.findByText("Ya tenés uno parecido")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Incluir" }));

    await waitFor(() => expect(onIncluido).toHaveBeenCalledWith({ id: "nuevo" }));
  });

  it("después de incluirlo lo saca de la lista: ofrecerlo de nuevo solo lo duplicaría", async () => {
    incluirMock.mockResolvedValue({ tipoConsulta: { id: "nuevo" } });

    render(<IncluirTipoDeColegaModal onCerrar={vi.fn()} onIncluido={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "Incluir" }));

    await waitFor(() => expect(screen.queryByText("Conducto")).not.toBeInTheDocument());
  });

  it("muestra el error del backend sin cerrarse", async () => {
    incluirMock.mockResolvedValue({ error: "ese tipo de consulta ya es tuyo" });
    const onCerrar = vi.fn();

    render(<IncluirTipoDeColegaModal onCerrar={onCerrar} onIncluido={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "Incluir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ese tipo de consulta ya es tuyo");
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("con una clínica de un solo profesional no ofrece nada", async () => {
    listarMock.mockResolvedValue([]);

    render(<IncluirTipoDeColegaModal onCerrar={vi.fn()} onIncluido={vi.fn()} />);

    expect(await screen.findByText(/Todavía no hay tipos de otros profesionales/)).toBeInTheDocument();
  });
});
