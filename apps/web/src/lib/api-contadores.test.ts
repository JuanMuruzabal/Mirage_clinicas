import { afterEach, describe, expect, it, vi } from "vitest";
import { apiContadoresDePacientes, apiContadoresDeTurnos } from "./api";

// Los contadores de las pestañas de Turnos y Pacientes (ronda de
// optimización post-Fase 3): un pedido en vez de cuatro/tres.
//
// En el backend, lo que se protege es que el contador cuente lo mismo que
// la lista de abajo. Acá, la mitad del cliente de esa misma promesa: que
// el pedido lleve LOS MISMOS filtros de pantalla que el listado —por eso
// se arma con `queryDeTurnos`— y ninguno de los que separan una pestaña
// de otra, que el backend resuelve solo.

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function urlDelPedido(fetchMock: ReturnType<typeof vi.fn>): URL {
  return new URL(String(fetchMock.mock.calls[0][0]), "http://api.local");
}

describe("apiContadoresDeTurnos", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("manda los filtros de pantalla y NO los de pestaña", async () => {
    const fetchMock = mockFetch(200, { agendado: 3, resuelto: 2, cancelada: 1, todas: 6 });

    await apiContadoresDeTurnos("tok", {
      estado: "agendado",
      resuelto: false,
      q: "Bruno",
      desde: "2026-09-01T03:00:00.000Z",
      hasta: "2026-09-30T03:00:00.000Z",
      tipoConsultaId: "tipo-1",
      verificacion: "verificado",
    });

    const url = urlDelPedido(fetchMock);
    expect(url.pathname).toMatch(/\/turnos\/contadores$/);
    expect(url.searchParams.get("q")).toBe("Bruno");
    expect(url.searchParams.get("desde")).toBe("2026-09-01T03:00:00.000Z");
    expect(url.searchParams.get("hasta")).toBe("2026-09-30T03:00:00.000Z");
    expect(url.searchParams.get("tipoConsultaId")).toBe("tipo-1");
    expect(url.searchParams.get("verificacion")).toBe("verificado");
    // Los que distinguen una pestaña de otra no viajan: si viajaran, las
    // cuatro contarían la pestaña activa.
    expect(url.searchParams.has("estado")).toBe(false);
    expect(url.searchParams.has("resuelto")).toBe(false);
  });

  it("sin filtros no agrega query string, y manda la sesión", async () => {
    const fetchMock = mockFetch(200, { agendado: 0, resuelto: 0, cancelada: 0, todas: 0 });

    await apiContadoresDeTurnos("tok", {});

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/turnos\/contadores$/);
    expect(new Headers((init as RequestInit).headers).get("Authorization")).toBe("Bearer tok");
  });

  it("devuelve los contadores del backend", async () => {
    mockFetch(200, { agendado: 3, resuelto: 2, cancelada: 1, todas: 6 });
    expect(await apiContadoresDeTurnos("tok", {})).toEqual({
      agendado: 3,
      resuelto: 2,
      cancelada: 1,
      todas: 6,
    });
  });

  it("si el backend falla, ceros: una pestaña sin número antes que uno inventado", async () => {
    mockFetch(500, { error: "boom" });
    expect(await apiContadoresDeTurnos("tok", {})).toEqual({
      agendado: 0,
      resuelto: 0,
      cancelada: 0,
      todas: 0,
    });
  });
});

describe("apiContadoresDePacientes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("manda la búsqueda cuando hay", async () => {
    const fetchMock = mockFetch(200, { todos: 3, verificados: 2, sinVerificar: 1 });

    await apiContadoresDePacientes("tok", { q: "Iglesias" });

    const url = urlDelPedido(fetchMock);
    expect(url.pathname).toMatch(/\/pacientes\/contadores$/);
    expect(url.searchParams.get("q")).toBe("Iglesias");
  });

  it("sin búsqueda no agrega query string", async () => {
    const fetchMock = mockFetch(200, { todos: 0, verificados: 0, sinVerificar: 0 });

    await apiContadoresDePacientes("tok");

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/pacientes\/contadores$/);
  });

  it("devuelve los contadores del backend", async () => {
    mockFetch(200, { todos: 3, verificados: 2, sinVerificar: 1 });
    expect(await apiContadoresDePacientes("tok", {})).toEqual({
      todos: 3,
      verificados: 2,
      sinVerificar: 1,
    });
  });

  it("si el backend falla, ceros", async () => {
    mockFetch(500, { error: "boom" });
    expect(await apiContadoresDePacientes("tok", {})).toEqual({
      todos: 0,
      verificados: 0,
      sinVerificar: 0,
    });
  });
});
