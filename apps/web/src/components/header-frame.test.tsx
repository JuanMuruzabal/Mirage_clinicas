import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { HeaderFrame } = await import("./header-frame");

function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
}

describe("HeaderFrame", () => {
  beforeEach(() => {
    setScrollY(0);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("es fixed (no sticky) — la foto del hero necesita que salga del flujo", () => {
    usePathnameMock.mockReturnValue("/buscar");
    const { container } = render(
      <HeaderFrame>
        <p>contenido</p>
      </HeaderFrame>,
    );
    expect(container.querySelector("header")).toHaveClass("fixed", "top-0");
  });

  it("fuera del Home, siempre sólido con la piel cálida (marfil/grafito, TR-015)", () => {
    usePathnameMock.mockReturnValue("/buscar");
    const { container } = render(
      <HeaderFrame>
        <p>contenido</p>
      </HeaderFrame>,
    );
    const header = container.querySelector("header")!;
    expect(header).toHaveClass("bg-marfil", "text-grafito");
    expect(header.className).not.toContain("bg-porcelain");
  });

  it("en el Home sin scrollear, transparente sobre la foto (texto claro)", () => {
    usePathnameMock.mockReturnValue("/");
    const { container } = render(
      <HeaderFrame>
        <p>contenido</p>
      </HeaderFrame>,
    );
    expect(container.querySelector("header")).toHaveClass("bg-transparent", "text-porcelain");
  });

  it("en el Home, al scrollear pasa a sólido", () => {
    usePathnameMock.mockReturnValue("/");
    setScrollY(80);
    const { container } = render(
      <HeaderFrame>
        <p>contenido</p>
      </HeaderFrame>,
    );
    window.dispatchEvent(new Event("scroll"));

    expect(container.querySelector("header")).toHaveClass("bg-porcelain", "text-ink");
  });

  it("dentro de /panel también, sólido con la piel cálida (marfil/grafito), no porcelana/ink (TR-013)", () => {
    usePathnameMock.mockReturnValue("/panel/turnos");
    const { container } = render(
      <HeaderFrame>
        <p>contenido</p>
      </HeaderFrame>,
    );
    const header = container.querySelector("header")!;
    expect(header).toHaveClass("bg-marfil", "text-grafito");
    expect(header.className).not.toContain("bg-porcelain");
  });

  it("renderiza los children", () => {
    usePathnameMock.mockReturnValue("/");
    render(
      <HeaderFrame>
        <p>contenido de prueba</p>
      </HeaderFrame>,
    );
    expect(screen.getByText("contenido de prueba")).toBeInTheDocument();
  });

  it("mide su altura real al montar y la expone como --header-height (evita el hueco con el contenido de abajo)", () => {
    usePathnameMock.mockReturnValue("/buscar");
    render(
      <HeaderFrame>
        <p>contenido</p>
      </HeaderFrame>,
    );
    // jsdom no calcula layout real (offsetHeight siempre da 0), pero esto
    // alcanza para confirmar que el efecto corrió y fijó la propiedad en
    // :root — lo que importa acá es que HeaderFrame la escribe él mismo,
    // no un valor hardcodeado en globals.css que puede desincronizarse.
    expect(document.documentElement.style.getPropertyValue("--header-height")).toBe("0px");
  });
});
