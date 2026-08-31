import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  revalidatePathMock,
  apiListHorarioAtencionMock,
  apiPutHorarioAtencionGeneralMock,
  apiCrearHorarioAtencionMock,
  apiEditarHorarioAtencionMock,
  apiEliminarHorarioAtencionMock,
  apiListBloqueosMock,
  apiCrearBloqueoMock,
  apiEliminarBloqueoMock,
  apiCrearTipoConsultaMock,
  apiEditarTipoConsultaMock,
  apiEliminarTipoConsultaMock,
  getSessionTokenMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  apiListHorarioAtencionMock: vi.fn(),
  apiPutHorarioAtencionGeneralMock: vi.fn(),
  apiCrearHorarioAtencionMock: vi.fn(),
  apiEditarHorarioAtencionMock: vi.fn(),
  apiEliminarHorarioAtencionMock: vi.fn(),
  apiListBloqueosMock: vi.fn(),
  apiCrearBloqueoMock: vi.fn(),
  apiEliminarBloqueoMock: vi.fn(),
  apiCrearTipoConsultaMock: vi.fn(),
  apiEditarTipoConsultaMock: vi.fn(),
  apiEliminarTipoConsultaMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/api", () => ({
  apiListHorarioAtencion: apiListHorarioAtencionMock,
  apiPutHorarioAtencionGeneral: apiPutHorarioAtencionGeneralMock,
  apiCrearHorarioAtencion: apiCrearHorarioAtencionMock,
  apiEditarHorarioAtencion: apiEditarHorarioAtencionMock,
  apiEliminarHorarioAtencion: apiEliminarHorarioAtencionMock,
  apiListBloqueos: apiListBloqueosMock,
  apiCrearBloqueo: apiCrearBloqueoMock,
  apiEliminarBloqueo: apiEliminarBloqueoMock,
  apiCrearTipoConsulta: apiCrearTipoConsultaMock,
  apiEditarTipoConsulta: apiEditarTipoConsultaMock,
  apiEliminarTipoConsulta: apiEliminarTipoConsultaMock,
}));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const {
  listHorarioAtencionAction,
  putHorarioAtencionGeneralAction,
  crearHorarioAtencionAction,
  editarHorarioAtencionAction,
  eliminarHorarioAtencionAction,
  listBloqueosAction,
  crearBloqueoAction,
  eliminarBloqueoAction,
  crearTipoConsultaAction,
  editarTipoConsultaAction,
  eliminarTipoConsultaAction,
} = await import("./calendario-config");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listHorarioAtencionAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(listHorarioAtencionAction()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("devuelve la lista en éxito", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiListHorarioAtencionMock.mockResolvedValue({ ok: true, data: [{ id: "h-1", alcance: "general", horaDesde: "09:00", horaHasta: "17:00" }] });

    await expect(listHorarioAtencionAction()).resolves.toEqual([{ id: "h-1", alcance: "general", horaDesde: "09:00", horaHasta: "17:00" }]);
  });

  it("devuelve la general sintetizada por default si la API falla", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiListHorarioAtencionMock.mockResolvedValue({ ok: false, status: 500, error: "error" });

    await expect(listHorarioAtencionAction()).resolves.toEqual([{ id: "", alcance: "general", horaDesde: "08:00", horaHasta: "18:00" }]);
  });
});

describe("putHorarioAtencionGeneralAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(putHorarioAtencionGeneralAction({ horaDesde: "08:00", horaHasta: "18:00" })).rejects.toThrow(
      "NEXT_REDIRECT:/ingresar",
    );
  });

  it("en éxito, revalida /panel/calendario y devuelve el horario guardado", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiPutHorarioAtencionGeneralMock.mockResolvedValue({ ok: true, data: { id: "h-1", alcance: "general", horaDesde: "09:00", horaHasta: "17:00" } });

    const result = await putHorarioAtencionGeneralAction({ horaDesde: "09:00", horaHasta: "17:00" });

    expect(result).toEqual({ horario: { id: "h-1", alcance: "general", horaDesde: "09:00", horaHasta: "17:00" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiPutHorarioAtencionGeneralMock.mockResolvedValue({ ok: false, status: 400, error: "formato inválido" });

    const result = await putHorarioAtencionGeneralAction({ horaDesde: "x", horaHasta: "y" });

    expect(result).toEqual({ error: "formato inválido" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("crearHorarioAtencionAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(crearHorarioAtencionAction({ alcance: "semana", horaDesde: "09:00", horaHasta: "13:00" })).rejects.toThrow(
      "NEXT_REDIRECT:/ingresar",
    );
  });

  it("en éxito, revalida /panel/calendario y devuelve la excepción creada", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    const excepcion = { id: "h-2", alcance: "semana" as const, horaDesde: "09:00", horaHasta: "13:00" };
    apiCrearHorarioAtencionMock.mockResolvedValue({ ok: true, data: excepcion });

    const result = await crearHorarioAtencionAction({ alcance: "semana", horaDesde: "09:00", horaHasta: "13:00" });

    expect(result).toEqual({ horario: excepcion });
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiCrearHorarioAtencionMock.mockResolvedValue({ ok: false, status: 400, error: "alcance inválido" });

    const result = await crearHorarioAtencionAction({ alcance: "semana", horaDesde: "09:00", horaHasta: "13:00" });

    expect(result).toEqual({ error: "alcance inválido" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("editarHorarioAtencionAction", () => {
  it("en éxito, revalida /panel/calendario y devuelve la excepción editada", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    const excepcion = { id: "h-2", alcance: "mes" as const, horaDesde: "10:00", horaHasta: "14:00" };
    apiEditarHorarioAtencionMock.mockResolvedValue({ ok: true, data: excepcion });

    const result = await editarHorarioAtencionAction("h-2", { alcance: "mes", horaDesde: "10:00", horaHasta: "14:00" });

    expect(result).toEqual({ horario: excepcion });
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });
});

describe("eliminarHorarioAtencionAction", () => {
  it("en éxito, revalida /panel/calendario", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiEliminarHorarioAtencionMock.mockResolvedValue({ ok: true, data: null });

    const result = await eliminarHorarioAtencionAction("h-2");

    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiEliminarHorarioAtencionMock.mockResolvedValue({ ok: false, status: 400, error: "no se puede eliminar la general" });

    const result = await eliminarHorarioAtencionAction("h-1");

    expect(result).toEqual({ error: "no se puede eliminar la general" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("listBloqueosAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(listBloqueosAction()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("devuelve la lista, pasando especifico a la API", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiListBloqueosMock.mockResolvedValue({ ok: true, data: [{ id: "b-1" }] });

    await expect(listBloqueosAction(true)).resolves.toEqual([{ id: "b-1" }]);
    expect(apiListBloqueosMock).toHaveBeenCalledWith("tok", true);
  });

  it("devuelve [] si la API falla", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiListBloqueosMock.mockResolvedValue({ ok: false, status: 500, error: "error" });

    await expect(listBloqueosAction()).resolves.toEqual([]);
  });
});

describe("crearBloqueoAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(
      crearBloqueoAction({ especifico: true, fecha: "2026-12-25", horaDesde: "08:00", horaHasta: "09:00" }),
    ).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida y devuelve el bloqueo creado", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiCrearBloqueoMock.mockResolvedValue({ ok: true, data: { id: "b-1", especifico: true } });

    const result = await crearBloqueoAction({ especifico: true, fecha: "2026-12-25", horaDesde: "08:00", horaHasta: "09:00" });

    expect(result).toEqual({ bloqueo: { id: "b-1", especifico: true } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiCrearBloqueoMock.mockResolvedValue({ ok: false, status: 400, error: "horario inválido" });

    const result = await crearBloqueoAction({ especifico: true, fecha: "2026-12-25", horaDesde: "09:00", horaHasta: "08:00" });

    expect(result).toEqual({ error: "horario inválido" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("eliminarBloqueoAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(eliminarBloqueoAction("b-1")).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida y devuelve ok", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiEliminarBloqueoMock.mockResolvedValue({ ok: true, data: null });

    await expect(eliminarBloqueoAction("b-1")).resolves.toEqual({ ok: true });
    expect(apiEliminarBloqueoMock).toHaveBeenCalledWith("tok", "b-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiEliminarBloqueoMock.mockResolvedValue({ ok: false, status: 404, error: "regla no encontrada" });

    await expect(eliminarBloqueoAction("b-1")).resolves.toEqual({ error: "regla no encontrada" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

const tipoPayload = { nombre: "Ortodoncia", color: "#123ABC", duracionMinutos: 45, tiempoPostConsultaMinutos: 20 };

describe("crearTipoConsultaAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(crearTipoConsultaAction(tipoPayload)).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida y devuelve el tipo creado", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiCrearTipoConsultaMock.mockResolvedValue({ ok: true, data: { id: "tc-1", ...tipoPayload } });

    const result = await crearTipoConsultaAction(tipoPayload);

    expect(result).toEqual({ tipoConsulta: { id: "tc-1", ...tipoPayload } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiCrearTipoConsultaMock.mockResolvedValue({ ok: false, status: 400, error: "color inválido" });

    await expect(crearTipoConsultaAction(tipoPayload)).resolves.toEqual({ error: "color inválido" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("editarTipoConsultaAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(editarTipoConsultaAction("tc-1", tipoPayload)).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida y devuelve el tipo editado", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiEditarTipoConsultaMock.mockResolvedValue({ ok: true, data: { id: "tc-1", ...tipoPayload } });

    const result = await editarTipoConsultaAction("tc-1", tipoPayload);

    expect(result).toEqual({ tipoConsulta: { id: "tc-1", ...tipoPayload } });
    expect(apiEditarTipoConsultaMock).toHaveBeenCalledWith("tok", "tc-1", tipoPayload);
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiEditarTipoConsultaMock.mockResolvedValue({ ok: false, status: 404, error: "no encontrado" });

    await expect(editarTipoConsultaAction("tc-1", tipoPayload)).resolves.toEqual({ error: "no encontrado" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("eliminarTipoConsultaAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(eliminarTipoConsultaAction("tc-1")).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida y devuelve ok", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiEliminarTipoConsultaMock.mockResolvedValue({ ok: true, data: null });

    await expect(eliminarTipoConsultaAction("tc-1")).resolves.toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });

  it("en error (409, turnos asociados), devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiEliminarTipoConsultaMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "no se puede eliminar un tipo de consulta con turnos asociados",
    });

    await expect(eliminarTipoConsultaAction("tc-1")).resolves.toEqual({
      error: "no se puede eliminar un tipo de consulta con turnos asociados",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
