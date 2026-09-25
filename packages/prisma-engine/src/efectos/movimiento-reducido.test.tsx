import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

// Archivo aparte a propósito: Motion lee la preferencia de movimiento
// reducido UNA vez por proceso, en el primer uso, así que tiene que estar
// fijada antes de montar cualquier efecto (PP-1, H1).
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: query.includes("reduce"),
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  },
);

const { default: EfectoEntrada } = await import("./entrada");

describe("con movimiento reducido el contenido queda en su estado final (H1)", () => {
  it.each(["aparicion-suave", "deslizar-suave"])("%s no deja el contenido borroso, corrido ni transparente", async (id) => {
    const { container } = render(<EfectoEntrada id={id} intensidad="marcada"><p>Somos una clínica.</p></EfectoEntrada>);
    const nodo = container.querySelector<HTMLElement>("[data-pp-efecto]")!;
    await waitFor(() => {
      expect(["", "1"]).toContain(nodo.style.opacity);
      expect(["", "none", "blur(0px)"]).toContain(nodo.style.filter);
      expect(["", "none"]).toContain(nodo.style.transform);
    });
  });
});
