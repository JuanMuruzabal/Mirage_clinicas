import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HoraPicker } from "./hora-picker";

describe("HoraPicker", () => {
  // Corrección de QA (F2.3): "quiero que aparezca colapsada primero la
  // lista de horarios y que diga selecciona hora disponible". El
  // aria-label es dinámico ("Hora: <valor>", ver el comentario del
  // componente) — se busca por coincidencia parcial, no texto exacto.
  it("arranca colapsado, mostrando el horario ya elegido en la barra", () => {
    render(<HoraPicker slots={["09:00", "09:15"]} value="09:00" onChange={vi.fn()} cargando={false} />);

    expect(screen.getByRole("button", { name: "Hora: 09:00" })).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("sin ningún valor elegido todavía, la barra colapsada dice el placeholder", () => {
    render(<HoraPicker slots={["09:00", "09:15"]} value="" onChange={vi.fn()} cargando={false} />);
    expect(screen.getByRole("button", { name: /Seleccioná un horario disponible/ })).toBeInTheDocument();
  });

  it("mientras carga, la barra colapsada dice 'Buscando horarios…' y queda deshabilitada", () => {
    render(<HoraPicker slots={[]} value="" onChange={vi.fn()} cargando={true} />);
    const boton = screen.getByRole("button", { name: /Buscando horarios/ });
    expect(boton).toBeDisabled();
  });

  it("sin horarios disponibles, la barra colapsada lo dice y queda deshabilitada", () => {
    render(<HoraPicker slots={[]} value="" onChange={vi.fn()} cargando={false} />);
    const boton = screen.getByRole("button", { name: /No hay horarios disponibles/ });
    expect(boton).toBeDisabled();
  });

  it("tocar la barra colapsada despliega la lista de horarios", async () => {
    const user = userEvent.setup();
    render(<HoraPicker slots={["09:00", "09:15", "09:30"]} value="09:15" onChange={vi.fn()} cargando={false} />);

    await user.click(screen.getByRole("button", { name: "Hora: 09:15" }));

    const lista = screen.getByRole("listbox", { name: "Hora" });
    expect(lista.tagName).not.toBe("SELECT");
    const opciones = screen.getAllByRole("option");
    expect(opciones.map((o) => o.textContent)).toEqual(["09:00", "09:15", "09:30"]);
    expect(screen.getByRole("option", { name: "09:15" })).toHaveAttribute("aria-selected", "true");
  });

  // Corrección de QA (F2.3): "una vez que se seleccione una hora, se
  // vuelva a colapsar y que quede solo el horario seleccionado en la
  // barra".
  it("elegir un horario llama a onChange y vuelve a colapsar la lista", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<HoraPicker slots={["09:00", "09:15"]} value="09:00" onChange={onChange} cargando={false} />);

    await user.click(screen.getByRole("button", { name: "Hora: 09:00" }));
    await user.click(screen.getByRole("option", { name: "09:15" }));

    expect(onChange).toHaveBeenCalledWith("09:15");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // El value en sí lo controla el padre (componente controlado) — acá
    // solo se verifica que la lista se cerró sola tras elegir.
  });

  // Es una lista inline con scroll propio acotado, nunca un popup nativo
  // del navegador que se pueda salir de la pantalla.
  it("la lista desplegada tiene su propio alto acotado (nunca un <select> nativo)", async () => {
    const user = userEvent.setup();
    render(<HoraPicker slots={["09:00"]} value="09:00" onChange={vi.fn()} cargando={false} />);

    await user.click(screen.getByRole("button", { name: "Hora: 09:00" }));
    const lista = screen.getByRole("listbox", { name: "Hora" });
    expect(lista.className).toContain("max-h-40");
    expect(lista.className).toContain("overflow-y-auto");
  });
});
