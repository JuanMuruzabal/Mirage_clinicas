import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Historia } from "./historia";

const ESCENAS = [
  { dibujo: <span>dibujo 1</span>, texto: "Primera escena." },
  { dibujo: <span>dibujo 2</span>, texto: "Segunda escena." },
  { dibujo: <span>dibujo 3</span>, texto: "Tercera escena." },
];

function conMovimientoReducido(reducido: boolean) {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: reducido,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
}

// La escena activa es la que NO está escondida para lectores de pantalla.
function escenaActiva() {
  return screen
    .getAllByRole("group", { hidden: true })
    .find((g) => g.getAttribute("aria-hidden") !== "true")
    ?.textContent;
}

beforeEach(() => {
  vi.useFakeTimers();
  conMovimientoReducido(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Historia", () => {
  it("arranca en la primera escena y esconde las otras (no se leen ni se tocan)", () => {
    render(<Historia escenas={ESCENAS} />);
    expect(screen.getByRole("region", { name: "La historia de Lucía" })).toHaveAttribute("aria-roledescription", "carrusel");
    expect(escenaActiva()).toContain("Primera escena.");
    const escondidas = screen.getAllByRole("group", { hidden: true }).filter((g) => g.getAttribute("aria-hidden") === "true");
    expect(escondidas).toHaveLength(2);
    for (const g of escondidas) expect(g).toHaveAttribute("inert");
  });

  it("avanza sola cada 7 segundos, y después de la última vuelve a la primera", () => {
    render(<Historia escenas={ESCENAS} />);
    act(() => vi.advanceTimersByTime(7000));
    expect(escenaActiva()).toContain("Segunda escena.");
    act(() => vi.advanceTimersByTime(7000));
    act(() => vi.advanceTimersByTime(7000));
    expect(escenaActiva()).toContain("Primera escena.");
  });

  it("las flechas y los puntos llevan a cada escena", () => {
    render(<Historia escenas={ESCENAS} />);
    fireEvent.click(screen.getByRole("button", { name: "Escena siguiente" }));
    expect(escenaActiva()).toContain("Segunda escena.");
    fireEvent.click(screen.getByRole("button", { name: "Escena anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Escena anterior" }));
    expect(escenaActiva()).toContain("Tercera escena.");
    fireEvent.click(screen.getByRole("button", { name: "Ir a la escena 1" }));
    expect(escenaActiva()).toContain("Primera escena.");
    expect(screen.getByRole("button", { name: "Ir a la escena 1" })).toHaveAttribute("aria-current", "step");
  });

  // WCAG 2.2.2: lo que se mueve solo tiene que poder pararse.
  it("se puede pausar y reanudar", () => {
    render(<Historia escenas={ESCENAS} />);
    fireEvent.click(screen.getByRole("button", { name: "Pausar la historia" }));
    act(() => vi.advanceTimersByTime(20000));
    expect(escenaActiva()).toContain("Primera escena.");

    fireEvent.click(screen.getByRole("button", { name: "Reanudar la historia" }));
    act(() => vi.advanceTimersByTime(7000));
    expect(escenaActiva()).toContain("Segunda escena.");
  });

  it("con el mouse encima no avanza, y al salir sigue", () => {
    render(<Historia escenas={ESCENAS} />);
    const carrusel = screen.getByRole("region");
    fireEvent.mouseEnter(carrusel);
    act(() => vi.advanceTimersByTime(20000));
    expect(escenaActiva()).toContain("Primera escena.");
    fireEvent.mouseLeave(carrusel);
    act(() => vi.advanceTimersByTime(7000));
    expect(escenaActiva()).toContain("Segunda escena.");
  });

  it("con el foco adentro no avanza; al irse el foco, sigue", () => {
    render(
      <>
        <Historia escenas={ESCENAS} />
        <button type="button">afuera</button>
      </>,
    );
    const siguiente = screen.getByRole("button", { name: "Escena siguiente" });
    fireEvent.focus(siguiente);
    act(() => vi.advanceTimersByTime(20000));
    expect(escenaActiva()).toContain("Primera escena.");
    fireEvent.blur(siguiente, { relatedTarget: screen.getByRole("button", { name: "afuera" }) });
    act(() => vi.advanceTimersByTime(7000));
    expect(escenaActiva()).toContain("Segunda escena.");
  });

  it("con 'reducir movimiento' no avanza sola ni ofrece pausa, pero se puede recorrer", () => {
    vi.restoreAllMocks();
    conMovimientoReducido(true);
    render(<Historia escenas={ESCENAS} />);
    act(() => vi.advanceTimersByTime(30000));
    expect(escenaActiva()).toContain("Primera escena.");
    expect(screen.queryByRole("button", { name: /Pausar/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Escena siguiente" }));
    expect(escenaActiva()).toContain("Segunda escena.");
  });
});
