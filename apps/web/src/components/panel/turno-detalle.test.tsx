import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { marcarAsistenciaActionMock } = vi.hoisted(() => ({ marcarAsistenciaActionMock: vi.fn() }));
vi.mock("@/app/actions/turnos", () => ({
  marcarAsistenciaAction: marcarAsistenciaActionMock,
}));

const { TurnoDetalle } = await import("./turno-detalle");

const tiposConsulta = [{ id: "tc-1", nombre: "Urgencia", color: "#D6563A" }];

const turno = {
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
  motivo: "Dolor de muela",
  createdAt: new Date().toISOString(),
};

describe("TurnoDetalle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra hora, paciente y tipo de consulta (spec §4.3)", () => {
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);

    expect(screen.getByText("María Games")).toBeInTheDocument();
    expect(screen.getByText("Urgencia")).toBeInTheDocument();
    expect(screen.getByText(/09:00–09:30/)).toBeInTheDocument();
    expect(screen.getByText("Dolor de muela")).toBeInTheDocument();
  });

  it("se cierra al presionar la X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("se cierra al hacer click en el fondo (backdrop)", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={onClose} />);

    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });

  it("'Ver turno' enlaza a la vista Turnos filtrada por estado y DNI, con este turno para desplegar (deep-link)", () => {
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Ver turno →" })).toHaveAttribute(
      "href",
      "/panel/turnos?estado=agendado&q=1&turno=t-1",
    );
  });

  it("con pacienteId, muestra 'Ver paciente' hacia su ficha", () => {
    render(<TurnoDetalle turno={{ ...turno, pacienteId: "pac-1" }} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Ver paciente →" })).toHaveAttribute("href", "/panel/pacientes/pac-1");
  });

  it("sin pacienteId, no muestra 'Ver paciente'", () => {
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.queryByRole("link", { name: "Ver paciente →" })).not.toBeInTheDocument();
  });

  it("un turno con hora de fin pasada muestra la etiqueta 'Resuelto'", () => {
    const turnoPasado = { ...turno, horaInicio: "2020-01-01T09:00:00Z", horaFin: "2020-01-01T09:30:00Z" };
    render(<TurnoDetalle turno={turnoPasado} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.getByText("Resuelto")).toBeInTheDocument();
  });

  it("un turno futuro no muestra 'Resuelto'", () => {
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.queryByText("Resuelto")).not.toBeInTheDocument();
  });

  // TR-076 en docs/tradeoffs.md (pedido explícito del cliente,
  // 2026-08-27): "tocar un turno resuelto... lleva a la pestaña de
  // Confirmadas, no Resueltas" — 'Ver turno' tiene que abrir la pestaña
  // correcta (?estado=resuelto, no el estado real "agendado").
  it("un turno resuelto: 'Ver turno' enlaza con estado=resuelto, no agendado", () => {
    const turnoResuelto = { ...turno, horaInicio: "2020-01-01T09:00:00Z", horaFin: "2020-01-01T09:30:00Z" };
    render(<TurnoDetalle turno={turnoResuelto} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Ver turno →" })).toHaveAttribute(
      "href",
      "/panel/turnos?estado=resuelto&q=1&turno=t-1",
    );
  });

  // Paso 2 (manejo de conflictos con turnos, 2026-09-04, pedido textual
  // del cliente): "al hacer click en el turno mostrará info del turno y
  // abajo el mensaje turno en conflicto con un horario reservado, hablar
  // con el cliente para acordar otro horario" — solo cuando se abre desde
  // esa tarjeta (ver calendar-view.tsx), nunca en el uso normal.
  it("con enConflicto, muestra el aviso de conflicto abajo del todo", () => {
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} enConflicto />);
    expect(
      screen.getByText("Turno en conflicto con un horario reservado. Hablar con el paciente para acordar otro horario."),
    ).toBeInTheDocument();
  });

  it("sin enConflicto (uso normal), no muestra ningún aviso de conflicto", () => {
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.queryByText(/en conflicto/)).not.toBeInTheDocument();
  });

  // Paso 2b (pedido explícito del cliente, 2026-09-04): "los turnos
  // resueltos ahora tienen la opción al ser tocados de marcar asistidos o
  // ausente, cosa de poder guardar ese dato... tanto en el calendario,
  // como de la sección de turnos resueltos en la pestaña de turnos" — acá
  // el lado "calendario" de ese pedido. Irreversible (corrección de QA,
  // 2026-09-04, textual): "me debe aparecer un aviso que la elección es
  // irreversible y confirmar esto" — tocar el botón solo pide
  // confirmación, la Server Action recién se llama al confirmar.
  describe("marcar asistencia (solo en un turno resuelto, irreversible)", () => {
    const resuelto = { ...turno, horaInicio: "2020-01-01T09:00:00Z", horaFin: "2020-01-01T09:30:00Z" };

    it("un turno todavía no resuelto no ofrece marcar asistencia", () => {
      render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
      expect(screen.queryByRole("button", { name: "Asistió" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ausente" })).not.toBeInTheDocument();
    });

    it("tocar 'Asistió' NO llama a la Server Action todavía — pide confirmación con el aviso de irreversibilidad", async () => {
      const user = userEvent.setup();
      render(<TurnoDetalle turno={resuelto} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Asistió" }));
      expect(marcarAsistenciaActionMock).not.toHaveBeenCalled();
      expect(screen.getByText(/Esta elección es irreversible/)).toBeInTheDocument();
      expect(screen.getByText(/¿Confirmás que el paciente asistió\?/)).toBeInTheDocument();
    });

    it("tocar 'Ausente' pide confirmar con el texto correcto ('estuvo ausente')", async () => {
      const user = userEvent.setup();
      render(<TurnoDetalle turno={resuelto} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Ausente" }));
      expect(screen.getByText(/¿Confirmás que el paciente estuvo ausente\?/)).toBeInTheDocument();
    });

    it("'Cancelar' en la confirmación vuelve a los dos botones sin llamar a la acción", async () => {
      const user = userEvent.setup();
      render(<TurnoDetalle turno={resuelto} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Asistió" }));
      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(marcarAsistenciaActionMock).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Asistió" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ausente" })).toBeInTheDocument();
    });

    it("'Confirmar' llama a marcarAsistenciaAction y deja la marca fija, sin botones", async () => {
      const user = userEvent.setup();
      marcarAsistenciaActionMock.mockResolvedValue({ turno: { ...resuelto, asistencia: "asistio" } });
      render(<TurnoDetalle turno={resuelto} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Asistió" }));
      await user.click(screen.getByRole("button", { name: "Confirmar" }));

      expect(marcarAsistenciaActionMock).toHaveBeenCalledWith("t-1", "asistio");
      expect(await screen.findByText("No se puede modificar.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ausente" })).not.toBeInTheDocument();
    });

    it("un turno que ya llega marcado muestra la etiqueta fija de entrada, sin botones", () => {
      const yaMarcado = { ...resuelto, asistencia: "ausente" as const };
      render(<TurnoDetalle turno={yaMarcado} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);

      expect(screen.getByText("Ausente")).toBeInTheDocument();
      expect(screen.getByText("No se puede modificar.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Asistió" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ausente" })).not.toBeInTheDocument();
    });

    it("muestra el error si falla al confirmar la asistencia", async () => {
      const user = userEvent.setup();
      marcarAsistenciaActionMock.mockResolvedValue({ error: "la asistencia ya fue marcada y no se puede modificar" });
      render(<TurnoDetalle turno={resuelto} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Asistió" }));
      await user.click(screen.getByRole("button", { name: "Confirmar" }));
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent("la asistencia ya fue marcada y no se puede modificar"),
      );
    });
  });
});
