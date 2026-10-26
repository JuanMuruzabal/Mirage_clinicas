import { describe, expect, it } from "vitest";
import { CLASE_CABECERA, CLASE_CABECERA_SOBRE_VIDRIO } from "./tabla";

// La cabecera de las tablas con scroll vertical es sticky y opaca; la de
// "Turnos de hoy" queda afuera de ese scroll y va sobre el vidrio (ítem 8).
describe("las clases de cabecera", () => {
  it("la común lleva panel-th-sticky", () => {
    expect(CLASE_CABECERA.split(" ")).toContain("panel-th-sticky");
  });

  it("la de sobre el vidrio no la lleva, y comparte el resto del rótulo", () => {
    const sobreVidrio = CLASE_CABECERA_SOBRE_VIDRIO.split(" ");
    expect(sobreVidrio).not.toContain("panel-th-sticky");
    for (const clase of ["whitespace-nowrap", "uppercase", "text-grafito/75", "text-xs"]) {
      expect(sobreVidrio).toContain(clase);
    }
    expect(sobreVidrio).toContain("px-4");
  });
});
