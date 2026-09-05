import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  cancelarTurnoActionMock,
  cancelarTurnosSinVerificarActionMock,
  listTurnosActionMock,
  crearTurnoManualActionMock,
  reprogramarTurnoActionMock,
  marcarAsistenciaActionMock,
  listPacientesActionMock,
  listDisponibilidadActionMock,
} = vi.hoisted(() => ({
  cancelarTurnoActionMock: vi.fn(),
  cancelarTurnosSinVerificarActionMock: vi.fn(),
  listTurnosActionMock: vi.fn(),
  crearTurnoManualActionMock: vi.fn(),
  reprogramarTurnoActionMock: vi.fn(),
  marcarAsistenciaActionMock: vi.fn(),
  listPacientesActionMock: vi.fn(),
  listDisponibilidadActionMock: vi.fn(),
}));

// TurnosTable renderiza EditarTurnoModal (mismo módulo que su propio
// test) — mockeamos todas las acciones que ese componente importa, no
// solo las que usa TurnosTable directamente.
vi.mock("@/app/actions/turnos", () => ({
  cancelarTurnoAction: cancelarTurnoActionMock,
  cancelarTurnosSinVerificarAction: cancelarTurnosSinVerificarActionMock,
  listTurnosAction: listTurnosActionMock,
  crearTurnoManualAction: crearTurnoManualActionMock,
  reprogramarTurnoAction: reprogramarTurnoActionMock,
  marcarAsistenciaAction: marcarAsistenciaActionMock,
}));
vi.mock("@/app/actions/pacientes", () => ({
  listPacientesAction: listPacientesActionMock,
}));
vi.mock("@/app/actions/calendario-config", () => ({
  listDisponibilidadAction: listDisponibilidadActionMock,
}));

const { TurnosTable } = await import("./turnos-table");

const tiposConsulta = [{ id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" }];

const turnoAgendado = {
  id: "agen-1",
  estado: "agendado" as const,
  origen: "manual" as const,
  nombreContacto: "Julián",
  apellidoContacto: "Ortiz",
  dniContacto: "30222333",
  telefonoContacto: "+5493511111111",
  emailContacto: "julian@example.com",
  motivo: "",
  horaInicio: "2030-09-01T09:00:00Z",
  horaFin: "2030-09-01T09:30:00Z",
  createdAt: new Date().toISOString(),
};

// Las acciones (Confirmar/Editar/Cancelar) viven en un panel que se
// despliega al tocar la fila (pedido explícito del cliente, 2026-08-23) —
// se abre clickeando el nombre del paciente, que nunca es en sí mismo un
// botón/link.
async function desplegarFila(user: ReturnType<typeof userEvent.setup>, nombreCompleto: string) {
  await user.click(screen.getByText(nombreCompleto));
}

describe("TurnosTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTurnosActionMock.mockResolvedValue([]);
    listPacientesActionMock.mockResolvedValue([]);
    listDisponibilidadActionMock.mockResolvedValue({ slots: ["09:00", "09:15", "09:30"] });
    cancelarTurnosSinVerificarActionMock.mockResolvedValue({ cancelados: 0 });
  });

  it("muestra un mensaje cuando no hay turnos", () => {
    render(<TurnosTable turnosIniciales={[]} tiposConsulta={tiposConsulta} filtros={{}} />);
    expect(screen.getByText("No hay turnos para este filtro.")).toBeInTheDocument();
  });

  // El sticky vive en cada `th` (`.panel-th-sticky`), no en thead/tr —
  // bug de Safari de iOS con rebote elástico (2026-08-28): WebKit no
  // recalcula bien el sticky en thead/tr durante el overscroll.
  it("cada th del encabezado tiene la clase sticky (no el thead)", () => {
    const { container } = render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);
    const thead = container.querySelector("thead")!;
    expect(thead.className).toBe("");
    const ths = container.querySelectorAll("thead th");
    expect(ths.length).toBeGreaterThan(0);
    ths.forEach((th) => expect(th).toHaveClass("panel-th-sticky"));
  });

  // Corrección de seguridad (Fase 2.4.1): visibilidad para el profesional
  // sobre turnos de pacientes que todavía no demostraron ser reales.
  it("con pacienteVerificado en false, muestra la etiqueta 'Sin verificar'", () => {
    render(<TurnosTable turnosIniciales={[{ ...turnoAgendado, pacienteVerificado: false }]} tiposConsulta={tiposConsulta} filtros={{}} />);
    expect(screen.getByText("Sin verificar")).toBeInTheDocument();
  });

  it("con pacienteVerificado en true, no muestra la etiqueta 'Sin verificar'", () => {
    render(<TurnosTable turnosIniciales={[{ ...turnoAgendado, pacienteVerificado: true }]} tiposConsulta={tiposConsulta} filtros={{}} />);
    expect(screen.queryByText("Sin verificar")).not.toBeInTheDocument();
  });

  // Corrección de seguridad (Fase 2.4.1): "cómo se hace para borrar todos
  // los turnos sin verificar" — el botón solo aparece con ese filtro
  // activo, pide confirmación en dos pasos antes de llamar a la acción.
  describe("botón 'Cancelar todos los turnos sin verificar'", () => {
    it("no aparece sin el filtro verificacion=sin_verificar", () => {
      render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);
      expect(screen.queryByRole("button", { name: "Cancelar todos los turnos sin verificar" })).not.toBeInTheDocument();
    });

    it("con el filtro activo, pide confirmación antes de llamar a la acción", async () => {
      const user = userEvent.setup();
      render(
        <TurnosTable
          turnosIniciales={[{ ...turnoAgendado, pacienteVerificado: false }]}
          tiposConsulta={tiposConsulta}
          filtros={{ verificacion: "sin_verificar" }}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Cancelar todos los turnos sin verificar" }));
      expect(cancelarTurnosSinVerificarActionMock).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent("no se puede deshacer");

      await user.click(screen.getByRole("button", { name: "Sí, cancelar todos" }));
      expect(cancelarTurnosSinVerificarActionMock).toHaveBeenCalledTimes(1);
    });

    it("'Volver' cierra la confirmación sin llamar a la acción", async () => {
      const user = userEvent.setup();
      render(
        <TurnosTable
          turnosIniciales={[{ ...turnoAgendado, pacienteVerificado: false }]}
          tiposConsulta={tiposConsulta}
          filtros={{ verificacion: "sin_verificar" }}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Cancelar todos los turnos sin verificar" }));
      await user.click(screen.getByRole("button", { name: "Volver" }));
      expect(cancelarTurnosSinVerificarActionMock).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Cancelar todos los turnos sin verificar" })).toBeInTheDocument();
    });

    it("en éxito, muestra cuántos se cancelaron y recarga la lista", async () => {
      cancelarTurnosSinVerificarActionMock.mockResolvedValue({ cancelados: 3 });
      listTurnosActionMock.mockResolvedValue([]);
      const user = userEvent.setup();
      render(
        <TurnosTable
          turnosIniciales={[{ ...turnoAgendado, pacienteVerificado: false }]}
          tiposConsulta={tiposConsulta}
          filtros={{ verificacion: "sin_verificar" }}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Cancelar todos los turnos sin verificar" }));
      await user.click(screen.getByRole("button", { name: "Sí, cancelar todos" }));

      expect(await screen.findByText("Se cancelaron 3 turno(s) sin verificar.")).toBeInTheDocument();
      // El mensaje sigue visible aunque la lista haya quedado vacía.
      expect(screen.getByText("No hay turnos para este filtro.")).toBeInTheDocument();
    });

    it("en error, muestra el mensaje sin recargar la lista", async () => {
      cancelarTurnosSinVerificarActionMock.mockResolvedValue({ error: "no se pudieron cancelar los turnos" });
      const user = userEvent.setup();
      render(
        <TurnosTable
          turnosIniciales={[{ ...turnoAgendado, pacienteVerificado: false }]}
          tiposConsulta={tiposConsulta}
          filtros={{ verificacion: "sin_verificar" }}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Cancelar todos los turnos sin verificar" }));
      await user.click(screen.getByRole("button", { name: "Sí, cancelar todos" }));

      expect(await screen.findByText("no se pudieron cancelar los turnos")).toBeInTheDocument();
      expect(listTurnosActionMock).not.toHaveBeenCalled();
    });
  });

  it("las acciones no están visibles hasta que se despliega la fila", () => {
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
  });

  it("clickear la fila la despliega y clickearla de nuevo la cierra", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();

    await desplegarFila(user, "Julián Ortiz");
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("no muestra 'Confirmar' para un turno ya agendado (TR-104: 'pendiente' no existe más)", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
  });

  it("Cancelar un turno AGENDADO abre el modal de confirmación extra, y no llama a la acción hasta confirmar", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByRole("dialog", { name: "Cancelar turno" })).toBeInTheDocument();
    expect(cancelarTurnoActionMock).not.toHaveBeenCalled();
  });

  it("confirmar en el modal de cancelación llama a la acción y recarga la lista", async () => {
    cancelarTurnoActionMock.mockResolvedValue({ turno: { ...turnoAgendado, estado: "cancelada" } });
    listTurnosActionMock.mockResolvedValue([{ ...turnoAgendado, estado: "cancelada" }]);
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar turno" });
    await user.click(within(dialogo).getByRole("button", { name: "Sí, cancelar turno" }));

    await waitFor(() => expect(cancelarTurnoActionMock).toHaveBeenCalledWith("agen-1"));
    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalledWith({}));
    expect(screen.queryByRole("dialog", { name: "Cancelar turno" })).not.toBeInTheDocument();
  });

  it("'Volver' en el modal de cancelación cierra sin llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar turno" });
    await user.click(within(dialogo).getByRole("button", { name: "Volver" }));

    expect(screen.queryByRole("dialog", { name: "Cancelar turno" })).not.toBeInTheDocument();
    expect(cancelarTurnoActionMock).not.toHaveBeenCalled();
  });

  it("muestra el error de cancelación dentro del modal, sin cerrarlo", async () => {
    cancelarTurnoActionMock.mockResolvedValue({ error: "turno no encontrado" });
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar turno" });
    await user.click(within(dialogo).getByRole("button", { name: "Sí, cancelar turno" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("turno no encontrado");
  });

  it("no muestra 'Cancelar' ni 'Editar' para turnos ya cancelados", async () => {
    const user = userEvent.setup();
    render(
      <TurnosTable
        turnosIniciales={[{ ...turnoAgendado, estado: "cancelada" }]}
        tiposConsulta={tiposConsulta}
        filtros={{}}
      />,
    );
    await desplegarFila(user, "Julián Ortiz");
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  // TR-074 en docs/tradeoffs.md (pedido explícito del cliente): un turno
  // agendado con horaFin ya pasado ("resuelto") debe mostrar "Resuelto",
  // no "Confirmado", y no debe poder confirmarse/editarse/cancelarse —
  // solo lectura.
  it("un turno resuelto (agendado + horaFin pasado) muestra Resuelto y no ofrece acciones de edición", async () => {
    const user = userEvent.setup();
    const resuelto = { ...turnoAgendado, horaFin: "2020-01-01T09:30:00Z" };
    render(<TurnosTable turnosIniciales={[resuelto]} tiposConsulta={tiposConsulta} filtros={{}} />);

    expect(screen.getByText("Resuelto")).toBeInTheDocument();
    expect(screen.queryByText("Confirmado")).not.toBeInTheDocument();

    await desplegarFila(user, "Julián Ortiz");
    expect(screen.getByText("Turno ya resuelto — sin acciones de edición disponibles.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
  });

  // Corrección de QA (rediseño del cartel de asistencia en tiempo real,
  // `AsistenciaCartelGlobal`): "vamos a quitar todos los otros botones
  // para poner ausente o presente fuera de esto, por ejemplo al tocar el
  // turno resuelto en la sección de turnos resueltos en turnos" — esta
  // fila deja de tener forma de marcar asistencia, solo muestra lo que el
  // cartel ya marcó (o un aviso de que está pendiente ahí).
  describe("asistencia en un turno resuelto (solo lectura, el cartel global es quien la marca)", () => {
    const resuelto = { ...turnoAgendado, horaFin: "2020-01-01T09:30:00Z" };

    it("un turno resuelto sin marcar avisa que está pendiente en el cartel, sin botones", async () => {
      const user = userEvent.setup();
      render(<TurnosTable turnosIniciales={[resuelto]} tiposConsulta={tiposConsulta} filtros={{}} />);

      await desplegarFila(user, "Julián Ortiz");
      expect(screen.getByText("Pendiente de confirmar en el cartel de asistencia.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Asistió" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ausente" })).not.toBeInTheDocument();
    });

    it("un turno ya marcado muestra la etiqueta fija, sin botones", async () => {
      const user = userEvent.setup();
      const yaMarcado = { ...resuelto, asistencia: "ausente" as const };
      render(<TurnosTable turnosIniciales={[yaMarcado]} tiposConsulta={tiposConsulta} filtros={{}} />);

      await desplegarFila(user, "Julián Ortiz");
      expect(screen.getAllByText("Ausente").length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: "Asistió" })).not.toBeInTheDocument();
    });

    // Corrección de QA (2026-09-06): "abajo del estado asistido... poner
    // lo que el profesional marcó" — visible en la columna de estado SIN
    // desplegar la fila.
    it("un turno ya marcado muestra la marca junto al estado sin desplegar la fila", () => {
      const yaMarcado = { ...resuelto, asistencia: "ausente" as const };
      render(<TurnosTable turnosIniciales={[yaMarcado]} tiposConsulta={tiposConsulta} filtros={{}} />);

      expect(screen.getByText("Resuelto")).toBeInTheDocument();
      expect(screen.getByText("Ausente")).toBeInTheDocument();
    });

    it("al desplegar la fila, la marca de la columna de estado no se duplica con la de las acciones", async () => {
      const user = userEvent.setup();
      const yaMarcado = { ...resuelto, asistencia: "asistio" as const };
      render(<TurnosTable turnosIniciales={[yaMarcado]} tiposConsulta={tiposConsulta} filtros={{}} />);

      expect(screen.getByText("Asistió")).toBeInTheDocument();
      await desplegarFila(user, "Julián Ortiz");
      expect(screen.getAllByText("Asistió")).toHaveLength(1);
    });
  });

  it("Editar abre el modal con los datos del turno", async () => {
    const user = userEvent.setup();
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

    await desplegarFila(user, "Julián Ortiz");
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(await screen.findByRole("dialog", { name: "Editar turno" })).toBeInTheDocument();
  });

  it("con abrirId, la fila correspondiente arranca desplegada (deep-link desde 'Ver turno')", () => {
    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} abrirId="agen-1" />);
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  // Bug reportado 2026-08-28: "si toco Ver turno... y este turno está muy
  // debajo de la tabla, tengo que bajar manualmente para ver el turno
  // desplegado" — la fila ya arrancaba desplegada, pero nada la traía a
  // la vista.
  it("con abrirId, la fila correspondiente se trae a la vista con scrollIntoView", () => {
    const scrollIntoViewMock = vi.fn();
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(scrollIntoViewMock);

    render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} abrirId="agen-1" />);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  // Corrección de QA: "dar un indicador visual en la tabla de turnos el
  // tipo de consulta, ya que está ausente" — punto de color + nombre
  // (nunca el color solo, TR-013), con "Ver tipo →" para un nombre largo.
  describe("corrección de QA: indicador de tipo de consulta", () => {
    it("muestra el nombre del tipo con su color configurado como punto indicador", () => {
      const turnoConTipo = { ...turnoAgendado, tipoConsultaId: "tc-1" };
      const { container } = render(<TurnosTable turnosIniciales={[turnoConTipo]} tiposConsulta={tiposConsulta} filtros={{}} />);

      expect(screen.getByText("Consulta general")).toBeInTheDocument();
      const punto = container.querySelector(".rounded-full[style]") as HTMLElement;
      expect(punto).toHaveStyle({ background: "rgb(231, 217, 190)" });
    });

    it("sin tipoConsultaId (o si no se encuentra), muestra —", () => {
      render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
    });

    it("un nombre de tipo largo se oculta detrás de 'Ver tipo →', y lo muestra completo en un modal", async () => {
      const tipoNombreLargo = [{ id: "tc-largo", nombre: "Consulta de ortodoncia y control post-tratamiento prolongado", color: "#E7D9BE" }];
      const turnoConTipoLargo = { ...turnoAgendado, tipoConsultaId: "tc-largo" };
      const user = userEvent.setup();
      render(<TurnosTable turnosIniciales={[turnoConTipoLargo]} tiposConsulta={tipoNombreLargo} filtros={{}} />);

      const boton = screen.getByRole("button", { name: "Ver tipo →" });
      expect(screen.queryByText(tipoNombreLargo[0].nombre)).not.toBeInTheDocument();

      await user.click(boton);
      const dialogo = await screen.findByRole("dialog", { name: "Tipo" });
      expect(within(dialogo).getByText(tipoNombreLargo[0].nombre)).toBeInTheDocument();
    });
  });

  // Extra 2.3.3 (E3.3): un motivo largo ya no se muestra inline (rompía
  // el ancho de la fila) — se reemplaza por el botón "Ver motivo de consulta"
  // (VerTextoBoton, Extra 2.3.1/E1.7), que abre el texto completo en un
  // modal aparte.
  describe("E3.3: 'Ver motivo' para un motivo largo", () => {
    const motivoLargo = "Dolor intenso en la muela del juicio inferior derecha desde hace tres días, empeora al masticar";
    const turnoMotivoLargo = { ...turnoAgendado, id: "agen-largo", motivo: motivoLargo };

    it("un motivo largo se oculta detrás del botón 'Ver motivo', sin mostrar el texto inline", () => {
      render(<TurnosTable turnosIniciales={[turnoMotivoLargo]} tiposConsulta={tiposConsulta} filtros={{}} />);

      expect(screen.getByRole("button", { name: "Ver motivo de consulta" })).toBeInTheDocument();
      expect(screen.queryByText(motivoLargo)).not.toBeInTheDocument();
    });

    it("tocar 'Ver motivo' muestra el texto completo en un modal", async () => {
      const user = userEvent.setup();
      render(<TurnosTable turnosIniciales={[turnoMotivoLargo]} tiposConsulta={tiposConsulta} filtros={{}} />);

      await user.click(screen.getByRole("button", { name: "Ver motivo de consulta" }));

      const dialogo = await screen.findByRole("dialog", { name: "Motivo de consulta" });
      expect(within(dialogo).getByText(motivoLargo)).toBeInTheDocument();
    });

    it("un motivo corto se sigue mostrando inline, sin botón 'Ver motivo'", () => {
      render(<TurnosTable turnosIniciales={[{ ...turnoAgendado, motivo: "Control" }]} tiposConsulta={tiposConsulta} filtros={{}} />);

      expect(screen.getByText("Control")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ver motivo de consulta" })).not.toBeInTheDocument();
    });
  });

  // Corrección de QA: mismo "Ver mail" de Pacientes (Extra 2.3.4/E4.1),
  // pero acá en la columna Contacto, como link con flecha ("Ver email →",
  // sin la pastilla con borde de "Ver motivo" al lado) — pedido explícito
  // del cliente.
  describe("corrección de QA: 'Ver email →' en la columna Contacto para un mail largo", () => {
    const emailLargo = "bruno.alejandro.iglesias.paciente.frecuente@clinica-ejemplo.com.ar";
    const turnoEmailLargo = { ...turnoAgendado, id: "agen-mail-largo", emailContacto: emailLargo };

    it("un email largo se oculta detrás de 'Ver email →', sin la pastilla con borde", () => {
      render(<TurnosTable turnosIniciales={[turnoEmailLargo]} tiposConsulta={tiposConsulta} filtros={{}} />);

      const link = screen.getByRole("button", { name: "Ver email →" });
      expect(link.className).not.toContain("rounded-full");
      expect(screen.queryByText(emailLargo)).not.toBeInTheDocument();
    });

    it("tocarlo muestra el texto completo en un modal, sin desplegar la fila", async () => {
      const user = userEvent.setup();
      render(<TurnosTable turnosIniciales={[turnoEmailLargo]} tiposConsulta={tiposConsulta} filtros={{}} />);

      await user.click(screen.getByRole("button", { name: "Ver email →" }));

      const dialogo = await screen.findByRole("dialog", { name: "Email" });
      expect(within(dialogo).getByText(emailLargo)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    });

    it("un email corto se sigue mostrando inline, sin el link 'Ver email →'", () => {
      render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

      expect(screen.getByText("julian@example.com")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ver email →" })).not.toBeInTheDocument();
    });
  });

  // Extra 2.3.3 (E3.4): misma navegación que el botón homónimo del
  // calendario (turno-detalle.tsx) — lleva a la ficha del paciente.
  describe("E3.4: botón 'Ver paciente'", () => {
    it("aparece al desplegar la fila cuando el turno tiene pacienteId, y lleva a su ficha", async () => {
      const user = userEvent.setup();
      const turnoConPaciente = { ...turnoAgendado, pacienteId: "pac-1" };
      render(<TurnosTable turnosIniciales={[turnoConPaciente]} tiposConsulta={tiposConsulta} filtros={{}} />);

      await desplegarFila(user, "Julián Ortiz");
      const link = screen.getByRole("link", { name: "Ver paciente →" });
      expect(link).toHaveAttribute("href", "/panel/pacientes/pac-1");
    });

    it("no aparece si el turno no tiene pacienteId", async () => {
      const user = userEvent.setup();
      render(<TurnosTable turnosIniciales={[turnoAgendado]} tiposConsulta={tiposConsulta} filtros={{}} />);

      await desplegarFila(user, "Julián Ortiz");
      expect(screen.queryByRole("link", { name: "Ver paciente →" })).not.toBeInTheDocument();
    });
  });
});
