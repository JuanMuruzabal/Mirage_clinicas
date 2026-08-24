import { describe, expect, it } from "vitest";
import { CONTACTO_EMAIL, getCurrentYear } from "./contacto";

describe("lib/contacto", () => {
  it("getCurrentYear devuelve el año actual", () => {
    expect(getCurrentYear()).toBe(new Date().getFullYear());
  });

  it("CONTACTO_EMAIL tiene un valor por defecto", () => {
    expect(CONTACTO_EMAIL).toMatch(/@/);
  });
});
