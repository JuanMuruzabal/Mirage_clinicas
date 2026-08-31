import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PacienteTurnosTable } from "./paciente-turnos-table";

// Cada fila ahora es un ClickableTableRow (TR-074 en docs/tradeoffs.md —
// "tocando el turno... me debería redirigir al turno en el apartado de
// turnos"), que usa useRouter() internamente — mismo mock que
// clickable-table-row.test.tsx.
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

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

  // El sticky vive en cada `th` (`.panel-th-sticky`), no en thead/tr —
  // bug de Safari de iOS con rebote elástico (2026-08-28): WebKit no
  // recalcula bien el sticky en thead/tr durante el overscroll.
  it("cada th del encabezado tiene la clase sticky (no el thead)", () => {
    const { container } = render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);
    const thead = container.querySelector("thead")!;
    expect(thead.className).toBe("");
    const ths = container.querySelectorAll("thead th");
    expect(ths.length).toBeGreaterThan(0);
    ths.forEach((th) => expect(th).toHaveClass("panel-th-sticky"));
  });

  // Corrección de QA (F2.3): el punto usa el color CONFIGURADO para ese
  // tipo de consulta (tc-2 → #D6563A), no un tema fijo por nombre.
  it("muestra el nombre del tipo de consulta y su color configurado como punto indicador", () => {
    const { container } = render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);

    expect(screen.getByRole("cell", { name: "Urgencia" })).toBeInTheDocument();
    const punto = container.querySelector("tbody .rounded-full") as HTMLElement;
    expect(punto).toHaveStyle({ background: "rgb(214, 86, 58)" });
  });

  it("muestra estado, fecha y motivo", () => {
    render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    expect(screen.getByText("Dolor de muela")).toBeInTheDocument();
  });

  // TR-074 en docs/tradeoffs.md (pedido explícito del cliente): un turno
  // agendado con horaFin ya pasado debe mostrar "Resuelto", no
  // "Confirmado" — mismo criterio derivado que TurnosTable/TurnoDetalle.
  it("un turno agendado con horaFin pasado muestra Resuelto, no Confirmado", () => {
    const resuelto = { ...turno, horaFin: "2020-01-01T13:30:00.000Z" };
    render(<PacienteTurnosTable turnos={[resuelto]} tiposConsulta={tiposConsulta} vacio="" />);
    expect(screen.getByText("Resuelto")).toBeInTheDocument();
    expect(screen.queryByText("Confirmado")).not.toBeInTheDocument();
  });

  // TR-076 en docs/tradeoffs.md (pedido explícito del cliente,
  // 2026-08-27): tocar un turno resuelto tiene que abrir la pestaña
  // "Resueltos", no "Confirmadas" (?estado=resuelto, no el estado real
  // "agendado").
  it("tocar un turno resuelto navega con estado=resuelto, no agendado", async () => {
    const user = userEvent.setup();
    const resuelto = { ...turno, horaFin: "2020-01-01T13:30:00.000Z" };
    render(<PacienteTurnosTable turnos={[resuelto]} tiposConsulta={tiposConsulta} vacio="" />);

    await user.click(screen.getByText("Dolor de muela"));

    expect(pushMock).toHaveBeenCalledWith("/panel/turnos?estado=resuelto&q=1&turno=t-1");
  });

  // TR-074 en docs/tradeoffs.md (pedido explícito del cliente): tocar la
  // fila manda a la vista Turnos con esa fila ya desplegada, mismo
  // patrón que "Ver turno →" en TurnoDetalle.
  it("tocar una fila navega a /panel/turnos con el turno ya desplegado", async () => {
    const user = userEvent.setup();
    render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);

    await user.click(screen.getByText("Dolor de muela"));

    expect(pushMock).toHaveBeenCalledWith("/panel/turnos?estado=agendado&q=1&turno=t-1");
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
