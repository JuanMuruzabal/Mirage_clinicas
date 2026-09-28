import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalcoCongelado, CalcoEnVivo } from "./calco";
import { caminoDelTrazo } from "./trazo-de-firma";
import { conducto, contenidoDe, firma, todoTipo } from "./fixtures";

describe("CalcoEnVivo", () => {
  it("lo que falta se ve como un hueco con el nombre del dato, y tocarlo lo abre", async () => {
    const onElegir = vi.fn();
    render(<CalcoEnVivo plantilla={todoTipo} valores={{ nombre: "Ana" }} hoy="2026-09-27" onElegir={onElegir} campoActivo="nombre" />);

    expect(screen.getByRole("heading", { name: "Prueba" })).toBeInTheDocument();
    expect(screen.getByText("27/09/2026")).toBeInTheDocument();
    // Lo cargado, resaltado y tocable.
    await userEvent.click(screen.getByRole("button", { name: "Nombre: Ana. Editar" }));
    expect(onElegir).toHaveBeenCalledWith("nombre");
    // Lo que falta, con su etiqueta.
    await userEvent.click(screen.getByRole("button", { name: "Completar: Hora" }));
    expect(onElegir).toHaveBeenCalledWith("hora");
    // El campo que se lee solo, también.
    await userEvent.click(screen.getByRole("button", { name: "Completar: Notas" }));
    expect(onElegir).toHaveBeenCalledWith("notas");
    // Las firmas, sin firmar.
    expect(screen.getByText("Firma del paciente")).toBeInTheDocument();
    expect(screen.getAllByText("Pendiente")).toHaveLength(2);
    expect(screen.getByText(/Modelo: Tests/)).toBeInTheDocument();
  });

  it("sin onElegir (la vista precargada) nada es tocable", () => {
    render(<CalcoEnVivo plantilla={conducto} valores={{}} hoy="2026-09-27" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getAllByText("Elemento(s) a tratar").length).toBeGreaterThan(0);
  });

  it("lee cada tipo de valor como lo va a leer el documento", () => {
    render(
      <CalcoEnVivo
        plantilla={todoTipo}
        valores={{
          nombre: "Ana",
          peso: 70,
          alergia: { respuesta: "si", detalle: "penicilina" },
          higiene: "buena",
          habitos: ["lengua", "dedo"],
          piezas: ["36", "11"],
          notas: "Primera línea",
        }}
        hoy="2026-09-27"
      />,
    );
    expect(screen.getByText("70,0 kg")).toBeInTheDocument();
    expect(screen.getByText("Sí (penicilina)")).toBeInTheDocument();
    expect(screen.getByText("Dedo, Lengua")).toBeInTheDocument();
    expect(screen.getByText("11, 36")).toBeInTheDocument();
    expect(screen.getByText("Primera línea")).toBeInTheDocument();
  });
});

describe("CalcoCongelado", () => {
  it("lee el texto congelado y dibuja las firmas que ya están", () => {
    const contenido = contenidoDe({ lugar: "Córdoba", elementos: ["36"], suscribe_nombre: "Ana Paz" });
    render(
      <CalcoCongelado
        cuerpo={contenido.cuerpo}
        definiciones={contenido.firmas}
        firmas={[firma("paciente", { enRepresentacion: true, vinculo: "Madre", nombre: "Marta Paz" })]}
        pie={<>Pie de prueba</>}
      />,
    );
    expect(screen.getByText(/en el elemento N° 36 propuesto/)).toBeInTheDocument();
    expect(screen.getAllByText("No consigna").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "Firma de Marta Paz" })).toBeInTheDocument();
    expect(screen.getByText(/en representación \(Madre\)/)).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("Pie de prueba")).toBeInTheDocument();
  });
});

describe("caminoDelTrazo", () => {
  it("arma el camino SVG, y un toque solo es un punto", () => {
    expect(caminoDelTrazo([])).toBe("");
    expect(caminoDelTrazo([[1, 2, 0]])).toBe("M1 2 l0.1 0");
    expect(caminoDelTrazo([[1, 2, 0], [3, 4, 5]])).toBe("M1 2 L3 4");
  });
});
