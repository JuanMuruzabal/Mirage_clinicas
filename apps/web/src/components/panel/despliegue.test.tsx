import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Despliegue } from "./despliegue";

// La animación es CSS; lo que se prueba acá es CUÁNDO se dispara: la
// tarjeta que ya está a la vista no se toca, la que está afuera espera y
// se despliega al entrar, y con "reducir movimiento" no pasa nada.

type Callback = (entradas: { isIntersecting: boolean }[]) => void;
let observadores: { callback: Callback; disconnect: ReturnType<typeof vi.fn> }[] = [];

class ObservadorFalso {
  callback: Callback;
  disconnect = vi.fn();
  constructor(callback: Callback) {
    this.callback = callback;
    observadores.push(this);
  }
  observe() {}
  unobserve() {}
}

function conCaja(top: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + 200,
    left: 0,
    right: 300,
    width: 300,
    height: 200,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
}

function tarjeta() {
  return screen.getByText("contenido").parentElement as HTMLElement;
}

beforeEach(() => {
  observadores = [];
  vi.stubGlobal("IntersectionObserver", ObservadorFalso);
  vi.stubGlobal("innerHeight", 800);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Despliegue", () => {
  it("la que ya está a la vista no se toca: su despliegue de carga ya se está viendo", () => {
    conCaja(100);
    render(
      <Despliegue>
        <p>contenido</p>
      </Despliegue>,
    );
    expect(tarjeta()).not.toHaveAttribute("data-despliegue");
    expect(observadores).toHaveLength(0);
  });

  it("la que está debajo espera, y se despliega cuando entra en la pantalla", () => {
    conCaja(1200);
    render(
      <Despliegue>
        <p>contenido</p>
      </Despliegue>,
    );
    expect(tarjeta()).toHaveAttribute("data-despliegue", "en-espera");

    act(() => observadores[0].callback([{ isIntersecting: false }]));
    expect(tarjeta()).toHaveAttribute("data-despliegue", "en-espera");

    act(() => observadores[0].callback([{ isIntersecting: true }]));
    expect(tarjeta()).toHaveAttribute("data-despliegue", "activo");
    expect(observadores[0].disconnect).toHaveBeenCalled();
  });

  it("con 'reducir movimiento' no espera nada: se ve siempre", () => {
    conCaja(1200);
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    render(
      <Despliegue>
        <p>contenido</p>
      </Despliegue>,
    );
    expect(tarjeta()).not.toHaveAttribute("data-despliegue");
  });

  it("la forma y el orden llegan al nodo, para que el CSS los use", () => {
    conCaja(100);
    render(
      <Despliegue forma="derecha" orden={3} className="rounded-card">
        <p>contenido</p>
      </Despliegue>,
    );
    expect(tarjeta()).toHaveClass("despliegue", "despliegue--derecha", "rounded-card");
    expect(tarjeta().style.getPropertyValue("--despliegue-orden")).toBe("3");
  });
});
