import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { eliminarBloqueoActionMock, autoreservarTurnosActionMock } = vi.hoisted(() => ({
  eliminarBloqueoActionMock: vi.fn(),
  autoreservarTurnosActionMock: vi.fn(),
}));
vi.mock("@/app/actions/calendario-config", () => ({
  eliminarBloqueoAction: eliminarBloqueoActionMock,
}));
vi.mock("@/app/actions/turnos", () => ({
  autoreservarTurnosAction: autoreservarTurnosActionMock,
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

  // Excepción de horario de atención sintética sola (nueva función,
  // corrección de QA 2026-09-08: "agregar botón de ver excepción de
  // horario al tocar la tarjeta de horario de excepción en el
  // calendario") — la tarjeta es clickeable (calendar-grid.tsx) y llega
  // acá como una regla sintética sola: "Ver..." sigue funcionando, solo
  // con otra etiqueta; "Eliminar" no aplica (no hay un bloqueo real
  // detrás de este id, se borra desde Configuración de calendario).
  it("con una excepción sintética sola, muestra 'Ver excepción de horario' pero no 'Eliminar'", async () => {
    const user = userEvent.setup();
    const onVerRegla = vi.fn();
    const excepcionSintetica = {
      id: "excepcion:ha-1:2026-09-01:0:completo",
      especifico: true as const,
      fecha: "2026-09-01",
      horaDesde: "08:00",
      horaHasta: "20:00",
      tipoRegla: "bloquear_horario",
      motivo: "No trabajo en este período",
    };
    render(<BloqueoDetalleModal reglas={[excepcionSintetica]} onClose={vi.fn()} onVerRegla={onVerRegla} />);
    expect(screen.getByText("08:00 – 20:00")).toBeInTheDocument();
    expect(screen.getByText("No trabajo en este período")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver horario reservado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver excepción de horario" }));
    expect(onVerRegla).toHaveBeenCalledWith(excepcionSintetica.id);
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

    // Corrección de QA (2026-09-03, reemplazada 2026-09-08): "si se
    // superponen muchas cosas, se hace muy grande la vista de los
    // eventos" — la lista tiene su propio scroll (no crece la tarjeta sin
    // límite). Desde 2026-09-08 el límite ya no es un `max-h-` fijo a
    // ojo: se mide el alto real de la PRIMERA tarjeta (ScrollDeUnaTarjeta)
    // y se usa como `max-height` inline, para mostrar siempre exactamente
    // una tarjeta completa — "le propongo una más elegante... porque
    // ahora el horario reservado no se ve casi" (con el `max-h-72` viejo,
    // la primera tarjeta quedaba cortada a la mitad). jsdom no calcula
    // layout real, así que `offsetHeight` se stubea acá para poder
    // verificar el número exacto que termina en el estilo.
    it("la lista de reglas siempre muestra una tarjeta completa, con su propio scroll si hay más", () => {
      const offsetHeightSpy = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(120);
      try {
        render(<BloqueoDetalleModal reglas={[general, especifica]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
        // .closest("div") → la tarjeta de la regla; un .parentElement más
        // que antes → el wrapper con el ref que mide (ScrollDeUnaTarjeta);
        // otro más → el contenedor con scroll en sí.
        const lista = screen.getByText("07:00 – 08:00").closest("div")!.parentElement!.parentElement!;
        expect(lista.className).toContain("overflow-y-auto");
        expect(lista.style.maxHeight).toBe("120px");
      } finally {
        offsetHeightSpy.mockRestore();
      }
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

    // Excepción de horario de atención sintética (nueva función,
    // 2026-09-08): calendar-grid.tsx arma un "horario reservado" sintético
    // (id "excepcion-...") para representar el cierre de una excepción —
    // no es un horario reservado real de la base, así que no tiene a
    // dónde "ver" ni qué "eliminar" desde acá.
    it("una regla sintética de excepción muestra 'Ver excepción de horario' (no 'Ver este horario reservado') y sin botón de eliminar", async () => {
      const user = userEvent.setup();
      const onVerRegla = vi.fn();
      const excepcionSintetica = {
        id: "excepcion:ha-1:2026-09-01:0:completo",
        especifico: true as const,
        fecha: "2026-09-01",
        horaDesde: "08:00",
        horaHasta: "20:00",
        tipoRegla: "bloquear_horario",
        motivo: "No trabajo en este período",
      };
      render(<BloqueoDetalleModal reglas={[general, excepcionSintetica]} onClose={vi.fn()} onVerRegla={onVerRegla} />);
      // La real sigue con "Ver este horario reservado"; la sintética
      // muestra "Ver excepción de horario" en su lugar — nunca las dos
      // reglas con el mismo botón/etiqueta.
      expect(screen.getAllByRole("button", { name: "Ver este horario reservado" })).toHaveLength(1);
      const botonExcepcion = screen.getByRole("button", { name: "Ver excepción de horario" });
      expect(screen.getAllByText("No trabajo en este período")).toHaveLength(1);

      await user.click(botonExcepcion);
      expect(onVerRegla).toHaveBeenCalledWith(excepcionSintetica.id);
    });
  });

  // Paso 2 — manejo de conflictos con turnos (2026-09-04, pedido textual
  // del cliente): "un título abajo aparte diciendo turnos en conflicto",
  // cada tarjeta con el formato de TurnoDetalle más el aviso fijo.
  describe("con turnos en conflicto (paso 2)", () => {
    const tiposConsulta = [{ id: "tc-1", nombre: "Urgencia", color: "#D6563A" }];
    const turno = {
      id: "t-1", estado: "agendado" as const, origen: "manual" as const, tipoConsultaId: "tc-1",
      horaInicio: new Date(2030, 8, 1, 9, 0).toISOString(), horaFin: new Date(2030, 8, 1, 9, 30).toISOString(),
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

    // Corrección de QA, 2026-09-08: "marcar el aviso... una vez debajo
    // del mini título... en vez de dentro de cada tarjeta... así no se
    // hace tan grande la ventana" — con dos turnos en conflicto, el
    // aviso aparece UNA sola vez, no una por tarjeta.
    it("con dos turnos en conflicto, el aviso aparece una sola vez, no repetido por tarjeta", () => {
      const otro = { ...turno, id: "t-2", nombreContacto: "Bruno", apellidoContacto: "Iglesias" };
      render(
        <BloqueoDetalleModal reglas={[bloqueo]} turnos={[turno, otro]} tiposConsulta={tiposConsulta} onClose={vi.fn()} onVerRegla={vi.fn()} />,
      );
      expect(screen.getAllByText("María Games")).toHaveLength(1);
      expect(screen.getAllByText("Bruno Iglesias")).toHaveLength(1);
      expect(
        screen.getAllByText("Turno en conflicto con un horario reservado. Hablar con el paciente para acordar otro horario."),
      ).toHaveLength(1);
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

      // Corrección de QA (2026-09-05): "si en la tarjeta de solapamiento
      // hay turnos en conflicto, solo mostrar los turnos en conflicto y
      // el horario reservado... excluir... las tarjetas de los turnos
      // resueltos, ya que esto lo hace poco intuitivo" — reemplaza el
      // comportamiento anterior (mostrar las dos secciones por separado).
      it("con un turno en conflicto Y uno resuelto a la vez, solo muestra el en conflicto", () => {
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
        expect(screen.queryByText("Turnos resueltos")).not.toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: "Ver turno" })).toHaveLength(1);
      });
    });
  });

  // Autoreservar turnos (nueva función, pedido textual del cliente,
  // 2026-09-08): "dar un botón de autoreservar turno para los
  // afectados... después mostrará una pantalla que dice el turno x
  // horario viejo -> turno x horario nuevo y un botón de informar
  // afectados".
  describe("autoreservar turnos", () => {
    const tiposConsulta = [{ id: "tc-1", nombre: "Urgencia", color: "#D6563A" }];
    const turno = {
      id: "t-1", estado: "agendado" as const, origen: "manual" as const, tipoConsultaId: "tc-1",
      horaInicio: new Date(2030, 8, 1, 9, 0).toISOString(), horaFin: new Date(2030, 8, 1, 9, 30).toISOString(),
      nombreContacto: "María", apellidoContacto: "Games", dniContacto: "1", telefonoContacto: "1",
      emailContacto: "", motivo: "", createdAt: new Date().toISOString(),
    };

    it("sin turnos en conflicto, no muestra el botón", () => {
      render(<BloqueoDetalleModal reglas={[bloqueo]} onClose={vi.fn()} onVerRegla={vi.fn()} />);
      expect(screen.queryByRole("button", { name: "Autoreservar turnos" })).not.toBeInTheDocument();
    });

    it("al hacer click, llama a la acción con los ids de los turnos en conflicto", async () => {
      const user = userEvent.setup();
      const otro = { ...turno, id: "t-2" };
      autoreservarTurnosActionMock.mockResolvedValue({ resultados: [] });
      render(
        <BloqueoDetalleModal reglas={[bloqueo]} turnos={[turno, otro]} tiposConsulta={tiposConsulta} onClose={vi.fn()} onVerRegla={vi.fn()} />,
      );

      await user.click(screen.getByRole("button", { name: "Autoreservar turnos" }));

      expect(autoreservarTurnosActionMock).toHaveBeenCalledWith(["t-1", "t-2"]);
    });

    it("en éxito, reemplaza el cuerpo por la pantalla de confirmación con el horario viejo y el nuevo", async () => {
      const user = userEvent.setup();
      autoreservarTurnosActionMock.mockResolvedValue({
        resultados: [
          {
            turnoId: "t-1",
            nombre: "María Games",
            horaInicioAnterior: "2026-09-01T09:00:00-03:00",
            horaFinAnterior: "2026-09-01T09:30:00-03:00",
            horaInicioNueva: "2026-09-02T09:00:00-03:00",
            horaFinNueva: "2026-09-02T09:30:00-03:00",
            reprogramado: true,
          },
        ],
      });
      render(
        <BloqueoDetalleModal reglas={[bloqueo]} turnos={[turno]} tiposConsulta={tiposConsulta} onClose={vi.fn()} onVerRegla={vi.fn()} />,
      );

      await user.click(screen.getByRole("button", { name: "Autoreservar turnos" }));

      expect(await screen.findByText("Turnos reprogramados")).toBeInTheDocument();
      expect(screen.getByText("María Games")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Informar afectados" })).toBeInTheDocument();
      // La sección/aviso de conflicto de antes ya no está — el cuerpo se
      // reemplazó por la pantalla de confirmación.
      expect(screen.queryByText("Turnos en conflicto")).not.toBeInTheDocument();
    });

    // Corrección de QA, 2026-09-08: "si son más de 1 turno mostrar 3 y
    // medio (en caso de ser 4) y más de esos bajar con scrollbar" — a
    // diferencia de las demás listas de este modal (una tarjeta a la
    // vez), esta pantalla deja ver 3.5 tarjetas de entrada.
    it("con varios turnos reprogramados, el alto visible es de 3.5 tarjetas, no 1", async () => {
      const user = userEvent.setup();
      const offsetHeightSpy = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
      try {
        autoreservarTurnosActionMock.mockResolvedValue({
          resultados: [
            { turnoId: "t-1", nombre: "María Games", horaInicioAnterior: "2026-09-01T09:00:00-03:00", horaFinAnterior: "2026-09-01T09:30:00-03:00", horaInicioNueva: "2026-09-02T09:00:00-03:00", horaFinNueva: "2026-09-02T09:30:00-03:00", reprogramado: true },
            { turnoId: "t-2", nombre: "Bruno Iglesias", horaInicioAnterior: "2026-09-01T09:30:00-03:00", horaFinAnterior: "2026-09-01T10:00:00-03:00", horaInicioNueva: "2026-09-02T09:30:00-03:00", horaFinNueva: "2026-09-02T10:00:00-03:00", reprogramado: true },
          ],
        });
        render(
          <BloqueoDetalleModal reglas={[bloqueo]} turnos={[turno]} tiposConsulta={tiposConsulta} onClose={vi.fn()} onVerRegla={vi.fn()} />,
        );

        await user.click(screen.getByRole("button", { name: "Autoreservar turnos" }));
        await screen.findByText("Turnos reprogramados");

        // 100px * 3.5 + 8px (gap) * 2.5 = 370px.
        const lista = screen.getByText("María Games").closest("div")!.parentElement!.parentElement!;
        expect(lista.style.maxHeight).toBe("370px");
      } finally {
        offsetHeightSpy.mockRestore();
      }
    });

    it("un turno sin hueco libre se muestra sin horario nuevo, no como si se hubiera movido", async () => {
      const user = userEvent.setup();
      autoreservarTurnosActionMock.mockResolvedValue({
        resultados: [
          {
            turnoId: "t-1",
            nombre: "María Games",
            horaInicioAnterior: "2026-09-01T09:00:00-03:00",
            horaFinAnterior: "2026-09-01T09:30:00-03:00",
            horaInicioNueva: null,
            horaFinNueva: null,
            reprogramado: false,
          },
        ],
      });
      render(
        <BloqueoDetalleModal reglas={[bloqueo]} turnos={[turno]} tiposConsulta={tiposConsulta} onClose={vi.fn()} onVerRegla={vi.fn()} />,
      );

      await user.click(screen.getByRole("button", { name: "Autoreservar turnos" }));

      expect(await screen.findByText("No se encontró un horario libre — sigue como estaba.")).toBeInTheDocument();
      expect(screen.getByText("1 turno no se pudo reprogramar.")).toBeInTheDocument();
    });

    it("en error, muestra el mensaje y no reemplaza el cuerpo", async () => {
      const user = userEvent.setup();
      autoreservarTurnosActionMock.mockResolvedValue({ error: "solo se pueden autoreservar turnos confirmados" });
      render(
        <BloqueoDetalleModal reglas={[bloqueo]} turnos={[turno]} tiposConsulta={tiposConsulta} onClose={vi.fn()} onVerRegla={vi.fn()} />,
      );

      await user.click(screen.getByRole("button", { name: "Autoreservar turnos" }));

      expect(await screen.findByText("solo se pueden autoreservar turnos confirmados")).toBeInTheDocument();
      expect(screen.getByText("Turnos en conflicto")).toBeInTheDocument();
    });

    it("en éxito, avisa al padre con onReprogramados para que recargue los turnos", async () => {
      const user = userEvent.setup();
      const onReprogramados = vi.fn();
      autoreservarTurnosActionMock.mockResolvedValue({ resultados: [] });
      render(
        <BloqueoDetalleModal
          reglas={[bloqueo]}
          turnos={[turno]}
          tiposConsulta={tiposConsulta}
          onClose={vi.fn()}
          onVerRegla={vi.fn()}
          onReprogramados={onReprogramados}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Autoreservar turnos" }));

      await waitFor(() => expect(onReprogramados).toHaveBeenCalledTimes(1));
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
