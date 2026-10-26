import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TarjetaConDibujo } from "./tarjeta-con-dibujo";

// El armado común de las tarjetas de /seleccionar-servicio y de /clinicas
// (2026-10-19): con `href` es un enlace, con `onClick` un botón y sin
// ninguno un <article>. Todas de vidrio y en fila (ítem 8, 2026-10-25).
describe("TarjetaConDibujo", () => {
  it("con href, toda la tarjeta es el enlace, de vidrio, con la carátula y la escena adentro", () => {
    render(
      <TarjetaConDibujo href="/clinicas/x" dibujo="agenda">
        <h2>Mi clínica</h2>
      </TarjetaConDibujo>,
    );
    const link = screen.getByRole("link", { name: "Mi clínica" });
    expect(link).toHaveAttribute("href", "/clinicas/x");
    expect(link).toHaveClass("vidrio", "vidrio-enlace", "md:flex-row");
    expect(link.querySelector(".vidrio-capa")).toHaveTextContent("Mi clínica");
    // La escena es decoración: fuera del árbol de accesibilidad.
    expect(link.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("la escena es una sola, aria-hidden y quieta: sin corrimiento al pasar el mouse", () => {
    const { container } = render(
      <TarjetaConDibujo href="/x" dibujo="invitacion">
        <h2>Invitación</h2>
      </TarjetaConDibujo>,
    );
    const escenas = container.querySelectorAll(".escena");
    expect(escenas).toHaveLength(1);
    const franja = escenas[0].closest('[aria-hidden="true"]')!;
    expect(franja).not.toBeNull();
    // Ningún ancestro de la escena dentro de la tarjeta se corre con el hover.
    for (let el: Element | null = escenas[0]; el && el !== container; el = el.parentElement) {
      expect(el.className).not.toMatch(/group-hover:(-?translate|scale|rotate)/);
    }
  });

  it("con onClick es un botón", () => {
    const onClick = vi.fn();
    render(
      <TarjetaConDibujo onClick={onClick}>
        <span>Crear mi clínica</span>
      </TarjetaConDibujo>,
    );
    const boton = screen.getByRole("button", { name: "Crear mi clínica" });
    expect(boton).toHaveAttribute("type", "button");
    fireEvent.click(boton);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("sin href ni onClick es un article, sin el estilo de algo tocable, y sin dibujo no hay escena", () => {
    const { container } = render(
      <TarjetaConDibujo>
        <button type="button">Aceptar invitación</button>
      </TarjetaConDibujo>,
    );
    const tarjeta = container.querySelector("article")!;
    expect(tarjeta).toBeInTheDocument();
    expect(tarjeta).not.toHaveClass("vidrio-enlace");
    expect(tarjeta.querySelector("svg")).toBeNull();
    expect(screen.getByRole("button", { name: "Aceptar invitación" })).toBeInTheDocument();
  });

  it("la tarjeta es vidrio encabezado-seccion y, sin dibujo, no hay caja aria-hidden", () => {
    render(
      <TarjetaConDibujo href="/x">
        <h2>Sin dibujo</h2>
      </TarjetaConDibujo>,
    );
    const link = screen.getByRole("link", { name: "Sin dibujo" });
    expect(link).toHaveClass("vidrio", "encabezado-seccion");
    expect(link.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(link.querySelector(".escena, svg")).toBeNull();
  });

  it("con dibujo, la escena va en UNA caja aria-hidden después de la carátula", () => {
    render(
      <TarjetaConDibujo onClick={() => {}} dibujo="agenda">
        <span>Agenda</span>
      </TarjetaConDibujo>,
    );
    const boton = screen.getByRole("button", { name: "Agenda" });
    expect(boton).toHaveClass("vidrio", "encabezado-seccion");
    const cajas = boton.querySelectorAll(':scope > [aria-hidden="true"]');
    expect(cajas).toHaveLength(1);
    expect(cajas[0].querySelector(".escena")).not.toBeNull();
    const caratula = boton.querySelector(".vidrio-capa")!;
    expect(caratula.compareDocumentPosition(cajas[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caratula.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
