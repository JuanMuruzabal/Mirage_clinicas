import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOGO_PLANTILLAS } from "@dental-mirage/prisma-engine";
import { clinicaDeDemostracion } from "./demostracion";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("clinicaDeDemostracion", () => {
  it("apagada sin PRISMA_DEMO_PLANTILLAS: `demo-...` es un slug como cualquier otro", () => {
    expect(clinicaDeDemostracion(`demo-${CATALOGO_PLANTILLAS[0].id}`)).toBeNull();
  });

  it("con la variable, arma la página de cada plantilla sin pasar por la API", () => {
    vi.stubEnv("PRISMA_DEMO_PLANTILLAS", "1");
    for (const plantilla of CATALOGO_PLANTILLAS) {
      const clinica = clinicaDeDemostracion(`demo-${plantilla.id}`);
      expect(clinica?.tema).toBe(plantilla.tema);
      expect(clinica?.modulos).toHaveLength(plantilla.modulos.length);
      expect(clinica?.temaTokens.movimiento).toBe(plantilla.estiloMovimiento);
    }
    const conEquipo = CATALOGO_PLANTILLAS.find((p) => p.modulos.some((m) => m.tipo === "equipo"));
    const equipo = clinicaDeDemostracion(`demo-${conEquipo?.id}`)?.modulos.find((m) => m.tipo === "equipo");
    expect(equipo?.datosVista?.equipo?.length).toBeGreaterThan(0);
  });

  it("un slug sin el prefijo o con una plantilla que no existe no es una demostración", () => {
    vi.stubEnv("PRISMA_DEMO_PLANTILLAS", "1");
    expect(clinicaDeDemostracion("clinica-sol")).toBeNull();
    expect(clinicaDeDemostracion("demo-no-existe")).toBeNull();
  });
});
