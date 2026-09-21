import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { PanelNotificacionesResponse } from "@dental-mirage/shared-types";

const { panelNotificacionesActionMock, usePathnameMock, refreshMock } = vi.hoisted(() => ({
  panelNotificacionesActionMock: vi.fn(),
  usePathnameMock: vi.fn(() => "/panel"),
  refreshMock: vi.fn(),
}));
vi.mock("@/app/actions/panel", () => ({
  panelNotificacionesAction: panelNotificacionesActionMock,
}));
vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ refresh: refreshMock }),
}));

const { NotificacionesConflictoGlobal } = await import("./notificaciones-conflicto-global");

function notificaciones(overrides: Partial<PanelNotificacionesResponse> = {}): PanelNotificacionesResponse {
  return { conflictosPacientes: 0, conflictosCalendario: 0, ...overrides };
}

describe("NotificacionesConflictoGlobal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue("/panel");
  });

  it("no muestra nada sin conflictos", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones());
    render(<NotificacionesConflictoGlobal />);

    await waitFor(() => expect(panelNotificacionesActionMock).toHaveBeenCalled());
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("con un conflicto de pacientes, avisa y enlaza a /panel/pacientes", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 2 }));
    render(<NotificacionesConflictoGlobal />);

    const link = await screen.findByRole("link", { name: /conflictos con los pacientes/ });
    expect(link).toHaveAttribute("href", "/panel/pacientes");
  });

  it("con un conflicto de calendario, avisa y enlaza a /panel/calendario", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosCalendario: 1 }));
    render(<NotificacionesConflictoGlobal />);

    const link = await screen.findByRole("link", { name: /turno en conflicto en el calendario/ });
    expect(link).toHaveAttribute("href", "/panel/calendario");
  });

  it("estando en /panel/pacientes, NO repite el aviso de conflicto de pacientes (esa pantalla ya tiene el suyo)", async () => {
    usePathnameMock.mockReturnValue("/panel/pacientes");
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 1 }));
    render(<NotificacionesConflictoGlobal />);

    await waitFor(() => expect(panelNotificacionesActionMock).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /conflictos con los pacientes/ })).not.toBeInTheDocument();
  });

  // FUERA DEL CALENDARIO Y NADA MÁS (QA de la 3.2.6, 2026-09-21).
  //
  // Probé mostrarlo también adentro, para que recepción no se perdiera un
  // conflicto de otra agenda, y el cliente lo rechazó: *"siempre esta
  // debe aparecer afuera del calendario, no adentro, ya que 2
  // notificaciones lo hace confuso"*.
  //
  // El reparto quedó así: este avisa desde afuera y LLEVA al calendario,
  // ubicándolo en el día del conflicto; una vez adentro, el banner propio
  // del calendario —que desde esta misma ronda tampoco desaparece al
  // cambiar de día— es el que abre la pantalla de resolución.
  it("estando en /panel/calendario NO repite el aviso: esa pantalla tiene el suyo", async () => {
    usePathnameMock.mockReturnValue("/panel/calendario");
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosCalendario: 1 }));
    render(<NotificacionesConflictoGlobal />);

    await waitFor(() => expect(panelNotificacionesActionMock).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: /turno en conflicto en el calendario/ }),
    ).not.toBeInTheDocument();
  });

  // Y cuando avisa, lleva al DÍA del conflicto: sin la fecha, quien lo
  // toca aterriza en hoy y tiene que salir a buscarlo.
  it("el aviso lleva al día del conflicto", async () => {
    usePathnameMock.mockReturnValue("/panel");
    panelNotificacionesActionMock.mockResolvedValue({
      ...notificaciones({ conflictosCalendario: 1 }),
      conflictoCalendarioFecha: "2030-12-24",
    });
    render(<NotificacionesConflictoGlobal />);

    const link = await screen.findByRole("link", { name: /turno en conflicto en el calendario/ });
    expect(link).toHaveAttribute("href", "/panel/calendario?vista=dia&fecha=2030-12-24");
  });

  // El de PACIENTES sigue escondiéndose en su propia pantalla: ahí la
  // lista completa está a la vista, no hay nada que el aviso agregue.
  it("el aviso de pacientes sí se sigue escondiendo en su propia pantalla", async () => {
    usePathnameMock.mockReturnValue("/panel/pacientes");
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 1 }));
    render(<NotificacionesConflictoGlobal />);

    await waitFor(() => expect(panelNotificacionesActionMock).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /conflictos con los pacientes/ })).not.toBeInTheDocument();
  });

  it("estando en /panel/pacientes, SÍ muestra el de calendario si corresponde (son avisos independientes)", async () => {
    usePathnameMock.mockReturnValue("/panel/pacientes");
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 1, conflictosCalendario: 1 }));
    render(<NotificacionesConflictoGlobal />);

    expect(await screen.findByRole("link", { name: /turno en conflicto en el calendario/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /conflictos con los pacientes/ })).not.toBeInTheDocument();
  });

  it("usa singular cuando hay exactamente 1 conflicto", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 1 }));
    render(<NotificacionesConflictoGlobal />);

    expect(await screen.findByText(/Tenés 1 conflicto con los pacientes/)).toBeInTheDocument();
  });
});

// El sondeo no solo actualiza su propio cartel: cuando el conteo cambia
// pide la pantalla de vuelta (2026-09-20).
//
// El bug que esto arregla, reportado probando de a dos profesionales:
// uno resuelve el conflicto y al OTRO se le iba el cartel a los 2 s
// —correcto— pero la ficha duplicada seguía en su tabla de pacientes,
// porque eso sale del render del servidor y nada lo volvía a pedir.
// Cambiar de pestaña lo "arreglaba" por accidente: la navegación era lo
// que refrescaba la página.
describe("NotificacionesConflictoGlobal — pedir la pantalla de vuelta", () => {
  beforeEach(() => {
    refreshMock.mockClear();
    usePathnameMock.mockReturnValue("/panel");
    // Relojes falsos solo acá: el sondeo es de 2 s y estos tests
    // necesitan saltarlo. `shouldAdvanceTime` para que waitFor no se
    // cuelgue esperando un reloj congelado.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no refresca por la primera respuesta: el salto desde los ceros iniciales no es un cambio", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 2 }));

    render(<NotificacionesConflictoGlobal />);

    await waitFor(() => expect(panelNotificacionesActionMock).toHaveBeenCalled());
    expect(refreshMock).not.toHaveBeenCalled();
  });

  // `asentar` y no un solo `waitFor`: el componente sondea DOS veces al
  // montar —el efecto de montaje y el que mira `pathname`— así que hay
  // que dejar que las dos respondan antes de medir nada. Si no, la
  // segunda llega después y cuenta como "cambio".
  async function asentar() {
    await waitFor(() => expect(panelNotificacionesActionMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    refreshMock.mockClear();
  }

  it("cuando un colega resuelve y el conteo BAJA, pide la pantalla de vuelta", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 1 }));
    render(<NotificacionesConflictoGlobal />);
    await asentar();
    expect(refreshMock).not.toHaveBeenCalled();

    // El colega resolvió: el próximo sondeo trae cero.
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 0 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(refreshMock).toHaveBeenCalled();
  });

  // Hacia arriba también: entró un conflicto nuevo y la ficha duplicada
  // tiene que aparecer en la tabla, no solo el cartel.
  it("cuando el conteo SUBE, también la pide", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 0 }));
    render(<NotificacionesConflictoGlobal />);
    await asentar();

    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(refreshMock).toHaveBeenCalled();
  });

  // EL caso que motivó todo, y el que faltaba: en /panel/pacientes este
  // componente no dibuja nada —esa pantalla tiene su propio banner— pero
  // el `return null` está DESPUÉS de los hooks, así que el sondeo corre
  // igual. Importa porque ahí es donde se resuelven los conflictos, o
  // sea donde los dos profesionales están mirando, y porque el banner de
  // esa pantalla no sondea: es server data pura. Sin este refresh, ahí
  // no se movía nada hasta refrescar a mano.
  it("en /panel/pacientes no dibuja nada, pero igual sondea y pide la pantalla de vuelta", async () => {
    usePathnameMock.mockReturnValue("/panel/pacientes");
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 1 }));
    const { container } = render(<NotificacionesConflictoGlobal />);
    await asentar();
    expect(container).toBeEmptyDOMElement();

    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 0 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(refreshMock).toHaveBeenCalled();
  });

  // Y no en cada sondeo: refrescar cada 2 s sería volver a renderizar la
  // pantalla entera del servidor todo el tiempo.
  it("sin cambios no pide nada, por más que siga sondeando", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 1 }));
    render(<NotificacionesConflictoGlobal />);
    await asentar();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(panelNotificacionesActionMock.mock.calls.length).toBeGreaterThan(2);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
