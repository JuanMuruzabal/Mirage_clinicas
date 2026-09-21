import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const apiListTiposConsultaMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiListTiposConsulta: (...args: unknown[]) => apiListTiposConsultaMock(...args),
}));

const { tiposConsultaDeLaVista } = await import("./tipos-de-la-vista");
const { colorPrecargado } = await import("./paleta-recepcion");

const DE_LUCIA = { id: "tc-1", nombre: "Limpieza dental", color: "#6E8F72" };
const DE_MARCOS = { id: "tc-2", nombre: "Limpieza dental", color: "#D6563A" };

beforeEach(() => {
  apiListTiposConsultaMock.mockReset();
  apiListTiposConsultaMock.mockResolvedValue({ ok: true, data: [DE_LUCIA, DE_MARCOS] });
});

// TR-145: un punto de color significa lo que decidió QUIEN MIRA, no quien
// cargó. QA de la 3.2.6 (2026-09-21): *"en todas las vistas el
// recepcionista ve con el color de tipo de consulta que tiene"*.
describe("tiposConsultaDeLaVista", () => {
  it("un profesional ve los colores REALES, los suyos", async () => {
    const tipos = await tiposConsultaDeLaVista("un-token", ["profesional"]);

    expect(tipos.map((t) => t.color)).toEqual(["#6E8F72", "#D6563A"]);
  });

  // LO QUE IMPORTA: recepción ve su paleta, y dos filas del mismo tipo
  // —una por profesional— se ven iguales. Sin esto, el verde de uno puede
  // ser "Limpieza" mientras el de otro es "Urgencia".
  it("recepción ve su paleta, y el mismo tipo se ve igual venga de quien venga", async () => {
    const tipos = await tiposConsultaDeLaVista("un-token", ["recepcion"]);

    expect(tipos[0].color).toBe(tipos[1].color);
    expect(tipos[0].color).toBe(colorPrecargado("Limpieza dental"));
  });

  // No es solo la vista general: parada en la agenda de un profesional,
  // recepción sigue percibiendo las consultas con SU color.
  it("para recepción vale también con un profesional en foco", async () => {
    apiListTiposConsultaMock.mockResolvedValue({ ok: true, data: [DE_LUCIA] });

    const tipos = await tiposConsultaDeLaVista("un-token", ["recepcion"]);

    expect(tipos[0].color).toBe(colorPrecargado("Limpieza dental"));
  });

  it("no toca el nombre ni el id", async () => {
    const tipos = await tiposConsultaDeLaVista("un-token", ["recepcion"]);

    expect(tipos.map((t) => t.id)).toEqual(["tc-1", "tc-2"]);
    expect(tipos.map((t) => t.nombre)).toEqual(["Limpieza dental", "Limpieza dental"]);
  });

  it("sin token no pide nada", async () => {
    const tipos = await tiposConsultaDeLaVista(undefined, ["recepcion"]);

    expect(tipos).toEqual([]);
    expect(apiListTiposConsultaMock).not.toHaveBeenCalled();
  });

  it("si el backend falla, la pantalla se dibuja igual", async () => {
    apiListTiposConsultaMock.mockResolvedValue({ ok: false, error: "500" });

    expect(await tiposConsultaDeLaVista("un-token", ["recepcion"])).toEqual([]);
  });
});
