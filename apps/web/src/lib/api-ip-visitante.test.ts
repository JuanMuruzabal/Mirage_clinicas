import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fase 3.1.1 — el BFF le pasa a la API la IP REAL del visitante.
//
// Estos tests viven en un archivo aparte de api.test.ts porque necesitan
// controlar `process.env.BFF_SHARED_SECRET`, que api.ts lee una sola vez al
// evaluarse el módulo: hay que fijar el valor ANTES de importarlo, y por
// eso cada caso hace `resetModules()` + import dinámico.

const headersMock = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => headersMock(),
  cookies: vi.fn(),
}));

function mockFetchOnce() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [],
    headers: new Headers(),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function conCabeceras(valores: Record<string, string | null>) {
  headersMock.mockResolvedValue({ get: (nombre: string) => valores[nombre.toLowerCase()] ?? null });
}

function conXForwardedFor(valor: string | null) {
  conCabeceras({ "x-forwarded-for": valor });
}

async function importarApi() {
  vi.resetModules();
  return import("./api");
}

function cabecerasDelFetch(fetchMock: ReturnType<typeof mockFetchOnce>): Record<string, string> {
  return fetchMock.mock.calls[0][1].headers as Record<string, string>;
}

describe("IP del visitante hacia la API (Fase 3.1.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("con el secreto configurado, manda la IP del visitante y el secreto", async () => {
    vi.stubEnv("BFF_SHARED_SECRET", "secreto-compartido");
    conXForwardedFor("201.235.14.7");
    const fetchMock = mockFetchOnce();

    const { apiListEspecialidades } = await importarApi();
    await apiListEspecialidades();

    const cabeceras = cabecerasDelFetch(fetchMock);
    expect(cabeceras["X-Prisma-Client-IP"]).toBe("201.235.14.7");
    expect(cabeceras["X-Prisma-Bff-Auth"]).toBe("secreto-compartido");
  });

  // El primero lo pone el navegador y se puede inventar; los del final son
  // saltos de infraestructura. Si tomáramos el primero, cualquiera elegiría
  // su IP mandando su propio X-Forwarded-For.
  it("toma la última IP pública de x-forwarded-for, no la primera", async () => {
    vi.stubEnv("BFF_SHARED_SECRET", "secreto-compartido");
    conXForwardedFor("1.1.1.1, 2.2.2.2, 201.235.14.7");
    const fetchMock = mockFetchOnce();

    const { apiListEspecialidades } = await importarApi();
    await apiListEspecialidades();

    expect(cabecerasDelFetch(fetchMock)["X-Prisma-Client-IP"]).toBe("201.235.14.7");
  });

  // Fase 3.1.2: el final de la cadena en Render es infraestructura —
  // medido en el deploy real, un request quedó logueado como
  // ip=10.29.215.4, el router interno.
  it("saltea los saltos internos del final de la cadena", async () => {
    vi.stubEnv("BFF_SHARED_SECRET", "secreto-compartido");
    conXForwardedFor("201.235.14.7, 10.29.215.4");
    const fetchMock = mockFetchOnce();

    const { apiListEspecialidades } = await importarApi();
    await apiListEspecialidades();

    expect(cabecerasDelFetch(fetchMock)["X-Prisma-Client-IP"]).toBe("201.235.14.7");
  });

  // Cloudflare la sobrescribe en cada request, y es la única que distingue
  // al visitante del borde del CDN: 172.71.x es un rango PÚBLICO de
  // Cloudflare, así que mirando solo la cadena no hay forma de saber cuál
  // de las dos IPs públicas es la persona.
  it("prefiere cf-connecting-ip sobre la cadena", async () => {
    vi.stubEnv("BFF_SHARED_SECRET", "secreto-compartido");
    conCabeceras({
      "cf-connecting-ip": "201.235.14.7",
      "x-forwarded-for": "201.235.14.7, 172.71.98.5, 10.29.215.4",
    });
    const fetchMock = mockFetchOnce();

    const { apiListEspecialidades } = await importarApi();
    await apiListEspecialidades();

    expect(cabecerasDelFetch(fetchMock)["X-Prisma-Client-IP"]).toBe("201.235.14.7");
  });

  it("si la cadena es toda interna, no manda nada", async () => {
    vi.stubEnv("BFF_SHARED_SECRET", "secreto-compartido");
    conXForwardedFor("172.22.0.1, 10.29.215.4");
    const fetchMock = mockFetchOnce();

    const { apiListEspecialidades } = await importarApi();
    await apiListEspecialidades();

    expect(cabecerasDelFetch(fetchMock)["X-Prisma-Client-IP"]).toBeUndefined();
  });

  it("sin secreto configurado no manda ninguna cabecera de IP", async () => {
    vi.stubEnv("BFF_SHARED_SECRET", "");
    conXForwardedFor("201.235.14.7");
    const fetchMock = mockFetchOnce();

    const { apiListEspecialidades } = await importarApi();
    await apiListEspecialidades();

    const cabeceras = cabecerasDelFetch(fetchMock);
    expect(cabeceras["X-Prisma-Client-IP"]).toBeUndefined();
    expect(cabeceras["X-Prisma-Bff-Auth"]).toBeUndefined();
  });

  // Desarrollo local: el navegador le pega derecho a Next, sin proxy en el
  // medio, así que no hay x-forwarded-for. Mandar el secreto sin IP no
  // aporta nada.
  it("sin x-forwarded-for no manda nada, y el pedido sale igual", async () => {
    vi.stubEnv("BFF_SHARED_SECRET", "secreto-compartido");
    conXForwardedFor(null);
    const fetchMock = mockFetchOnce();

    const { apiListEspecialidades } = await importarApi();
    const res = await apiListEspecialidades();

    expect(res.ok).toBe(true);
    expect(cabecerasDelFetch(fetchMock)["X-Prisma-Bff-Auth"]).toBeUndefined();
  });

  // `headers()` explota fuera de un contexto de request (durante el build,
  // por ejemplo). Eso no puede tumbar un pedido a la API.
  it("si headers() falla, el pedido sale igual sin cabeceras de IP", async () => {
    vi.stubEnv("BFF_SHARED_SECRET", "secreto-compartido");
    headersMock.mockRejectedValue(new Error("fuera de un contexto de request"));
    const fetchMock = mockFetchOnce();

    const { apiListEspecialidades } = await importarApi();
    const res = await apiListEspecialidades();

    expect(res.ok).toBe(true);
    expect(cabecerasDelFetch(fetchMock)["X-Prisma-Client-IP"]).toBeUndefined();
  });
});
