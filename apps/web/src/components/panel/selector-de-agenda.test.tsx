import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const opcionesDeAgendaActionMock = vi.fn();
const elegirVistaActionMock = vi.fn();
vi.mock("@/app/actions/topbar-panel", () => ({
  opcionesDeAgendaAction: () => opcionesDeAgendaActionMock(),
  elegirVistaAction: (...args: unknown[]) => elegirVistaActionMock(...args),
}));

const { SelectorDeAgenda, SelectorDeVistaDeRecepcion } = await import("./selector-de-agenda");

const LUCIA = { userId: "u1", nombre: "Lucía Gómez", detalle: "Ortodoncia" };
const MARCOS = { userId: "u2", nombre: "Marcos Díaz", detalle: "Endodoncia" };

beforeEach(() => {
  opcionesDeAgendaActionMock.mockReset();
  elegirVistaActionMock.mockReset();
  elegirVistaActionMock.mockResolvedValue({});
  opcionesDeAgendaActionMock.mockResolvedValue({
    profesionales: [LUCIA],
    miUserId: "u1",
    puedeElegirOtros: false,
    focoActual: null,
  });
});

// QA de la Fase 3.2.6: "faltan, para agregar turno o agregar horario
// reservado, elegir el profesional a quien se le cargará".
describe("SelectorDeAgenda", () => {
  it("arranca en la agenda propia: lo más común es cargarse algo a uno mismo", async () => {
    const onElegir = vi.fn();
    render(<SelectorDeAgenda valor={null} onElegir={onElegir} />);

    await waitFor(() => expect(onElegir).toHaveBeenCalledWith("u1"));
  });

  // Recepción no tiene agenda propia, así que no hay default posible:
  // eso es exactamente lo que hay que preguntarle.
  it("recepción arranca sin elegir", async () => {
    opcionesDeAgendaActionMock.mockResolvedValue({
      profesionales: [LUCIA, MARCOS],
      miUserId: null,
      puedeElegirOtros: true,
      focoActual: null,
    });
    const onElegir = vi.fn();
    render(<SelectorDeAgenda valor={null} onElegir={onElegir} />);

    await screen.findByText("Elegí un profesional");
    expect(onElegir).not.toHaveBeenCalled();
  });

  it("recepción puede elegir a cualquiera de la clínica", async () => {
    opcionesDeAgendaActionMock.mockResolvedValue({
      profesionales: [LUCIA, MARCOS],
      miUserId: null,
      puedeElegirOtros: true,
      focoActual: null,
    });
    const onElegir = vi.fn();
    const user = userEvent.setup();
    render(<SelectorDeAgenda valor={null} onElegir={onElegir} />);
    await screen.findByText("Elegí un profesional");

    await user.click(screen.getByRole("button", { name: "Elegir de quién es la vista" }));
    await user.click(screen.getByRole("button", { name: /Marcos Díaz/ }));

    expect(onElegir).toHaveBeenCalledWith("u2");
  });

  // Un turno entra en UNA agenda: la opción general del carrusel sería
  // una pregunta sin respuesta posible.
  it("no ofrece una opción general", async () => {
    opcionesDeAgendaActionMock.mockResolvedValue({
      profesionales: [LUCIA, MARCOS],
      miUserId: null,
      puedeElegirOtros: true,
      focoActual: null,
    });
    const user = userEvent.setup();
    render(<SelectorDeAgenda valor={null} onElegir={vi.fn()} />);
    await screen.findByText("Elegí un profesional");

    await user.click(screen.getByRole("button", { name: "Elegir de quién es la vista" }));

    expect(screen.queryByRole("button", { name: /Toda la clínica/ })).not.toBeInTheDocument();
  });
});

// "En la configuración de calendario aparecerá arriba del todo el
// selector carrusel".
describe("SelectorDeVistaDeRecepcion", () => {
  it("para quien no es recepción no se dibuja nada", async () => {
    const { container } = render(<SelectorDeVistaDeRecepcion onCambio={vi.fn()} />);

    await waitFor(() => expect(opcionesDeAgendaActionMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  // Este carrusel SÍ mueve el foco de la sesión, y tiene que hacerlo: lo
  // que la configuración muestra se lee con los scopes de visibilidad.go,
  // que responden al profesional en foco.
  it("elegir mueve el foco de la sesión y hace releer el modal", async () => {
    opcionesDeAgendaActionMock.mockResolvedValue({
      profesionales: [LUCIA, MARCOS],
      miUserId: null,
      puedeElegirOtros: true,
      focoActual: "u1",
    });
    const onCambio = vi.fn();
    const user = userEvent.setup();
    render(<SelectorDeVistaDeRecepcion onCambio={onCambio} />);
    await screen.findByText("Lucía Gómez");

    await user.click(screen.getByRole("button", { name: "Elegir de quién es la vista" }));
    await user.click(screen.getByRole("button", { name: /Marcos Díaz/ }));

    await waitFor(() => expect(elegirVistaActionMock).toHaveBeenCalledWith("u2"));
    // Sin esto, el modal seguiría mostrando el horario de atención del
    // profesional anterior con el nombre del nuevo arriba.
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
  });

  it("parte del profesional en el que ya está parada la sesión", async () => {
    opcionesDeAgendaActionMock.mockResolvedValue({
      profesionales: [LUCIA, MARCOS],
      miUserId: null,
      puedeElegirOtros: true,
      focoActual: "u2",
    });
    render(<SelectorDeVistaDeRecepcion onCambio={vi.fn()} />);

    expect(await screen.findByText("Marcos Díaz")).toBeInTheDocument();
  });
});
