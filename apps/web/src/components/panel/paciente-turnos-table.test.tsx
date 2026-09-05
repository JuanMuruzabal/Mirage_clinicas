import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rangoRapidoFechas } from "@/lib/calendar-utils";
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
  horaInicio: "2030-09-01T13:00:00.000Z",
  horaFin: "2030-09-01T13:30:00.000Z",
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

  // Corrección de QA (pedido textual del cliente): "si el tipo de
  // consulta es muy largo... poner un botón 'Ver tipo'" — mismo umbral
  // que TurnosTable (tipoConsultaNombreEsLargo: más largo que "Consulta
  // general", 16 caracteres). El punto de color sigue viendo siempre,
  // sea cual sea el nombre.
  it("un nombre de tipo largo se oculta detrás de 'Ver tipo →', sin tapar el punto de color", async () => {
    const tipoLargo = [{ id: "tc-largo", nombre: "Consulta de ortodoncia y control", color: "#D6563A" }];
    const turnoConTipoLargo = { ...turno, tipoConsultaId: "tc-largo" };
    const user = userEvent.setup();
    const { container } = render(<PacienteTurnosTable turnos={[turnoConTipoLargo]} tiposConsulta={tipoLargo} vacio="" />);

    // queryByText a secas también encuentra la <option> del selector de
    // tipos (que sí lleva el nombre completo) — se busca puntualmente la
    // celda de la tabla, no cualquier texto en la página.
    expect(screen.queryByRole("cell", { name: tipoLargo[0].nombre })).not.toBeInTheDocument();
    const punto = container.querySelector("tbody .rounded-full") as HTMLElement;
    expect(punto).toHaveStyle({ background: "rgb(214, 86, 58)" });

    await user.click(screen.getByRole("button", { name: "Ver tipo →" }));
    const dialogo = await screen.findByRole("dialog", { name: "Tipo" });
    expect(dialogo).toHaveTextContent(tipoLargo[0].nombre);
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

  // Corrección de QA: "en la ficha de pacientes en historial de turnos
  // si el turno fue ausente o asistió, ya que no hay referencia visual
  // de esto" — junto a la etiqueta "Resuelto", no reemplazándola.
  it("un turno resuelto marcado 'asistio' muestra la etiqueta Asistió junto a Resuelto", () => {
    const marcado = { ...turno, horaFin: "2020-01-01T13:30:00.000Z", asistencia: "asistio" as const };
    render(<PacienteTurnosTable turnos={[marcado]} tiposConsulta={tiposConsulta} vacio="" />);
    expect(screen.getByText("Resuelto")).toBeInTheDocument();
    expect(screen.getByText("Asistió")).toBeInTheDocument();
  });

  it("un turno resuelto marcado 'ausente' muestra la etiqueta Ausente", () => {
    const marcado = { ...turno, horaFin: "2020-01-01T13:30:00.000Z", asistencia: "ausente" as const };
    render(<PacienteTurnosTable turnos={[marcado]} tiposConsulta={tiposConsulta} vacio="" />);
    expect(screen.getByText("Ausente")).toBeInTheDocument();
  });

  it("un turno resuelto sin marcar todavía no muestra ninguna etiqueta de asistencia", () => {
    const sinMarcar = { ...turno, horaFin: "2020-01-01T13:30:00.000Z" };
    render(<PacienteTurnosTable turnos={[sinMarcar]} tiposConsulta={tiposConsulta} vacio="" />);
    expect(screen.queryByText("Asistió")).not.toBeInTheDocument();
    expect(screen.queryByText("Ausente")).not.toBeInTheDocument();
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

  // Corrección de QA (2026-09-06), pedido textual del cliente: "los
  // filtros de búsqueda... pasan a aparecer cuando se toca un botón...
  // en vez de decir aplicar, aparezca 'ver X turnos'" — Tipo/Hoy-Semana-
  // Mes/Desde-Hasta viven ahora dentro de FiltrosSheet (botón "Filtros"),
  // y filtrar es de dos pasos: elegir en el panel (borrador, no filtra
  // todavía) → tocar "Ver X turnos" (recién ahí se confirma).
  async function abrirFiltros(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Filtros" }));
  }

  async function confirmarFiltros(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /^Ver \d+ turnos?$/ }));
  }

  it("filtra por tipo de consulta", async () => {
    const user = userEvent.setup();
    const otro = { ...turno, id: "t-2", tipoConsultaId: "tc-1", nombreContacto: "Ana", motivo: "" };
    render(<PacienteTurnosTable turnos={[turno, otro]} tiposConsulta={tiposConsulta} vacio="" />);

    expect(screen.getByRole("cell", { name: "Urgencia" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Consulta general" })).toBeInTheDocument();

    await abrirFiltros(user);
    await user.selectOptions(screen.getByLabelText("Tipo de consulta"), "tc-1");
    expect(screen.getByRole("button", { name: "Ver 1 turno" })).toBeInTheDocument();
    await confirmarFiltros(user);

    expect(screen.queryByRole("cell", { name: "Urgencia" })).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Consulta general" })).toBeInTheDocument();
  });

  it("filtra por rango de fecha y avisa cuando ningún turno coincide", async () => {
    const user = userEvent.setup();
    render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);

    await abrirFiltros(user);
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2030-10-01" } });
    expect(screen.getByRole("button", { name: "Ver 0 turnos" })).toBeInTheDocument();
    await confirmarFiltros(user);

    expect(screen.getByText("Ningún turno coincide con el filtro.")).toBeInTheDocument();
  });

  // Extra 2.3.3 (E3.5): atajos HOY/SEMANA/MES antes de Desde/Hasta.
  it("tocar 'Hoy' precarga Desde y Hasta con la fecha de hoy", async () => {
    const user = userEvent.setup();
    render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);

    await abrirFiltros(user);
    await user.click(screen.getByRole("button", { name: "Hoy" }));

    const { desde, hasta } = rangoRapidoFechas("hoy");
    expect(screen.getByLabelText("Desde")).toHaveValue(desde);
    expect(screen.getByLabelText("Hasta")).toHaveValue(hasta);
  });

  it("tocar 'Semana' precarga Desde/Hasta con el lunes a domingo de la semana actual", async () => {
    const user = userEvent.setup();
    render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);

    await abrirFiltros(user);
    await user.click(screen.getByRole("button", { name: "Semana" }));

    const { desde, hasta } = rangoRapidoFechas("semana");
    expect(screen.getByLabelText("Desde")).toHaveValue(desde);
    expect(screen.getByLabelText("Hasta")).toHaveValue(hasta);
  });

  // Corrección de QA (pedido explícito del cliente): los atajos HOY/
  // SEMANA/MES se sacan SOLO de "Historial de turnos" — Desde/Hasta
  // sigue disponible ahí, y "Turnos activos" (mostrarRangosRapidos=true
  // por default, sin tocar su call site) no se ve afectado.
  it("mostrarRangosRapidos=false saca los atajos HOY/SEMANA/MES, sin tocar Desde/Hasta", async () => {
    const user = userEvent.setup();
    render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" mostrarRangosRapidos={false} />);

    await abrirFiltros(user);

    expect(screen.queryByRole("button", { name: "Hoy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Semana" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mes" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Desde")).toBeInTheDocument();
    expect(screen.getByLabelText("Hasta")).toBeInTheDocument();
  });

  // Corrección de QA: "Ver motivo" (Extra 2.3.3/E3.3) faltaba acá — mismo
  // componente que ya aplica en TurnosTable, para "Turnos activos" e
  // "Historial de turnos" (mismo componente en los dos lugares).
  it("motivo largo: se oculta detrás de 'Ver motivo', y clickearlo no navega la fila", async () => {
    const motivoLargo = "Dolor intenso en la muela del juicio inferior derecha desde hace tres días";
    const user = userEvent.setup();
    render(<PacienteTurnosTable turnos={[{ ...turno, motivo: motivoLargo }]} tiposConsulta={tiposConsulta} vacio="" />);
    // pushMock no se limpia entre tests de este archivo (no hay
    // `beforeEach(vi.clearAllMocks)`) — se compara contra la cantidad de
    // llamadas ya acumuladas, no contra cero.
    const llamadasPrevias = pushMock.mock.calls.length;

    expect(screen.getByRole("button", { name: "Ver motivo de consulta" })).toBeInTheDocument();
    expect(screen.queryByText(motivoLargo)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver motivo de consulta" }));
    const dialogo = await screen.findByRole("dialog", { name: "Motivo de consulta" });
    expect(dialogo).toBeInTheDocument();
    expect(pushMock.mock.calls.length).toBe(llamadasPrevias);
  });

  it("'Limpiar filtros' resetea el borrador (no navega solo) — 'Ver X turnos' confirma", async () => {
    const user = userEvent.setup();
    render(<PacienteTurnosTable turnos={[turno]} tiposConsulta={tiposConsulta} vacio="" />);

    await abrirFiltros(user);
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-01-01" } });
    await confirmarFiltros(user);
    expect(screen.getByText("Ningún turno coincide con el filtro.")).toBeInTheDocument();

    // Reabre la hoja — el borrador arranca desde lo confirmado (Hasta
    // sigue en "2026-01-01"), "Limpiar filtros" lo resetea pero la tabla
    // de abajo sigue sin cambios hasta confirmar de nuevo.
    await abrirFiltros(user);
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getByText("Ningún turno coincide con el filtro.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver 1 turno" })).toBeInTheDocument();

    await confirmarFiltros(user);
    expect(screen.getByRole("cell", { name: "Urgencia" })).toBeInTheDocument();
  });
});
