import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TarjetaConDibujo } from "../tarjeta-con-dibujo";
import { VARIANTES_DE_DIBUJO, varianteDeDibujo } from "./dibujos-discretos";
import type { DibujoDeTarjeta } from "./escenas";

const DIBUJOS: DibujoDeTarjeta[] = ["agenda", "pagina", "equipo", "clinica", "otra-clinica", "crear-clinica", "invitacion"];

// Las variantes discretas de los dibujos de las tarjetas (28/10), a prueba
// contra el objeto de hoy: `?dibujo=` en /seleccionar-servicio.
describe("dibujos discretos", () => {
  it("varianteDeDibujo lee ?dibujo= y cae en el objeto de hoy con cualquier otra cosa", () => {
    expect(varianteDeDibujo("icono")).toBe("icono");
    expect(varianteDeDibujo(["trazo", "mancha"])).toBe("trazo");
    expect(varianteDeDibujo(undefined)).toBe("objeto");
    expect(varianteDeDibujo("cualquiera")).toBe("objeto");
  });

  it.each(DIBUJOS)("%s: cada variante va en la caja aria-hidden, sin el objeto de hoy", (dibujo) => {
    for (const variante of VARIANTES_DE_DIBUJO.filter((v) => v !== "objeto")) {
      const { container, unmount } = render(
        <TarjetaConDibujo href="/x" dibujo={dibujo} variante={variante}>
          <h2>Tarjeta</h2>
        </TarjetaConDibujo>,
      );
      const cajas = container.querySelectorAll('a > [aria-hidden="true"]');
      expect(cajas).toHaveLength(1);
      expect(cajas[0].querySelector(".escena")).toBeNull();
      if (variante === "mancha") {
        expect(cajas[0].querySelector("svg")).toBeNull();
        // jsdom no entiende `color-mix`: alcanza con que esté la mancha.
        expect(cajas[0].querySelector("div > div")).not.toBeNull();
      } else {
        expect(cajas[0].querySelector("svg.dibujo-discreto")).not.toBeNull();
      }
      unmount();
    }
  });

  it("sin variante, sigue el objeto de hoy", () => {
    const { container } = render(
      <TarjetaConDibujo href="/x" dibujo="agenda">
        <h2>Agenda</h2>
      </TarjetaConDibujo>,
    );
    expect(container.querySelector(".escena")).not.toBeNull();
    expect(container.querySelector(".dibujo-discreto")).toBeNull();
  });
});
