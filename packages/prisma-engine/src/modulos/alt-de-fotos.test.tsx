import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { REGISTRO_MODULOS } from "../registro";
import { ESQUEMAS_MODULOS } from "../schemas";
import type { ContextoPublico, EditorModuloProps, ModuloBorrador } from "../tipos";

// PP-4 (H13): la descripción de las fotos. Vacía, el alt genérico de
// siempre; cargada, la del admin. En la galería van alineadas posición por
// posición con fotoUrls, y el editor tiene que mantenerlas alineadas.

const contexto = (parcial: Partial<ContextoPublico["utils"]> = {}): ContextoPublico => ({
  nombreClinica: "Clínica Sol",
  telefono: null,
  especialidades: [],
  contenido: { bio: null, direccion: null, mostrarMapa: false, redesSociales: {}, estadisticas: {} },
  utils: {
    esUrlDeFotoSegura: (url) => url.startsWith("/uploads/"),
    hrefDeTelefono: (t) => `tel:${t}`,
    urlDeComoLlegar: (d) => d,
    urlDeMapaEmbebido: (d) => d,
    urlDeRedSocial: () => null,
    ...parcial,
  },
});

const modulo = (tipo: string, config: Record<string, unknown>): ModuloBorrador => ({ clave: "c1", tipo, visible: true, config });

function dibujar(m: ModuloBorrador) {
  const s = REGISTRO_MODULOS[m.tipo as keyof typeof REGISTRO_MODULOS].seccion(m, 0, contexto());
  render(<>{s?.contenido}</>);
}

describe("alt de las fotos en la página", () => {
  it("foto suelta: el alt cargado, y vacío el genérico", () => {
    dibujar(modulo("foto", { fotoUrl: "/uploads/a.jpg", subtipo: "banner", fotoAlt: "  La sala de espera " }));
    expect(screen.getByRole("img").getAttribute("alt")).toBe("La sala de espera");
  });

  it("foto suelta sin alt: el genérico de siempre", () => {
    dibujar(modulo("foto", { fotoUrl: "/uploads/a.jpg", subtipo: "banner", fotoAlt: "   " }));
    expect(screen.getByRole("img").getAttribute("alt")).toBe("Foto de Clínica Sol");
  });

  it("galería: cada descripción queda con SU foto aunque se filtre una URL insegura antes", () => {
    dibujar(modulo("galeria", { fotoUrls: ["javascript:x", "/uploads/b.jpg", "/uploads/c.jpg"], fotoAlts: ["mala", "El consultorio"] }));
    const fotos = screen.getAllByRole("img");
    expect(fotos.map((f) => f.getAttribute("alt"))).toEqual(["El consultorio", "Foto 2 de Clínica Sol"]);
  });
});

describe("esquemas", () => {
  it("aceptan una config vieja, sin descripciones", () => {
    expect(ESQUEMAS_MODULOS.galeria.safeParse({ fotoUrls: ["/uploads/a.jpg"] }).success).toBe(true);
    expect(ESQUEMAS_MODULOS.foto.safeParse({ fotoUrl: "/uploads/a.jpg", subtipo: "banner" }).success).toBe(true);
  });
});

function EditorDeGaleria({ inicial, onConfig }: { inicial: Record<string, unknown>; onConfig: (c: Record<string, unknown>) => void }) {
  const [config, setConfig] = useState(inicial);
  const { Editor } = REGISTRO_MODULOS.galeria;
  const props = {
    modulo: modulo("galeria", config),
    onConfig: (c: Record<string, unknown>) => {
      setConfig(c);
      onConfig(c);
    },
    componentes: { SubirFoto: () => null },
  } as unknown as EditorModuloProps;
  return <Editor {...props} />;
}

describe("editor de la galería", () => {
  it("escribir una descripción la guarda en su posición", () => {
    const onConfig = vi.fn();
    render(<EditorDeGaleria inicial={{ fotoUrls: ["/uploads/a.jpg", "/uploads/b.jpg"] }} onConfig={onConfig} />);
    fireEvent.change(screen.getByLabelText(/descripción de la foto 2/i), { target: { value: "El jardín" } });
    expect(onConfig).toHaveBeenLastCalledWith({ fotoUrls: ["/uploads/a.jpg", "/uploads/b.jpg"], fotoAlts: ["", "El jardín"] });
  });

  it("quitar una foto se lleva su descripción, y sin ninguna la lista desaparece", () => {
    const onConfig = vi.fn();
    render(<EditorDeGaleria inicial={{ fotoUrls: ["/uploads/a.jpg", "/uploads/b.jpg"], fotoAlts: ["", "El jardín"] }} onConfig={onConfig} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar foto 2" }));
    expect(onConfig).toHaveBeenLastCalledWith({ fotoUrls: ["/uploads/a.jpg"] });
  });

  it("quitar la primera corre las descripciones con sus fotos", () => {
    const onConfig = vi.fn();
    render(<EditorDeGaleria inicial={{ fotoUrls: ["/uploads/a.jpg", "/uploads/b.jpg"], fotoAlts: ["", "El jardín"] }} onConfig={onConfig} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar foto 1" }));
    expect(onConfig).toHaveBeenLastCalledWith({ fotoUrls: ["/uploads/b.jpg"], fotoAlts: ["El jardín"] });
  });
});
