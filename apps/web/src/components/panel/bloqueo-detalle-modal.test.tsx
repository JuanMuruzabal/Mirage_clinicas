import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { eliminarBloqueoActionMock } = vi.hoisted(() => ({ eliminarBloqueoActionMock: vi.fn() }));
vi.mock("@/app/actions/calendario-config", () => ({
  eliminarBloqueoAction: eliminarBloqueoActionMock,
}));

const { BloqueoDetalleModal } = await import("./bloqueo-detalle-modal");

const bloqueo = {
  id: "b-1", especifico: false, diaSemana: 2, alcance: "semana" as const, horaDesde: "07:00", horaHasta: "08:00", tipoRegla: "bloquear_horario",
};

describe("BloqueoDetalleModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con una sola regla, muestra el horario bien grande", () => {
    render(<BloqueoDetalleModal reglas={[bloqueo]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
    const horario = screen.getByText("07:00 – 08:00");
    expect(horario).toBeInTheDocument();
    expect(horario.className).toContain("text-3xl");
  });

  it("con una sola regla, muestra el motivo si lo tiene", () => {
    render(<BloqueoDetalleModal reglas={[{ ...bloqueo, motivo: "Limpieza" }]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
    expect(screen.getByText("Limpieza")).toBeInTheDocument();
  });

  it("con una sola regla, 'Ver horario reservado' llama a onVerRegla con su id", async () => {
    const user = userEvent.setup();
    const onVerRegla = vi.fn();
    render(<BloqueoDetalleModal reglas={[bloqueo]} onClose={vi.fn()} onVerRegla={onVerRegla} />);

    await user.click(screen.getByRole("button", { name: "Ver horario reservado" }));
    expect(onVerRegla).toHaveBeenCalledWith("b-1");
  });

  it("la X cierra el modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BloqueoDetalleModal reglas={[bloqueo]} onClose={onClose} onVerRegla={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Rediseño 2026-09-01, corrección de QA ("las tarjetas de horarios
  // reservados ser más informativas... quitar lo que dice general u
  // específico"): el tipo de regla ("Bloquear horario", hoy el único
  // valor que existe) tampoco se muestra — nunca aportaba nada nuevo.
  it("no muestra 'General'/'Específico' ni el tipo de regla", () => {
    render(<BloqueoDetalleModal reglas={[bloqueo]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
    expect(screen.queryByText("General")).not.toBeInTheDocument();
    expect(screen.queryByText("Específico")).not.toBeInTheDocument();
    expect(screen.queryByText("Bloquear horario")).not.toBeInTheDocument();
  });

  // Rediseño 2026-08-31 (ver "tipos de solapamiento.png" en docs/):
  // "que al tocar en el centro muestre la combinación de horarios
  // reservados... que muestre los horarios de cada una y el botón para
  // redirigirse a cada una, que no dé aviso de solapamiento" — con dos o
  // más reglas, ya no hay una "principal" con un aviso de la otra abajo:
  // se listan todas por igual.
  describe("con dos o más reglas (tramo combinado)", () => {
    const general = { ...bloqueo, motivo: "Limpieza" };
    const especifica = { ...bloqueo, id: "b-2", especifico: true, fecha: "2026-09-01", horaDesde: "07:30", horaHasta: "08:30", motivo: "Reunión" };

    it("muestra el horario bien grande y el motivo de cada regla, no un aviso de solapamiento ni el tipo", () => {
      render(<BloqueoDetalleModal reglas={[general, especifica]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
      expect(screen.getByText("Horarios reservados combinados")).toBeInTheDocument();
      expect(screen.queryByText(/aviso/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/que se solapa:/)).not.toBeInTheDocument();
      expect(screen.queryByText("General")).not.toBeInTheDocument();
      expect(screen.queryByText("Específico")).not.toBeInTheDocument();

      const horarioGeneral = screen.getByText("07:00 – 08:00");
      expect(horarioGeneral.className).toContain("text-lg");
      expect(screen.getByText("Limpieza")).toBeInTheDocument();
      const horarioEspecifica = screen.getByText("07:30 – 08:30");
      expect(horarioEspecifica.className).toContain("text-lg");
      expect(screen.getByText("Reunión")).toBeInTheDocument();
    });

    // Corrección de QA (2026-09-03): "si se superponen muchas cosas, se
    // hace muy grande la vista de los eventos" — la lista tiene su
    // propio scroll (no crece la tarjeta sin límite), mismo criterio que
    // ReglasTable en configuracion-calendario-modal.tsx.
    it("la lista de reglas tiene su propio scroll (no crece sin límite)", () => {
      render(<BloqueoDetalleModal reglas={[general, especifica]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
      const lista = screen.getByText("07:00 – 08:00").closest("div")!.parentElement!;
      expect(lista.className).toContain("overflow-y-auto");
      expect(lista.className).toMatch(/max-h-/);
    });

    it("tiene un botón 'Ver este horario reservado' por cada regla, cada uno con su propio id", async () => {
      const user = userEvent.setup();
      const onVerRegla = vi.fn();
      render(<BloqueoDetalleModal reglas={[general, especifica]} onClose={vi.fn()} onVerRegla={onVerRegla} />);

      const botones = screen.getAllByRole("button", { name: "Ver este horario reservado" });
      expect(botones).toHaveLength(2);

      await user.click(botones[0]);
      expect(onVerRegla).toHaveBeenCalledWith(general.id);
      await user.click(botones[1]);
      expect(onVerRegla).toHaveBeenCalledWith(especifica.id);
    });

    // Escala a una TERCERA regla sin ningún cambio de diseño — "si hay
    // otro solapamiento más, con tocar en el centro se puede agregar
    // acá".
    it("con una tercera regla, la lista y sus botones crecen igual", () => {
      const tercera = { ...bloqueo, id: "b-3", especifico: true, fecha: "2026-09-01", horaDesde: "07:45", horaHasta: "08:15", motivo: "Auditoría" };
      render(<BloqueoDetalleModal reglas={[general, especifica, tercera]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
      expect(screen.getAllByRole("button", { name: "Ver este horario reservado" })).toHaveLength(3);
      expect(screen.getByText("Auditoría")).toBeInTheDocument();
    });
  });

  // Paso 2 — manejo de conflictos con turnos (2026-09-04, pedido textual
  // del cliente): "un título abajo aparte diciendo turnos en conflicto",
  // cada tarjeta con el formato de TurnoDetalle más el aviso fijo.
  describe("con turnos en conflicto (paso 2)", () => {
    const tiposConsulta = [{ id: "tc-1", nombre: "Urgencia", color: "#D6563A" }];
    const turno = {
      id: "t-1", estado: "agendado" as const, origen: "manual" as const, tipoConsultaId: "tc-1",
      horaInicio: new Date(2026, 8, 1, 9, 0).toISOString(), horaFin: new Date(2026, 8, 1, 9, 30).toISOString(),
      nombreContacto: "María", apellidoContacto: "Games", dniContacto: "1", telefonoContacto: "1",
      emailContacto: "", motivo: "", createdAt: new Date().toISOString(),
    };

    it("con un solo turno en conflicto y una sola regla, usa igual la vista de lista (no el detalle simple)", () => {
      render(
        <BloqueoDetalleModal reglas={[bloqueo]} turnos={[turno]} tiposConsulta={tiposConsulta} onClose={vi.fn()} onVerRegla={vi.fn()} />,
      );
      expect(screen.getByText("Turnos en conflicto")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ver este horario reservado" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ver horario reservado" })).not.toBeInTheDocument();
    });

    it("muestra la hora, el paciente, el tipo de consulta y el aviso de conflicto de cada turno", () => {
      render(
        <BloqueoDetalleModal reglas={[bloqueo]} turnos={[turno]} tiposConsulta={tiposConsulta} onClose={vi.fn()} onVerRegla={vi.fn()} />,
      );
      expect(screen.getByText("09:00 – 09:30")).toBeInTheDocument();
      expect(screen.getByText("María Games")).toBeInTheDocument();
      expect(screen.getByText("Urgencia")).toBeInTheDocument();
      expect(
        screen.getByText("Turno en conflicto con un horario reservado. Hablar con el paciente para acordar otro horario."),
      ).toBeInTheDocument();
    });

    it("'Ver turno' llama a onVerTurno con ese turno", async () => {
      const user = userEvent.setup();
      const onVerTurno = vi.fn();
      render(
        <BloqueoDetalleModal
          reglas={[bloqueo]}
          turnos={[turno]}
          tiposConsulta={tiposConsulta}
          onClose={vi.fn()}
          onVerRegla={vi.fn()}
          onVerTurno={onVerTurno}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Ver turno" }));
      expect(onVerTurno).toHaveBeenCalledWith(turno);
    });

    it("sin turnos en conflicto, no muestra la sección 'Turnos en conflicto'", () => {
      render(<BloqueoDetalleModal reglas={[bloqueo]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
      expect(screen.queryByText("Turnos en conflicto")).not.toBeInTheDocument();
    });

    // Corrección de QA (2026-09-04): "que los turnos en conflicto con un
    // horario reservado pasen a resueltos... dejar de decir turno en
    // conflicto, sino pasar a decir X turnos resueltos" — sección aparte,
    // sin el aviso de "hablar con el paciente" (ya no hay nada urgente).
    describe("con un turno ya resuelto (2026-09-04)", () => {
      const turnoResuelto = { ...turno, id: "t-resuelto", horaInicio: "2020-01-01T09:00:00Z", horaFin: "2020-01-01T09:30:00Z" };

      it("lo lista bajo 'Turnos resueltos', no bajo 'Turnos en conflicto', y sin el aviso de conflicto", () => {
        render(
          <BloqueoDetalleModal reglas={[bloqueo]} turnos={[turnoResuelto]} tiposConsulta={tiposConsulta} onClose={vi.fn()} onVerRegla={vi.fn()} />,
        );
        expect(screen.getByText("Turnos resueltos")).toBeInTheDocument();
        expect(screen.queryByText("Turnos en conflicto")).not.toBeInTheDocument();
        expect(screen.queryByText(/en conflicto con un horario reservado/)).not.toBeInTheDocument();
      });

      it("'Ver turno' sigue funcionando para un turno resuelto", async () => {
        const user = userEvent.setup();
        const onVerTurno = vi.fn();
        render(
          <BloqueoDetalleModal
            reglas={[bloqueo]}
            turnos={[turnoResuelto]}
            tiposConsulta={tiposConsulta}
            onClose={vi.fn()}
            onVerRegla={vi.fn()}
            onVerTurno={onVerTurno}
          />,
        );
        await user.click(screen.getByRole("button", { name: "Ver turno" }));
        expect(onVerTurno).toHaveBeenCalledWith(turnoResuelto);
      });

      it("con un turno en conflicto Y uno resuelto a la vez, muestra las dos secciones por separado", () => {
        const enConflicto = { ...turno, id: "t-activo" };
        render(
          <BloqueoDetalleModal
            reglas={[bloqueo]}
            turnos={[enConflicto, turnoResuelto]}
            tiposConsulta={tiposConsulta}
            onClose={vi.fn()}
            onVerRegla={vi.fn()}
          />,
        );
        expect(screen.getByText("Turnos en conflicto")).toBeInTheDocument();
        expect(screen.getByText("Turnos resueltos")).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: "Ver turno" })).toHaveLength(2);
      });
    });
  });

  // Corrección de QA (2026-09-04, pedido textual del cliente): "los
  // horarios específicos reservados pasado el tiempo al tocarlos desde el
  // calendario dar la opción de eliminarlos de ahí directamente".
  describe("eliminar un horario específico ya pasado", () => {
    const especificaPasada = {
      ...bloqueo, id: "b-pasada", especifico: true, fecha: "2020-01-01", diaSemana: undefined, alcance: undefined,
    };
    const especificaFutura = { ...bloqueo, id: "b-futura", especifico: true, fecha: "2099-01-01", diaSemana: undefined, alcance: undefined };

    it("una regla específica ya pasada ofrece 'Eliminar' en el detalle simple", () => {
      render(<BloqueoDetalleModal reglas={[especificaPasada]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    });

    it("una regla específica futura no ofrece 'Eliminar'", () => {
      render(<BloqueoDetalleModal reglas={[especificaFutura]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
      expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
    });

    it("una regla general no ofrece 'Eliminar' aunque su rango ya haya terminado", () => {
      const generalVencida = { ...bloqueo, fechaDesde: "2020-01-01", fechaHasta: "2020-01-07" };
      render(<BloqueoDetalleModal reglas={[generalVencida]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
      expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
    });

    it("pide confirmación, y al confirmar llama a eliminarBloqueoAction y cierra el modal", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const onEliminada = vi.fn();
      eliminarBloqueoActionMock.mockResolvedValue({ ok: true });
      render(<BloqueoDetalleModal reglas={[especificaPasada]} onClose={onClose} onVerRegla={vi.fn()} onEliminada={onEliminada} />);

      await user.click(screen.getByRole("button", { name: "Eliminar" }));
      expect(screen.getByText("¿Eliminar este horario reservado?")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));
      expect(eliminarBloqueoActionMock).toHaveBeenCalledWith("b-pasada");
      await waitFor(() => expect(onEliminada).toHaveBeenCalledTimes(1));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("'Cancelar' en la confirmación vuelve al botón 'Eliminar' sin llamar a la acción", async () => {
      const user = userEvent.setup();
      render(<BloqueoDetalleModal reglas={[especificaPasada]} onClose={vi.fn()} onVerRegla={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Eliminar" }));
      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
      expect(eliminarBloqueoActionMock).not.toHaveBeenCalled();
    });

    it("muestra el error si falla la eliminación, sin cerrar el modal", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      eliminarBloqueoActionMock.mockResolvedValue({ error: "no se pudo eliminar la regla" });
      render(<BloqueoDetalleModal reglas={[especificaPasada]} onClose={onClose} onVerRegla={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Eliminar" }));
      await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("no se pudo eliminar la regla");
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
