import { describe, expect, it } from "vitest";
import { contenidoCongelado, ETIQUETA_DE_ESTADO, fechaCorta, fechaYHora, huellaCorta } from "./documentos";

describe("documentos (ayudantes)", () => {
  it("lee el contenido congelado solo si tiene la forma esperada", () => {
    expect(contenidoCongelado(null)).toBeNull();
    expect(contenidoCongelado("texto")).toBeNull();
    expect(contenidoCongelado({ cuerpo: [], firmas: [] })).toBeNull();
    const bueno = { cuerpo: [], firmas: [], paciente: {}, plantilla: {} };
    expect(contenidoCongelado(bueno)).toBe(bueno);
  });

  it("fechas en hora de Córdoba", () => {
    expect(fechaCorta(undefined)).toBe("—");
    expect(fechaYHora(undefined)).toBe("—");
    // 02:30 UTC es el día anterior en Córdoba.
    expect(fechaCorta("2026-09-28T02:30:00Z")).toBe("27/09/2026");
    expect(fechaYHora("2026-09-27T17:05:00Z")).toBe("27/09/2026 · 14:05");
  });

  it("una huella abreviada", () => {
    expect(huellaCorta(undefined)).toBe("—");
    expect(huellaCorta("abc")).toBe("abc");
    expect(huellaCorta("a3f1c0de9b8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a392817060000")).toBe("a3f1c0de…0000");
  });

  it("cada estado tiene su nombre", () => {
    expect(ETIQUETA_DE_ESTADO.sellado).toBe("Firmado y sellado");
  });

  it("un consentimiento terminado está listo para imprimir o descargar (Fase 5.3)", () => {
    expect(ETIQUETA_DE_ESTADO.para_imprimir).toBe("Listo para imprimir o descargar");
  });
});
