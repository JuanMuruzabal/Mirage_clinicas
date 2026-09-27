import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";
import { useAltoDeFilas } from "./alto-de-filas";
import { FechaHoraCelda } from "@/components/panel/fecha-hora-celda";

// jsdom no mide nada: cada fila dice su alto en `data-alto` y se lo
// devuelve getBoundingClientRect.
function conAltos() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const alto = Number(this.dataset.alto ?? 0);
    return { height: alto, width: 300, top: 0, left: 0, bottom: alto, right: 300, x: 0, y: 0, toJSON: () => ({}) };
  });
}

function enCelular(es: boolean) {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: es,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
}

function Tabla({ filas, alto = 100 }: { filas: number; alto?: number }) {
  const caja = useRef<HTMLDivElement>(null);
  useAltoDeFilas(caja);
  return (
    <div ref={caja} data-testid="caja">
      <table>
        <thead data-alto="40">
          <tr>
            <th>Paciente</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: filas }, (_, i) => (
            <tr key={i} data-alto={alto}>
              <td>fila {i}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("useAltoDeFilas", () => {
  // Pedido del cliente: cuatro filas enteras antes del scroll, y un
  // pedacito de la quinta para que se note que hay más.
  it("en el celular mide la cabecera, cuatro filas y una franja de la quinta", () => {
    conAltos();
    enCelular(true);
    const { getByTestId } = render(<Tabla filas={8} alto={100} />);
    // 40 + 4 × 100 + min(28, 100 / 2)
    expect(getByTestId("caja").style.getPropertyValue("--alto-mobile")).toBe("468px");
  });

  it("con cuatro filas o menos no pone tope (el alto de siempre cortaría la cuarta)", () => {
    conAltos();
    enCelular(true);
    const { getByTestId } = render(<Tabla filas={4} alto={105} />);
    expect(getByTestId("caja").style.getPropertyValue("--alto-mobile")).toBe("none");
  });

  it("fuera del celular no toca nada: manda el alto de escritorio", () => {
    conAltos();
    enCelular(false);
    const { getByTestId } = render(<Tabla filas={8} />);
    expect(getByTestId("caja").style.getPropertyValue("--alto-mobile")).toBe("");
  });
});

describe("FechaHoraCelda", () => {
  // En un iPhone, "15 sept · 08:00" se partía en cuatro renglones.
  it("la fecha y la hora van en dos piezas que no se parten por dentro", () => {
    const { container } = render(<FechaHoraCelda iso="2026-09-15T11:00:00Z" />);
    const piezas = container.querySelectorAll(".whitespace-nowrap");
    expect(piezas).toHaveLength(2);
    expect(piezas[0].textContent).toMatch(/15 sept/);
    expect(piezas[1].textContent).toBe("08:00");
  });

  it("sin fecha, una raya", () => {
    const { container } = render(<FechaHoraCelda />);
    expect(container.textContent).toBe("—");
  });
});
