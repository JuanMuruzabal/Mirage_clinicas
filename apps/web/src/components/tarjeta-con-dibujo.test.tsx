import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TarjetaConDibujo } from "./tarjeta-con-dibujo";

// El armado común de las tarjetas de /seleccionar-servicio y de /clinicas
// (2026-10-19): con `href` es un enlace, con `onClick` un botón y sin
// ninguno un <article>; `blanca` es la de "Otras clínicas".
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
      <TarjetaConDibujo disposicion="columna">
        <button type="button">Aceptar invitación</button>
      </TarjetaConDibujo>,
    );
    const tarjeta = container.querySelector("article")!;
    expect(tarjeta).toBeInTheDocument();
    expect(tarjeta).not.toHaveClass("vidrio-enlace");
    // En columna, nunca pasa a fila.
    expect(tarjeta).not.toHaveClass("md:flex-row");
    expect(tarjeta.querySelector("svg")).toBeNull();
    expect(screen.getByRole("button", { name: "Aceptar invitación" })).toBeInTheDocument();
  });

  it("blanca: opaca, sin vidrio ni carátula, con su dibujo en la franja", () => {
    render(
      <TarjetaConDibujo href="/c" blanca disposicion="columna" dibujo="equipo">
        <h3>Clínica del colega</h3>
      </TarjetaConDibujo>,
    );
    const link = screen.getByRole("link", { name: "Clínica del colega" });
    expect(link).toHaveClass("bg-marfil", "hover:bg-velo");
    expect(link).not.toHaveClass("vidrio");
    expect(link).not.toHaveClass("vidrio-enlace");
    expect(link.querySelector(".vidrio-capa")).toBeNull();
    expect(link.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });
});
