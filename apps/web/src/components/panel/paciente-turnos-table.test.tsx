import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PacienteTurnosTable } from "./paciente-turnos-table";

// TR-064 en docs/tradeoffs.md: desde esta corrección, ResponsiveTable
// renderiza la tabla de escritorio Y la lista de cards mobile al mismo
// tiempo en el DOM (jsdom no evalúa media queries) — algunas queries de
// texto plano necesitan acotarse a la tabla para no ambigüar contra la
// card equivalente (las que ya usaban `role="cell"`, exclusivo de
// `<table>`, siguen sin ambigüedad y no se tocaron).
function tabla() {
  return within(screen.getByRole("table"));
}

const tiposConsulta = [
  { id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" },
  { id: "tc-2", nombre: "Urgencia", color: "#D6563A" },
];

const turno = {
  id: "t-1",
  estado: "agendado" as const,
  origen: "manual" as const,
  tipoConsultaId: "tc-2",
  horaInicio: "2026-09-01T13:00:00.000Z",
  horaFin: "2026-09-01T13:30:00.000Z",
  nombreContacto: "Bruno",
  apellidoContacto: "Iglesias",
  dniContacto: "1",
  telefonoContacto: "1",
  emailContacto: "",
  motivo: "Dolor de muela",
  createdAt: new Date().toISOString(),
};

describe("PacienteTurnosTable", () => {
  it("muestra el mensaje vacío cuando no hay turnos", () => {
    render(<PacienteTurnosTable turnos={[]} tiposConsulta={tiposConsulta} vacio="Nada por acá." />);
    expect(screen.getByText("Nada por acá.")).toBeInTheDocument();
  });

  it("muestra el nombre del tipo de consulta y su color como punto indicador", () => {
    const { container } = render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);

    expect(screen.getByRole("cell", { name: "Urgencia" })).toBeInTheDocument();
    const punto = container.querySelector("tbody .rounded-full") as HTMLElement;
    expect(punto).toHaveStyle({ background: "var(--color-terracota)" });
  });

  it("muestra estado, fecha y motivo", () => {
    render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);
    expect(tabla().getByText("Confirmado")).toBeInTheDocument();
    expect(tabla().getByText("Dolor de muela")).toBeInTheDocument();
  });

  it("sin tipoConsultaId resuelto, muestra — y el color neutro por defecto", () => {
    const { container } = render(
      <PacienteTurnosTable turnos={[{ ...turno, tipoConsultaId: undefined }]} tiposConsulta={tiposConsulta} vacio="" />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
    const punto = container.querySelector("tbody .rounded-full") as HTMLElement;
    expect(punto).toHaveStyle({ background: "var(--color-arena)" });
  });

  it("sin motivo, muestra —", () => {
    render(<PacienteTurnosTable turnos={[{ ...turno, motivo: "" }]} tiposConsulta={tiposConsulta} vacio="" />);
    const filas = screen.getAllByText("—");
    expect(filas.length).toBeGreaterThanOrEqual(1);
  });

  // Filtros por tipo de consulta y fecha (pedido explícito del cliente,
  // 2026-08-23: "poder agregar filtros para encontrar con facilidad los
  // turnos activos e historial de turnos").
  it("filtra por tipo de consulta", async () => {
    const user = userEvent.setup();
    const otro = { ...turno, id: "t-2", tipoConsultaId: "tc-1", nombreContacto: "Ana", motivo: "" };
    render(<PacienteTurnosTable turnos={[turno, otro]} tiposConsulta={tiposConsulta} vacio="" />);

    expect(screen.getByRole("cell", { name: "Urgencia" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Consulta general" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Filtrar por tipo de consulta"), "tc-1");

    expect(screen.queryByRole("cell", { name: "Urgencia" })).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Consulta general" })).toBeInTheDocument();
  });

  it("filtra por rango de fecha y avisa cuando ningún turno coincide", () => {
    render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-01" } });

    expect(screen.getByText("Ningún turno coincide con el filtro.")).toBeInTheDocument();
  });

  it("'Limpiar filtros' vuelve a mostrar todos los turnos", async () => {
    const user = userEvent.setup();
    render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);

    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-01-01" } });
    expect(screen.getByText("Ningún turno coincide con el filtro.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getByRole("cell", { name: "Urgencia" })).toBeInTheDocument();
  });
});

// TR-064 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-26):
// debajo de `md` la tabla se reemplaza por una card por turno.
describe("PacienteTurnosTable — cards mobile", () => {
  function cards() {
    const t = screen.getByRole("table");
    const desktopWrapper = t.parentElement!.parentElement!;
    return desktopWrapper.nextElementSibling as HTMLElement;
  }

  it("muestra el tipo de consulta, el estado y el motivo", () => {
    render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);
    expect(within(cards()).getByText("Urgencia")).toBeInTheDocument();
    expect(within(cards()).getByText("Confirmado")).toBeInTheDocument();
    expect(within(cards()).getByText("Motivo")).toBeInTheDocument();
    expect(within(cards()).getByText("Dolor de muela")).toBeInTheDocument();
  });

  it("sin motivo, no muestra esa fila (a diferencia de la tabla, que sí muestra —)", () => {
    render(<PacienteTurnosTable turnos={[{ ...turno, motivo: "" }]} tiposConsulta={tiposConsulta} vacio="" />);
    expect(within(cards()).queryByText("Motivo")).not.toBeInTheDocument();
  });
});
