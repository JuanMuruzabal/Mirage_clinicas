import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { FondoOndas } from "./fondo-ondas";

// jsdom no tiene WebGL: lo que se puede probar acá es el contrato de
// presentación —decorativo, sin capturar el puntero, con la base estática
// de CSS— y que sin contexto el canvas se queda invisible sobre el degradé.
// Con un contexto falso se prueba además que dibuja, que pausa con la
// pestaña oculta y que libera todo al desmontar.

function glFalso() {
  const perder = vi.fn();
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TRIANGLES: 8,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    viewport: vi.fn(),
    uniform2f: vi.fn(),
    uniform1f: vi.fn(),
    drawArrays: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext: perder })),
  };
  return { gl, perder };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FondoOndas", () => {
  it("es decorativo, no captura el puntero y trae la base estática", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container } = render(<FondoOndas />);
    const caja = container.firstElementChild as HTMLElement;
    expect(caja).toHaveAttribute("aria-hidden", "true");
    expect(caja).toHaveClass("fondo-ondas", "pointer-events-none", "fixed");
    expect(container.querySelector("canvas")).toBeInTheDocument();
  });

  it("sin WebGL el canvas queda invisible y se ve el degradé", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container } = render(<FondoOndas />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.style.opacity).toBe("");
    expect(canvas).toHaveClass("opacity-0");
  });

  it("con WebGL dibuja, aparece, pausa con la pestaña oculta y libera el contexto al desmontar", () => {
    const { gl, perder } = glFalso();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as RenderingContext);
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    const cancelar = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const { container, unmount } = render(<FondoOndas />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(gl.drawArrays).toHaveBeenCalled();
    expect(canvas.style.opacity).toBe("1");
    expect(raf).toHaveBeenCalled();

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cancelar).toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });

    unmount();
    expect(perder).toHaveBeenCalled();
  });

  it("con reducir movimiento dibuja un cuadro y no anima", () => {
    const { gl } = glFalso();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as RenderingContext);
    const original = window.matchMedia;
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    try {
      render(<FondoOndas />);
      expect(gl.drawArrays).toHaveBeenCalled();
      // El primer render (el de hidratación) arranca en movimiento; el
      // canvas que queda montado después es el quieto, que no pide cuadros.
      raf.mockClear();
      gl.drawArrays.mockClear();
      window.dispatchEvent(new Event("resize"));
      expect(gl.drawArrays).toHaveBeenCalled();
      expect(raf).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = original;
    }
  });
});
