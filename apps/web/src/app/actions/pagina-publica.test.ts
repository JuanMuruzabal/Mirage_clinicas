import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, revalidatePathMock, apiOcultarPaginaPublicaMock, apiDeployarPaginaPublicaMock, getSessionTokenMock } = vi.hoisted(
  () => ({
    redirectMock: vi.fn((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    }),
    revalidatePathMock: vi.fn(),
    apiOcultarPaginaPublicaMock: vi.fn(),
    apiDeployarPaginaPublicaMock: vi.fn(),
    getSessionTokenMock: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/api", () => ({
  apiOcultarPaginaPublica: apiOcultarPaginaPublicaMock,
  apiDeployarPaginaPublica: apiDeployarPaginaPublicaMock,
}));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const { ocultarPaginaPublicaAction, deployarPaginaPublicaAction } = await import("./pagina-publica");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ocultarPaginaPublicaAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(ocultarPaginaPublicaAction(true)).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida /personalizar-pagina y devuelve la página", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiOcultarPaginaPublicaMock.mockResolvedValue({ ok: true, data: { oculta: true, deployadaEn: null } });

    const result = await ocultarPaginaPublicaAction(true);

    expect(result).toEqual({ pagina: { oculta: true, deployadaEn: null } });
    expect(apiOcultarPaginaPublicaMock).toHaveBeenCalledWith("un-jwt", { oculta: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/personalizar-pagina");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiOcultarPaginaPublicaMock.mockResolvedValue({ ok: false, status: 500, error: "no se pudo actualizar la página" });

    const result = await ocultarPaginaPublicaAction(true);

    expect(result).toEqual({ error: "no se pudo actualizar la página" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("deployarPaginaPublicaAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(deployarPaginaPublicaAction()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida /personalizar-pagina y /buscar (T4.5), y devuelve la página", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiDeployarPaginaPublicaMock.mockResolvedValue({ ok: true, data: { oculta: false, deployadaEn: "2026-08-23T00:00:00Z" } });

    const result = await deployarPaginaPublicaAction();

    expect(result).toEqual({ pagina: { oculta: false, deployadaEn: "2026-08-23T00:00:00Z" } });
    expect(apiDeployarPaginaPublicaMock).toHaveBeenCalledWith("un-jwt");
    expect(revalidatePathMock).toHaveBeenCalledWith("/personalizar-pagina");
    expect(revalidatePathMock).toHaveBeenCalledWith("/buscar");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiDeployarPaginaPublicaMock.mockResolvedValue({ ok: false, status: 500, error: "no se pudo publicar la página" });

    const result = await deployarPaginaPublicaAction();

    expect(result).toEqual({ error: "no se pudo publicar la página" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
