import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CuerpoDesplegable, FilaDesplegable } from "./fila-desplegable";

// Las filas con PDF se despliegan al tocarlas (correcciones generales,
// 2026-10-18): el chevron dice si está abierta, abajo aparecen las acciones y
// hay una sola abierta por tabla. El nombre abre el documento: no despliega.
function Tabla() {
  return (
    <table>
      <CuerpoDesplegable>
        {["uno", "dos"].map((id) => (
          <FilaDesplegable key={id} id={id} columnas={3} columnasAntes={1} acciones={<button type="button">Acción de {id}</button>}>
            <td>Folio {id}</td>
            <td>
              <a href={`/panel/documentos/${id}`}>Documento {id}</a>
            </td>
          </FilaDesplegable>
        ))}
      </CuerpoDesplegable>
    </table>
  );
}

const fila = (id: string) => screen.getByText(`Folio ${id}`).closest("tr") as HTMLElement;
const chevron = (id: string) => within(fila(id)).getByRole("button", { name: /acciones/ });

describe("FilaDesplegable", () => {
  it("tocar la fila la despliega y tocarla de nuevo la pliega; el chevron lleva aria-expanded", () => {
    render(<Tabla />);
    expect(chevron("uno")).toHaveAttribute("aria-expanded", "false");
    expect(chevron("uno")).toHaveAccessibleName("Mostrar acciones");
    expect(screen.queryByRole("button", { name: "Acción de uno" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Folio uno"));
    expect(chevron("uno")).toHaveAttribute("aria-expanded", "true");
    expect(chevron("uno")).toHaveAccessibleName("Ocultar acciones");
    // Lo desplegado es la fila de abajo, desde la columna del nombre.
    const desplegada = fila("uno").nextElementSibling as HTMLElement;
    expect(within(desplegada).getByRole("button", { name: "Acción de uno" })).toBeInTheDocument();
    const celdas = desplegada.querySelectorAll("td");
    expect(celdas).toHaveLength(2);
    expect(celdas[0]).toHaveAttribute("colspan", "1");
    expect(celdas[1]).toHaveAttribute("colspan", "2");

    fireEvent.click(screen.getByText("Folio uno"));
    expect(chevron("uno")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Acción de uno" })).not.toBeInTheDocument();
  });

  it("el chevron alterna por su cuenta, y deja una sola abierta", () => {
    render(<Tabla />);
    fireEvent.click(chevron("uno"));
    expect(screen.getByRole("button", { name: "Acción de uno" })).toBeInTheDocument();

    fireEvent.click(chevron("dos"));
    expect(screen.queryByRole("button", { name: "Acción de uno" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acción de dos" })).toBeInTheDocument();
    expect(chevron("uno")).toHaveAttribute("aria-expanded", "false");
    expect(chevron("dos")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: "Ocultar acciones" })).toHaveLength(1);

    fireEvent.click(chevron("dos"));
    expect(screen.queryByRole("button", { name: /^Acción de/ })).not.toBeInTheDocument();
  });

  it("tocar el nombre (el link) no despliega la fila", () => {
    render(<Tabla />);
    fireEvent.click(screen.getByRole("link", { name: "Documento uno" }));
    expect(chevron("uno")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Acción de uno" })).not.toBeInTheDocument();
  });

  it("tocar una acción de lo desplegado no la pliega", () => {
    render(<Tabla />);
    fireEvent.click(chevron("uno"));
    fireEvent.click(screen.getByRole("button", { name: "Acción de uno" }));
    expect(chevron("uno")).toHaveAttribute("aria-expanded", "true");
  });
});
