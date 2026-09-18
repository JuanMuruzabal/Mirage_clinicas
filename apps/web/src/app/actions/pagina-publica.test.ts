import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  revalidatePathMock,
  apiOcultarPaginaPublicaMock,
  apiDeployarPaginaPublicaMock,
  apiActualizarPaginaPublicaMock,
  apiSubirFotoPaginaPublicaMock,
  getSessionTokenMock,
} = vi.hoisted(
  () => ({
    redirectMock: vi.fn((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    }),
    revalidatePathMock: vi.fn(),
    apiOcultarPaginaPublicaMock: vi.fn(),
    apiDeployarPaginaPublicaMock: vi.fn(),
    apiActualizarPaginaPublicaMock: vi.fn(),
    apiSubirFotoPaginaPublicaMock: vi.fn(),
    getSessionTokenMock: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/api", () => ({
  apiOcultarPaginaPublica: apiOcultarPaginaPublicaMock,
  apiDeployarPaginaPublica: apiDeployarPaginaPublicaMock,
  apiActualizarPaginaPublica: apiActualizarPaginaPublicaMock,
  apiSubirFotoPaginaPublica: apiSubirFotoPaginaPublicaMock,
}));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const { ocultarPaginaPublicaAction, deployarPaginaPublicaAction, actualizarPaginaPublicaAction, subirFotoPaginaPublicaAction } =
  await import("./pagina-publica");

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

describe("actualizarPaginaPublicaAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(actualizarPaginaPublicaAction({ bio: "x" })).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito devuelve la página; revalida el buscador solo si ya está publicada", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiActualizarPaginaPublicaMock.mockResolvedValue({ ok: true, data: { oculta: false, deployadaEn: null } });
    await actualizarPaginaPublicaAction({ bio: "x" });
    expect(apiActualizarPaginaPublicaMock).toHaveBeenCalledWith("un-jwt", { bio: "x" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/personalizar-pagina");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/buscar");

    apiActualizarPaginaPublicaMock.mockResolvedValue({ ok: true, data: { oculta: false, deployadaEn: "2026-09-18T00:00:00Z" } });
    await actualizarPaginaPublicaAction({ bio: "y" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/buscar");
  });

  it("en error devuelve el mensaje del backend sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiActualizarPaginaPublicaMock.mockResolvedValue({ ok: false, status: 400, error: "tema o variante de color inválidos" });
    expect(await actualizarPaginaPublicaAction({ tema: "x" })).toEqual({ error: "tema o variante de color inválidos" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("subirFotoPaginaPublicaAction", () => {
  const conFoto = (foto: unknown) => {
    const datos = new FormData();
    if (foto !== undefined) datos.append("foto", foto as Blob | string);
    return datos;
  };
  const archivo = () => new File(["x"], "f.png", { type: "image/png" });

  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(subirFotoPaginaPublicaAction(conFoto(archivo()))).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("sin archivo (o con un campo que no es un archivo) no llama al backend", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    expect(await subirFotoPaginaPublicaAction(conFoto(undefined))).toEqual({ error: "Elegí una imagen para subir." });
    expect(await subirFotoPaginaPublicaAction(conFoto("texto"))).toEqual({ error: "Elegí una imagen para subir." });
    expect(apiSubirFotoPaginaPublicaMock).not.toHaveBeenCalled();
  });

  it("en éxito devuelve solo la URL y NO revalida nada (la foto no forma parte de la página hasta guardar)", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiSubirFotoPaginaPublicaMock.mockResolvedValue({ ok: true, data: { url: "http://localhost:8080/uploads/a.png" } });
    expect(await subirFotoPaginaPublicaAction(conFoto(archivo()))).toEqual({ url: "http://localhost:8080/uploads/a.png" });
    expect(apiSubirFotoPaginaPublicaMock).toHaveBeenCalledWith("un-jwt", expect.any(File));
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("un 501 (storage sin configurar) se explica como un estado esperable, no como un fallo", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiSubirFotoPaginaPublicaMock.mockResolvedValue({ ok: false, status: 501, error: "el storage de archivos no está configurado" });
    expect(await subirFotoPaginaPublicaAction(conFoto(archivo()))).toEqual({
      error: "La subida de fotos todavía no está disponible en este entorno.",
    });
  });

  it("cualquier otro error del backend se devuelve tal cual", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiSubirFotoPaginaPublicaMock.mockResolvedValue({ ok: false, status: 400, error: "formato de imagen no soportado — usá JPEG, PNG o WebP" });
    expect(await subirFotoPaginaPublicaAction(conFoto(archivo()))).toEqual({ error: "formato de imagen no soportado — usá JPEG, PNG o WebP" });
  });
});
