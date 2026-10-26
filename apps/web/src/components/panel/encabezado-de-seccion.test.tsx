import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EncabezadoDeSeccion, type SeccionDelPanel } from "./encabezado-de-seccion";
import { CLASE_TITULO_DE_PANTALLA } from "../titulo-de-pantalla";

const SECCIONES: [SeccionDelPanel, string][] = [
  ["general", "General"],
  ["turnos", "Turnos"],
  ["pacientes", "Pacientes"],
  ["documentos", "Documentos clínicos"],
  ["calendario", "Calendario"],
];

describe("EncabezadoDeSeccion", () => {
  it.each(SECCIONES)("%s: solo el h1, sin tarjeta ni dibujo", (seccion, titulo) => {
    const { container } = render(<EncabezadoDeSeccion seccion={seccion} titulo={titulo} />);
    expect(screen.getByRole("heading", { level: 1, name: titulo })).toHaveClass("text-marca");
    const header = container.querySelector("header")!;
    expect(header).toHaveAttribute("data-seccion", seccion);
    expect(header).toHaveAttribute("data-recorrido", seccion);
    expect(container.querySelector(".vidrio, .escena, svg")).toBeNull();
  });

  it("con `antes`, ese contenido va debajo del título", () => {
    render(<EncabezadoDeSeccion seccion="pacientes" titulo="Pacientes" antes={<button type="button">Volver</button>} />);
    const titulo = screen.getByRole("heading", { level: 1, name: "Pacientes" });
    const volver = screen.getByRole("button", { name: "Volver" });
    expect(titulo.compareDocumentPosition(volver) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("en el calendario, los controles van en una tarjeta de vidrio debajo del título y de `antes`", () => {
    const { container } = render(
      <EncabezadoDeSeccion
        seccion="calendario"
        titulo="Calendario"
        antes={<span>Viendo</span>}
        navegacion={<button type="button">Hoy</button>}
        opciones={<button type="button">Día</button>}
      >
        <p>lunes 26 de octubre</p>
      </EncabezadoDeSeccion>,
    );
    const tarjeta = container.querySelector(".vidrio.encabezado-seccion")!;
    expect(tarjeta).not.toBeNull();
    for (const nombre of ["Hoy", "Día"]) {
      expect(tarjeta.contains(screen.getByRole("button", { name: nombre }))).toBe(true);
    }
    expect(tarjeta.contains(screen.getByText("lunes 26 de octubre"))).toBe(true);
    expect(tarjeta.contains(screen.getByRole("heading", { level: 1 }))).toBe(false);
    expect(tarjeta.contains(screen.getByText("Viendo"))).toBe(false);
    expect(screen.getByText("Viendo").compareDocumentPosition(tarjeta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("el h1 lleva CLASE_TITULO_DE_PANTALLA entera", () => {
    render(<EncabezadoDeSeccion seccion="turnos" titulo="Turnos" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Turnos" });
    expect(h1).toHaveClass(...CLASE_TITULO_DE_PANTALLA.split(/\s+/));
  });

  it("con `antes` y sin controles no hay tarjeta ni escena", () => {
    const { container } = render(
      <EncabezadoDeSeccion seccion="pacientes" titulo="Pacientes" antes={<span>Viendo</span>} />,
    );
    expect(container.querySelector(".vidrio, .encabezado-seccion, .escena")).toBeNull();
  });

  it.each([
    ["solo navegacion", { navegacion: <button type="button">Hoy</button> }],
    ["solo opciones", { opciones: <button type="button">Día</button> }],
    ["solo children", { children: <p>lunes</p> }],
  ])("con %s ya hay tarjeta de controles", (_, props) => {
    const { container } = render(<EncabezadoDeSeccion seccion="calendario" titulo="Calendario" {...props} />);
    expect(container.querySelectorAll(".vidrio.encabezado-seccion")).toHaveLength(1);
  });

  it("orden en el DOM: h1, antes, y en la tarjeta children, navegacion y opciones", () => {
    const { container } = render(
      <EncabezadoDeSeccion
        seccion="calendario"
        titulo="Calendario"
        antes={<span>Viendo</span>}
        navegacion={<button type="button">Hoy</button>}
        opciones={<button type="button">Día</button>}
      >
        <p>lunes 26 de octubre</p>
      </EncabezadoDeSeccion>,
    );
    const header = container.querySelector("header")!;
    expect(header).toHaveAttribute("data-recorrido", "calendario");
    const tarjeta = container.querySelector(".vidrio.encabezado-seccion")!;
    const enOrden = [
      screen.getByRole("heading", { level: 1 }),
      screen.getByText("Viendo"),
      tarjeta,
      screen.getByText("lunes 26 de octubre"),
      screen.getByRole("button", { name: "Hoy" }),
      screen.getByRole("button", { name: "Día" }),
    ];
    for (let i = 1; i < enOrden.length; i++) {
      expect(
        enOrden[i - 1].compareDocumentPosition(enOrden[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(header.contains(enOrden[i])).toBe(true);
    }
  });
});
