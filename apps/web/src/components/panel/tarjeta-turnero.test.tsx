import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilaResumen, TarjetaConLista, TarjetaEstadistica, TarjetaSimple } from "./tarjeta-turnero";

describe("TarjetaConLista", () => {
  it("muestra el eyebrow, el valor y el link de cabecera", () => {
    render(
      <TarjetaConLista
        eyebrow="Turnos de hoy"
        valor={3}
        hrefCabecera="/panel/calendario?vista=dia"
        labelCabecera="Ver calendario"
        vacioMensaje="No hay turnos para hoy."
        filas={[]}
      />,
    );
    expect(screen.getByText("Turnos de hoy")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Ver calendario →" });
    expect(link).toHaveAttribute("href", "/panel/calendario?vista=dia");
  });

  it("sin filas, muestra el mensaje de vacío en vez de una lista", () => {
    render(<TarjetaConLista eyebrow="Turnos de hoy" valor={0} vacioMensaje="No hay turnos para hoy." filas={[]} />);
    expect(screen.getByText("No hay turnos para hoy.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("con filas, cada una es un link a su propio href", () => {
    render(
      <TarjetaConLista
        eyebrow="Turnos de hoy"
        valor={2}
        vacioMensaje="No hay turnos para hoy."
        filas={[
          { key: "t-1", href: "/panel/calendario?turno=t-1", contenido: <span>10:00 — Bruno Iglesias</span> },
          { key: "t-2", href: "/panel/calendario?turno=t-2", contenido: <span>11:00 — Ana Pérez</span> },
        ]}
      />,
    );
    const filaBruno = screen.getByRole("link", { name: "10:00 — Bruno Iglesias" });
    expect(filaBruno).toHaveAttribute("href", "/panel/calendario?turno=t-1");
    const filaAna = screen.getByRole("link", { name: "11:00 — Ana Pérez" });
    expect(filaAna).toHaveAttribute("href", "/panel/calendario?turno=t-2");
  });

  it("acepta una cabecera custom en vez de hrefCabecera/labelCabecera (tarjeta de horarios reservados)", () => {
    render(
      <TarjetaConLista
        eyebrow="Horarios reservados"
        valor={1}
        vacioMensaje="Todavía no cargaste ningún horario reservado."
        filas={[]}
        cabeceraCustom={<button type="button">Ver horarios reservados →</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Ver horarios reservados →" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("acento aplica el color de énfasis al valor", () => {
    const { rerender } = render(<TarjetaConLista eyebrow="X" valor={5} vacioMensaje="Vacío" filas={[]} />);
    expect(screen.getByText("5").className).toContain("text-grafito");

    rerender(<TarjetaConLista eyebrow="X" valor={5} vacioMensaje="Vacío" filas={[]} acento />);
    expect(screen.getByText("5").className).toContain("text-salvia-oscuro");
  });

  // Corrección de QA (2026-09-06: "añadir diseños a los encabezados de
  // cada tarjeta", ver diseño1.png/diseño2.png en docs/).
  it("renderiza el ícono decorativo de cabecera cuando se pasa uno", () => {
    render(
      <TarjetaConLista eyebrow="X" valor={5} vacioMensaje="Vacío" filas={[]} icono={<svg data-testid="icono-cabecera" />} />,
    );
    expect(screen.getByTestId("icono-cabecera")).toBeInTheDocument();
  });
});

describe("TarjetaSimple", () => {
  it("toda la tarjeta es un único link", () => {
    render(<TarjetaSimple eyebrow="Turnos confirmados" valor={7} href="/panel/turnos?estado=agendado" titulo="Ver turnos" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/panel/turnos?estado=agendado");
    expect(link).toHaveTextContent("Turnos confirmados");
    expect(link).toHaveTextContent("7");
    expect(link).toHaveTextContent("Ver turnos →");
  });

  it("renderiza el ícono decorativo de cabecera cuando se pasa uno", () => {
    render(
      <TarjetaSimple
        eyebrow="Turnos confirmados"
        valor={7}
        href="/panel/turnos?estado=agendado"
        titulo="Ver turnos"
        icono={<svg data-testid="icono-cabecera" />}
      />,
    );
    expect(screen.getByTestId("icono-cabecera")).toBeInTheDocument();
  });
});

// TarjetaEstadistica (corrección de QA, 2026-09-06: "crear una tarjeta
// nueva al lado de turnos confirmados, llamada estadística donde dice
// turnos asistidos en verde y turnos ausentados en rojo").
describe("TarjetaEstadistica", () => {
  it("muestra los dos números con sus etiquetas", () => {
    render(<TarjetaEstadistica eyebrow="Estadística" asistieron={12} ausentes={3} />);
    expect(screen.getByText("Estadística")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Asistieron")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Ausentes")).toBeInTheDocument();
  });

  it("asistieron en verde, ausentes en rojo", () => {
    render(<TarjetaEstadistica eyebrow="Estadística" asistieron={12} ausentes={3} />);
    expect(screen.getByText("12").className).toContain("text-salvia-oscuro");
    expect(screen.getByText("3").className).toContain("text-terracota-oscuro");
  });

  it("no es un link — es puramente informativa", () => {
    render(<TarjetaEstadistica eyebrow="Estadística" asistieron={12} ausentes={3} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renderiza el ícono decorativo de cabecera cuando se pasa uno", () => {
    render(<TarjetaEstadistica eyebrow="Estadística" asistieron={0} ausentes={0} icono={<svg data-testid="icono-cabecera" />} />);
    expect(screen.getByTestId("icono-cabecera")).toBeInTheDocument();
  });
});

// FilaResumen (corrección de QA, 2026-09-06: "la tipografía dentro del
// cuerpo de la tarjeta debe ser más llamativa... también agregar de que
// hora a que hora... las horas deben ser de color verde").
describe("FilaResumen", () => {
  it("sin etiqueta, muestra la hora y el contenido", () => {
    render(<FilaResumen hora="10:00 a 10:30">Bruno Iglesias</FilaResumen>);
    expect(screen.getByText("10:00 a 10:30")).toBeInTheDocument();
    expect(screen.getByText("Bruno Iglesias")).toBeInTheDocument();
  });

  it("la hora usa el color verde de la app (salvia-oscuro)", () => {
    render(<FilaResumen hora="10:00 a 10:30">Bruno Iglesias</FilaResumen>);
    expect(screen.getByText("10:00 a 10:30").className).toContain("text-salvia-oscuro");
  });

  it("con etiqueta (día), la muestra arriba de la hora", () => {
    render(
      <FilaResumen etiqueta="MAR 1" hora="10:00 a 10:30">
        Bruno Iglesias
      </FilaResumen>,
    );
    expect(screen.getByText("MAR 1")).toBeInTheDocument();
  });

  it("uppercase (default true) pone el contenido en mayúsculas vía CSS", () => {
    render(<FilaResumen hora="10:00 a 10:30">Bruno Iglesias</FilaResumen>);
    expect(screen.getByText("Bruno Iglesias").className).toContain("uppercase");
  });

  // Corrección de QA (2026-09-06): "para todas las tarjetas... si el
  // nombre es muy largo poner los tres puntitos" + "quiero que se alinien
  // bien las cosas... quede bien derechito" — la columna de hora tiene un
  // ancho fijo (para que el contenido de todas las filas arranque en la
  // misma posición) y el contenido largo trunca con "…" en vez de romper
  // a una segunda línea.
  it("la columna de hora tiene un ancho fijo, para que el contenido de todas las filas arranque alineado", () => {
    render(<FilaResumen hora="10:00 a 10:30">Bruno Iglesias</FilaResumen>);
    expect(screen.getByText("10:00 a 10:30").className).toContain("w-[8.5rem]");
  });

  it("un contenido muy largo trunca con puntos suspensivos, no rompe a una segunda línea", () => {
    render(<FilaResumen hora="10:00 a 10:30">Juan de la Rosa Muruzabal Fernández Fernández</FilaResumen>);
    const contenido = screen.getByText("Juan de la Rosa Muruzabal Fernández Fernández");
    expect(contenido.className).toContain("truncate");
  });

  it("uppercase=false no fuerza mayúsculas (motivo de horario reservado)", () => {
    render(
      <FilaResumen hora="10:00 a 10:30" uppercase={false}>
        Limpieza semanal
      </FilaResumen>,
    );
    expect(screen.getByText("Limpieza semanal").className).not.toContain("uppercase");
  });
});
