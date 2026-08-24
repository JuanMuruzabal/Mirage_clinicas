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
    const punto = container.querySelector(".rounded-full") as HTMLElement;
    expect(punto).toHaveStyle({ background: "var(--color-arena)" });
  });

  it("un turno de 'Consulta general' pinta su punto con el acento salvia", () => {
    const { container } = render(
      <CalendarMonthGrid dias={dias} mesReferencia={mesReferencia} turnos={[turnoEnDia1]} tiposConsulta={tiposConsulta} onDiaClick={vi.fn()} />,
    );
    const punto = container.querySelector(".rounded-full") as HTMLElement;
    expect(punto).toHaveStyle({ background: "var(--color-salvia)" });
  });
});
