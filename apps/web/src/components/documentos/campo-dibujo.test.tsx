import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { CampoDibujo as DefinicionDeDibujo, ValorDibujo } from "@dental-mirage/documentos-clinicos";
import { CampoDibujo } from "./campo-dibujo";

// El campo dibujo del formulario (Fase 5.6b): el resumen, la pantalla
// emergente con el lienzo y, sobre todo, que se GUARDA SOLO —cada trazo,
// Deshacer y Borrar todo avisan— y que cerrar (Listo, Escape, Cerrar o el
// fondo) no pierde nada. Lo que se prueba es el valor que sale.

const CAMPO: DefinicionDeDibujo = { tipo: "dibujo", id: "genograma", etiqueta: "Genograma" };

afterEach(() => vi.restoreAllMocks());

/** jsdom no mide: el lienzo queda sin ancho y cada píxel es una unidad del
 *  lienzo, desde la esquina. */
function lienzoSinMedidas() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    right: 0,
    bottom: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

function trazar(lienzo: HTMLElement, puntos: [number, number][]) {
  const [primero, ...resto] = puntos;
  fireEvent.pointerDown(lienzo, { clientX: primero[0], clientY: primero[1], pointerId: 1 });
  for (const [x, y] of resto) fireEvent.pointerMove(lienzo, { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(lienzo, { pointerId: 1 });
}

/** El campo con su valor vivo: lo que manda vuelve como prop, como en el
 *  editor (que guarda lo que recibe). */
function montarVivo(inicial?: ValorDibujo, proporcion = 2.5) {
  const onCambio = vi.fn();
  function Vivo() {
    const [valor, setValor] = useState<ValorDibujo | undefined>(inicial);
    return (
      <>
        <span id="genograma-etiqueta">Genograma</span>
        <CampoDibujo
          campo={CAMPO}
          valor={valor}
          proporcion={proporcion}
          id="genograma"
          etiquetaId="genograma-etiqueta"
          onCambio={(v) => {
            onCambio(v);
            setValor(v);
          }}
        />
      </>
    );
  }
  return { onCambio, ...render(<Vivo />) };
}

const abrir = () => screen.getByRole("button", { name: "Abrir genograma" });
const lienzo = () => screen.getByRole("application", { name: "Genograma" });
const ultimo = (onCambio: ReturnType<typeof vi.fn>) => onCambio.mock.lastCall?.[0] as ValorDibujo | undefined;
const DIBUJO: ValorDibujo = { ancho: 1000, alto: 400, trazos: [[[10, 10], [50, 50]], [[100, 100]]] };

describe("CampoDibujo: el resumen", () => {
  it("sin dibujo dice Sin dibujar, y el botón lleva el nombre del campo", () => {
    montarVivo();
    expect(screen.getByText("Sin dibujar")).toBeInTheDocument();
    expect(abrir()).toHaveAccessibleDescription("Sin dibujar");
    expect(screen.getByRole("group", { name: "Genograma" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("con trazos muestra la miniatura, un camino por trazo", () => {
    const { container } = montarVivo(DIBUJO);
    expect(screen.queryByText("Sin dibujar")).toBeNull();
    expect(abrir()).toHaveAccessibleDescription("Dibujado");
    const miniatura = container.querySelector("svg")!;
    expect(miniatura.getAttribute("viewBox")).toBe("0 0 1000 400");
    const caminos = miniatura.querySelectorAll("path");
    expect([...caminos].map((c) => c.getAttribute("d"))).toEqual(["M10 10 L50 50", "M100 100 l0.1 0"]);
  });

  it("un dibujo sin trazos o roto es Sin dibujar", () => {
    for (const valor of [{ ancho: 1000, alto: 400, trazos: [] }, { ancho: 1000, alto: 400, trazos: [[[5000, 1]]] }, "basura"]) {
      const { unmount } = render(
        <CampoDibujo campo={CAMPO} valor={valor} proporcion={2} id="g" etiquetaId="x" onCambio={vi.fn()} />,
      );
      expect(screen.getByText("Sin dibujar")).toBeInTheDocument();
      unmount();
    }
  });
});

describe("CampoDibujo: la pantalla emergente", () => {
  it("se abre con un lienzo de la proporción del recuadro, y el pie tiene solo Listo", async () => {
    const user = userEvent.setup();
    montarVivo(undefined, 2.5);
    await user.click(abrir());
    const dialogo = screen.getByRole("dialog", { name: "Genograma" });
    expect(dialogo).toHaveClass("max-w-4xl");
    expect(dialogo).toHaveAccessibleDescription(/Se guarda solo/);
    expect(lienzo().style.aspectRatio).toBe("1000 / 400");
    expect(screen.getByText("Dibujá acá con el dedo o el mouse")).toBeInTheDocument();
    // Ni Cancelar ni Guardar: lo dibujado ya está guardado.
    const listo = within(dialogo).getByRole("button", { name: "Listo" });
    expect(listo.parentElement!.querySelectorAll("button")).toHaveLength(1);
    expect(within(dialogo).queryByRole("button", { name: /Cancelar|Guardar/ })).toBeNull();
    // Sin trazos, Deshacer y Borrar todo están apagados.
    expect(within(dialogo).getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(within(dialogo).getByRole("button", { name: "Borrar todo" })).toBeDisabled();
  });

  it("dibujar con el puntero guarda cada trazo al levantar el dedo", async () => {
    lienzoSinMedidas();
    const user = userEvent.setup();
    const { onCambio } = montarVivo(undefined, 2.5);
    await user.click(abrir());
    trazar(lienzo(), [
      [10, 20],
      [30, 40],
      [60, 80],
    ]);
    expect(onCambio).toHaveBeenCalledTimes(1);
    expect(ultimo(onCambio)).toEqual({
      ancho: 1000,
      alto: 400,
      trazos: [
        [
          [10, 20],
          [30, 40],
          [60, 80],
        ],
      ],
    });
    trazar(lienzo(), [[500, 200]]);
    expect(onCambio).toHaveBeenCalledTimes(2);
    expect(ultimo(onCambio)!.trazos).toHaveLength(2);
    // El resumen ya muestra el dibujo, con el diálogo abierto.
    expect(screen.queryByText("Sin dibujar")).toBeNull();
    expect(screen.queryByText("Dibujá acá con el dedo o el mouse")).toBeNull();
  });

  it("Deshacer saca el último trazo y lo guarda; sin trazos manda undefined", async () => {
    lienzoSinMedidas();
    const user = userEvent.setup();
    const { onCambio } = montarVivo(undefined, 2);
    await user.click(abrir());
    trazar(lienzo(), [
      [1, 1],
      [9, 9],
    ]);
    trazar(lienzo(), [[50, 50]]);
    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(ultimo(onCambio)).toEqual({ ancho: 1000, alto: 500, trazos: [[[1, 1], [9, 9]]] });
    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(onCambio).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(screen.getByText("Sin dibujar")).toBeInTheDocument();
  });

  it("Borrar todo pregunta; Sí manda undefined y deja el foco en las herramientas", async () => {
    const user = userEvent.setup();
    const { onCambio } = montarVivo(DIBUJO);
    await user.click(abrir());
    const borrar = screen.getByRole("button", { name: "Borrar todo" });
    await user.click(borrar);
    const confirmar = screen.getByRole("group", { name: "Confirmar" });
    expect(within(confirmar).getByText("¿Borrar todo el dibujo?")).toBeInTheDocument();
    expect(within(confirmar).getByRole("button", { name: "No" })).toHaveFocus();
    // Deshacer sigue al lado, en la misma caja.
    const herramientas = borrar.parentElement!;
    expect(within(herramientas).getByRole("button", { name: "Deshacer" })).toBeInTheDocument();
    await user.click(within(confirmar).getByRole("button", { name: "Sí" }));
    expect(onCambio).toHaveBeenCalledTimes(1);
    expect(onCambio).toHaveBeenLastCalledWith(undefined);
    expect(herramientas).toHaveAttribute("tabindex", "-1");
    expect(herramientas).toHaveFocus();
    expect(borrar).toBeDisabled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Borrar todo, No: no toca nada y vuelve a Borrar todo", async () => {
    const user = userEvent.setup();
    const { onCambio } = montarVivo(DIBUJO);
    await user.click(abrir());
    const borrar = screen.getByRole("button", { name: "Borrar todo" });
    await user.click(borrar);
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(onCambio).not.toHaveBeenCalled();
    expect(borrar).toHaveFocus();
  });

  it("Escape cierra sin perder lo dibujado, y al volver a abrir sigue ahí", async () => {
    lienzoSinMedidas();
    const user = userEvent.setup();
    const { onCambio, container } = montarVivo(undefined, 2);
    await user.click(abrir());
    trazar(lienzo(), [
      [10, 10],
      [80, 40],
    ]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(abrir()).toHaveFocus();
    // Cerrar no avisa nada: lo que había ya estaba guardado.
    expect(onCambio).toHaveBeenCalledTimes(1);
    expect(container.querySelector("svg path")!.getAttribute("d")).toBe("M10 10 L80 40");
    await user.click(abrir());
    const dialogo = screen.getByRole("dialog");
    expect(dialogo.querySelectorAll("[role=application] path")).toHaveLength(1);
    expect(within(dialogo).getByRole("button", { name: "Deshacer" })).toBeEnabled();
  });

  it("Cerrar y un clic en el fondo también solo cierran", async () => {
    const user = userEvent.setup();
    const { onCambio } = montarVivo(DIBUJO);
    await user.click(abrir());
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(abrir());
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(abrir());
    await user.click(screen.getByRole("button", { name: "Listo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onCambio).not.toHaveBeenCalled();
    expect(screen.queryByText("Sin dibujar")).toBeNull();
  });

  it("un dibujo guardado se retoma con su propio lienzo, no con la proporción", async () => {
    const user = userEvent.setup();
    montarVivo({ ancho: 800, alto: 200, trazos: [[[1, 1]]] }, 2);
    await user.click(abrir());
    expect(lienzo().style.aspectRatio).toBe("800 / 200");
  });

  it("controlado desde afuera: abierto lo muestra y cerrar avisa con onAbierto", async () => {
    const user = userEvent.setup();
    const onAbierto = vi.fn();
    const props = { campo: CAMPO, valor: undefined, proporcion: 2, id: "g", etiquetaId: "x", onCambio: vi.fn(), onAbierto };
    const { rerender } = render(<CampoDibujo {...props} abierto={false} />);
    await user.click(abrir());
    expect(onAbierto).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<CampoDibujo {...props} abierto />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    });
    expect(onAbierto).toHaveBeenLastCalledWith(false);
  });
});
