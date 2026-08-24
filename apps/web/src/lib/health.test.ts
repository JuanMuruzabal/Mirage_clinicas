import { describe, expect, it } from "vitest";
import { getHealthStatus } from "./health";

describe("getHealthStatus", () => {
  it("devuelve status ok con el nombre de la app", () => {
    expect(getHealthStatus()).toEqual({ status: "ok", app: "dental-mirage-web" });
  });
});
