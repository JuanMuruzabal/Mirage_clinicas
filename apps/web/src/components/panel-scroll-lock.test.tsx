import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { PanelScrollLock } = await import("./panel-scroll-lock");

// Rama fix/mobile, corrección 2026-08-24 sobre TR-026 (ver TR-027 en
// docs/tradeoffs.md) — PanelScrollLock es el componente que pone/saca
// `.panel-locked` en <html> mientras se está en /panel/**, para cerrar la
// vía de filtración del rebote elástico de mobile Safari hacia el header
// fijo (ver el comentario del propio componente).
describe("PanelScrollLock", () => {
  afterEach(() => {
    document.documentElement.classList.remove("panel-locked");
  });

  it("agrega .panel-locked en <html> dentro de /panel/**", () => {
    usePathnameMock.mockReturnValue("/panel/turnos");
    render(<PanelScrollLock />);
    expect(document.documentElement.classList.contains("panel-locked")).toBe(true);
  });

  it("no agrega .panel-locked fuera de /panel", () => {
    for (const pathname of ["/", "/buscar", "/perfil", "/personalizar-pagina"]) {
      usePathnameMock.mockReturnValue(pathname);
      const { unmount } = render(<PanelScrollLock />);
      expect(document.documentElement.classList.contains("panel-locked")).toBe(false);
      unmount();
    }
  });

  it("saca .panel-locked al desmontarse (navegar fuera de /panel)", () => {
    usePathnameMock.mockReturnValue("/panel");
    const { unmount } = render(<PanelScrollLock />);
    expect(document.documentElement.classList.contains("panel-locked")).toBe(true);

    unmount();
    expect(document.documentElement.classList.contains("panel-locked")).toBe(false);
  });

  it("no renderiza ningún nodo visible", () => {
    usePathnameMock.mockReturnValue("/panel");
    const { container } = render(<PanelScrollLock />);
    expect(container).toBeEmptyDOMElement();
  });
});
