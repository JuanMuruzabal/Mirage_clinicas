import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarGrid } from "./calendar-grid";

const tiposConsulta = [
  { id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" },
  { id: "tc-2", nombre: "Urgencia", color: "#D6563A" },
];

const dias = [new Date(2026, 8, 1)];

const turnos = [
  {
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
  },
];

describe("CalendarGrid", () => {
  it("renderiza el turno en el día correcto con su nombre y hora", () => {
    render(<CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);
    const bloque = screen.getByRole("button", { name: /María Games/ });
    expect(within(bloque).getByText("María Games")).toBeInTheDocument();
    expect(within(bloque).getByText("09:00")).toBeInTheDocument();
  });

  it("no muestra turnos de otro día", () => {
    render(
      <CalendarGrid dias={[new Date(2026, 8, 2)]} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />,
    );
    expect(screen.queryByText("María Games")).not.toBeInTheDocument();
  });

  it("al hacer click en un turno, llama a onTurnoClick con ese turno", async () => {
    const onTurnoClick = vi.fn();
    const user = userEvent.setup();
    render(<CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={onTurnoClick} />);

    await user.click(screen.getByText("María Games"));
    expect(onTurnoClick).toHaveBeenCalledWith(turnos[0]);
  });

  it("un turno de 'Consulta general' se pinta con el tema salvia (fondo pastel + texto oscuro)", () => {
    render(<CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);
    const bloque = screen.getByRole("button", { name: /María Games/ });
    expect(bloque).toHaveStyle({ background: "var(--color-salvia-claro)" });
  });

  it("muestra las horas del día en la columna izquierda", () => {
    render(<CalendarGrid dias={dias} turnos={[]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument();
  });

  // Bug reportado 2026-08-29 (tanto mobile como escritorio), tras F2.1:
  // "la primera hora (08:00) quedó casi tapada por la fila de días" — el
  // `-translate-y-1/2` que centra cada hora sobre su línea de grilla
  // hacía que la mitad de arriba de "08:00" cayera detrás de la esquina
  // fija (ahora con fondo opaco, F2.1). El resto de las horas sigue
  // centrado sobre su línea como siempre.
  it("la hora 08:00 no lleva el translate que la esconde detrás de la esquina fija", () => {
    render(<CalendarGrid dias={dias} turnos={[]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);
    expect(screen.getByText("08:00")).not.toHaveClass("-translate-y-1/2");
    expect(screen.getByText("09:00")).toHaveClass("-translate-y-1/2");
  });

  // F2.1 (docs/implementation-plan.md §11, pedido explícito del
  // cliente): "si me muevo horizontalmente, al costado los horarios me
  // van siguiendo, y verticalmente los días" — cada uno fijo en un solo
  // eje (no en los dos), salvo la esquina compartida.
  it("la columna de horas queda fija en X, la fila de días en Y, la esquina en los dos ejes", () => {
    const dosDias = [new Date(2026, 8, 1), new Date(2026, 8, 2)];
    const { container } = render(
      <CalendarGrid dias={dosDias} turnos={[]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />,
    );

    const columnaHoras = container.querySelector(".w-16.flex-shrink-0")!;
    expect(columnaHoras).toHaveClass("sticky", "left-0");
    expect(columnaHoras).not.toHaveClass("top-0");

    const esquina = columnaHoras.querySelector(":scope > div")!;
    expect(esquina).toHaveClass("sticky", "top-0");

    const encabezadosDia = container.querySelectorAll(".flex.h-10.items-center.justify-center");
    expect(encabezadosDia.length).toBe(2);
    encabezadosDia.forEach((encabezado) => {
      expect(encabezado).toHaveClass("sticky", "top-0");
      expect(encabezado).not.toHaveClass("left-0");
    });
  });

  it("un turno resuelto (hora de fin pasada) se pinta gris, no con el color de su tipo de consulta", () => {
    const diaPasado = new Date(2020, 0, 15);
    const turnoPasado = {
      ...turnos[0],
      horaInicio: new Date(2020, 0, 15, 9, 0).toISOString(),
      horaFin: new Date(2020, 0, 15, 9, 30).toISOString(),
    };
    render(<CalendarGrid dias={[diaPasado]} turnos={[turnoPasado]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);

    const bloque = screen.getByRole("button", { name: /María Games/ });
    expect(bloque).toHaveStyle({ background: "var(--color-arena)" });
    expect(bloque.className).toContain("text-grafito/60");
  });
});
