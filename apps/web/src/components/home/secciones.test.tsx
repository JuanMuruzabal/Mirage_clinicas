import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  DibujoAgil,
  DibujoOrdenada,
  DibujoTranquila,
  DibujoVisible,
  EscenaCalma,
  EscenaEscritorio,
  EscenaLink,
  EscenaNoche,
} from "./dibujos";
import { Ventajas } from "./ventajas";
import { LlamadoFinal, ParaPacientes } from "./cierre";

// Las partes de la home. Lo que importa que no se rompa: que las escenas
// se describan (son imágenes con algo que contar), que los dibujos chicos
// no se lean dos veces (el texto de al lado ya lo dice), que los anclas del
// header (#como-funciona, #buscar) existan y que cada botón lleve a donde
// dice.

describe("los dibujos", () => {
  it.each([
    ["el escritorio", EscenaEscritorio],
    ["la noche", EscenaNoche],
    ["el link", EscenaLink],
    ["la calma", EscenaCalma],
  ])("la escena de %s es una imagen con su descripción", (_nombre, Escena) => {
    render(<Escena />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("aria-label")?.length).toBeGreaterThan(20);
  });

  it.each([DibujoAgil, DibujoOrdenada, DibujoVisible, DibujoTranquila])(
    "los dibujos chicos son decorado",
    (Dibujo) => {
      const { container } = render(<Dibujo className="h-10" />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).not.toHaveAttribute("role");
      expect(svg).toHaveClass("h-10");
    },
  );

  it("de noche los mensajes están sin responder, y el celular vibra", () => {
    const { container } = render(<EscenaNoche />);
    expect(container.querySelectorAll(".dib-globo").length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector(".dib-vibrar")).toBeInTheDocument();
    expect(container.textContent).toContain("23:04");
  });

  // El CSS de la animación pisaba el `transform` del SVG y todo quedaba
  // apilado en una esquina: la posición va en un grupo y la animación en
  // otro, de adentro.
  it("lo que se anima no lleva la posición: la tiene su grupo de afuera", () => {
    const { container } = render(<EscenaNoche />);
    for (const animado of container.querySelectorAll(".dib-globo, .dib-aviso")) {
      expect(animado).not.toHaveAttribute("transform");
      expect(animado.parentElement).toHaveAttribute("transform");
    }
  });
});

describe("Ventajas", () => {
  it("es el destino de 'Servicios para profesionales' del header y tiene cuatro ventajas", () => {
    const { container } = render(<Ventajas />);
    expect(container.querySelector("section#como-funciona")).toBeInTheDocument();
    const lista = screen.getByRole("list");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "Más tranquila" })).toBeInTheDocument();
  });
});

describe("el cierre", () => {
  it("la entrada para pacientes es el destino de 'Buscar clínicas' del header y lleva al buscador", () => {
    const { container } = render(<ParaPacientes />);
    expect(container.querySelector("section#buscar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buscar clínicas" })).toHaveAttribute("href", "/buscar");
  });

  it("el llamado final lleva a sumarse o a ingresar", () => {
    render(<LlamadoFinal />);
    expect(screen.getByRole("link", { name: "Sumate gratis" })).toHaveAttribute("href", "/sumarse");
    expect(screen.getByRole("link", { name: "Ya tengo cuenta" })).toHaveAttribute("href", "/ingresar");
  });
});
