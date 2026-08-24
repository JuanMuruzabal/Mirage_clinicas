import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScrollReveal } from "./scroll-reveal";

describe("ScrollReveal", () => {
  it("renderiza sus children", () => {
    render(
      <ScrollReveal>
        <p>Contenido revelado</p>
      </ScrollReveal>,
    );
    expect(screen.getByText("Contenido revelado")).toBeInTheDocument();
  });

  it("acepta un delay y una className sin romper el render", () => {
    render(
      <ScrollReveal delay={0.2} className="mi-clase">
        <span>Con delay</span>
      </ScrollReveal>,
    );
    const wrapper = screen.getByText("Con delay").parentElement;
    expect(wrapper).toHaveClass("mi-clase");
  });
});
