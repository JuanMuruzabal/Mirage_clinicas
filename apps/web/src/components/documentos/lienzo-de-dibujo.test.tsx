import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LIENZO_MAXIMO, LIENZO_MINIMO, MAXIMO_DE_PUNTOS, MAXIMO_DE_TRAZOS, type Punto, type ValorDibujo } from "@dental-mirage/documentos-clinicos";
import { LienzoDeDibujo, lienzoPara } from "./lienzo-de-dibujo";

// El lienzo del dibujo (Fase 5.6b): 1000 unidades de ancho con la proporción
// del recuadro, los topes de la API, el paso mínimo entre puntos y la
// conversión del puntero a unidades del lienzo.

afterEach(() => vi.restoreAllMocks());

/** La caja del lienzo en pantalla: su rect, su ancho y alto sin borde y el
 *  borde de arriba y de la izquierda (jsdom no mide nada). */
function medir({ left = 0, top = 0, ancho = 0, alto = 0, borde = 0 }) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left,
    top,
    width: ancho + 2 * borde,
    height: alto + 2 * borde,
    right: left + ancho + 2 * borde,
    bottom: top + alto + 2 * borde,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(ancho);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(alto);
  vi.spyOn(Element.prototype, "clientLeft", "get").mockReturnValue(borde);
  vi.spyOn(Element.prototype, "clientTop", "get").mockReturnValue(borde);
}

function montar(inicial: ValorDibujo) {
  const onCambio = vi.fn();
  render(<LienzoDeDibujo inicial={inicial} onCambio={onCambio} etiqueta="Genograma" />);
  return { onCambio, lienzo: screen.getByRole("application", { name: "Genograma" }) };
}

const vacio = (ancho = 1000, alto = 500): ValorDibujo => ({ ancho, alto, trazos: [] });
const ultimo = (onCambio: ReturnType<typeof vi.fn>) => onCambio.mock.lastCall?.[0] as ValorDibujo;

describe("lienzoPara", () => {
  it("1000 de ancho y el alto de la proporción, redondeado", () => {
    expect(lienzoPara(2)).toEqual({ ancho: 1000, alto: 500 });
    expect(lienzoPara(261 / 98)).toEqual({ ancho: 1000, alto: 375 });
    expect(lienzoPara(3)).toEqual({ ancho: 1000, alto: 333 });
  });

  it("el alto queda dentro de los topes de la API", () => {
    expect(lienzoPara(100)).toEqual({ ancho: 1000, alto: LIENZO_MINIMO });
    expect(lienzoPara(0.1)).toEqual({ ancho: 1000, alto: LIENZO_MAXIMO });
    expect(lienzoPara(0.25)).toEqual({ ancho: 1000, alto: 4000 });
  });
});

describe("LienzoDeDibujo", () => {
  it("toma la proporción del dibujo, y no deja el dedo mover la página", () => {
    const { lienzo } = montar(vacio(1000, 375));
    expect(lienzo.style.aspectRatio).toBe("1000 / 375");
    expect(lienzo.style.touchAction).toBe("none");
    expect(lienzo.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 1000 375");
  });

  it("lleva el puntero a unidades del lienzo, sin el borde de la caja", () => {
    // 500 × 250 en pantalla para un lienzo de 1000 × 500: escala 2. Caja en
    // (10, 20) con un borde de 1.
    medir({ left: 10, top: 20, ancho: 500, alto: 250, borde: 1 });
    const { onCambio, lienzo } = montar(vacio());
    fireEvent.pointerDown(lienzo, { clientX: 111, clientY: 71, pointerId: 1 });
    fireEvent.pointerMove(lienzo, { clientX: 11.123, clientY: 21, pointerId: 1 });
    fireEvent.pointerUp(lienzo, { pointerId: 1 });
    expect(ultimo(onCambio).trazos).toEqual([
      [
        [200, 100],
        [0.25, 0],
      ],
    ]);
  });

  it("un punto fuera de la caja queda en el borde del lienzo", () => {
    medir({ ancho: 1000, alto: 500 });
    const { onCambio, lienzo } = montar(vacio());
    fireEvent.pointerDown(lienzo, { clientX: -30, clientY: 900, pointerId: 1 });
    fireEvent.pointerMove(lienzo, { clientX: 1500, clientY: -5, pointerId: 1 });
    fireEvent.pointerUp(lienzo, { pointerId: 1 });
    expect(ultimo(onCambio).trazos).toEqual([
      [
        [0, 500],
        [1000, 0],
      ],
    ]);
  });

  it("menos de 1 unidad desde el punto anterior no suma un punto; 1 o más, sí", () => {
    medir({ ancho: 1000, alto: 500 });
    const { onCambio, lienzo } = montar(vacio());
    fireEvent.pointerDown(lienzo, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(lienzo, { clientX: 100.5, clientY: 100.5, pointerId: 1 }); // 0,71
    fireEvent.pointerMove(lienzo, { clientX: 100.99, clientY: 100, pointerId: 1 }); // 0,99
    fireEvent.pointerMove(lienzo, { clientX: 101, clientY: 100, pointerId: 1 }); // 1
    fireEvent.pointerMove(lienzo, { clientX: 101.5, clientY: 101, pointerId: 1 }); // 1,12
    fireEvent.pointerUp(lienzo, { pointerId: 1 });
    expect(ultimo(onCambio).trazos).toEqual([
      [
        [100, 100],
        [101, 100],
        [101.5, 101],
      ],
    ]);
  });

  it("mover sin apretar no dibuja, y soltar sin haber apretado no avisa", () => {
    medir({ ancho: 1000, alto: 500 });
    const { onCambio, lienzo } = montar(vacio());
    fireEvent.pointerMove(lienzo, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(lienzo, { pointerId: 1 });
    expect(onCambio).not.toHaveBeenCalled();
    expect(lienzo.querySelectorAll("path")).toHaveLength(0);
  });

  it("salir del lienzo o cancelar el puntero cierran el trazo", () => {
    medir({ ancho: 1000, alto: 500 });
    const { onCambio, lienzo } = montar(vacio());
    fireEvent.pointerDown(lienzo, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerLeave(lienzo, { pointerId: 1 });
    fireEvent.pointerDown(lienzo, { clientX: 20, clientY: 20, pointerId: 2 });
    fireEvent.pointerCancel(lienzo, { pointerId: 2 });
    expect(onCambio).toHaveBeenCalledTimes(2);
    expect(ultimo(onCambio).trazos).toEqual([[[10, 10]], [[20, 20]]]);
    // Ya cerrado, mover no suma nada.
    fireEvent.pointerMove(lienzo, { clientX: 300, clientY: 300, pointerId: 2 });
    expect(lienzo.querySelectorAll("path")).toHaveLength(2);
  });

  it("con 300 trazos no empieza otro", () => {
    medir({ ancho: 1000, alto: 500 });
    const trazos: Punto[][] = Array.from({ length: MAXIMO_DE_TRAZOS }, () => [[1, 1]]);
    const { onCambio, lienzo } = montar({ ...vacio(), trazos });
    fireEvent.pointerDown(lienzo, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(lienzo, { pointerId: 1 });
    expect(onCambio).not.toHaveBeenCalled();
    expect(lienzo.querySelectorAll("path")).toHaveLength(MAXIMO_DE_TRAZOS);
  });

  it("con 299 trazos todavía empieza uno, el último", () => {
    medir({ ancho: 1000, alto: 500 });
    const trazos: Punto[][] = Array.from({ length: MAXIMO_DE_TRAZOS - 1 }, () => [[1, 1]]);
    const { onCambio, lienzo } = montar({ ...vacio(), trazos });
    fireEvent.pointerDown(lienzo, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(lienzo, { pointerId: 1 });
    expect(ultimo(onCambio).trazos).toHaveLength(MAXIMO_DE_TRAZOS);
  });

  it("con 20.000 puntos no empieza otro trazo, y en el tope deja de sumar puntos", () => {
    medir({ ancho: 1000, alto: 500 });
    const lleno: Punto[] = Array.from({ length: MAXIMO_DE_PUNTOS }, () => [1, 1]);
    const { onCambio, lienzo } = montar({ ...vacio(), trazos: [lleno] });
    fireEvent.pointerDown(lienzo, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(lienzo, { pointerId: 1 });
    expect(onCambio).not.toHaveBeenCalled();
  });

  it("a un punto del tope, el trazo nuevo tiene un solo punto y lo que sigue no suma", () => {
    medir({ ancho: 1000, alto: 500 });
    const casiLleno: Punto[] = Array.from({ length: MAXIMO_DE_PUNTOS - 1 }, () => [1, 1]);
    const { onCambio, lienzo } = montar({ ...vacio(), trazos: [casiLleno] });
    fireEvent.pointerDown(lienzo, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(lienzo, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(lienzo, { clientX: 90, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(lienzo, { pointerId: 1 });
    const { trazos } = ultimo(onCambio);
    expect(trazos).toHaveLength(2);
    expect(trazos[1]).toEqual([[10, 10]]);
    expect(trazos.reduce((n, t) => n + t.length, 0)).toBe(MAXIMO_DE_PUNTOS);
  });

  it("el tamaño del lienzo se fija al abrir: un `inicial` nuevo no lo cambia", () => {
    medir({ ancho: 1000, alto: 500 });
    const onCambio = vi.fn();
    const { rerender } = render(<LienzoDeDibujo inicial={vacio(1000, 500)} onCambio={onCambio} etiqueta="Genograma" />);
    rerender(<LienzoDeDibujo inicial={vacio(1000, 200)} onCambio={onCambio} etiqueta="Genograma" />);
    const lienzo = screen.getByRole("application");
    expect(lienzo.style.aspectRatio).toBe("1000 / 500");
    fireEvent.pointerDown(lienzo, { clientX: 1, clientY: 1, pointerId: 1 });
    fireEvent.pointerUp(lienzo, { pointerId: 1 });
    expect(ultimo(onCambio)).toMatchObject({ ancho: 1000, alto: 500 });
  });

  it("dibuja un camino por trazo, con un toque como un punto", () => {
    const { lienzo } = montar({ ...vacio(), trazos: [[[1, 2], [3, 4]], [[5, 6]]] });
    expect([...lienzo.querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual(["M1 2 L3 4", "M5 6 l0.1 0"]);
    expect(screen.queryByText("Dibujá acá con el dedo o el mouse")).toBeNull();
  });

  it("Deshacer y Borrar todo van juntos, con Sí y No del mismo tamaño", () => {
    const { onCambio } = montar({ ...vacio(), trazos: [[[1, 2]]] });
    const deshacer = screen.getByRole("button", { name: "Deshacer" });
    const borrar = screen.getByRole("button", { name: "Borrar todo" });
    expect(deshacer.parentElement).toBe(borrar.parentElement);
    fireEvent.click(borrar);
    const si = screen.getByRole("button", { name: "Sí" });
    const no = screen.getByRole("button", { name: "No" });
    for (const boton of [si, no]) expect(boton).toHaveClass("min-h-11", "min-w-16");
    fireEvent.click(no);
    fireEvent.click(deshacer);
    expect(onCambio).toHaveBeenLastCalledWith({ ancho: 1000, alto: 500, trazos: [] });
  });
});
