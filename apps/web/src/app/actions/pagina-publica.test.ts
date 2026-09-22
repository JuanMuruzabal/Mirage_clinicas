import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  revalidatePathMock,
  apiOcultarPaginaPublicaMock,
  apiPublicarPaginaPublicaMock,
  apiActualizarPaginaPublicaMock,
  apiObtenerHistorialPaginaPublicaMock,
  apiRestaurarVersionPaginaPublicaMock,
  apiGetPaginaPublicaMock,
  apiSubirFotoPaginaPublicaMock,
  getSessionTokenMock,
} = vi.hoisted(
  () => ({
    redirectMock: vi.fn((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    }),
    revalidatePathMock: vi.fn(),
    apiOcultarPaginaPublicaMock: vi.fn(),
    apiPublicarPaginaPublicaMock: vi.fn(),
    apiActualizarPaginaPublicaMock: vi.fn(),
    apiObtenerHistorialPaginaPublicaMock: vi.fn(),
    apiRestaurarVersionPaginaPublicaMock: vi.fn(),
    apiGetPaginaPublicaMock: vi.fn(),
    apiSubirFotoPaginaPublicaMock: vi.fn(),
    getSessionTokenMock: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/api", () => ({
  apiOcultarPaginaPublica: apiOcultarPaginaPublicaMock,
  apiPublicarPaginaPublica: apiPublicarPaginaPublicaMock,
  apiActualizarPaginaPublica: apiActualizarPaginaPublicaMock,
  apiObtenerHistorialPaginaPublica: apiObtenerHistorialPaginaPublicaMock,
  apiRestaurarVersionPaginaPublica: apiRestaurarVersionPaginaPublicaMock,
  apiGetPaginaPublica: apiGetPaginaPublicaMock,
  apiSubirFotoPaginaPublica: apiSubirFotoPaginaPublicaMock,
}));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const {
  ocultarPaginaPublicaAction,
  publicarPaginaPublicaAction,
  actualizarPaginaPublicaAction,
  historialPaginaPublicaAction,
  restaurarVersionPaginaPublicaAction,
  obtenerPaginaPublicaAction,
  subirFotoPaginaPublicaAction,
} = await import("./pagina-publica");

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

describe("publicarPaginaPublicaAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(publicarPaginaPublicaAction("clinica-x")).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida /personalizar-pagina, /buscar y /{slug}, y devuelve la página", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiPublicarPaginaPublicaMock.mockResolvedValue({ ok: true, data: { oculta: false, deployadaEn: "2026-08-23T00:00:00Z" } });

    const result = await publicarPaginaPublicaAction("clinica-x");

    expect(result).toEqual({ pagina: { oculta: false, deployadaEn: "2026-08-23T00:00:00Z" } });
    expect(apiPublicarPaginaPublicaMock).toHaveBeenCalledWith("un-jwt");
    expect(revalidatePathMock).toHaveBeenCalledWith("/personalizar-pagina");
    expect(revalidatePathMock).toHaveBeenCalledWith("/buscar");
    expect(revalidatePathMock).toHaveBeenCalledWith("/clinica-x");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiPublicarPaginaPublicaMock.mockResolvedValue({ ok: false, status: 500, error: "no se pudo publicar la página" });

    const result = await publicarPaginaPublicaAction("clinica-x");

    expect(result).toEqual({ error: "no se pudo publicar la página" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("actualizarPaginaPublicaAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(actualizarPaginaPublicaAction({ bio: "x", revision: 0 })).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito devuelve kind ok con la página, y revalida /personalizar-pagina", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiActualizarPaginaPublicaMock.mockResolvedValue({ kind: "ok", data: { oculta: false, deployadaEn: null, revision: 1 } });

    const result = await actualizarPaginaPublicaAction({ bio: "x", revision: 0 });

    expect(result).toEqual({ kind: "ok", pagina: { oculta: false, deployadaEn: null, revision: 1 } });
    expect(apiActualizarPaginaPublicaMock).toHaveBeenCalledWith("un-jwt", { bio: "x", revision: 0 });
    expect(revalidatePathMock).toHaveBeenCalledWith("/personalizar-pagina");
  });

  it("en conflicto (409) devuelve kind conflicto sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    const conflicto = { error: "x", revisionActual: 3, actualizadaEn: "2026-09-22T00:00:00Z", actualizadaPorNombre: "Ana" };
    apiActualizarPaginaPublicaMock.mockResolvedValue({ kind: "conflicto", conflicto });

    const result = await actualizarPaginaPublicaAction({ bio: "x", revision: 0 });

    expect(result).toEqual({ kind: "conflicto", conflicto });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("en error devuelve el mensaje del backend sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiActualizarPaginaPublicaMock.mockResolvedValue({ kind: "error", status: 400, error: "tema o variante de color inválidos" });
    expect(await actualizarPaginaPublicaAction({ tema: "x", revision: 0 })).toEqual({
      kind: "error",
      error: "tema o variante de color inválidos",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("historialPaginaPublicaAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(historialPaginaPublicaAction()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito devuelve las versiones", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    const versiones = [{ numero: 1, publicadaEn: "2026-09-22T00:00:00Z", publicadaPorNombre: "Ana", contenido: {} }];
    apiObtenerHistorialPaginaPublicaMock.mockResolvedValue({ ok: true, data: versiones });
    expect(await historialPaginaPublicaAction()).toEqual({ versiones });
  });
});

describe("restaurarVersionPaginaPublicaAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(restaurarVersionPaginaPublicaAction(1, 0)).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito devuelve kind ok y revalida /personalizar-pagina", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiRestaurarVersionPaginaPublicaMock.mockResolvedValue({ kind: "ok", data: { oculta: false, revision: 4 } });
    const result = await restaurarVersionPaginaPublicaAction(1, 3);
    expect(result).toEqual({ kind: "ok", pagina: { oculta: false, revision: 4 } });
    expect(apiRestaurarVersionPaginaPublicaMock).toHaveBeenCalledWith("un-jwt", 1, 3);
    expect(revalidatePathMock).toHaveBeenCalledWith("/personalizar-pagina");
  });
});

describe("obtenerPaginaPublicaAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(obtenerPaginaPublicaAction()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito devuelve la página tal cual", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiGetPaginaPublicaMock.mockResolvedValue({ ok: true, data: { oculta: false, revision: 7 } });
    expect(await obtenerPaginaPublicaAction()).toEqual({ pagina: { oculta: false, revision: 7 } });
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
