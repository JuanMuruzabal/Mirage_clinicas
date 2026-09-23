import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiSitemapClinicasMock } = vi.hoisted(() => ({ apiSitemapClinicasMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiSitemapClinicas: apiSitemapClinicasMock }));

const { default: sitemap } = await import("./sitemap");
const { default: robots } = await import("./robots");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SITE_URL", "https://prisma.test/");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sitemap.xml", () => {
  it("lista el inicio, el buscador y cada clínica publicada con su fecha", async () => {
    apiSitemapClinicasMock.mockResolvedValue({ ok: true, data: [{ slug: "clinica-sol", actualizadaEn: "2026-09-20T10:00:00Z" }] });
    const urls = await sitemap();
    expect(urls.map((u) => u.url)).toEqual(["https://prisma.test/", "https://prisma.test/buscar", "https://prisma.test/clinica-sol"]);
    expect(urls[2].lastModified).toBe("2026-09-20T10:00:00Z");
  });

  it("si la API no responde, sirve igual lo fijo en vez de fallar", async () => {
    apiSitemapClinicasMock.mockResolvedValue({ ok: false, status: 0, error: "sin conexión" });
    expect((await sitemap()).map((u) => u.url)).toEqual(["https://prisma.test/", "https://prisma.test/buscar"]);
  });
});

describe("robots.txt", () => {
  it("deja indexar lo público, no las pantallas con sesión, y apunta al sitemap", () => {
    const r = robots();
    const reglas = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(reglas.allow).toBe("/");
    expect(reglas.disallow).toContain("/panel$");
    expect(reglas.disallow).toContain("/panel/");
    // Nunca un prefijo suelto: bloquearía clínicas cuyo slug empiece igual.
    expect(reglas.disallow).not.toContain("/panel");
    expect(r.sitemap).toBe("https://prisma.test/sitemap.xml");
  });

  it("sin SITE_URL usa la URL que inyecta Render, y en local localhost", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://dental.onrender.com");
    expect(robots().sitemap).toBe("https://dental.onrender.com/sitemap.xml");
    vi.stubEnv("RENDER_EXTERNAL_URL", "");
    expect(robots().sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});
