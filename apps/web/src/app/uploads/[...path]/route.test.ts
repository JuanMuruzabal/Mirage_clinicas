import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchUploadMock } = vi.hoisted(() => ({ apiFetchUploadMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetchUpload: apiFetchUploadMock }));

const { GET } = await import("./route");

// RouteContext es un tipo global que Next genera con `typegen`; en el test
// alcanza con la forma que el handler lee (params como promesa).
const pedir = (...path: string[]) =>
  GET(new Request("http://localhost:3000/uploads/" + path.join("/")), { params: Promise.resolve({ path }) } as never);

const NOMBRE = "pM57apYdofXnjjQoF3SA9GP3HmNU6Us_JO8TEMrih6A.png";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /uploads/{archivo}", () => {
  it("devuelve la imagen que le da la API, con el tipo de la extensión y cache larga", async () => {
    apiFetchUploadMock.mockResolvedValue(
      new Response("bytes-de-la-imagen", { status: 200, headers: { "Content-Type": "text/html", "Content-Length": "18" } }),
    );

    const res = await pedir(NOMBRE);

    expect(apiFetchUploadMock).toHaveBeenCalledWith(NOMBRE);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("bytes-de-la-imagen");
    // Aunque la API conteste text/html, se sirve por la extensión validada.
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Length")).toBe("18");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("resuelve el tipo para cada extensión soportada", async () => {
    for (const [ext, tipo] of [
      ["jpg", "image/jpeg"],
      ["png", "image/png"],
      ["webp", "image/webp"],
    ]) {
      apiFetchUploadMock.mockResolvedValue(new Response("x", { status: 200 }));
      const res = await pedir(`abc_DEF-123.${ext}`);
      expect(res.headers.get("Content-Type")).toBe(tipo);
    }
  });

  it("solo acepta el nombre que genera el backend: nada de rutas, traversal ni otras extensiones", async () => {
    for (const path of [
      ["..", "etc"],
      ["a", "b.png"],
      ["..%2F..%2Fsecreto.png"],
      ["../secreto.png"],
      ["foto.gif"],
      ["foto.svg"],
      ["foto.html"],
      ["foto"],
      [".png"],
      ["a b.png"],
      ["a.png.exe"],
      [`${"a".repeat(129)}.png`],
      [],
    ]) {
      const res = await pedir(...path);
      expect(res.status, JSON.stringify(path)).toBe(404);
    }
    // Ninguno llegó a la API.
    expect(apiFetchUploadMock).not.toHaveBeenCalled();
  });

  it("404 si la API dice que el archivo no existe", async () => {
    apiFetchUploadMock.mockResolvedValue(new Response("nope", { status: 404 }));
    expect((await pedir(NOMBRE)).status).toBe(404);
  });

  it("502 si no se pudo hablar con la API (distinto de 'no existe')", async () => {
    apiFetchUploadMock.mockResolvedValue(null);
    expect((await pedir(NOMBRE)).status).toBe(502);
  });
});
