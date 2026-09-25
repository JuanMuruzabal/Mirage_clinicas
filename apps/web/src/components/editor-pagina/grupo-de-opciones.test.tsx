import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GrupoDeOpciones } from "./grupo-de-opciones";
import { Pestanas } from "./pestanas";

const OPCIONES = [
  { valor: "a", contenido: "Alfa" },
  { valor: "b", contenido: "Beta" },
  { valor: "c", contenido: "Gama" },
];

function Grupo({ inicial = "b", onCambio = vi.fn() }: { inicial?: string; onCambio?: (v: string) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <button type="button">antes</button>
      <GrupoDeOpciones
        etiqueta="Letra"
        opciones={OPCIONES}
        valor={valor}
        onCambio={(v) => {
          setValor(v);
          onCambio(v);
        }}
        claseOpcion={() => ""}
      />
      <button type="button">después</button>
    </>
  );
}

describe("GrupoDeOpciones", () => {
  it("se nombra una sola vez, con la etiqueta visible", () => {
    render(<Grupo />);
    const grupo = screen.getByRole("radiogroup", { name: "Letra" });
    expect(grupo).not.toHaveAttribute("aria-label");
    expect(screen.getAllByText("Letra")).toHaveLength(1);
  });

  it("es una sola parada de Tab: la opción elegida", async () => {
    render(<Grupo />);
    await userEvent.click(screen.getByRole("button", { name: "antes" }));
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "después" })).toHaveFocus();
  });

  it("sin nada elegido, el Tab entra por la primera", async () => {
    render(<Grupo inicial="" />);
    await userEvent.click(screen.getByRole("button", { name: "antes" }));
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Alfa" })).toHaveFocus();
  });

  it("las flechas recorren en ciclo y eligen; Home y End van a los extremos", async () => {
    const onCambio = vi.fn();
    render(<Grupo onCambio={onCambio} />);
    screen.getByRole("radio", { name: "Beta" }).focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Gama" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Gama" })).toHaveAttribute("aria-checked", "true");

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Alfa" })).toHaveFocus();

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Gama" })).toHaveFocus();

    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: "Alfa" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "Gama" })).toHaveFocus();

    expect(onCambio.mock.calls.map(([v]) => v)).toEqual(["c", "a", "c", "a", "c"]);
    expect(screen.getByRole("radio", { name: "Gama" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Alfa" })).toHaveAttribute("tabindex", "-1");
  });

  it("deshabilitado no elige", async () => {
    const onCambio = vi.fn();
    render(<GrupoDeOpciones etiqueta="Letra" opciones={OPCIONES} valor="a" onCambio={onCambio} disabled claseOpcion={() => ""} />);
    await userEvent.click(screen.getByRole("radio", { name: "Beta" }));
    expect(onCambio).not.toHaveBeenCalled();
  });
});

function ConPestanas() {
  const [activa, setActiva] = useState<"uno" | "dos" | "tres">("uno");
  return (
    <Pestanas
      etiqueta="Qué editar"
      pestanas={[
        ["uno", "Uno"],
        ["dos", "Dos"],
        ["tres", "Tres"],
      ]}
      activa={activa}
      onCambio={setActiva}
    >
      <p>Contenido de {activa}</p>
    </Pestanas>
  );
}

describe("Pestanas", () => {
  it("la pestaña activa controla un tabpanel que la nombra", () => {
    render(<ConPestanas />);
    const pestana = screen.getByRole("tab", { name: "Uno" });
    const panel = screen.getByRole("tabpanel", { name: "Uno" });
    expect(pestana).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveTextContent("Contenido de uno");
    // Los paneles inactivos no existen: nadie apunta a un id que no está.
    expect(screen.getByRole("tab", { name: "Dos" })).not.toHaveAttribute("aria-controls");
  });

  it("las flechas cambian de pestaña y mueven el foco", async () => {
    render(<ConPestanas />);
    screen.getByRole("tab", { name: "Uno" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Dos" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Dos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Contenido de dos");

    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Tres" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Uno" })).toHaveFocus();
  });

  it("es una sola parada de Tab, y el siguiente Tab entra al panel", async () => {
    render(<ConPestanas />);
    await userEvent.tab();
    expect(screen.getByRole("tab", { name: "Uno" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("tabpanel")).toHaveFocus();
  });
});
