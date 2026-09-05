import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  revalidatePathMock,
  apiEditarPacienteMock,
  apiListPacientesMock,
  apiListConflictosPacienteMock,
  apiResolverConflictoPacienteMock,
  getSessionTokenMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  apiEditarPacienteMock: vi.fn(),
  apiListPacientesMock: vi.fn(),
  apiListConflictosPacienteMock: vi.fn(),
  apiResolverConflictoPacienteMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/api", () => ({
  apiEditarPaciente: apiEditarPacienteMock,
  apiListPacientes: apiListPacientesMock,
  apiListConflictosPaciente: apiListConflictosPacienteMock,
  apiResolverConflictoPaciente: apiResolverConflictoPacienteMock,
}));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const { editarPacienteAction, listPacientesAction, listConflictosPacienteAction, resolverConflictoPacienteAction } = await import("./pacientes");

beforeEach(() => {
  vi.clearAllMocks();
});

const payload = { dni: "30111222", telefono: "+5493511234567", email: "bruno@example.com" };

describe("editarPacienteAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(editarPacienteAction("pac-1", payload)).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida la lista y el detalle, y devuelve el paciente", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiEditarPacienteMock.mockResolvedValue({ ok: true, data: { id: "pac-1", dni: "30111222" } });

    const result = await editarPacienteAction("pac-1", payload);

    expect(result).toEqual({ paciente: { id: "pac-1", dni: "30111222" } });
    expect(apiEditarPacienteMock).toHaveBeenCalledWith("un-jwt", "pac-1", payload);
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/pacientes");
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/pacientes/pac-1");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiEditarPacienteMock.mockResolvedValue({ ok: false, status: 400, error: "el DNI debe tener 7 u 8 dígitos" });

    const result = await editarPacienteAction("pac-1", payload);

    expect(result).toEqual({ error: "el DNI debe tener 7 u 8 dígitos" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("listPacientesAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(listPacientesAction()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("devuelve la lista en éxito, pasando q a la API", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiListPacientesMock.mockResolvedValue({ ok: true, data: [{ id: "pac-1" }] });

    await expect(listPacientesAction("Bruno")).resolves.toEqual([{ id: "pac-1" }]);
    expect(apiListPacientesMock).toHaveBeenCalledWith("un-jwt", "Bruno");
  });

  it("devuelve [] si la API falla", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiListPacientesMock.mockResolvedValue({ ok: false, status: 500, error: "error" });

    await expect(listPacientesAction()).resolves.toEqual([]);
  });
});

describe("listConflictosPacienteAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(listConflictosPacienteAction()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("devuelve la lista en éxito", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiListConflictosPacienteMock.mockResolvedValue({ ok: true, data: [{ id: "conf-1" }] });

    await expect(listConflictosPacienteAction()).resolves.toEqual([{ id: "conf-1" }]);
    expect(apiListConflictosPacienteMock).toHaveBeenCalledWith("un-jwt");
  });

  it("devuelve [] si la API falla", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiListConflictosPacienteMock.mockResolvedValue({ ok: false, status: 500, error: "error" });

    await expect(listConflictosPacienteAction()).resolves.toEqual([]);
  });
});

describe("resolverConflictoPacienteAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(resolverConflictoPacienteAction("conf-1", true)).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida /panel/pacientes y devuelve ok", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiResolverConflictoPacienteMock.mockResolvedValue({ ok: true, data: { mensaje: "conflicto resuelto" } });

    const result = await resolverConflictoPacienteAction("conf-1", true);

    expect(result).toEqual({ ok: true });
    expect(apiResolverConflictoPacienteMock).toHaveBeenCalledWith("un-jwt", "conf-1", { esVerificado: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/pacientes");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiResolverConflictoPacienteMock.mockResolvedValue({ ok: false, status: 409, error: "este conflicto ya fue resuelto" });

    const result = await resolverConflictoPacienteAction("conf-1", false);

    expect(result).toEqual({ error: "este conflicto ya fue resuelto" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
