import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { campoPorId, type Campo } from "@dental-mirage/documentos-clinicos";
import { CampoDeDocumento, SelectorDePiezas } from "./campo-de-documento";
import { todoTipo } from "./fixtures";

const campo = (id: string) => campoPorId(todoTipo, id) as Campo;

function montar(id: string, valor?: unknown, error?: string) {
  const onCambio = vi.fn();
  render(<CampoDeDocumento campo={campo(id)} valor={valor} error={error} onCambio={onCambio} />);
  return onCambio;
}

describe("CampoDeDocumento", () => {
  it("texto: escribe, y vaciarlo lo borra", () => {
    const onCambio = montar("nombre", "Ana");
    expect(screen.getByText("· Obligatorio")).toBeInTheDocument();
    expect(screen.getByText("Como figura en el DNI.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Ana María" } });
    expect(onCambio).toHaveBeenLastCalledWith("Ana María");
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "" } });
    expect(onCambio).toHaveBeenLastCalledWith(undefined);
  });

  it("un campo bloqueado no se edita y dice de dónde sale", () => {
    montar("profesional", "Lucía Gómez");
    expect(screen.getByLabelText(/Profesional/)).toBeDisabled();
    expect(screen.getByText("· Sale de tu perfil")).toBeInTheDocument();
  });

  it("el error se ve y se anuncia", () => {
    montar("dia", "2026-02-30", "No es una fecha válida.");
    expect(screen.getByRole("alert")).toHaveTextContent("No es una fecha válida.");
    expect(screen.getByLabelText(/Día/)).toHaveAttribute("aria-invalid", "true");
  });

  it("texto largo, fecha y hora", () => {
    const notas = montar("notas");
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Reposo" } });
    expect(notas).toHaveBeenLastCalledWith("Reposo");
  });

  it.each([
    ["dia", "2026-09-27"],
    ["hora", "10:30"],
  ])("%s", (id, valor) => {
    const onCambio = montar(id);
    fireEvent.change(document.getElementById(`campo-${id}`) as HTMLElement, { target: { value: valor } });
    expect(onCambio).toHaveBeenLastCalledWith(valor);
  });

  it("número con su unidad; vacío lo borra", () => {
    const onCambio = montar("peso", 70);
    expect(screen.getByText("kg")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Peso"), { target: { value: "71.5" } });
    expect(onCambio).toHaveBeenLastCalledWith(71.5);
    fireEvent.change(screen.getByLabelText("Peso"), { target: { value: "" } });
    expect(onCambio).toHaveBeenLastCalledWith(undefined);
  });

  it("SI/NO: elegir, volver a tocar lo borra, y el Sí pide el detalle", async () => {
    const onCambio = montar("alergia");
    await userEvent.click(screen.getByRole("radio", { name: "Sí" }));
    expect(onCambio).toHaveBeenLastCalledWith({ respuesta: "si" });
  });

  it("SI/NO con Sí: muestra el detalle y lo manda con la respuesta", () => {
    const onCambio = montar("alergia", { respuesta: "si", detalle: "pen" });
    fireEvent.change(screen.getByLabelText("¿A qué?"), { target: { value: "penicilina" } });
    expect(onCambio).toHaveBeenLastCalledWith({ respuesta: "si", detalle: "penicilina" });
    fireEvent.change(screen.getByLabelText("¿A qué?"), { target: { value: "" } });
    expect(onCambio).toHaveBeenLastCalledWith({ respuesta: "si" });
  });

  it("SI/NO: tocar la respuesta elegida la borra, y el No no pide detalle", async () => {
    const onCambio = montar("alergia", { respuesta: "no" });
    expect(screen.queryByLabelText("¿A qué?")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(onCambio).toHaveBeenLastCalledWith(undefined);
  });

  it("opción única: elegir y desmarcar", async () => {
    const onCambio = montar("higiene", "buena");
    expect(screen.getByRole("radio", { name: "Buena" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Mala" }));
    expect(onCambio).toHaveBeenLastCalledWith("mala");
    await userEvent.click(screen.getByRole("radio", { name: "Buena" }));
    expect(onCambio).toHaveBeenLastCalledWith(undefined);
  });

  it("opción múltiple: sumar y sacar", async () => {
    const onCambio = montar("habitos", ["dedo"]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Lengua" }));
    expect(onCambio).toHaveBeenLastCalledWith(["dedo", "lengua"]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Dedo" }));
    expect(onCambio).toHaveBeenLastCalledWith(undefined);
  });

  it("piezas: se eligen en el odontograma", async () => {
    const onCambio = montar("piezas", ["36"]);
    await userEvent.click(screen.getByRole("button", { name: "Pieza 11" }));
    expect(onCambio).toHaveBeenLastCalledWith(["36", "11"]);
    await userEvent.click(screen.getByRole("button", { name: "Pieza 36" }));
    expect(onCambio).toHaveBeenLastCalledWith(undefined);
  });
});

describe("SelectorDePiezas", () => {
  it("muestra solo la dentición pedida", () => {
    const { rerender } = render(<SelectorDePiezas denticion="permanente" valor={[]} onCambio={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(32);
    expect(screen.queryByRole("button", { name: "Pieza 55" })).not.toBeInTheDocument();
    rerender(<SelectorDePiezas denticion="temporaria" valor={["55"]} onCambio={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(20);
    expect(screen.getByRole("button", { name: "Pieza 55" })).toHaveAttribute("aria-pressed", "true");
  });

  // jsdom no mide anchos: esto cuida la forma que hace que, en el celular,
  // las piezas se desplacen en su caja en vez de ensanchar la pantalla.
  it("las arcadas se desplazan de costado en su propia caja, sin ensanchar la sección", () => {
    const { container } = render(<SelectorDePiezas denticion="ambas" valor={[]} onCambio={vi.fn()} />);
    const caja = container.querySelector("[data-scroll-piezas]");
    expect(caja).toHaveClass("overflow-x-auto");
    // Centradas cuando entran; desde el borde cuando no (nada de justify-center en la caja que scrollea).
    expect(caja?.firstElementChild).toHaveClass("w-max", "mx-auto");
    expect(caja).not.toHaveClass("justify-center");
    // Un fieldset se estira a su contenido si no se le dice lo contrario.
    for (const arcada of container.querySelectorAll("fieldset")) expect(arcada).toHaveClass("min-w-0");
  });
});
