import { describe, expect, it } from "vitest";
import {
  PALETA_RECEPCION,
  colorPrecargado,
  conPaletaPrecargada,
} from "./paleta-recepcion";

// QA de la Fase 3.2.6 (2026-09-21): *"el recepcionista ya tiene por
// default colores precargados en los diferentes tipos de turno, así no se
// mezclan los colores que usa un profesional y los colores que usa
// otro"*.
describe("la paleta de recepción", () => {
  // LO QUE DE VERDAD IMPORTA. En la vista general conviven las dos filas
  // de "Limpieza dental" —la de cada profesional, con su propio color— y
  // para recepción son la misma cosa: tienen que verse igual.
  it("el mismo nombre da el mismo color, venga de quien venga", () => {
    const deLucia = { id: "tc-1", nombre: "Limpieza dental", color: "#6E8F72" };
    const deMarcos = { id: "tc-2", nombre: "Limpieza dental", color: "#D6563A" };

    const [a, b] = conPaletaPrecargada([deLucia, deMarcos]);

    expect(a.color).toBe(b.color);
    // Y el color es el de la paleta, no el de ninguno de los dos.
    expect(PALETA_RECEPCION).toContain(a.color);
  });

  it("dos tipos distintos no se pintan iguales por descuido", () => {
    // No es una garantía del hash (con muchos nombres hay colisiones
    // inevitables), pero los dos tipos que vienen precargados en toda
    // clínica sí tienen que distinguirse.
    expect(colorPrecargado("Consulta general")).not.toBe(colorPrecargado("Urgencia"));
  });

  // Mismo criterio de normalización que usa el backend para decidir si
  // dos tipos son "el mismo": sin esto, dos escrituras del mismo nombre
  // se pintarían distinto y no habría forma de darse cuenta de por qué.
  it("ignora mayúsculas, acentos y espacios de más", () => {
    const base = colorPrecargado("Limpieza dental");
    expect(colorPrecargado("LIMPIEZA DENTAL")).toBe(base);
    expect(colorPrecargado("  Limpieza   dental  ")).toBe(base);
    expect(colorPrecargado("Limpiezá dentál")).toBe(base);
  });

  // Determinista: el mismo nombre da siempre el mismo color, sin guardar
  // nada y sin depender del orden en que lleguen los tipos.
  it("no depende del orden de la lista", () => {
    const uno = { id: "a", nombre: "Ortodoncia", color: "#000000" };
    const dos = { id: "b", nombre: "Endodoncia", color: "#000000" };

    const directo = conPaletaPrecargada([uno, dos]);
    const alReves = conPaletaPrecargada([dos, uno]);

    expect(directo[0].color).toBe(alReves[1].color);
    expect(directo[1].color).toBe(alReves[0].color);
  });

  it("no toca nada más del tipo", () => {
    const tipo = {
      id: "tc-1",
      nombre: "Ortodoncia",
      color: "#000000",
      duracionMinutos: 45,
    };
    const [repintado] = conPaletaPrecargada([tipo]);

    expect(repintado.id).toBe("tc-1");
    expect(repintado.nombre).toBe("Ortodoncia");
    expect(repintado.duracionMinutos).toBe(45);
    expect(repintado.color).not.toBe("#000000");
  });
});
