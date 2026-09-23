import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuscadoresYRedes } from "./buscadores-y-redes";

const props = {
  slug: "clinica-sol",
  seoTitulo: "",
  seoDescripcion: "",
  tituloPorDefecto: "Clínica Sol — Ortodoncia en Córdoba",
  descripcionPorDefecto: "Pedí turno online en Clínica Sol.",
};

describe("BuscadoresYRedes", () => {
  it("vacío, sugiere el default y la vista previa lo muestra", () => {
    render(<BuscadoresYRedes {...props} onCambio={vi.fn()} />);
    expect(screen.getByLabelText(/título/i)).toHaveAttribute("placeholder", props.tituloPorDefecto);
    expect(screen.getByLabelText(/descripción/i)).toHaveAttribute("placeholder", props.descripcionPorDefecto);
    const vista = screen.getByRole("figure", { name: /vista previa en google/i });
    expect(vista).toHaveTextContent(props.tituloPorDefecto);
    expect(vista).toHaveTextContent("/clinica-sol");
    expect(screen.getByRole("link", { name: /ver la imagen actual/i })).toHaveAttribute("href", "/clinica-sol/opengraph-image");
  });

  it("lo que se escribe va al borrador y la vista previa usa eso", async () => {
    const onCambio = vi.fn();
    const { rerender } = render(<BuscadoresYRedes {...props} onCambio={onCambio} />);
    await userEvent.type(screen.getByLabelText(/título/i), "H");
    expect(onCambio).toHaveBeenCalledWith({ seoTitulo: "H" });
    await userEvent.type(screen.getByLabelText(/descripción/i), "D");
    expect(onCambio).toHaveBeenCalledWith({ seoDescripcion: "D" });

    rerender(<BuscadoresYRedes {...props} seoTitulo="Mi título" seoDescripcion="Mi descripción" onCambio={onCambio} />);
    expect(screen.getByRole("figure", { name: /vista previa en google/i })).toHaveTextContent("Mi título");
    expect(screen.getByText("9/70")).toBeInTheDocument();
  });
});
