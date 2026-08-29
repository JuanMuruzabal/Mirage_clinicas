import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalendarRotationContext } from "@/lib/calendar-rotation-context";
import { ModalPortal } from "./modal-portal";

describe("ModalPortal", () => {
  it("monta los children directo en document.body, sin envoltorio, cuando no hay rotación activa", () => {
    render(
      <ModalPortal>
        <div data-testid="contenido">Hola</div>
      </ModalPortal>,
    );

    const contenido = screen.getByTestId("contenido");
    expect(contenido.parentElement).toBe(document.body);
  });

  // F2.2 (docs/implementation-plan.md §11, pedido explícito del
  // cliente, 2026-08-29): "los botones, pantallas dentro de calendario
  // también se deben adaptar a la rotación" — cualquier modal abierto
  // mientras el calendario está en modo horizontal se envuelve en el
  // mismo truco de rotación, sin que el modal en sí sepa nada de esto.
  it("envuelve los children en el contenedor rotado cuando CalendarRotationContext está activo", () => {
    render(
      <CalendarRotationContext.Provider value={true}>
        <ModalPortal>
          <div data-testid="contenido">Hola</div>
        </ModalPortal>
      </CalendarRotationContext.Provider>,
    );

    const contenido = screen.getByTestId("contenido");
    // Dos envoltorios anidados (bug de iOS: `position: fixed` + `transform`
    // en el MISMO elemento rompe el touch) — el de afuera es `fixed` y
    // nunca lleva transform; el de adentro lleva el transform pero es
    // `absolute`, no `fixed`.
    const envoltorioInterno = contenido.parentElement!;
    const envoltorioExterno = envoltorioInterno.parentElement!;
    expect(envoltorioExterno.parentElement).toBe(document.body);
    expect(envoltorioExterno).toHaveClass("fixed");
    expect(envoltorioInterno).not.toHaveClass("fixed");
    // `.style.*` (no `toHaveStyle`, que en jsdom resuelve `vh`/`vw` contra
    // un viewport por default en vez de conservar el valor especificado)
    // — el ancho/alto intercambiados son justo el punto del truco.
    expect(envoltorioInterno.style.width).toBe("100vh");
    expect(envoltorioInterno.style.height).toBe("100vw");
    expect(envoltorioInterno.style.transform).toBe("rotate(90deg) translateY(-100%)");
  });
});
