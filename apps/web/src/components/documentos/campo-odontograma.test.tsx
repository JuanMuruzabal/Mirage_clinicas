import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { estaVacio, type Campo, type ValorOdontograma } from "@dental-mirage/documentos-clinicos";
import { CampoOdontograma } from "./campo-odontograma";

// El odontograma del editor (Fase 5.5, TR-192): lo que se prueba es el
// VALOR que sale (el contrato, §2), no cómo se dibuja. Las piezas son
// botones "Pieza 16"; color y herramienta, dos grupos de opciones.

type CampoDeOdontograma = { denticion?: "permanente" | "temporaria" | "ambas"; leyenda: "general" | "pediatrica"; existentes?: boolean };

const GENERAL: CampoDeOdontograma = { leyenda: "general", existentes: true };
const PEDIATRICO: CampoDeOdontograma = { leyenda: "pediatrica", denticion: "temporaria" };

function montar(campo: CampoDeOdontograma, valor?: ValorOdontograma) {
  const onCambio = vi.fn();
  const utils = render(
    <>
      <span id="etiqueta-odonto">Odontograma</span>
      <CampoOdontograma campo={campo} valor={valor} onCambio={onCambio} idFoco="campo-odonto" etiquetaId="etiqueta-odonto" />
    </>,
  );
  return { onCambio, ...utils };
}

/** Lo último que mandó el campo. */
const ultimo = (onCambio: ReturnType<typeof vi.fn>) => onCambio.mock.lastCall?.[0] as ValorOdontograma | undefined;

const pieza = (n: string) => screen.getByRole("button", { name: `Pieza ${n}` });

function elegirColor(nombre: RegExp) {
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Color" })).getByRole("radio", { name: nombre }));
}

function elegirHerramienta(nombre: string | RegExp) {
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Herramienta" })).getByRole("radio", { name: nombre }));
}

/** Pintar una cara por el camino accesible: tocar la pieza abre la lista
 *  de sus caras con nombre, y se elige una. */
function tocarCara(n: string, cara: RegExp) {
  fireEvent.click(pieza(n));
  fireEvent.click(within(screen.getByRole("group", { name: `Caras de la pieza ${n}` })).getByRole("button", { name: cara }));
}

const CAMPO_PARA_VACIO = { tipo: "odontograma", id: "odonto", etiqueta: "Odontograma", leyenda: "general" } as Campo;

describe("CampoOdontograma", () => {
  it("dibuja una pieza por diente de la dentición, con su nombre", () => {
    montar(GENERAL);
    expect(screen.getAllByRole("button", { name: /^Pieza \d\d$/ })).toHaveLength(52);
    expect(pieza("18")).toBeInTheDocument();
    expect(pieza("75")).toBeInTheDocument();
  });

  it("una dentición temporaria tiene solo las 20 temporarias", () => {
    montar(PEDIATRICO);
    expect(screen.getAllByRole("button", { name: /^Pieza \d\d$/ })).toHaveLength(20);
    expect(screen.queryByRole("button", { name: "Pieza 16" })).toBeNull();
  });

  it("pinta una cara con el color elegido, y la nombra según la pieza", () => {
    const { onCambio } = montar(GENERAL);
    tocarCara("16", /palatina/i);
    expect(ultimo(onCambio)).toEqual({ piezas: { "16": { caras: { L: "rojo" } } } });
  });

  it("en una inferior la L es lingual, y en una anterior la O es incisal", () => {
    montar(GENERAL);
    fireEvent.click(pieza("46"));
    const caras46 = screen.getByRole("group", { name: "Caras de la pieza 46" });
    expect(within(caras46).getByRole("button", { name: /lingual/i })).toBeInTheDocument();
    expect(within(caras46).getByRole("button", { name: /oclusal/i })).toBeInTheDocument();
    fireEvent.click(pieza("11"));
    expect(within(screen.getByRole("group", { name: "Caras de la pieza 11" })).getByRole("button", { name: /incisal/i })).toBeInTheDocument();
  });

  it("tocar una cara en el dibujo la pinta directamente", () => {
    const { onCambio } = montar(GENERAL);
    const cara = pieza("26").querySelector("[data-cara='O']");
    expect(cara).not.toBeNull();
    fireEvent.click(cara!);
    expect(ultimo(onCambio)).toEqual({ piezas: { "26": { caras: { O: "rojo" } } } });
  });

  it("la misma cara con el mismo color se despinta; con el otro color, cambia", () => {
    const valor: ValorOdontograma = { piezas: { "16": { caras: { O: "rojo" } } } };
    const { onCambio, unmount } = montar(GENERAL, valor);
    tocarCara("16", /oclusal/i);
    const despintado = ultimo(onCambio);
    expect(despintado?.piezas?.["16"]?.caras?.O).toBeUndefined();
    // Sin nada más, el odontograma queda vacío.
    expect(estaVacio(CAMPO_PARA_VACIO, despintado)).toBe(true);
    unmount();

    const otro = montar(GENERAL, valor);
    elegirColor(/azul/i);
    tocarCara("16", /oclusal/i);
    expect(ultimo(otro.onCambio)).toEqual({ piezas: { "16": { caras: { O: "azul" } } } });
  });

  it("pintar una cara no toca las demás ni las otras piezas", () => {
    const { onCambio } = montar(GENERAL, { piezas: { "16": { caras: { O: "rojo" }, marcas: { corona: "rojo" } }, "36": { caras: { D: "azul" } } }, existentes: 30 });
    elegirColor(/azul/i);
    tocarCara("16", /mesial/i);
    expect(ultimo(onCambio)).toEqual({
      piezas: { "16": { caras: { O: "rojo", M: "azul" }, marcas: { corona: "rojo" } }, "36": { caras: { D: "azul" } } },
      existentes: 30,
    });
  });

  it("marca y desmarca la pieza con la herramienta elegida", () => {
    const { onCambio, unmount } = montar(GENERAL);
    elegirHerramienta(/^X/);
    fireEvent.click(pieza("26"));
    expect(ultimo(onCambio)).toEqual({ piezas: { "26": { marcas: { x: "rojo" } } } });
    unmount();

    const marcada = montar(GENERAL, { piezas: { "26": { marcas: { x: "rojo" } } } });
    elegirHerramienta(/^X/);
    fireEvent.click(pieza("26"));
    expect(estaVacio(CAMPO_PARA_VACIO, ultimo(marcada.onCambio))).toBe(true);
  });

  it("una corona en azul", () => {
    const { onCambio } = montar(GENERAL);
    elegirColor(/azul/i);
    elegirHerramienta(/corona/i);
    fireEvent.click(pieza("21"));
    expect(ultimo(onCambio)).toEqual({ piezas: { "21": { marcas: { corona: "azul" } } } });
  });

  it("cada leyenda ofrece sus herramientas: la general, prótesis; la pediátrica, sellador y T", () => {
    const { unmount } = montar(GENERAL);
    const general = within(screen.getByRole("radiogroup", { name: "Herramienta" }));
    expect(general.getByRole("radio", { name: /^X/ })).toBeInTheDocument();
    expect(general.getByRole("radio", { name: /corona/i })).toBeInTheDocument();
    expect(general.getByRole("radio", { name: /prótesis fija/i })).toBeInTheDocument();
    expect(general.getByRole("radio", { name: /prótesis removible/i })).toBeInTheDocument();
    expect(general.queryByRole("radio", { name: /sellador/i })).toBeNull();
    expect(general.queryByRole("radio", { name: /^T$/ })).toBeNull();
    unmount();

    montar(PEDIATRICO);
    const pediatrica = within(screen.getByRole("radiogroup", { name: "Herramienta" }));
    expect(pediatrica.getByRole("radio", { name: /sellador/i })).toBeInTheDocument();
    expect(pediatrica.getByRole("radio", { name: /^T$/ })).toBeInTheDocument();
    expect(pediatrica.queryByRole("radio", { name: /prótesis/i })).toBeNull();
  });

  it("la pediátrica marca sellador y traumatizado", () => {
    const { onCambio } = montar(PEDIATRICO, { piezas: { "55": { marcas: { sellador: "azul" } } } });
    elegirHerramienta(/^T$/);
    fireEvent.click(pieza("61"));
    expect(ultimo(onCambio)).toEqual({ piezas: { "55": { marcas: { sellador: "azul" } }, "61": { marcas: { traumatizado: "rojo" } } } });
  });

  it("los colores se nombran con los rótulos de cada leyenda", () => {
    const { unmount } = montar(GENERAL);
    expect(screen.getByRole("radio", { name: /prestaciones existentes/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /prestaciones requeridas/i })).toBeInTheDocument();
    unmount();
    montar(PEDIATRICO);
    expect(screen.getByRole("radio", { name: /trabajos realizados/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /trabajos a realizar/i })).toBeInTheDocument();
  });

  describe("las prótesis", () => {
    it("un tramo se marca con dos toques en la misma fila", () => {
      const { onCambio } = montar(GENERAL);
      elegirHerramienta(/prótesis fija/i);
      fireEvent.click(pieza("23"));
      expect(onCambio).not.toHaveBeenCalled();
      fireEvent.click(pieza("13"));
      const valor = ultimo(onCambio);
      expect(valor?.protesis).toHaveLength(1);
      const [tramo] = valor!.protesis!;
      expect(tramo).toMatchObject({ tipo: "fija", color: "rojo" });
      expect([tramo.desde, tramo.hasta].sort()).toEqual(["13", "23"]);
    });

    it("entre filas distintas avisa y no marca nada; la pieza siguiente de la fila lo cierra", () => {
      const { onCambio } = montar(GENERAL);
      elegirHerramienta(/prótesis removible/i);
      fireEvent.click(pieza("13"));
      fireEvent.click(pieza("43"));
      expect(onCambio).not.toHaveBeenCalled();
      expect(screen.getByText(/misma fila/i)).toBeInTheDocument();
      fireEvent.click(pieza("11"));
      expect(ultimo(onCambio)?.protesis?.[0]).toMatchObject({ tipo: "removible", color: "rojo" });
    });

    it("tocar de nuevo la primera pieza cancela el tramo", () => {
      const { onCambio } = montar(GENERAL);
      elegirHerramienta(/prótesis fija/i);
      fireEvent.click(pieza("13"));
      fireEvent.click(pieza("13"));
      expect(onCambio).not.toHaveBeenCalled();
    });

    it("con el color elegido: una prótesis azul es la que hay que hacer", () => {
      const { onCambio } = montar(GENERAL);
      elegirColor(/azul/i);
      elegirHerramienta(/prótesis fija/i);
      fireEvent.click(pieza("34"));
      fireEvent.click(pieza("36"));
      expect(ultimo(onCambio)?.protesis?.[0]).toMatchObject({ tipo: "fija", color: "azul" });
    });

    it("con 16 prótesis marcadas avisa y no suma la 17", () => {
      const otras = ["17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
      const protesis = [
        ...otras.map((hasta) => ({ tipo: "fija" as const, desde: "18", hasta, color: "rojo" as const })),
        { tipo: "removible" as const, desde: "18", hasta: "17", color: "rojo" as const },
      ];
      expect(protesis).toHaveLength(16);
      const { onCambio } = montar(GENERAL, { protesis });
      elegirHerramienta(/prótesis removible/i);
      fireEvent.click(pieza("36"));
      fireEvent.click(pieza("34"));
      expect(onCambio).not.toHaveBeenCalled();
      expect(screen.getByText("Hay 16 prótesis marcadas: quitá una para sumar otra.")).toBeInTheDocument();
    });

    it("con 16 marcadas, rehacer una existente con otro color sí se puede (la reemplaza)", () => {
      const otras = ["17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28", "38"];
      const protesis = otras.slice(0, 15).map((hasta) => ({ tipo: "fija" as const, desde: "18", hasta, color: "rojo" as const }));
      protesis.push({ tipo: "fija", desde: "48", hasta: "46", color: "rojo" });
      const { onCambio } = montar(GENERAL, { protesis });
      elegirColor(/azul/i);
      elegirHerramienta(/prótesis fija/i);
      fireEvent.click(pieza("46"));
      fireEvent.click(pieza("48"));
      const valor = ultimo(onCambio);
      expect(valor?.protesis).toHaveLength(16);
      expect(valor?.protesis?.at(-1)).toMatchObject({ color: "azul" });
    });

    it("un tramo se quita de la lista", () => {
      const { onCambio } = montar(GENERAL, {
        protesis: [
          { tipo: "fija", desde: "23", hasta: "13", color: "rojo" },
          { tipo: "removible", desde: "33", hasta: "36", color: "azul" },
        ],
      });
      fireEvent.click(screen.getByRole("button", { name: /^Quitar: Prótesis fija/ }));
      expect(ultimo(onCambio)).toEqual({ protesis: [{ tipo: "removible", desde: "33", hasta: "36", color: "azul" }] });
    });
  });

  describe("el teclado", () => {
    it("las piezas son una sola parada de Tab y las flechas las recorren", async () => {
      const user = userEvent.setup();
      montar(GENERAL);
      const conTab = screen.getAllByRole("button", { name: /^Pieza \d\d$/ }).filter((b) => b.tabIndex === 0);
      expect(conTab).toHaveLength(1);
      act(() => pieza("18").focus());
      await user.keyboard("{ArrowRight}");
      expect(pieza("17")).toHaveFocus();
      await user.keyboard("{ArrowLeft}");
      expect(pieza("18")).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(pieza("48")).toHaveFocus();
      await user.keyboard("{ArrowUp}");
      expect(pieza("18")).toHaveFocus();
    });

    it("Inicio y Fin van a los extremos de la fila", async () => {
      const user = userEvent.setup();
      montar(GENERAL);
      act(() => pieza("13").focus());
      await user.keyboard("{End}");
      expect(pieza("28")).toHaveFocus();
      await user.keyboard("{Home}");
      expect(pieza("18")).toHaveFocus();
      await user.keyboard("{ArrowDown}{End}");
      expect(pieza("38")).toHaveFocus();
    });

    it("Enter abre las caras, se elige una, y Escape vuelve a la pieza", async () => {
      const user = userEvent.setup();
      const { onCambio } = montar(GENERAL);
      act(() => pieza("18").focus());
      await user.keyboard("{ArrowRight}{Enter}");
      const caras = screen.getByRole("group", { name: "Caras de la pieza 17" });
      expect(within(caras).getAllByRole("button")[0]).toHaveFocus();
      await user.click(within(caras).getByRole("button", { name: /vestibular/i }));
      expect(ultimo(onCambio)).toEqual({ piezas: { "17": { caras: { V: "rojo" } } } });
      act(() => within(caras).getAllByRole("button")[0].focus());
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("group", { name: "Caras de la pieza 17" })).toBeNull();
      expect(pieza("17")).toHaveFocus();
    });

    it("con una marca, Enter marca la pieza", async () => {
      const user = userEvent.setup();
      const { onCambio } = montar(GENERAL);
      elegirHerramienta(/corona/i);
      act(() => pieza("18").focus());
      await user.keyboard("{Enter}");
      expect(ultimo(onCambio)).toEqual({ piezas: { "18": { marcas: { corona: "rojo" } } } });
    });
  });

  describe("los dientes existentes", () => {
    it("se sugieren (32 menos las permanentes con X) y Usar los carga", () => {
      const valor: ValorOdontograma = { piezas: { "18": { marcas: { x: "rojo" } }, "28": { marcas: { x: "azul" } } } };
      const { onCambio } = montar(GENERAL, valor);
      expect(screen.getByText(/30/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Usar" }));
      expect(ultimo(onCambio)).toEqual({ ...valor, existentes: 30 });
    });

    it("se corrigen a mano, y vaciar el número los saca", () => {
      const { onCambio } = montar(GENERAL, { existentes: 28 });
      const numero = screen.getByLabelText(/dientes existentes/i);
      fireEvent.change(numero, { target: { value: "27" } });
      expect(ultimo(onCambio)).toEqual({ existentes: 27 });
      fireEvent.change(numero, { target: { value: "" } });
      expect(estaVacio(CAMPO_PARA_VACIO, ultimo(onCambio))).toBe(true);
    });

    it("un campo que no los pide no los muestra", () => {
      montar(PEDIATRICO);
      expect(screen.queryByLabelText(/dientes existentes/i)).toBeNull();
      expect(screen.queryByRole("button", { name: "Usar" })).toBeNull();
    });
  });
});
