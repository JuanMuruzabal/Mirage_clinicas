import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FiltrosSheet } from "./filtros-sheet";

describe("FiltrosSheet", () => {
  it("muestra el botón disparador sin abrir la hoja todavía", () => {
    render(
      <FiltrosSheet activo={false} aplicarLabel="Ver 5 turnos" onAplicar={vi.fn()}>
        <p>Contenido</p>
      </FiltrosSheet>,
    );
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el disparador tiene fondo claro con un ícono de filtro", () => {
    render(
      <FiltrosSheet activo={false} aplicarLabel="Ver 5 turnos" onAplicar={vi.fn()}>
        <p>Contenido</p>
      </FiltrosSheet>,
    );
    const boton = screen.getByRole("button", { name: "Filtros" });
    expect(boton).toHaveClass("bg-marfil");
    expect(boton.querySelector("svg")).toBeInTheDocument();
  });

  it("con activo=true, el disparador suma el punto indicador de filtro aplicado", () => {
    const { container } = render(
      <FiltrosSheet activo={true} aplicarLabel="Ver 5 turnos" onAplicar={vi.fn()}>
        <p>Contenido</p>
      </FiltrosSheet>,
    );
    expect(container.querySelector('span[aria-hidden="true"].bg-salvia-oscuro')).toBeInTheDocument();
  });

  it("sin activo, no muestra el punto indicador", () => {
    const { container } = render(
      <FiltrosSheet activo={false} aplicarLabel="Ver 5 turnos" onAplicar={vi.fn()}>
        <p>Contenido</p>
      </FiltrosSheet>,
    );
    expect(container.querySelector('span[aria-hidden="true"].bg-salvia-oscuro')).not.toBeInTheDocument();
  });

  it("al tocar el disparador, llama a onAbrir y abre la hoja con el contenido", async () => {
    const onAbrir = vi.fn();
    const user = userEvent.setup();
    render(
      <FiltrosSheet activo={false} aplicarLabel="Ver 5 turnos" onAplicar={vi.fn()} onAbrir={onAbrir}>
        <p>Campo de tipo de consulta</p>
      </FiltrosSheet>,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));

    expect(onAbrir).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Filtros" })).toBeInTheDocument();
    expect(screen.getByText("Campo de tipo de consulta")).toBeInTheDocument();
  });

  it("tocar el botón de aplicar llama a onAplicar y cierra la hoja", async () => {
    const onAplicar = vi.fn();
    const user = userEvent.setup();
    render(
      <FiltrosSheet activo={false} aplicarLabel="Ver 7 turnos" onAplicar={onAplicar}>
        <p>Contenido</p>
      </FiltrosSheet>,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("button", { name: "Ver 7 turnos" }));

    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin onLimpiar, no muestra el link 'Limpiar filtros'", async () => {
    const user = userEvent.setup();
    render(
      <FiltrosSheet activo={false} aplicarLabel="Ver 5 turnos" onAplicar={vi.fn()}>
        <p>Contenido</p>
      </FiltrosSheet>,
    );
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument();
  });

  it("con onLimpiar, tocarlo lo llama y NO cierra la hoja", async () => {
    const onLimpiar = vi.fn();
    const user = userEvent.setup();
    render(
      <FiltrosSheet activo={true} aplicarLabel="Ver 5 turnos" onAplicar={vi.fn()} onLimpiar={onLimpiar}>
        <p>Contenido</p>
      </FiltrosSheet>,
    );
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect(onLimpiar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cierra al tocar la X", async () => {
    const user = userEvent.setup();
    render(
      <FiltrosSheet activo={false} aplicarLabel="Ver 5 turnos" onAplicar={vi.fn()}>
        <p>Contenido</p>
      </FiltrosSheet>,
    );
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cierra al tocar el fondo", async () => {
    const user = userEvent.setup();
    render(
      <FiltrosSheet activo={false} aplicarLabel="Ver 5 turnos" onAplicar={vi.fn()}>
        <p>Contenido</p>
      </FiltrosSheet>,
    );
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("acepta un triggerLabel propio", () => {
    render(
      <FiltrosSheet activo={false} aplicarLabel="Ver 5 turnos" onAplicar={vi.fn()} triggerLabel="Filtrar historial">
        <p>Contenido</p>
      </FiltrosSheet>,
    );
    expect(screen.getByRole("button", { name: "Filtrar historial" })).toBeInTheDocument();
  });
});
