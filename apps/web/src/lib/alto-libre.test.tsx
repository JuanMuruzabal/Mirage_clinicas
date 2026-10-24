import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { CLASE_ALTO_LIBRE, useAltoLibre } from "./alto-de-filas";

// useAltoLibre: la caja mide dónde arranca y cuánto contenido la sigue, y lo
// deja en --arriba-caja y --abajo-caja. jsdom no mide nada: cada elemento dice
// su borde de arriba y de abajo en data-top / data-bottom.
const UNA_PANTALLA = "calc(var(--header-height) + 1rem)";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    const top = Number(el.dataset.top ?? 0);
    const bottom = Number(el.dataset.bottom ?? 0);
    return { top, bottom, height: bottom - top, width: 300, left: 0, right: 300, x: 0, y: top, toJSON: () => ({}) };
  });
  // Todo se ve: getClientRects no vacío.
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    return [this.getBoundingClientRect()] as unknown as DOMRectList;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const SIN_RELLENO = { paddingBottom: "0px", borderBottomWidth: "0px", marginBottom: "0px" };

function Caja({ id, top, bottom, activo = true }: { id: string; top: number; bottom: number; activo?: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  useAltoLibre(caja, activo);
  return <div ref={caja} data-testid={id} className={CLASE_ALTO_LIBRE} data-top={top} data-bottom={bottom} style={SIN_RELLENO} />;
}

describe("useAltoLibre", () => {
  it("una sola caja en la primera pantalla: --arriba-caja es dónde arranca y --abajo-caja lo que la sigue", () => {
    render(
      <main style={SIN_RELLENO}>
        <div data-top={0} data-bottom={200} style={SIN_RELLENO} />
        <Caja id="caja" top={200} bottom={500} />
        <div data-top={500} data-bottom={560.4} style={SIN_RELLENO}>
          Cargar más
        </div>
      </main>,
    );
    const caja = screen.getByTestId("caja");
    expect(caja.style.getPropertyValue("--arriba-caja")).toBe("200px");
    expect(caja.style.getPropertyValue("--abajo-caja")).toBe("61px");
  });

  it("con cajas apiladas, cada una mide como mucho una pantalla", () => {
    render(
      <main style={SIN_RELLENO}>
        <Caja id="primera" top={150} bottom={400} />
        <Caja id="segunda" top={900} bottom={1200} />
      </main>,
    );
    // La primera tiene otra debajo; la segunda arranca debajo de la primera
    // pantalla (innerHeight de jsdom: 768).
    expect(window.innerHeight).toBeLessThan(900);
    for (const id of ["primera", "segunda"]) {
      const caja = screen.getByTestId(id);
      expect(caja.style.getPropertyValue("--arriba-caja")).toBe(UNA_PANTALLA);
      expect(caja.style.getPropertyValue("--abajo-caja")).toBe("0px");
    }
  });

  it("vuelve a medir al cambiar el tamaño de la ventana", () => {
    render(
      <main style={SIN_RELLENO}>
        <Caja id="caja" top={200} bottom={500} />
      </main>,
    );
    const caja = screen.getByTestId("caja");
    caja.dataset.top = "240";
    window.dispatchEvent(new Event("resize"));
    expect(caja.style.getPropertyValue("--arriba-caja")).toBe("240px");
  });

  it("inactiva, o fuera de <main>, no toca nada", () => {
    render(
      <>
        <main>
          <Caja id="inactiva" top={200} bottom={500} activo={false} />
        </main>
        <Caja id="afuera" top={200} bottom={500} />
      </>,
    );
    for (const id of ["inactiva", "afuera"]) {
      expect(screen.getByTestId(id).style.getPropertyValue("--arriba-caja")).toBe("");
      expect(screen.getByTestId(id).style.getPropertyValue("--abajo-caja")).toBe("");
    }
  });
});
