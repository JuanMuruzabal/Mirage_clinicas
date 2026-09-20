import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const apiEquipoMock = vi.fn();
const apiVistaActualMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiEquipo: (...args: unknown[]) => apiEquipoMock(...args),
  apiVistaActual: (...args: unknown[]) => apiVistaActualMock(...args),
}));

const { datosDeLaVista } = await import("./vista-de-recepcion");

function miembro(over: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    nombre: "Lucía Gómez",
    email: "lucia@example.com",
    roles: ["profesional"],
    especialidad: "Ortodoncia",
    ...over,
  };
}

beforeEach(() => {
  apiEquipoMock.mockReset();
  apiVistaActualMock.mockReset();
  apiEquipoMock.mockResolvedValue({ ok: true, data: { miembros: [miembro()] } });
  apiVistaActualMock.mockResolvedValue({ ok: true, data: { profesional: null } });
});

// Fase 3.2.6 — de quién es la agenda que estoy mirando.
describe("datosDeLaVista", () => {
  // El aislamiento de la 3.2.2 no se relaja: para quien no es recepción
  // la pregunta directamente no existe, y ni siquiera se pide el equipo.
  it("para quien no es recepción no pide nada y devuelve el selector vacío", async () => {
    const datos = await datosDeLaVista("un-token", ["profesional", "owner"]);

    expect(datos).toEqual({ profesionales: [], vista: null, esRecepcion: false });
    expect(apiEquipoMock).not.toHaveBeenCalled();
    expect(apiVistaActualMock).not.toHaveBeenCalled();
  });

  it("sin token tampoco pregunta", async () => {
    const datos = await datosDeLaVista(undefined, ["recepcion"]);

    expect(datos.esRecepcion).toBe(false);
    expect(apiEquipoMock).not.toHaveBeenCalled();
  });

  it("para recepción trae los profesionales y la vista actual", async () => {
    apiVistaActualMock.mockResolvedValue({
      ok: true,
      data: { profesional: { userId: "u1", nombre: "Lucía Gómez" } },
    });

    const datos = await datosDeLaVista("un-token", ["recepcion"]);

    expect(datos.esRecepcion).toBe(true);
    expect(datos.profesionales).toEqual([{ userId: "u1", detalle: "Ortodoncia", nombre: "Lucía Gómez" }]);
    expect(datos.vista?.profesional?.userId).toBe("u1");
  });

  // Un administrador de página o un segundo recepcionista no tienen
  // agenda que mirar — el backend lo rechaza con 409, así que ofrecerlos
  // en el carrusel sería ofrecer un error.
  it("deja afuera a quien no atiende pacientes", async () => {
    apiEquipoMock.mockResolvedValue({
      ok: true,
      data: {
        miembros: [
          miembro(),
          miembro({ userId: "u2", nombre: "Admin", roles: ["admin"] }),
          miembro({ userId: "u3", nombre: "Otra recepción", roles: ["recepcion"] }),
        ],
      },
    });

    const datos = await datosDeLaVista("un-token", ["recepcion"]);

    expect(datos.profesionales.map((p) => p.userId)).toEqual(["u1"]);
  });

  // La línea de abajo del carrusel nunca queda vacía: sin perfil cargado
  // se dice algo genérico antes que dejar un hueco.
  it("sin especialidad cargada usa un detalle genérico", async () => {
    apiEquipoMock.mockResolvedValue({
      ok: true,
      data: { miembros: [miembro({ especialidad: "" })] },
    });

    const datos = await datosDeLaVista("un-token", ["recepcion"]);

    expect(datos.profesionales[0].detalle).toBe("Profesional de la clínica");
  });

  // Que el backend falle no puede dejar al panel sin dibujarse: el
  // selector queda vacío y la pantalla sigue siendo la de recepción.
  it("si el equipo no responde el selector queda vacío, no rompe", async () => {
    apiEquipoMock.mockResolvedValue({ ok: false, error: "500" });
    apiVistaActualMock.mockResolvedValue({ ok: false, error: "500" });

    const datos = await datosDeLaVista("un-token", ["recepcion"]);

    expect(datos).toEqual({ profesionales: [], vista: null, esRecepcion: true });
  });
});
