import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { EscenaDeServicio, type DibujoDeTarjeta } from "./escenas";

// Un objeto por tarjeta (ítem 8): el `Lienzo` arma la caja `.escena` con dos
// capas (línea y relleno) que comparten el `viewBox`. No se comparan
// coordenadas del dibujo.

const TARJETAS: DibujoDeTarjeta[] = [
  "agenda",
  "pagina",
  "equipo",
  "clinica",
  "otra-clinica",
  "crear-clinica",
  "invitacion",
];

describe("EscenaDeServicio", () => {
  it.each(TARJETAS)("%s: una escena con dos svg del mismo viewBox", (servicio) => {
    const { container } = render(<EscenaDeServicio servicio={servicio} className="extra" />);
    const escenas = container.querySelectorAll<HTMLElement>(".escena");
    expect(escenas).toHaveLength(1);
    expect(escenas[0]).toHaveClass("extra");
    const svgs = escenas[0].querySelectorAll(":scope > svg");
    expect(svgs).toHaveLength(2);
    const viewBox = svgs[0].getAttribute("viewBox");
    expect(viewBox).toMatch(/^-?\d+(\.\d+)? -?\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)?$/);
    expect(svgs[1].getAttribute("viewBox")).toBe(viewBox);
  });
});

describe("Lienzo: ids de las máscaras", () => {
  function idsDeMascaras(escena: Element) {
    return Array.from(escena.querySelectorAll("mask")).map((m) => m.id);
  }

  it("dos tarjetas iguales renderizadas juntas no comparten el id de la máscara", () => {
    const { container } = render(
      <>
        <EscenaDeServicio servicio="agenda" />
        <EscenaDeServicio servicio="agenda" />
      </>,
    );
    const [a, b] = Array.from(container.querySelectorAll(".escena"));
    const idsA = idsDeMascaras(a);
    const idsB = idsDeMascaras(b);
    expect(idsA.length).toBeGreaterThanOrEqual(2);
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    // Y cada `mask="url(#…)"` apunta a una máscara de su propia escena.
    for (const escena of [a, b]) {
      const propios = idsDeMascaras(escena);
      for (const g of Array.from(escena.querySelectorAll("[mask]"))) {
        const ref = g.getAttribute("mask")!.match(/^url\(#(.+)\)$/)![1];
        expect(propios).toContain(ref);
      }
    }
  });
});
