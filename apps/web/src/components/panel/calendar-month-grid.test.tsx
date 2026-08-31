import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { diasDeVista } from "@/lib/calendar-utils";
import { CalendarMonthGrid } from "./calendar-month-grid";

const mesReferencia = new Date(2026, 8, 15);
const dias = diasDeVista(mesReferencia, "mes");

const tiposConsulta = [{ id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" }];

const turnoEnDia1 = {
  id: "t-1",
  estado: "agendado" as const,
  origen: "manual" as const,
  tipoConsultaId: "tc-1",
  horaInicio: new Date(2026, 8, 1, 9, 0).toISOString(),
  horaFin: new Date(2026, 8, 1, 9, 30).toISOString(),
  nombreContacto: "María",
  apellidoContacto: "Games",
  dniContacto: "1",
  telefonoContacto: "1",
  emailContacto: "",
  motivo: "",
  createdAt: new Date().toISOString(),
};

describe("CalendarMonthGrid", () => {
  it("renderiza los encabezados de día de la semana", () => {
    render(
      <CalendarMonthGrid dias={dias} mesReferencia={mesReferencia} turnos={[]} tiposConsulta={tiposConsulta} onDiaClick={vi.fn()} />,
    );
    expect(screen.getByText("Lun")).toBeInTheDocument();
    expect(screen.getByText("Dom")).toBeInTheDocument();
  });

  it("renderiza los 30 días del mes (más los de relleno de semana)", () => {
    render(
      <CalendarMonthGrid dias={dias} mesReferencia={mesReferencia} turnos={[]} tiposConsulta={tiposConsulta} onDiaClick={vi.fn()} />,
    );
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("al hacer click en un día, llama a onDiaClick con esa fecha", async () => {
    const onDiaClick = vi.fn();
    const user = userEvent.setup();
    render(
      <CalendarMonthGrid dias={dias} mesReferencia={mesReferencia} turnos={[]} tiposConsulta={tiposConsulta} onDiaClick={onDiaClick} />,
    );

    await user.click(screen.getByText("15"));
    expect(onDiaClick).toHaveBeenCalledTimes(1);
  });

  it("muestra un punto de color por cada turno agendado ese día", () => {
    const { container } = render(
      <CalendarMonthGrid
        dias={dias}
        mesReferencia={mesReferencia}
        turnos={[turnoEnDia1]}
        tiposConsulta={tiposConsulta}
        onDiaClick={vi.fn()}
      />,
    );
    const puntos = container.querySelectorAll(".rounded-full");
    expect(puntos.length).toBeGreaterThanOrEqual(1);
  });

  // puntoDeTurno — el `.rounded-full` del PUNTO de color de un turno,
  // distinguido del `.rounded-full` de la insignia "hoy" (bg-salvia-claro
  // por clase, sin estilo inline) buscando el que sí trae `background`
  // como estilo en línea. Bug real encontrado 2026-09-05: un
  // `container.querySelector(".rounded-full")` a secas devolvía la
  // insignia "hoy" en vez del punto cuando el día real de hoy caía
  // dentro de la grilla renderizada (los días de relleno del mes
  // anterior/siguiente también llevan esa insignia) — antes pasaba de
  // pura casualidad porque "hoy" (fecha real) todavía no caía dentro del
  // rango fijo de estos fixtures (septiembre 2026).
  function puntoDeTurno(container: HTMLElement): HTMLElement {
    const candidato = Array.from(container.querySelectorAll(".rounded-full")).find((el) => (el as HTMLElement).style.background);
    if (!candidato) throw new Error("no se encontró ningún punto de turno (.rounded-full con background inline)");
    return candidato as HTMLElement;
  }

  it("un turno resuelto (hora de fin pasada) se pinta gris, no con el color de su tipo de consulta", () => {
    const turnoPasado = { ...turnoEnDia1, horaInicio: "2020-01-01T09:00:00Z", horaFin: "2020-01-01T09:30:00Z" };
    const diasPasado = diasDeVista(new Date(2020, 0, 15), "mes");
    const { container } = render(
      <CalendarMonthGrid
        dias={diasPasado}
        mesReferencia={new Date(2020, 0, 15)}
        turnos={[turnoPasado]}
        tiposConsulta={tiposConsulta}
        onDiaClick={vi.fn()}
      />,
    );
    expect(puntoDeTurno(container)).toHaveStyle({ background: "var(--color-arena)" });
  });

  // Corrección de QA (F2.3): el acento es el color CONFIGURADO para ese
  // tipo de consulta (tc-1 → #E7D9BE), no un tema fijo por nombre.
  it("un turno pinta su punto con el color configurado para su tipo de consulta", () => {
    const { container } = render(
      <CalendarMonthGrid dias={dias} mesReferencia={mesReferencia} turnos={[turnoEnDia1]} tiposConsulta={tiposConsulta} onDiaClick={vi.fn()} />,
    );
    expect(puntoDeTurno(container)).toHaveStyle({ background: "rgb(231, 217, 190)" });
  });
});
