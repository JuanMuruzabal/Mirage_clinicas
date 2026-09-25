import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CATALOGO_PLANTILLAS, type PlantillaPagina } from "@dental-mirage/prisma-engine";
import type { PaginaPublica } from "@dental-mirage/shared-types";
import type { Borrador } from "@/lib/pagina-publica/borrador";

vi.mock("./vista-previa", () => ({ VistaPrevia: () => null }));

import { GaleriaPlantillas, type ModoPlantilla } from "./galeria-plantillas";

const borradorBase: Borrador = {
  bio: "Texto propio de la clínica.",
  tema: "clinico",
  temaVariante: "clinico-2",
  temaTipografia: "geometrica-moderna",
  fotoPortadaUrl: "/uploads/portada-propia.jpg",
  redes: { instagram: "@clinica" },
  mostrarMapa: true,
  direccionOverride: "Calle 123",
  nombreSobrePortada: true,
  nombreColor: "",
  temaTokens: { movimiento: "quieto" },
  seoTitulo: "",
  seoDescripcion: "",
  modulos: [
    {
      clave: "sobre-1",
      tipo: "sobre_nosotros",
      visible: true,
      config: { variante: "centrado", fotoUrl: "/uploads/equipo-propio.jpg" },
    },
  ],
  revision: 3,
};

const pagina = {
  estadisticas: {},
  direccionClinica: "Calle 456",
  equipoElegible: [],
  horariosClinica: undefined,
  serviciosDisponibles: [],
} as Pick<PaginaPublica, "estadisticas" | "direccionClinica" | "equipoElegible" | "horariosClinica" | "serviciosDisponibles">;

function renderGaleria(borrador = borradorBase) {
  const onAplicar = vi.fn<(valor: Borrador, modo: ModoPlantilla, plantilla: PlantillaPagina) => void>();
  const onCerrar = vi.fn<() => void>();
  const user = userEvent.setup();

  render(
    <GaleriaPlantillas
      slug="clinica-ejemplo"
      nombreClinica="Clínica Ejemplo"
      profesionalNombre="María"
      especialidades={["Odontología"]}
      borrador={borrador}
      pagina={pagina}
      onAplicar={onAplicar}
      onCerrar={onCerrar}
    />,
  );

  return { onAplicar, onCerrar, user };
}

describe("GaleriaPlantillas", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("permite elegir otra plantilla y marca la selección actual", async () => {
    const { user, onAplicar, onCerrar } = renderGaleria();
    const inicial = screen.getByRole("button", { name: /Odontología · Clínico sereno/ });
    const alternativa = screen.getByRole("button", { name: /Odontología · Cálido dinámico/ });

    expect(inicial).toHaveAttribute("aria-pressed", "true");
    await user.click(alternativa);

    expect(alternativa).toHaveAttribute("aria-pressed", "true");
    expect(inicial).toHaveAttribute("aria-pressed", "false");
    expect(onAplicar).not.toHaveBeenCalled();
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("aplica solo el diseño y conserva los textos y fotos existentes", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { user, onAplicar, onCerrar } = renderGaleria();
    const plantilla = CATALOGO_PLANTILLAS.find((item) => item.id === "odontologia-calido-dinamico")!;
    await user.click(screen.getByRole("button", { name: /Odontología · Cálido dinámico/ }));
    await user.click(screen.getByRole("button", { name: "Aplicar solo el diseño" }));

    expect(onAplicar).toHaveBeenCalledTimes(1);
    const [aplicado, modo, elegida] = onAplicar.mock.calls[0];
    expect(modo).toBe("diseno");
    expect(elegida.id).toBe(plantilla.id);
    expect(aplicado.tema).toBe(plantilla.tema);
    expect(aplicado.temaTokens.movimiento).toBe(plantilla.estiloMovimiento);
    expect(aplicado.bio).toBe(borradorBase.bio);
    expect(aplicado.fotoPortadaUrl).toBe(borradorBase.fotoPortadaUrl);
    expect(aplicado.modulos[0].config).toEqual(expect.objectContaining({
      variante: plantilla.modulos[0].config.variante,
      fotoUrl: "/uploads/equipo-propio.jpg",
    }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  // PP-3 (H10/H19): reemplazar ya no pregunta con window.confirm — el editor
  // ofrece "Deshacer" después (ver pagina-editor.test.tsx).
  it("reemplaza todo el borrador sin window.confirm, avisando el modo", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { user, onAplicar, onCerrar } = renderGaleria();
    const plantilla = CATALOGO_PLANTILLAS.find((item) => item.id === "kinesiologia-calido-dinamico")!;
    await user.click(screen.getByRole("button", { name: /Kinesiología · Cálido dinámico/ }));
    await user.click(screen.getByRole("button", { name: "Reemplazar todo el borrador" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(onAplicar).toHaveBeenCalledTimes(1);
    const [aplicado, modo] = onAplicar.mock.calls[0];
    expect(modo).toBe("reemplazar");
    expect(aplicado.tema).toBe(plantilla.tema);
    expect(aplicado.bio).toBe(plantilla.bio);
    expect(aplicado.fotoPortadaUrl).toBe("");
    expect(aplicado.modulos.map((modulo) => modulo.tipo)).toEqual(plantilla.modulos.map((modulo) => modulo.tipo));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it("es un diálogo modal que se cierra con Escape", async () => {
    const { user, onAplicar, onCerrar } = renderGaleria();
    expect(screen.getByRole("dialog", { name: "Plantillas por especialidad" })).toHaveAttribute("aria-modal", "true");

    await user.keyboard("{Escape}");

    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(onAplicar).not.toHaveBeenCalled();
  });
});
