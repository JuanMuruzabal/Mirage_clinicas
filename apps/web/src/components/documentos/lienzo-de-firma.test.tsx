import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LienzoDeFirma, PUNTOS_MINIMOS } from "./lienzo-de-firma";

// jsdom no mide nada: el lienzo mide 300 × 180 desde la esquina.
function lienzoDe300() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 300.4,
    height: 180,
    right: 300.4,
    bottom: 180,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

function dibujar(lienzo: HTMLElement, puntos: number) {
  fireEvent.pointerDown(lienzo, { clientX: 10, clientY: 20, pointerId: 1 });
  for (let i = 1; i < puntos; i++) fireEvent.pointerMove(lienzo, { clientX: 10 + i * 7, clientY: 20 + (i % 5), pointerId: 1 });
  fireEvent.pointerUp(lienzo, { pointerId: 1 });
}

afterEach(() => vi.restoreAllMocks());

describe("LienzoDeFirma", () => {
  it("una firma completa llega como vectores; el lienzo se declara redondeado hacia arriba", () => {
    lienzoDe300();
    const onCambio = vi.fn();
    render(<LienzoDeFirma etiqueta="Lienzo" onCambio={onCambio} />);
    const lienzo = screen.getByRole("application", { name: "Lienzo" });
    expect(screen.getByText("Firmá acá con el dedo o el mouse")).toBeInTheDocument();

    dibujar(lienzo, PUNTOS_MINIMOS + 2);
    const trazo = onCambio.mock.lastCall?.[0];
    expect(trazo).not.toBeNull();
    expect(trazo.ancho).toBe(301);
    expect(trazo.alto).toBe(180);
    expect(trazo.trazos).toHaveLength(1);
    expect(trazo.trazos[0].length).toBe(PUNTOS_MINIMOS + 2);
    expect(trazo.trazos[0][0]).toEqual([10, 20, expect.any(Number)]);
    expect(screen.queryByText("Firmá acá con el dedo o el mouse")).not.toBeInTheDocument();
  });

  it("una firma de un par de puntos no cuenta", () => {
    lienzoDe300();
    const onCambio = vi.fn();
    render(<LienzoDeFirma etiqueta="Lienzo" onCambio={onCambio} />);
    dibujar(screen.getByRole("application"), 3);
    expect(onCambio).toHaveBeenLastCalledWith(null);
  });

  it("mover sin apretar no dibuja, y un punto repetido no suma", () => {
    lienzoDe300();
    const onCambio = vi.fn();
    render(<LienzoDeFirma etiqueta="Lienzo" onCambio={onCambio} />);
    const lienzo = screen.getByRole("application");
    fireEvent.pointerMove(lienzo, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(lienzo);
    expect(onCambio).not.toHaveBeenCalled();
    fireEvent.pointerDown(lienzo, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(lienzo, { clientX: 10, clientY: 10 });
    fireEvent.pointerLeave(lienzo);
    expect(onCambio).toHaveBeenLastCalledWith(null);
  });

  it("borrar deja el lienzo vacío y avisa", async () => {
    lienzoDe300();
    const onCambio = vi.fn();
    render(<LienzoDeFirma etiqueta="Lienzo" onCambio={onCambio} />);
    const borrar = screen.getByRole("button", { name: "Borrar y volver a firmar" });
    expect(borrar).toBeDisabled();
    dibujar(screen.getByRole("application"), PUNTOS_MINIMOS);
    await userEvent.click(borrar);
    expect(onCambio).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("Firmá acá con el dedo o el mouse")).toBeInTheDocument();
  });
});
