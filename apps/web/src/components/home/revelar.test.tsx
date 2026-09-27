import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Revelar } from "./revelar";

// La animación es CSS; lo que se prueba es CUÁNDO se dispara (mismo
// criterio que Despliegue en el panel, TR-180).

type Callback = (entradas: { isIntersecting: boolean }[]) => void;
let observadores: { callback: Callback; opciones?: IntersectionObserverInit; disconnect: ReturnType<typeof vi.fn> }[] = [];

class ObservadorFalso {
  callback: Callback;
  opciones?: IntersectionObserverInit;
  disconnect = vi.fn();
  constructor(callback: Callback, opciones?: IntersectionObserverInit) {
    this.callback = callback;
    this.opciones = opciones;
    observadores.push(this);
  }
  observe() {}
  unobserve() {}
}

function conCaja(top: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + 300,
    left: 0,
    right: 300,
    width: 300,
    height: 300,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
}

const bloque = () => screen.getByText("contenido").parentElement as HTMLElement;

beforeEach(() => {
  observadores = [];
  vi.stubGlobal("IntersectionObserver", ObservadorFalso);
  vi.stubGlobal("innerHeight", 800);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Revelar", () => {
  it("lo que ya está a la vista no se toca: su animación de carga ya se está viendo", () => {
    conCaja(100);
    render(
      <Revelar>
        <p>contenido</p>
      </Revelar>,
    );
    expect(bloque()).not.toHaveAttribute("data-revelar");
    expect(observadores).toHaveLength(0);
  });

  it("lo de más abajo espera y se arma cuando entra, mirando el borde y no un porcentaje", () => {
    conCaja(2000);
    render(
      <Revelar>
        <p>contenido</p>
      </Revelar>,
    );
    expect(bloque()).toHaveAttribute("data-revelar", "en-espera");
    // Por el borde: una parte más alta que cinco pantallas nunca llegaría
    // a tener un porcentaje adentro.
    expect(observadores[0].opciones).toMatchObject({ threshold: 0 });

    act(() => observadores[0].callback([{ isIntersecting: false }]));
    expect(bloque()).toHaveAttribute("data-revelar", "en-espera");

    act(() => observadores[0].callback([{ isIntersecting: true }]));
    expect(bloque()).toHaveAttribute("data-revelar", "activo");
    expect(observadores[0].disconnect).toHaveBeenCalled();
  });

  // Con "reducir movimiento" el CSS cambia la animación por un fundido,
  // que igual tiene que esperar a que la parte se vea.
  it("con 'reducir movimiento' también espera, para aparecer con un fundido", () => {
    conCaja(2000);
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    render(
      <Revelar>
        <p>contenido</p>
      </Revelar>,
    );
    expect(bloque()).toHaveAttribute("data-revelar", "en-espera");
    act(() => observadores[0].callback([{ isIntersecting: true }]));
    expect(bloque()).toHaveAttribute("data-revelar", "activo");
  });

  it("usa la etiqueta pedida y le pasa el orden al CSS", () => {
    conCaja(100);
    render(
      <Revelar como="ol" orden={2} id="lista" className="grid">
        <li>contenido</li>
      </Revelar>,
    );
    const lista = bloque();
    expect(lista.tagName).toBe("OL");
    expect(lista).toHaveAttribute("id", "lista");
    expect(lista).toHaveClass("revelar", "grid");
    expect(lista.style.getPropertyValue("--revelar-orden")).toBe("2");
  });
});
