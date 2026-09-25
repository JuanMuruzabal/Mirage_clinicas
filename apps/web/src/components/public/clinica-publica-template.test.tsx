import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ClinicaPublicaTemplate } from "./clinica-publica-template";
import { CONTENIDO_VACIO, type ContenidoPagina } from "@/lib/pagina-publica/contenido";
import type { ModuloBorrador } from "@/lib/pagina-publica/modulos";

// PedirTurnoButton (renderizado siempre por esta plantilla) usa
// useSearchParams para leer `?enlace=` (Fase 2, ítem 5) — sin mock,
// jsdom no tiene ningún router real y el hook explota al montar.
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

const props = {
  slug: "clinica-sonrisas",
  nombreClinica: "Clínica Sonrisas",
  telefono: "+5493511234567",
  especialidades: ["Odontología general", "Ortodoncia"],
};

function modulo(tipo: string, config: Record<string, unknown> = {}, visible = true): ModuloBorrador {
  return { clave: `${tipo}-${Math.random()}`, tipo, visible, config };
}

function contenido(parcial: Partial<ContenidoPagina>): ContenidoPagina {
  return { ...CONTENIDO_VACIO, ...parcial };
}

describe("ClinicaPublicaTemplate — sin contenido (página que nadie personalizó)", () => {
  it("muestra lo fijo y la estructura por defecto: turno y especialidades", () => {
    render(<ClinicaPublicaTemplate {...props} />);
    expect(screen.getByRole("heading", { level: 1, name: "Clínica Sonrisas" })).toBeInTheDocument();
    // La portada nombra solo a la clínica (PP-7, H27).
    expect(screen.queryByText("María Games")).not.toBeInTheDocument();
    // "Pedí tu turno" aparece dos veces (el ancla del menú + el título de la
    // sección) — getByRole("heading") apunta al título, no al ancla.
    expect(screen.getByRole("heading", { name: "Pedí tu turno" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Especialidades" })).toBeInTheDocument();
    expect(screen.getByText("Odontología general")).toBeInTheDocument();
    expect(screen.getByText("Ortodoncia")).toBeInTheDocument();
  });

  it("'Sobre nosotros' no aparece sin texto: ni un placeholder ni un título suelto", () => {
    render(<ClinicaPublicaTemplate {...props} />);
    expect(screen.queryByRole("heading", { name: "Sobre nosotros" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sobre nosotros" })).not.toBeInTheDocument();
    expect(screen.queryByText(/todavía no tiene contenido propio/)).not.toBeInTheDocument();
  });

  it("el menú enlaza por ancla a las secciones que SÍ se dibujaron", () => {
    render(<ClinicaPublicaTemplate {...props} />);
    expect(screen.getByRole("link", { name: "Pedí tu turno" })).toHaveAttribute("href", "#turno");
    expect(screen.getByRole("link", { name: "Especialidades" })).toHaveAttribute("href", "#especialidades");
  });

  it("sin especialidades, ni la sección ni su link del menú", () => {
    render(<ClinicaPublicaTemplate {...props} especialidades={[]} />);
    expect(screen.queryByRole("heading", { name: "Especialidades" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Especialidades" })).not.toBeInTheDocument();
  });

  it("conserva el aspecto original (fondo celeste) cuando no hay tema", () => {
    const { container } = render(<ClinicaPublicaTemplate {...props} />);
    // Sin tema no se define ninguna custom property: manda el fallback.
    expect(container.firstElementChild).not.toHaveAttribute("style");
  });
});

describe("ClinicaPublicaTemplate — módulos", () => {
  it("dibuja los módulos en el orden de la lista", () => {
    render(
      <ClinicaPublicaTemplate
        {...props}
        contenido={contenido({
          bio: "Atendemos desde 1998.",
          modulos: [
            modulo("texto_libre", { titulo: "Nuestra filosofía", texto: "Cuidamos tu sonrisa." }),
            modulo("sobre_nosotros"),
            modulo("especialidades"),
          ],
        })}
      />,
    );
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual(["Pedí tu turno", "Nuestra filosofía", "Sobre nosotros", "Especialidades"]);
    expect(screen.getByText("Atendemos desde 1998.")).toBeInTheDocument();
    expect(screen.getByText("Cuidamos tu sonrisa.")).toBeInTheDocument();
  });

  it("un módulo sin contenido no deja ni hueco ni link en el menú", () => {
    render(
      <ClinicaPublicaTemplate
        {...props}
        contenido={contenido({
          modulos: [modulo("texto_libre", { titulo: "", texto: "" }), modulo("galeria", { fotoUrls: [] }), modulo("contacto")],
          direccion: null,
        })}
        telefono={null}
      />,
    );
    expect(screen.queryByRole("link", { name: "Galería" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Contacto" })).not.toBeInTheDocument();
  });

  it("un tipo de módulo desconocido (p. ej. 'horarios') se ignora sin romper la página", () => {
    render(<ClinicaPublicaTemplate {...props} contenido={contenido({ modulos: [modulo("horarios"), modulo("especialidades")] })} />);
    expect(screen.getByRole("heading", { name: "Especialidades" })).toBeInTheDocument();
  });

  it("estadísticas: solo las elegidas, con el valor real que vino del backend", () => {
    render(
      <ClinicaPublicaTemplate
        {...props}
        contenido={contenido({
          modulos: [modulo("estadisticas", { mostrar: ["pacientes_atendidos"] })],
          estadisticas: { pacientes_atendidos: 42, turnos_realizados: 130 },
        })}
      />,
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Pacientes atendidos")).toBeInTheDocument();
    expect(screen.queryByText("Turnos realizados")).not.toBeInTheDocument();
  });

  it("fotos: dibuja la portada, la foto suelta y la galería", () => {
    render(
      <ClinicaPublicaTemplate
        {...props}
        contenido={contenido({
          fotoPortadaUrl: "https://cdn.example.com/portada.jpg",
          modulos: [
            modulo("foto", { fotoUrl: "/uploads/una.jpg", subtipo: "retrato" }),
            modulo("galeria", { fotoUrls: ["/uploads/a.jpg", "/uploads/b.jpg"] }),
          ],
        })}
      />,
    );
    expect(screen.getByAltText("Portada de Clínica Sonrisas")).toHaveAttribute("src", "https://cdn.example.com/portada.jpg");
    expect(screen.getByAltText("Foto de Clínica Sonrisas")).toHaveAttribute("src", "/uploads/una.jpg");
    expect(screen.getByAltText("Foto 1 de Clínica Sonrisas")).toBeInTheDocument();
    expect(screen.getByAltText("Foto 2 de Clínica Sonrisas")).toBeInTheDocument();
  });

  it("no dibuja una foto cuya URL no es segura (javascript:, data:)", () => {
    render(
      <ClinicaPublicaTemplate
        {...props}
        contenido={contenido({
          fotoPortadaUrl: "javascript:alert(1)",
          modulos: [modulo("foto", { fotoUrl: "data:image/png;base64,AAAA", subtipo: "banner" }), modulo("galeria", { fotoUrls: ["javascript:x"] })],
        })}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("ClinicaPublicaTemplate — nombre sobre la portada", () => {
  const portada = "https://cdn.example.com/portada.jpg";

  it("la foto lleva la descripción que cargó el admin (PP-4, H13)", () => {
    render(<ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: portada, fotoPortadaAlt: "La fachada, con el cartel verde" })} />);
    expect(screen.getByRole("img", { name: "La fachada, con el cartel verde" })).toHaveAttribute("src", portada);
    expect(screen.queryByAltText("Portada de Clínica Sonrisas")).not.toBeInTheDocument();
  });

  it("por default el nombre va debajo de la foto, con el logo", () => {
    render(<ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: portada })} />);
    const foto = screen.getByAltText("Portada de Clínica Sonrisas");
    const titulo = screen.getByRole("heading", { level: 1, name: "Clínica Sonrisas" });
    // Debajo: el <h1> NO está dentro del contenedor de la foto.
    expect(foto.parentElement).not.toContainElement(titulo);
  });

  it("con la opción prendida, el nombre se dibuja SOBRE la foto (dentro de su contenedor)", () => {
    render(<ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: portada, nombreSobrePortada: true })} />);
    const foto = screen.getByAltText("Portada de Clínica Sonrisas");
    const titulo = screen.getByRole("heading", { level: 1, name: "Clínica Sonrisas" });
    expect(foto.parentElement).toContainElement(titulo);
    // Sigue habiendo un solo <h1>: el nombre no se duplica.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("el color es el elegido y el velo se adapta: claro para el negro, oscuro para el resto", () => {
    const { rerender } = render(
      <ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: portada, nombreSobrePortada: true, nombreColor: "dorado" })} />,
    );
    const titulo = () => screen.getByRole("heading", { level: 1 });
    const velo = () => titulo().previousElementSibling as HTMLElement;
    expect(titulo()).toHaveStyle({ color: "#f2d27a" });
    expect(velo().className).toContain("from-black");

    rerender(
      <ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: portada, nombreSobrePortada: true, nombreColor: "negro" })} />,
    );
    expect(titulo()).toHaveStyle({ color: "#1f1c17" });
    expect(velo().className).toContain("from-white");
  });

  it("sin color elegido usa blanco; uno desconocido también, en vez de romper", () => {
    const { rerender } = render(
      <ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: portada, nombreSobrePortada: true, nombreColor: "" })} />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveStyle({ color: "#ffffff" });
    rerender(
      <ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: portada, nombreSobrePortada: true, nombreColor: "fucsia" })} />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveStyle({ color: "#ffffff" });
  });

  it("sin foto (o con una URL insegura) la opción no aplica: el nombre queda debajo, legible", () => {
    const { rerender } = render(<ClinicaPublicaTemplate {...props} contenido={contenido({ nombreSobrePortada: true, nombreColor: "blanco" })} />);
    // Blanco sobre el fondo celeste no se leería: tiene que seguir siendo grafito.
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("text-(--pp-texto)");

    rerender(
      <ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: "javascript:alert(1)", nombreSobrePortada: true, nombreColor: "blanco" })} />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("text-(--pp-texto)");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("ClinicaPublicaTemplate — contacto", () => {
  const conContacto = (parcial: Partial<ContenidoPagina>) =>
    contenido({ modulos: [modulo("contacto")], direccion: "Av. Colón 100, Córdoba", ...parcial });

  it("muestra dirección, teléfono y redes como links", () => {
    render(
      <ClinicaPublicaTemplate
        {...props}
        contenido={conContacto({ redesSociales: { instagram: "@clinicasonrisas", whatsapp: "+54 9 351 1234567" } })}
      />,
    );
    // Acotado a la sección: el footer repite dirección y teléfono (PP-7).
    const seccion = within(document.getElementById("contacto")!);
    expect(seccion.getByText("Av. Colón 100, Córdoba")).toBeInTheDocument();
    // Se lee en formato local; el link sigue con el número completo (PP-7, H26).
    expect(seccion.getByRole("link", { name: "351 123-4567" })).toHaveAttribute("href", "tel:+5493511234567");
    expect(seccion.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://instagram.com/clinicasonrisas");
    expect(seccion.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/5493511234567");
    expect(seccion.getByRole("link", { name: "Cómo llegar" })).toHaveAttribute("href", expect.stringContaining("google.com/maps"));
  });

  it("el mapa embebido solo aparece si se pidió", () => {
    const { rerender } = render(<ClinicaPublicaTemplate {...props} contenido={conContacto({ mostrarMapa: false })} />);
    expect(screen.queryByTitle(/Mapa:/)).not.toBeInTheDocument();
    rerender(<ClinicaPublicaTemplate {...props} contenido={conContacto({ mostrarMapa: true })} />);
    expect(screen.getByTitle("Mapa: Av. Colón 100, Córdoba")).toHaveAttribute("src", expect.stringContaining("output=embed"));
  });

  it("una red con un esquema peligroso NO se vuelve un link", () => {
    render(<ClinicaPublicaTemplate {...props} contenido={conContacto({ redesSociales: { instagram: "javascript:alert(1)" } })} />);
    expect(screen.queryByRole("link", { name: "Instagram" })).not.toBeInTheDocument();
  });
});

describe("ClinicaPublicaTemplate — tema", () => {
  it("un tema elegido define los colores de la página como custom properties", () => {
    const { container } = render(
      <ClinicaPublicaTemplate {...props} contenido={contenido({ tema: "clinico", temaVariante: "clinico-2", temaTipografia: "geometrica-moderna" })} />,
    );
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.style.getPropertyValue("--pp-fondo")).toBe("#eef3f5");
    expect(raiz.style.getPropertyValue("--pp-acento")).toBe("#3d6a8a");
    expect(raiz.style.getPropertyValue("--font-display")).toContain("--font-tema-geometrica-moderna-display");
  });

  it("una variante que no es del tema cae a la primera del tema en vez de romper", () => {
    const { container } = render(
      <ClinicaPublicaTemplate {...props} contenido={contenido({ tema: "clinico", temaVariante: "calido-1", temaTipografia: "" })} />,
    );
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--pp-acento")).toBe("#3f7d7a");
  });

  it("un tema desconocido se trata como sin tema", () => {
    const { container } = render(<ClinicaPublicaTemplate {...props} contenido={contenido({ tema: "no-existe" })} />);
    expect(container.firstElementChild).not.toHaveAttribute("style");
  });
});

describe("ClinicaPublicaTemplate — tokens y variantes (PE-2/PE-3)", () => {
  const portada = "/uploads/portada.jpg";

  it("sin tema, los tokens de estilo elegidos no cambian nada: menú de pastillas y ningún --pp- en línea", () => {
    const { container } = render(
      <ClinicaPublicaTemplate {...props} contenido={contenido({ temaTokens: { menu: "barra", forma: "recta" } })} />,
    );
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz).toHaveClass("pp-raiz");
    expect(raiz).not.toHaveAttribute("style");
    expect(screen.getByRole("navigation")).not.toHaveClass("sticky");
  });

  it("con tema, el token de menú 'barra' deja el menú fijo arriba", () => {
    render(<ClinicaPublicaTemplate {...props} contenido={contenido({ tema: "oscuro", temaVariante: "oscuro-1", temaTokens: { menu: "barra" } })} />);
    expect(screen.getByRole("navigation")).toHaveClass("sticky");
  });

  it("portada 'mínima' no muestra la foto aunque haya una", () => {
    render(<ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: portada, temaTokens: { portada: "minima" } })} />);
    expect(screen.queryByRole("img", { name: /Portada de/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Clínica Sonrisas" })).toBeInTheDocument();
  });

  it("portada 'foto de fondo' sin foto se dibuja centrada (nunca un hueco)", () => {
    render(<ClinicaPublicaTemplate {...props} contenido={contenido({ temaTokens: { portada: "fondo" } })} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("text-(--pp-texto)");
  });

  it("una sección 'contraste' invierte el texto con custom properties sobre su <section>", () => {
    const { container } = render(
      <ClinicaPublicaTemplate
        {...props}
        contenido={contenido({ bio: "Somos una clínica", modulos: [modulo("sobre_nosotros", { fondoSeccion: "contraste", alineacion: "izquierda" })] })}
      />,
    );
    const seccion = container.querySelector("section#sobre-nosotros") as HTMLElement;
    expect(seccion.style.getPropertyValue("--pp-texto")).toBe("var(--pp-contraste-texto)");
    expect(seccion.style.getPropertyValue("--pp-alinear")).toBe("left");
  });
});

describe("ClinicaPublicaTemplate — secciones elegibles solo en el editor (PP-6, H21)", () => {
  const conModulos = () => contenido({ bio: "Somos una clínica.", modulos: [modulo("sobre_nosotros")] });

  it("la página pública no lleva data-modulo ni contornos", () => {
    const { container } = render(<ClinicaPublicaTemplate {...props} contenido={conModulos()} />);
    expect(container.querySelector("[data-modulo]")).toBeNull();
    expect(container.querySelector(".cursor-pointer")).toBeNull();
  });

  it("en la vista previa del editor cada sección lleva la clave de su módulo, y la abierta queda marcada", () => {
    const c = conModulos();
    const { container } = render(
      <ClinicaPublicaTemplate {...props} contenido={c} vistaPrevia={{ prefijoIds: "vp-", seccionesElegibles: true, moduloAbierto: c.modulos[0].clave }} />,
    );
    expect(container.querySelector('[data-modulo="portada"]')).not.toBeNull();
    expect(container.querySelector(`[data-modulo="${c.modulos[0].clave}"]`)).toHaveClass("outline-salvia-oscuro");
  });
});

describe("ClinicaPublicaTemplate — PP-7 (decisiones con Juan)", () => {
  it("H26: el footer cierra la página con los datos de la clínica y «Hecho con PRISMA»", () => {
    render(
      <ClinicaPublicaTemplate
        {...props}
        telefono="+5493511234567"
        contenido={contenido({ direccion: "Av. Colón 100", redesSociales: { instagram: "@clinicasonrisas" } })}
      />,
    );
    const pie = screen.getByRole("contentinfo");
    expect(within(pie).getByText("Av. Colón 100")).toBeInTheDocument();
    expect(within(pie).getByRole("link", { name: "351 123-4567" })).toHaveAttribute("href", "tel:+5493511234567");
    expect(within(pie).getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://instagram.com/clinicasonrisas");
    expect(within(pie).getByRole("link", { name: "Hecho con PRISMA" })).toHaveAttribute("href", "/");
  });

  it("H26: dentro del editor el footer no es un segundo landmark contentinfo", () => {
    render(<ClinicaPublicaTemplate {...props} contenido={contenido({})} vistaPrevia={{ prefijoIds: "vp-" }} />);
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hecho con PRISMA" })).toBeInTheDocument();
  });

  it("H26: sin foto, la portada es una banda con el color de contraste del tema", () => {
    render(<ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: null })} />);
    const nombre = screen.getByRole("heading", { level: 1, name: "Clínica Sonrisas" });
    expect(nombre.parentElement).toHaveClass("bg-(--pp-contraste-fondo)");
  });

  it("H26: la portada «mínima» sigue siendo solo texto", () => {
    render(<ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: null, temaTokens: { portada: "minima" } })} />);
    expect(screen.getByRole("heading", { level: 1, name: "Clínica Sonrisas" }).parentElement).not.toHaveClass("bg-(--pp-contraste-fondo)");
  });

  it("H25: portada y secciones llegan a ~1100 px", () => {
    const { container } = render(<ClinicaPublicaTemplate {...props} contenido={contenido({ fotoPortadaUrl: null, modulos: [modulo("especialidades")] })} />);
    expect(container.querySelectorAll('[class*="max-w-[70rem]"]').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector(".max-w-3xl")).toBeNull();
  });
});
