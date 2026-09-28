import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOnboardingCompleteMock, redirectMock } = vi.hoisted(() => ({
  requireOnboardingCompleteMock: vi.fn(),
  redirectMock: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
}));
vi.mock("@/lib/session", () => ({ requireOnboardingComplete: requireOnboardingCompleteMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { hoyEnCordoba, requireProfesional } = await import("./documentos-servidor");

beforeEach(() => vi.clearAllMocks());

describe("documentos del lado del servidor", () => {
  it("un profesional entra", async () => {
    const sesion = { roles: ["owner", "admin", "profesional"] };
    requireOnboardingCompleteMock.mockResolvedValue(sesion);
    await expect(requireProfesional()).resolves.toBe(sesion);
  });

  it("recepción vuelve al panel: esconder el ítem no es cerrar la puerta", async () => {
    requireOnboardingCompleteMock.mockResolvedValue({ roles: ["recepcion"] });
    await expect(requireProfesional()).rejects.toThrow("REDIRECT:/panel");
  });

  it("hoy en Córdoba, como AAAA-MM-DD", () => {
    vi.useFakeTimers();
    // 01:00 UTC del 28 todavía es el 27 en Córdoba.
    vi.setSystemTime(new Date("2026-09-28T01:00:00Z"));
    expect(hoyEnCordoba()).toBe("2026-09-27");
    vi.useRealTimers();
  });
});
