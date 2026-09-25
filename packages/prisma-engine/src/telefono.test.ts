import { describe, expect, it } from "vitest";
import { telefonoLegible } from "./telefono";

describe("telefonoLegible (PP-7, H26)", () => {
  it.each([
    ["+5493510000000", "351 000-0000"],
    ["+54 9 351 123 4567", "351 123-4567"],
    ["5493511234567", "351 123-4567"],
    ["03511234567", "351 123-4567"],
    ["+5491112345678", "11 1234-5678"],
    ["+5493543123456", "3543 12-3456"],
    ["3511234567", "351 123-4567"],
  ])("%s → %s", (entrada, esperado) => {
    expect(telefonoLegible(entrada)).toBe(esperado);
  });

  it("lo que no es un número argentino de 10 dígitos queda como vino", () => {
    expect(telefonoLegible("  +1 415 555 0100 ")).toBe("+1 415 555 0100");
    expect(telefonoLegible("interno 22")).toBe("interno 22");
    expect(telefonoLegible("")).toBe("");
  });
});
