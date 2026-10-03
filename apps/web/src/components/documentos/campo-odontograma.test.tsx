import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { estaVacio, type Campo, type ValorOdontograma } from "@dental-mirage/documentos-clinicos";
import { useState } from "react";
import { CampoOdontograma, ControlDeOdontograma } from "./campo-odontograma";

// El odontograma del editor (Fase 5.5, TR-192): lo que se prueba es el
// VALOR que sale (el contrato, §2), no cómo se dibuja. Las piezas son
// botones "Pieza 16"; color y herramienta, dos grupos de opciones. Es el
// control que va adentro de la pantalla emergente.

type CampoDeOdontograma = { denticion?: "permanente" | "temporaria" | "ambas"; leyenda: "general" | "pediatrica"; existentes?: boolean };

const GENERAL: CampoDeOdontograma = { leyenda: "general", existentes: true };
const PEDIATRICO: CampoDeOdontograma = { leyenda: "pediatrica", denticion: "temporaria" };

function montar(campo: CampoDeOdontograma, valor?: ValorOdontograma) {
  const onCambio = vi.fn();
  const utils = render(
    <>
      <span id="etiqueta-odonto">Odontograma</span>
      <ControlDeOdontograma campo={campo} valor={valor} onCambio={onCambio} />
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

/** Pintar una cara: tocar la pieza la selecciona y el panel la muestra
 *  grande, con sus caras con nombre, y se elige una. */
function tocarCara(n: string, cara: RegExp) {
  fireEvent.click(pieza(n));
  fireEvent.click(within(screen.getByRole("group", { name: `Caras de la pieza ${n}` })).getByRole("button", { name: cara }));
}

/** Poner o sacar la marca de la herramienta elegida: tocar la pieza la
 *  selecciona, y el botón del panel lo hace. */
function marcar(n: string) {
  fireEvent.click(pieza(n));
  fireEvent.click(screen.getByRole("button", { name: /^(Marcar|Sacar) / }));
}

/** Una prótesis por el diagrama, con sus tres pasos: tocar el inicio y
 *  Empezar, tocar el fin y Terminar, y Guardar. */
function armarProtesis(desde: string, hasta: string) {
  fireEvent.click(pieza(desde));
  fireEvent.click(screen.getByRole("button", { name: `Empezar en la pieza ${desde}` }));
  fireEvent.click(pieza(hasta));
  fireEvent.click(screen.getByRole("button", { name: `Terminar en la pieza ${hasta}` }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
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

  it("tocar la pieza en el dibujo la selecciona, sin pintar nada", () => {
    const { onCambio } = montar(GENERAL);
    fireEvent.click(pieza("26"));
    expect(screen.getByRole("group", { name: "Caras de la pieza 26" })).toBeInTheDocument();
    expect(onCambio).not.toHaveBeenCalled();
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
    marcar("26");
    expect(ultimo(onCambio)).toEqual({ piezas: { "26": { marcas: { x: "rojo" } } } });
    unmount();

    const marcada = montar(GENERAL, { piezas: { "26": { marcas: { x: "rojo" } } } });
    elegirHerramienta(/^X/);
    marcar("26");
    expect(estaVacio(CAMPO_PARA_VACIO, ultimo(marcada.onCambio))).toBe(true);
  });

  it("una corona en azul", () => {
    const { onCambio } = montar(GENERAL);
    elegirColor(/azul/i);
    elegirHerramienta(/corona/i);
    marcar("21");
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
    marcar("61");
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
    it("un tramo se marca con Empezar, Terminar y Guardar en la misma fila; dos toques solos no lo arman", () => {
      const { onCambio } = montar(GENERAL);
      elegirHerramienta(/prótesis fija/i);
      fireEvent.click(pieza("23"));
      fireEvent.click(pieza("13"));
      expect(onCambio).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Empezar en la pieza 13" }));
      fireEvent.click(pieza("23"));
      fireEvent.click(screen.getByRole("button", { name: "Terminar en la pieza 23" }));
      expect(screen.getByText("Prótesis fija en rojo, de 13 a 23")).toBeInTheDocument();
      expect(onCambio).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Empezar en la pieza 13" }));
      fireEvent.click(pieza("43"));
      expect(screen.getByRole("button", { name: "Terminar en la pieza 43" })).toBeDisabled();
      expect(screen.getByText("Una prótesis une piezas de la misma arcada.")).toBeInTheDocument();
      fireEvent.click(pieza("11"));
      fireEvent.click(screen.getByRole("button", { name: "Terminar en la pieza 11" }));
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      expect(ultimo(onCambio)?.protesis?.[0]).toMatchObject({ tipo: "removible", color: "rojo" });
    });

    it("terminar en la misma pieza no se puede, y Cancelar anula la operación", () => {
      const { onCambio } = montar(GENERAL);
      elegirHerramienta(/prótesis fija/i);
      fireEvent.click(pieza("13"));
      fireEvent.click(screen.getByRole("button", { name: "Empezar en la pieza 13" }));
      fireEvent.click(pieza("13"));
      expect(screen.getByRole("button", { name: "Terminar en la pieza 13" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("button", { name: /^(Empezar|Terminar) en/ })).toBeNull();
      expect(onCambio).not.toHaveBeenCalled();
    });

    it("con el color elegido: una prótesis azul es la que hay que hacer", () => {
      const { onCambio } = montar(GENERAL);
      elegirColor(/azul/i);
      elegirHerramienta(/prótesis fija/i);
      armarProtesis("34", "36");
      expect(ultimo(onCambio)?.protesis?.[0]).toMatchObject({ tipo: "fija", color: "azul" });
    });

    /** Dieciséis prótesis de a dos piezas: las dos filas permanentes enteras,
     *  sin superponerse (lo que quede libre es de las temporarias). */
    const dieciseis = () => {
      const filas = [
        ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"],
        ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"],
      ];
      return filas.flatMap((fila) =>
        Array.from({ length: 8 }, (_, k) => ({ tipo: "fija" as const, desde: fila[2 * k], hasta: fila[2 * k + 1], color: "rojo" as const })),
      );
    };

    it("con 16 prótesis marcadas avisa y no suma la 17", () => {
      const protesis = dieciseis();
      expect(protesis).toHaveLength(16);
      const { onCambio } = montar(GENERAL, { protesis });
      elegirHerramienta(/prótesis removible/i);
      armarProtesis("55", "53");
      expect(onCambio).not.toHaveBeenCalled();
      expect(screen.getByText("Hay 16 prótesis marcadas: quitá una para sumar otra.")).toBeInTheDocument();
    });

    it("no se empieza en una pieza de otra prótesis: el botón se apaga, con el motivo", () => {
      montar(GENERAL, { protesis: dieciseis() });
      elegirHerramienta(/prótesis fija/i);
      fireEvent.click(pieza("47"));
      const empezar = screen.getByRole("button", { name: "Empezar en la pieza 47" });
      expect(empezar).toBeDisabled();
      expect(empezar).toHaveAccessibleDescription("La pieza 47 ya es parte de la prótesis de 48 a 47.");
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
      expect(pieza("17")).toHaveFocus();
    });

    it("con una marca, Enter selecciona la pieza y Enter en el panel la marca", async () => {
      const user = userEvent.setup();
      const { onCambio } = montar(GENERAL);
      elegirHerramienta(/corona/i);
      act(() => pieza("18").focus());
      await user.keyboard("{Enter}");
      expect(screen.getByRole("button", { name: "Marcar corona en rojo" })).toHaveFocus();
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

// --- QA de la 5.5: el panel de la pieza, el borrador, borrar todo, los
// conflictos y la pantalla emergente --------------------------------------

/** El control con su valor vivo: lo que manda vuelve como prop, como en el
 *  editor. Para recorrer varios gestos seguidos. */
function montarVivo(campo: CampoDeOdontograma, inicial?: ValorOdontograma) {
  const onCambio = vi.fn();
  function Vivo() {
    const [valor, setValor] = useState<ValorOdontograma | undefined>(inicial);
    return (
      <>
        <span id="etiqueta-odonto">Odontograma</span>
        <ControlDeOdontograma
          campo={campo}
          valor={valor}
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

const panelDe = (n: string) => screen.getByRole("region", { name: `Pieza ${n} seleccionada` });

describe("el panel de la pieza seleccionada", () => {
  it("sin selección invita a tocar una pieza; con una, dice qué tiene", () => {
    montar(GENERAL, {
      piezas: { "13": { caras: { O: "rojo" }, marcas: { corona: "azul" } } },
      protesis: [{ tipo: "fija", desde: "13", hasta: "11", color: "rojo" }],
    });
    expect(screen.getByText(/Seleccioná el número de la pieza o tocala en el odontograma\./)).toBeInTheDocument();
    fireEvent.click(pieza("13"));
    const panel = panelDe("13");
    expect(within(panel).getByText(/^Tiene: /)).toHaveTextContent(/pilar de la prótesis fija en rojo, de 13 a 11|pilar de la prótesis fija en rojo, de 11 a 13/);
    fireEvent.click(pieza("12"));
    expect(within(panelDe("12")).getByText(/^Tiene: en la prótesis fija/)).toBeInTheDocument();
    fireEvent.click(pieza("28"));
    expect(within(panelDe("28")).getByText("No tiene nada marcado.")).toBeInTheDocument();
  });

  it("cambiar de herramienta deja la pieza seleccionada y cambia sus opciones", () => {
    montar(GENERAL);
    fireEvent.click(pieza("26"));
    // Caras: la pieza grande con sus caras.
    expect(within(panelDe("26")).getByRole("group", { name: "Caras de la pieza 26" })).toBeInTheDocument();
    elegirHerramienta(/^X/);
    expect(within(panelDe("26")).getByRole("button", { name: "Marcar X en rojo" })).toBeInTheDocument();
    elegirHerramienta("Corona");
    expect(within(panelDe("26")).getByRole("button", { name: "Marcar corona en rojo" })).toBeInTheDocument();
    elegirHerramienta(/prótesis fija/i);
    expect(within(panelDe("26")).getByRole("button", { name: "Empezar en la pieza 26" })).toBeInTheDocument();
    elegirHerramienta("Borrador");
    // Sin nada que borrar, el botón está, pero apagado.
    expect(within(panelDe("26")).getByRole("button", { name: "Borrar la pieza 26" })).toBeDisabled();
  });

  it("la pediátrica ofrece sellador y T en el panel", () => {
    const { onCambio } = montar(PEDIATRICO);
    elegirHerramienta("Sellador");
    fireEvent.click(pieza("55"));
    fireEvent.click(within(panelDe("55")).getByRole("button", { name: "Marcar sellador en rojo" }));
    expect(ultimo(onCambio)).toEqual({ piezas: { "55": { marcas: { sellador: "rojo" } } } });
  });

  it("una marca ya puesta se ofrece para sacar", () => {
    const { onCambio } = montar(GENERAL, { piezas: { "16": { marcas: { corona: "azul" } } } });
    elegirColor(/azul/i);
    elegirHerramienta("Corona");
    fireEvent.click(pieza("16"));
    fireEvent.click(within(panelDe("16")).getByRole("button", { name: "Sacar corona" }));
    expect(ultimo(onCambio)).toBeUndefined();
  });

  it("con la prótesis, empezar desde el panel deja la pieza como primer pilar, y Cancelar lo suelta", () => {
    const { onCambio } = montar(GENERAL);
    elegirHerramienta(/prótesis removible/i);
    // Empezar la deja como primer pilar; Cancelar la suelta y el panel vuelve a invitar.
    fireEvent.click(pieza("14"));
    fireEvent.click(within(panelDe("14")).getByRole("button", { name: "Empezar en la pieza 14" }));
    expect(within(panelDe("14")).getByText(/^Empieza en la pieza 14\./)).toBeInTheDocument();
    fireEvent.click(within(panelDe("14")).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText(/Seleccioná el número de la pieza/)).toBeInTheDocument();
    armarProtesis("14", "16");
    expect(ultimo(onCambio)?.protesis?.[0]).toMatchObject({ tipo: "removible", color: "rojo" });
    expect(screen.getByText(/Prótesis removible en rojo, de 16 a 14\.|Prótesis removible en rojo, de 14 a 16\./)).toBeInTheDocument();
  });
});

describe("los conflictos, antes de que pasen", () => {
  it("una cara sobre una pieza ausente no se pinta: el panel avisa por qué", () => {
    const { onCambio } = montar(GENERAL, { piezas: { "16": { marcas: { x: "rojo" } } } });
    tocarCara("16", /oclusal/i);
    expect(onCambio).not.toHaveBeenCalled();
    expect(within(panelDe("16")).getByText("La pieza 16 está ausente: no lleva prestaciones.")).toBeInTheDocument();
  });

  it("una corona sobre una ausente: el botón se apaga, con el motivo y sin atajo", () => {
    montar(GENERAL, { piezas: { "16": { marcas: { x: "rojo" } } } });
    elegirHerramienta("Corona");
    fireEvent.click(pieza("16"));
    const boton = within(panelDe("16")).getByRole("button", { name: "Marcar corona en rojo" });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription("La pieza 16 está ausente: no lleva prestaciones.");
    expect(screen.queryByRole("button", { name: /^Borrar y marcar/ })).toBeNull();
  });

  it("la X roja sobre una pieza con prestaciones avisa y ofrece Borrar y marcar ausente", () => {
    const { onCambio } = montar(GENERAL, {
      piezas: { "16": { caras: { O: "rojo" }, marcas: { corona: "azul" } } },
      protesis: [{ tipo: "fija", desde: "16", hasta: "14", color: "rojo" }],
    });
    elegirHerramienta(/^X/);
    fireEvent.click(pieza("16"));
    const panel = panelDe("16");
    expect(within(panel).getByText("La pieza 16 tiene prestaciones marcadas: borralas antes de marcarla ausente.")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Marcar X en rojo" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Borrar y marcar ausente" }));
    // Se va todo lo de la pieza, y la prótesis que se apoyaba en ella.
    expect(ultimo(onCambio)).toEqual({ piezas: { "16": { marcas: { x: "rojo" } } } });
  });

  it("la X azul ofrece Borrar y marcar para extraer, y conserva lo existente", () => {
    const { onCambio } = montar(GENERAL, { piezas: { "26": { caras: { O: "rojo", M: "azul" } } } });
    elegirColor(/azul/i);
    elegirHerramienta(/^X/);
    fireEvent.click(pieza("26"));
    fireEvent.click(within(panelDe("26")).getByRole("button", { name: "Borrar y marcar para extraer" }));
    expect(ultimo(onCambio)).toEqual({ piezas: { "26": { caras: { O: "rojo" }, marcas: { x: "azul" } } } });
  });

  it("una pieza ausente no puede ser pilar: el panel lo dice y el toque no empieza el tramo", () => {
    const { onCambio } = montar(GENERAL, { piezas: { "13": { marcas: { x: "rojo" } } } });
    elegirHerramienta(/prótesis fija/i);
    fireEvent.click(pieza("13"));
    expect(within(panelDe("13")).getByRole("button", { name: "Empezar en la pieza 13" })).toHaveAccessibleDescription(
      "La pieza 13 está ausente: no puede ser pilar.",
    );
    expect(within(panelDe("13")).getByRole("button", { name: "Empezar en la pieza 13" })).toBeDisabled();
    // El siguiente toque no cierra un tramo: elige otro inicio.
    fireEvent.click(pieza("11"));
    expect(onCambio).not.toHaveBeenCalled();
    expect(within(panelDe("11")).getByRole("button", { name: "Empezar en la pieza 11" })).toBeEnabled();
  });

  it("cerrar un tramo en una pieza a extraer, con una prótesis azul, se rechaza con su motivo", () => {
    const { onCambio } = montar(GENERAL, { piezas: { "11": { marcas: { x: "azul" } } } });
    elegirColor(/azul/i);
    elegirHerramienta(/prótesis fija/i);
    fireEvent.click(pieza("13"));
    fireEvent.click(screen.getByRole("button", { name: "Empezar en la pieza 13" }));
    fireEvent.click(pieza("11"));
    expect(onCambio).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Terminar en la pieza 11" })).toBeDisabled();
    // Una sola vez: junto al botón que apaga.
    expect(within(panelDe("11")).getAllByText("La pieza 11 se va a extraer: no puede ser pilar.")).toHaveLength(1);
  });

  it("una prótesis que se superpone con otra no se crea", () => {
    const { onCambio } = montar(GENERAL, { protesis: [{ tipo: "fija", desde: "13", hasta: "11", color: "rojo" }] });
    elegirHerramienta(/prótesis removible/i);
    fireEvent.click(pieza("14"));
    fireEvent.click(screen.getByRole("button", { name: "Empezar en la pieza 14" }));
    fireEvent.click(pieza("22"));
    expect(onCambio).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Terminar en la pieza 22" })).toBeDisabled();
    expect(screen.getByText("Esa prótesis se superpone con otra.")).toBeInTheDocument();
  });

  it("una prótesis vecina, que no comparte piezas, sí se crea", () => {
    const { onCambio } = montar(GENERAL, { protesis: [{ tipo: "fija", desde: "13", hasta: "11", color: "rojo" }] });
    elegirHerramienta(/prótesis removible/i);
    armarProtesis("21", "23");
    expect(ultimo(onCambio)?.protesis).toHaveLength(2);
  });
});

describe("el borrador y borrar todo", () => {
  it("el Borrador limpia la pieza tocada y las prótesis que pasan por ella", () => {
    const { onCambio } = montarVivo(GENERAL, {
      piezas: { "12": { caras: { O: "rojo" } }, "26": { marcas: { corona: "rojo" } } },
      protesis: [{ tipo: "fija", desde: "13", hasta: "11", color: "rojo" }],
    });
    elegirHerramienta("Borrador");
    fireEvent.click(pieza("12"));
    fireEvent.click(within(panelDe("12")).getByRole("button", { name: "Borrar la pieza 12" }));
    expect(ultimo(onCambio)).toEqual({ piezas: { "26": { marcas: { corona: "rojo" } } } });
    expect(screen.getByText("Borrada la pieza 12")).toBeInTheDocument();
    // Ya no tiene nada: el botón se apaga.
    expect(within(panelDe("12")).getByRole("button", { name: "Borrar la pieza 12" })).toBeDisabled();
  });

  it("Borrar todo pregunta en el mismo lugar: No vuelve sin tocar nada", async () => {
    const user = userEvent.setup();
    const { onCambio } = montar(GENERAL, { piezas: { "16": { caras: { O: "rojo" } } }, existentes: 31 });
    const borrar = screen.getByRole("button", { name: "Borrar todo" });
    expect(borrar).toHaveAttribute("aria-expanded", "false");
    await user.click(borrar);
    expect(borrar).toHaveAttribute("aria-expanded", "true");
    const confirmar = screen.getByRole("group", { name: "Confirmar" });
    expect(within(confirmar).getByText("¿Borrar todo el odontograma?")).toBeInTheDocument();
    // El foco arranca en No: un Enter por reflejo no borra.
    expect(within(confirmar).getByRole("button", { name: "No" })).toHaveFocus();
    await user.click(within(confirmar).getByRole("button", { name: "No" }));
    expect(onCambio).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Confirmar" })).toBeNull();
    expect(borrar).toHaveFocus();
  });

  it("Borrar todo, Sí: saca piezas y prótesis, deja los dientes existentes y avisa", async () => {
    const user = userEvent.setup();
    const { onCambio } = montarVivo(GENERAL, {
      piezas: { "16": { caras: { O: "rojo" } } },
      protesis: [{ tipo: "fija", desde: "13", hasta: "11", color: "rojo" }],
      existentes: 31,
    });
    await user.click(screen.getByRole("button", { name: "Borrar todo" }));
    await user.click(within(screen.getByRole("group", { name: "Confirmar" })).getByRole("button", { name: "Sí" }));
    expect(ultimo(onCambio)).toEqual({ existentes: 31 });
    expect(screen.getByText("Se borró el odontograma.")).toBeInTheDocument();
    // Sin nada que borrar, el botón se apaga.
    expect(screen.getByRole("button", { name: "Borrar todo" })).toBeDisabled();
  });

  it("sin nada marcado, Borrar todo está apagado", () => {
    montar(GENERAL, { existentes: 30 });
    expect(screen.getByRole("button", { name: "Borrar todo" })).toBeDisabled();
  });
});

describe("el teclado en el panel", () => {
  it("Escape en el panel vuelve a la pieza del diagrama, con cualquier herramienta", async () => {
    const user = userEvent.setup();
    montar(GENERAL);
    elegirHerramienta("Borrador");
    act(() => pieza("18").focus());
    await user.keyboard("{Enter}");
    // Sin nada que borrar, el foco queda en el panel.
    expect(panelDe("18")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(pieza("18")).toHaveFocus();
  });

  it("con la X en conflicto, Enter selecciona y el foco va a Borrar y marcar ausente", async () => {
    const user = userEvent.setup();
    const { onCambio } = montar(GENERAL, { piezas: { "18": { caras: { O: "azul" } } } });
    elegirHerramienta(/^X/);
    act(() => pieza("18").focus());
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Borrar y marcar ausente" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(ultimo(onCambio)).toEqual({ piezas: { "18": { marcas: { x: "rojo" } } } });
  });
});

describe("CampoOdontograma: el resumen y la pantalla emergente", () => {
  const CAMPO = { tipo: "odontograma", id: "odonto", etiqueta: "Odontograma", leyenda: "general", existentes: true } as const;

  function montarCampo(valor?: ValorOdontograma) {
    const onCambio = vi.fn();
    render(
      <>
        <span id="odonto-etiqueta">Odontograma</span>
        <CampoOdontograma campo={CAMPO as never} valor={valor} onCambio={onCambio} id="odonto" etiquetaId="odonto-etiqueta" />
      </>,
    );
    return { onCambio };
  }

  it("muestra el resumen del valor, o Sin marcar", () => {
    montarCampo();
    expect(screen.getByText("Sin marcar")).toBeInTheDocument();
  });

  it("Abrir odontograma lo abre en un diálogo de ancho completo; Listo lo cierra y devuelve el foco", async () => {
    const user = userEvent.setup();
    const { onCambio } = montarCampo({ existentes: 28 });
    expect(screen.getByText("Dientes existentes: 28.")).toBeInTheDocument();
    const abrir = screen.getByRole("button", { name: "Abrir odontograma" });
    expect(abrir).toHaveAccessibleDescription("Dientes existentes: 28.");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(abrir);
    const dialogo = screen.getByRole("dialog", { name: "Odontograma" });
    expect(dialogo).toHaveClass("max-w-4xl");
    expect(within(dialogo).getAllByRole("button", { name: /^Pieza \d\d$/ })).toHaveLength(52);
    fireEvent.click(pieza("16"));
    fireEvent.click(within(screen.getByRole("group", { name: "Caras de la pieza 16" })).getByRole("button", { name: /oclusal/i }));
    expect(ultimo(onCambio)).toEqual({ piezas: { "16": { caras: { O: "rojo" } } }, existentes: 28 });
    await user.click(within(dialogo).getByRole("button", { name: "Listo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(abrir).toHaveFocus();
  });

  it("Escape adentro del panel vuelve a la pieza sin cerrar; el siguiente Escape cierra", async () => {
    const user = userEvent.setup();
    montarCampo();
    await user.click(screen.getByRole("button", { name: "Abrir odontograma" }));
    act(() => pieza("18").focus());
    await user.keyboard("{Enter}");
    expect(within(screen.getByRole("group", { name: "Caras de la pieza 18" })).getAllByRole("button")[0]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(pieza("18")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir odontograma" })).toHaveFocus();
  });

  it("controlado desde afuera: abierto lo muestra y cerrar avisa con onAbierto", async () => {
    const user = userEvent.setup();
    const onAbierto = vi.fn();
    const { rerender } = render(
      <CampoOdontograma campo={CAMPO as never} valor={undefined} onCambio={vi.fn()} id="odonto" etiquetaId="x" abierto={false} onAbierto={onAbierto} />,
    );
    await user.click(screen.getByRole("button", { name: "Abrir odontograma" }));
    expect(onAbierto).toHaveBeenLastCalledWith(true);
    // Sin que el dueño lo abra, no se abre.
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<CampoOdontograma campo={CAMPO as never} valor={undefined} onCambio={vi.fn()} id="odonto" etiquetaId="x" abierto onAbierto={onAbierto} />);
    await user.click(screen.getByRole("button", { name: "Listo" }));
    expect(onAbierto).toHaveBeenLastCalledWith(false);
  });
});

// Elegir por número y la prótesis en pasos (QA de la 5.5): el campo "Pieza"
// selecciona como un toque, y la prótesis se arma con Desde/Hasta y tres
// pasos explícitos; el foco acompaña cada paso.
describe("elegir la pieza por su número", () => {
  const campoPieza = () => screen.getByRole("textbox", { name: "Pieza" });

  it("sin pieza, el panel invita a escribir el número o tocarla", () => {
    montar(GENERAL);
    const panel = screen.getByRole("region", { name: "Pieza seleccionada" });
    expect(within(panel).getByText(/^Seleccioná el número de la pieza o tocala en el odontograma\./)).toBeInTheDocument();
    expect(campoPieza()).toHaveValue("");
  });

  it("un número válido selecciona la pieza sin sacar el foco del campo", async () => {
    const user = userEvent.setup();
    montar(GENERAL);
    await user.click(campoPieza());
    await user.keyboard("16");
    expect(panelDe("16")).toBeInTheDocument();
    expect(campoPieza()).toHaveFocus();
    expect(campoPieza()).not.toHaveAttribute("aria-invalid");
    // Solo dígitos, y a lo sumo dos.
    fireEvent.change(campoPieza(), { target: { value: "2a17" } });
    expect(campoPieza()).toHaveValue("21");
    expect(panelDe("21")).toBeInTheDocument();
  });

  it("99 no es una pieza: el aviso va debajo del campo, atado con aria-describedby", () => {
    montar(GENERAL);
    fireEvent.change(campoPieza(), { target: { value: "99" } });
    expect(campoPieza()).toHaveAttribute("aria-invalid", "true");
    expect(campoPieza()).toHaveAccessibleDescription("99 no es una pieza de este odontograma.");
    expect(screen.getByRole("region", { name: "Pieza seleccionada" })).toBeInTheDocument();
    // Corregido, el aviso se va.
    fireEvent.change(campoPieza(), { target: { value: "11" } });
    expect(campoPieza()).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("99 no es una pieza de este odontograma.")).toBeNull();
  });

  it("tocar una pieza completa el número, y cambiar de herramienta lo conserva", () => {
    montar(GENERAL);
    fireEvent.click(pieza("34"));
    expect(campoPieza()).toHaveValue("34");
    elegirHerramienta("Corona");
    expect(campoPieza()).toHaveValue("34");
  });
});

describe("la prótesis en pasos, por la pantalla", () => {
  const desde = () => screen.getByRole("textbox", { name: "Desde" });
  const hasta = () => screen.getByRole("textbox", { name: "Hasta" });

  it("con la prótesis, Pieza se vuelve Desde y Hasta, y la pieza elegida pasa a Desde", () => {
    montar(GENERAL);
    fireEvent.click(pieza("13"));
    elegirHerramienta(/prótesis fija/i);
    expect(screen.queryByRole("textbox", { name: "Pieza" })).toBeNull();
    expect(desde()).toHaveValue("13");
    expect(hasta()).toHaveValue("");
    elegirHerramienta("Corona");
    expect(screen.getByRole("textbox", { name: "Pieza" })).toHaveValue("13");
  });

  it("los tres pasos por la pantalla, con el foco en el botón de cada paso, y Escape que retrocede", async () => {
    const user = userEvent.setup();
    const { onCambio } = montar(GENERAL);
    elegirHerramienta(/prótesis fija/i);
    await user.click(pieza("13"));
    expect(desde()).toHaveValue("13");
    const empezar = screen.getByRole("button", { name: "Empezar en la pieza 13" });
    expect(empezar).toHaveFocus();
    await user.click(empezar);
    // Sin fin todavía, Terminar está apagado y el foco queda en el panel.
    expect(screen.getByRole("button", { name: /^Terminar en la pieza …$/ })).toBeDisabled();
    expect(panelDe("13")).toHaveFocus();
    await user.click(pieza("23"));
    expect(hasta()).toHaveValue("23");
    expect(screen.getByRole("button", { name: "Terminar en la pieza 23" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Prótesis fija en rojo, de 13 a 23")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveFocus();
    expect(onCambio).not.toHaveBeenCalled();

    // Escape: confirmar, fin, inicio.
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Terminar en la pieza 23" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Empezar en la pieza 13" })).toHaveFocus();
    expect(onCambio).not.toHaveBeenCalled();

    // De nuevo hasta el final, y Guardar.
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Terminar en la pieza 23" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(ultimo(onCambio)?.protesis).toEqual([{ tipo: "fija", desde: "13", hasta: "23", color: "rojo" }]);
    expect(desde()).toHaveValue("");
    expect(hasta()).toHaveValue("");
    expect(screen.getByText("Prótesis fija en rojo, de 13 a 23.")).toBeInTheDocument();
  });

  it("tocar una pieza en confirmar vuelve al fin, con esa pieza", () => {
    montar(GENERAL);
    elegirHerramienta(/prótesis removible/i);
    fireEvent.click(pieza("13"));
    fireEvent.click(screen.getByRole("button", { name: "Empezar en la pieza 13" }));
    fireEvent.click(pieza("23"));
    fireEvent.click(screen.getByRole("button", { name: "Terminar en la pieza 23" }));
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    fireEvent.click(pieza("24"));
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Terminar en la pieza 24" })).toBeEnabled();
    expect(hasta()).toHaveValue("24");
  });

  it("Cancelar desde confirmar vacía la operación", () => {
    const { onCambio } = montar(GENERAL);
    elegirHerramienta(/prótesis fija/i);
    fireEvent.click(pieza("13"));
    fireEvent.click(screen.getByRole("button", { name: "Empezar en la pieza 13" }));
    fireEvent.click(pieza("23"));
    fireEvent.click(screen.getByRole("button", { name: "Terminar en la pieza 23" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(desde()).toHaveValue("");
    expect(hasta()).toHaveValue("");
    expect(screen.queryByRole("button", { name: /^(Empezar|Terminar) en|^Guardar$/ })).toBeNull();
    expect(onCambio).not.toHaveBeenCalled();
  });

  it("el atajo: Desde y Hasta escritos saltan a confirmar, con el foco en Guardar", () => {
    const { onCambio } = montar(GENERAL);
    elegirHerramienta(/prótesis fija/i);
    fireEvent.change(desde(), { target: { value: "13" } });
    expect(screen.getByRole("button", { name: "Empezar en la pieza 13" })).toBeInTheDocument();
    fireEvent.change(hasta(), { target: { value: "23" } });
    expect(screen.getByText("Prótesis fija en rojo, de 13 a 23")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(ultimo(onCambio)?.protesis).toEqual([{ tipo: "fija", desde: "13", hasta: "23", color: "rojo" }]);
  });

  it("un Hasta de otra arcada escrito antes de empezar dice por qué no salta, una vez", () => {
    montar(GENERAL);
    elegirHerramienta(/prótesis fija/i);
    fireEvent.change(desde(), { target: { value: "13" } });
    fireEvent.change(hasta(), { target: { value: "43" } });
    expect(screen.getAllByText("Una prótesis une piezas de la misma arcada.")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Empezar en la pieza 13" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
  });

  it("99 en Desde va debajo del campo, no en el panel", () => {
    montar(GENERAL);
    elegirHerramienta(/prótesis fija/i);
    fireEvent.change(desde(), { target: { value: "99" } });
    expect(desde()).toHaveAccessibleDescription("99 no es una pieza de este odontograma.");
    expect(screen.getAllByText("99 no es una pieza de este odontograma.")).toHaveLength(1);
  });

  it("empezar en una pieza de otra prótesis: el botón se apaga y el motivo sale una sola vez", () => {
    montar(GENERAL, { protesis: [{ tipo: "fija", desde: "11", hasta: "13", color: "rojo" }] });
    elegirHerramienta(/prótesis removible/i);
    fireEvent.change(desde(), { target: { value: "12" } });
    const empezar = screen.getByRole("button", { name: "Empezar en la pieza 12" });
    expect(empezar).toBeDisabled();
    expect(empezar).toHaveAccessibleDescription("La pieza 12 ya es parte de la prótesis de 13 a 11.");
    expect(screen.getAllByText("La pieza 12 ya es parte de la prótesis de 13 a 11.")).toHaveLength(1);
    // El campo no lo repite: el número es de la dentición.
    expect(desde()).not.toHaveAttribute("aria-describedby");
  });

  it("terminar en una pieza de otra prótesis: Terminar se apaga, con su motivo una vez", () => {
    montar(GENERAL, { protesis: [{ tipo: "fija", desde: "11", hasta: "13", color: "rojo" }] });
    elegirHerramienta(/prótesis fija/i);
    fireEvent.click(pieza("15"));
    fireEvent.click(screen.getByRole("button", { name: "Empezar en la pieza 15" }));
    fireEvent.click(pieza("12"));
    const terminar = screen.getByRole("button", { name: "Terminar en la pieza 12" });
    expect(terminar).toBeDisabled();
    expect(terminar).toHaveAccessibleDescription("La pieza 12 ya es parte de la prótesis de 13 a 11.");
    expect(screen.getAllByText("La pieza 12 ya es parte de la prótesis de 13 a 11.")).toHaveLength(1);
  });

  it("Guardar revalida: cambiar a azul con un pilar a extraer lo apaga, con el motivo", () => {
    const { onCambio } = montar(GENERAL, { piezas: { "23": { marcas: { x: "azul" } } } });
    elegirHerramienta(/prótesis fija/i);
    fireEvent.change(desde(), { target: { value: "13" } });
    fireEvent.change(hasta(), { target: { value: "23" } });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    elegirColor(/azul/i);
    const guardar = screen.getByRole("button", { name: "Guardar" });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription("La pieza 23 se va a extraer: no puede ser pilar.");
    fireEvent.click(guardar);
    expect(onCambio).not.toHaveBeenCalled();
  });
});

describe("Borrar todo: el Sí", () => {
  it("lleva el estilo de peligro, distinto del No, y los dos miden 44 px", async () => {
    const user = userEvent.setup();
    montar(GENERAL, { piezas: { "16": { caras: { O: "rojo" } } } });
    await user.click(screen.getByRole("button", { name: "Borrar todo" }));
    const confirmar = screen.getByRole("group", { name: "Confirmar" });
    const si = within(confirmar).getByRole("button", { name: "Sí" });
    const no = within(confirmar).getByRole("button", { name: "No" });
    expect(si).toHaveClass("bg-terracota-oscuro", "text-marfil", "min-h-11");
    expect(no).not.toHaveClass("bg-terracota-oscuro");
    expect(no).toHaveClass("min-h-11");
  });
});
