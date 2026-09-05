import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { TurnoDetalle } = await import("./turno-detalle");

const tiposConsulta = [{ id: "tc-1", nombre: "Urgencia", color: "#D6563A" }];

const turno = {
  id: "t-1",
  estado: "agendado" as const,
  origen: "manual" as const,
  tipoConsultaId: "tc-1",
  horaInicio: new Date(2030, 8, 1, 9, 0).toISOString(),
  horaFin: new Date(2030, 8, 1, 9, 30).toISOString(),
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

  // Autoreservado (nueva función, pedido textual del cliente,
  // 2026-09-08): "cuando tocas la tarjeta informar que es autoreservado".
  it("con autoreservado, avisa que el turno se reprogramó automáticamente", () => {
    render(<TurnoDetalle turno={{ ...turno, autoreservado: true }} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.getByText("Este turno fue reprogramado automáticamente con “Autoreservar turnos”.")).toBeInTheDocument();
  });

  it("sin autoreservado, no muestra ese aviso", () => {
    render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
    expect(screen.queryByText(/reprogramado automáticamente/)).not.toBeInTheDocument();
  });

  // Corrección de QA (rediseño del cartel de asistencia en tiempo real,
  // `AsistenciaCartelGlobal`): "vamos a quitar todos los otros botones
  // para poner ausente o presente fuera de esto, por ejemplo... en la
  // tarjeta del calendario" — este panel deja de tener forma de marcar
  // asistencia, solo muestra lo que el cartel ya marcó (o un aviso de que
  // todavía está pendiente ahí).
  describe("asistencia (solo lectura, el cartel global es quien la marca)", () => {
    const resuelto = { ...turno, horaInicio: "2020-01-01T09:00:00Z", horaFin: "2020-01-01T09:30:00Z" };

    it("un turno todavía no resuelto no muestra nada de asistencia", () => {
      render(<TurnoDetalle turno={turno} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
      expect(screen.queryByText("Asistencia")).not.toBeInTheDocument();
    });

    it("un turno resuelto sin marcar avisa que está pendiente en el cartel, sin botones", () => {
      render(<TurnoDetalle turno={resuelto} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
      expect(screen.getByText("Pendiente de confirmar en el cartel de asistencia.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Asistió" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ausente" })).not.toBeInTheDocument();
    });

    it("un turno ya marcado 'asistio' muestra la etiqueta correspondiente", () => {
      const marcado = { ...resuelto, asistencia: "asistio" as const };
      render(<TurnoDetalle turno={marcado} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
      expect(screen.getByText("Asistió")).toBeInTheDocument();
    });

    it("un turno ya marcado 'ausente' muestra la etiqueta correspondiente, sin botones", () => {
      const marcado = { ...resuelto, asistencia: "ausente" as const };
      render(<TurnoDetalle turno={marcado} tiposConsulta={tiposConsulta} onClose={vi.fn()} />);
      expect(screen.getByText("Ausente")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Asistió" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ausente" })).not.toBeInTheDocument();
    });
  });
});
