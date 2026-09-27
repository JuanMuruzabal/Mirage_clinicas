import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AgendaViva } from "./agenda-viva";
import { DiaEnMensajes, MENSAJES_DEL_DIA } from "./dia-en-mensajes";
import { DelChatALaAgenda } from "./del-chat-a-la-agenda";
import { Funciones } from "./funciones";
import { Confianza, LlamadoFinal, ParaPacientes, Pasos } from "./cierre";
import { IconoCampana, IconoChat, IconoCodigo, IconoEquipo, IconoEscudo, IconoReloj } from "./iconos-home";

// Las secciones de la home. Lo que importa que no se rompa: que el texto
// se lea (no quede escondido en una ilustración), que los anclas del header
// (#como-funciona, #buscar) existan, y que cada llamado lleve adonde dice.

describe("AgendaViva", () => {
  it("es una ilustración con su descripción, y lo de adentro no se lee dos veces", () => {
    render(<AgendaViva />);
    const ilustracion = screen.getByRole("img", { name: /agenda de PRISMA/ });
    expect(ilustracion.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThan(0);
    expect(within(ilustracion).getByText("Lucía Fernández")).toBeInTheDocument();
  });
});

describe("DiaEnMensajes", () => {
  it("los mensajes del día son una lista que se lee, cada uno con su hora", () => {
    render(<DiaEnMensajes />);
    const lista = screen.getByRole("list");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(MENSAJES_DEL_DIA.length);
    expect(within(lista).getByText("07:12")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(/Tu WhatsApp, nunca/);
  });

  it("el contador animado tiene su número también para lectores de pantalla", () => {
    const { container } = render(<DiaEnMensajes />);
    const contador = container.querySelector(".home-contador") as HTMLElement;
    expect(contador).toHaveAttribute("aria-hidden", "true");
    expect(contador.style.getPropertyValue("--home-contador-final")).toBe(String(MENSAJES_DEL_DIA.length));
    expect(container.querySelector(".sr-only")).toHaveTextContent(String(MENSAJES_DEL_DIA.length));
  });
});

describe("DelChatALaAgenda", () => {
  it("cada pedido de WhatsApp tiene al lado lo que pasa con PRISMA", () => {
    render(<DelChatALaAgenda />);
    expect(screen.getByText("Hola, soy la mamá de Tomi. ¿Le sacás un turno?")).toBeInTheDocument();
    expect(screen.getByText("Lo sacó su mamá, como tutora")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Compartiste un link.");
  });
});

describe("Funciones", () => {
  it("es el destino de 'Servicios para profesionales' del header y tiene las seis funciones", () => {
    const { container } = render(<Funciones />);
    expect(container.querySelector("section#como-funciona")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
    expect(screen.getByRole("heading", { name: "Nunca dos a la misma hora" })).toBeInTheDocument();
  });

  it("las ilustraciones no se leen: son el decorado del texto de cada panel", () => {
    const { container } = render(<Funciones />);
    const paneles = container.querySelectorAll("article");
    expect(paneles).toHaveLength(6);
    for (const panel of paneles) {
      expect(panel.firstElementChild).toHaveAttribute("aria-hidden", "true");
    }
  });
});

describe("el cierre", () => {
  it("los pasos son una secuencia numerada", () => {
    render(<Pasos />);
    const pasos = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(pasos).toHaveLength(3);
    expect(pasos[0]).toHaveTextContent("1Creá tu cuenta");
  });

  it("la seguridad cuenta cuatro cuidados", () => {
    render(<Confianza />);
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(4);
  });

  it("la entrada para pacientes es el destino de 'Buscar clínicas' del header y lleva al buscador", () => {
    const { container } = render(<ParaPacientes />);
    expect(container.querySelector("section#buscar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buscar clínicas" })).toHaveAttribute("href", "/buscar");
  });

  it("el llamado final lleva a sumarse o a ingresar", () => {
    render(<LlamadoFinal />);
    expect(screen.getByRole("link", { name: "Sumate gratis" })).toHaveAttribute("href", "/sumarse");
    expect(screen.getByRole("link", { name: "Ya tengo cuenta" })).toHaveAttribute("href", "/ingresar");
  });
});

describe("los íconos de la home", () => {
  it.each([IconoCampana, IconoChat, IconoCodigo, IconoEquipo, IconoEscudo, IconoReloj])(
    "son decorativos y toman la clase",
    (Icono) => {
      const { container } = render(<Icono className="h-5 w-5" />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveClass("h-5", "w-5");
    },
  );
});
