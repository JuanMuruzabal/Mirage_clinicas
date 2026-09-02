import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  listTurnosActionMock,
  listHorarioAtencionActionMock,
  listBloqueosActionMock,
  listTiposConsultaActionMock,
  listDisponibilidadActionMock,
  crearBloqueoActionMock,
  editarBloqueoActionMock,
  listPacientesActionMock,
} = vi.hoisted(() => ({
  listTurnosActionMock: vi.fn(),
  listHorarioAtencionActionMock: vi.fn(),
  listBloqueosActionMock: vi.fn(),
  listTiposConsultaActionMock: vi.fn(),
  listDisponibilidadActionMock: vi.fn(),
  crearBloqueoActionMock: vi.fn(),
  editarBloqueoActionMock: vi.fn(),
  listPacientesActionMock: vi.fn(),
}));
vi.mock("@/app/actions/turnos", () => ({
  listTurnosAction: listTurnosActionMock,
  crearTurnoManualAction: vi.fn(),
}));
// listPacientesAction (Extra 2.3.3, TR-104): "conocido" pasó a ser la
// pestaña por defecto de AgregarTurnoModal (antes era "pendiente", sacada
// del todo) — ese modal, montado de verdad al tocar "+ Agregar turno",
// ahora pide la lista de pacientes apenas se monta. Sin este mock, el
// useEffect llama a la Server Action de verdad, que intenta leer
// cookies() fuera de un request real de Next.js y explota como unhandled
// rejection en el test (mismo motivo que el comentario de abajo).
vi.mock("@/app/actions/pacientes", () => ({
  listPacientesAction: listPacientesActionMock,
}));
// F2.3.8: CalendarView pide horario de atención + reglas al montar (para
// que CalendarGrid respete el rango de horas configurado y pinte los
// bloqueos) — sin este mock, el useEffect llama a la Server Action de
// verdad, que intenta leer cookies() fuera de un request real de
// Next.js y explota como unhandled rejection en el test.
// `listTiposConsultaAction` hace falta porque el modal de configuración
// (F2.3.5, montado de verdad cuando se abre desde acá, no mockeado
// aparte) también la llama al montar (F2.3.7). `listDisponibilidadAction`
// (F2.3, corrección de QA) hace falta porque AgregarTurnoModal (montado
// de verdad al tocar "+ Agregar turno") la llama al elegir tipo/fecha.
vi.mock("@/app/actions/calendario-config", () => ({
  listHorarioAtencionAction: listHorarioAtencionActionMock,
  listBloqueosAction: listBloqueosActionMock,
  listTiposConsultaAction: listTiposConsultaActionMock,
  listDisponibilidadAction: listDisponibilidadActionMock,
  crearBloqueoAction: crearBloqueoActionMock,
  editarBloqueoAction: editarBloqueoActionMock,
  eliminarBloqueoAction: vi.fn(),
}));

const { CalendarView } = await import("./calendar-view");

const tiposConsulta = [{ id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" }];

describe("CalendarView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTurnosActionMock.mockResolvedValue([]);
    listHorarioAtencionActionMock.mockResolvedValue([{ id: "gen-h", alcance: "general", horaDesde: "08:00", horaHasta: "18:00" }]);
    listBloqueosActionMock.mockResolvedValue([]);
    listTiposConsultaActionMock.mockResolvedValue([]);
    listDisponibilidadActionMock.mockResolvedValue({ slots: ["09:00", "09:15", "09:30"] });
    listPacientesActionMock.mockResolvedValue([]);
  });

  it("arranca en vista día (Hoy) — pedido explícito del cliente", () => {
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    expect(screen.getByRole("button", { name: "dia" })).toHaveClass("bg-salvia-oscuro");
  });

  // F2.3 extra ítem 1 (docs/implementation-plan.md §11.5) — deep-link
  // desde una fila de tarjeta del dashboard "Turnero". String, no un Date
  // ya armado (bug real de QA, 2026-09-06: un Date cruzando de Server a
  // Client Component se reconstruye por su INSTANTE, no por sus dígitos
  // de calendario locales — ver el comentario grande en calendar-view.tsx).
  it("fechaInicialStr ancla la vista inicial a esa fecha, no a hoy", () => {
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} fechaInicialStr="2030-06-15" />);
    // formatDiaLargo da algo como "Sábado 15 de junio de 2030" — alcanza
    // con el año/día para confirmar que no ancló en "hoy".
    expect(screen.getByText(/15 de junio de 2030/i)).toBeInTheDocument();
  });

  it("turnoAFocalizarId abre el detalle de ese turno apenas se monta, sin ningún click", () => {
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
      motivo: "",
      createdAt: new Date().toISOString(),
    };
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[turno]} turnoAFocalizarId="t-1" />);

    // El grid también pinta un bloque con el nombre del turno — el
    // nombre aparece dos veces en la página (grid + modal), por eso la
    // aserción se scopea al modal en vez de screen.getByText a secas.
    const dialogo = screen.getByRole("dialog", { name: "Detalle del turno" });
    expect(within(dialogo).getByText("María Games")).toBeInTheDocument();
  });

  it("turnoAFocalizarId que no matchea ningún turno cargado no abre nada", () => {
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} turnoAFocalizarId="no-existe" />);
    expect(screen.queryByRole("dialog", { name: "Detalle del turno" })).not.toBeInTheDocument();
  });

  // turnoAPosicionar (corrección de QA, 2026-09-08): "Ver calendario ->"
  // de las tarjetas del dashboard — a diferencia de turnoAFocalizarId
  // (deep-link de una fila puntual, que sí abre el detalle), este NUNCA
  // abre TurnoDetalle: "no tiene que abrir la tarjeta del turno más
  // próximo, sino ubicar el calendario a la vista del usuario con el
  // turno más próximo visible, no abre la tarjeta de ningún turno".
  it("turnoAPosicionar ubica el calendario en ese turno, pero NUNCA abre su detalle", () => {
    const scrollToSpy = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => {});
    try {
      const turno = {
        id: "t-1",
        estado: "agendado" as const,
        origen: "manual" as const,
        tipoConsultaId: "tc-1",
        horaInicio: new Date(2030, 8, 1, 15, 0).toISOString(),
        horaFin: new Date(2030, 8, 1, 15, 30).toISOString(),
        nombreContacto: "María",
        apellidoContacto: "Games",
        dniContacto: "1",
        telefonoContacto: "1",
        emailContacto: "",
        motivo: "",
        createdAt: new Date().toISOString(),
      };
      render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[turno]} turnoAPosicionar="t-1" />);

      expect(screen.queryByRole("dialog", { name: "Detalle del turno" })).not.toBeInTheDocument();
      // Vertical: (15:00 en minutos/60 - HORA_INICIO=8) * PX_POR_HORA=64,
      // menos una hora de aire (ver scrollAHora) = (7 - 1) * 64 = 384.
      expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 384 }));
    } finally {
      scrollToSpy.mockRestore();
    }
  });

  it("turnoAPosicionar que no matchea ningún turno cargado no scrollea ni abre nada", () => {
    const scrollToSpy = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => {});
    try {
      render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} turnoAPosicionar="no-existe" />);
      expect(screen.queryByRole("dialog", { name: "Detalle del turno" })).not.toBeInTheDocument();
      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      scrollToSpy.mockRestore();
    }
  });

  // bloqueoAFocalizarId (F2.3 extra ítem 1, docs/implementation-plan.md
  // §11.5) — corrección de QA: "en la tarjeta de horarios reservados,
  // cuando dé click a un elemento del cuerpo, también llevarme a la
  // tarjeta de ese elemento... es lo mismo que sucede si le doy click a
  // la tarjeta en el calendario".
  it("bloqueoAFocalizarId abre el 'Ver eventos' de ese horario reservado apenas cargan los bloqueos", async () => {
    const especifico = {
      id: "b-1",
      especifico: true as const,
      fecha: "2030-09-01",
      horaDesde: "08:00",
      horaHasta: "09:00",
      tipoRegla: "bloquear_horario",
    };
    listBloqueosActionMock.mockImplementation((esp: boolean) => Promise.resolve(esp ? [especifico] : []));

    render(
      <CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} fechaInicialStr="2030-09-01" bloqueoAFocalizarId="b-1" />,
    );

    expect(await screen.findByRole("dialog", { name: "Horario bloqueado" })).toBeInTheDocument();
  });

  // Corrección de QA, 2026-09-08: "al tocar algún elemento del cuerpo de
  // la tarjeta... de horarios reservados, también que te ubique
  // visualmente... como hace con turnos de hoy y turnos próximos".
  it("bloqueoAFocalizarId también ubica el calendario en la hora de ese horario reservado", async () => {
    const scrollToSpy = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => {});
    try {
      const especifico = {
        id: "b-1",
        especifico: true as const,
        fecha: "2030-09-01",
        horaDesde: "15:00",
        horaHasta: "16:00",
        tipoRegla: "bloquear_horario",
      };
      listBloqueosActionMock.mockImplementation((esp: boolean) => Promise.resolve(esp ? [especifico] : []));

      render(
        <CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} fechaInicialStr="2030-09-01" bloqueoAFocalizarId="b-1" />,
      );

      await screen.findByRole("dialog", { name: "Horario bloqueado" });
      // (15:00 en minutos/60 - HORA_INICIO=8) * PX_POR_HORA=64, menos una
      // hora de aire (ver scrollAHora en calendar-view.tsx) = (7-1)*64 = 384.
      expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 384 }));
    } finally {
      scrollToSpy.mockRestore();
    }
  });

  it("bloqueoAFocalizarId que no matchea ningún bloqueo cargado no abre nada", async () => {
    listBloqueosActionMock.mockResolvedValue([]);
    render(
      <CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} fechaInicialStr="2030-09-01" bloqueoAFocalizarId="no-existe" />,
    );

    await waitFor(() => expect(listBloqueosActionMock).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Banner de conflicto (F2.3 extra ítem 2, docs/implementation-plan.md
  // §11.5) — pedido textual: "Tienes X turnos en conflictos, toca para
  // ver", entre el selector día/semana/mes y el calendario.
  describe("banner de conflicto", () => {
    const turnoEnConflicto = {
      id: "t-conflicto",
      estado: "agendado" as const,
      origen: "manual" as const,
      tipoConsultaId: "tc-1",
      horaInicio: new Date(2030, 8, 1, 9, 0).toISOString(),
      horaFin: new Date(2030, 8, 1, 9, 30).toISOString(),
      nombreContacto: "Bruno",
      apellidoContacto: "Iglesias",
      dniContacto: "1",
      telefonoContacto: "1",
      emailContacto: "",
      motivo: "",
      createdAt: new Date().toISOString(),
    };
    const bloqueoSolapado = {
      id: "b-conflicto",
      especifico: true as const,
      fecha: "2030-09-01",
      horaDesde: "09:15",
      horaHasta: "09:45",
      tipoRegla: "bloquear_horario",
    };

    it("sin conflictos, no muestra el banner", () => {
      render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} fechaInicialStr="2030-09-01" />);
      expect(screen.queryByText(/en conflictos, toca para ver/)).not.toBeInTheDocument();
    });

    it("con un turno solapado a un horario reservado específico, muestra 'Tienes 1 turno en conflictos'", async () => {
      // listTurnosAction se vuelve a llamar al montar (rango visible) y
      // pisa `turnosIniciales` con lo que devuelva el mock — sin esto el
      // turno de la fixture desaparece antes de que los bloqueos terminen
      // de cargar, y el cluster nunca se arma (bug real encontrado acá).
      listTurnosActionMock.mockResolvedValue([turnoEnConflicto]);
      listBloqueosActionMock.mockImplementation((esp: boolean) => Promise.resolve(esp ? [bloqueoSolapado] : []));
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[turnoEnConflicto]}
          fechaInicialStr="2030-09-01"
        />,
      );

      expect(await screen.findByText("Tienes 1 turno en conflictos, toca para ver")).toBeInTheDocument();
    });

    it("un turno en conflicto que ya pasó no cuenta (turnoResuelto)", async () => {
      const yaResuelto = { ...turnoEnConflicto, horaFin: new Date(2020, 0, 1).toISOString() };
      listTurnosActionMock.mockResolvedValue([yaResuelto]);
      listBloqueosActionMock.mockImplementation((esp: boolean) => Promise.resolve(esp ? [bloqueoSolapado] : []));
      render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[yaResuelto]} fechaInicialStr="2030-09-01" />);

      await waitFor(() => expect(listBloqueosActionMock).toHaveBeenCalled());
      expect(screen.queryByText(/en conflictos, toca para ver/)).not.toBeInTheDocument();
    });

    it("tocar el banner abre el 'Ver eventos' del conflicto", async () => {
      const user = userEvent.setup();
      listTurnosActionMock.mockResolvedValue([turnoEnConflicto]);
      listBloqueosActionMock.mockImplementation((esp: boolean) => Promise.resolve(esp ? [bloqueoSolapado] : []));
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[turnoEnConflicto]}
          fechaInicialStr="2030-09-01"
        />,
      );

      await user.click(await screen.findByText("Tienes 1 turno en conflictos, toca para ver"));

      expect(screen.getByRole("dialog", { name: "Horarios reservados y turnos" })).toBeInTheDocument();
    });

    // Excepciones de horario de atención (nueva función, 2026-09-08):
    // "básicamente es lo mismo que horarios reservados" — una excepción
    // que se solapa con un turno cuenta para el banner igual que un
    // horario reservado real, sin ningún camino aparte.
    it("un turno solapado con una excepción de horario de atención también cuenta para el banner", async () => {
      listTurnosActionMock.mockResolvedValue([turnoEnConflicto]);
      listHorarioAtencionActionMock.mockResolvedValue([
        { id: "gen-h", alcance: "general", horaDesde: "08:00", horaHasta: "18:00" },
        // "No trabajo este período" 09:15-20:00 — cierra 08:00-09:15, que
        // se solapa con el turno 09:00-09:30.
        { id: "ha-1", alcance: "rango", fechaDesde: "2030-09-01", fechaHasta: "2030-09-01", horaDesde: "09:15", horaHasta: "20:00" },
      ]);
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[turnoEnConflicto]}
          fechaInicialStr="2030-09-01"
        />,
      );

      expect(await screen.findByText("Tienes 1 turno en conflictos, toca para ver")).toBeInTheDocument();
    });
  });

  it("el toolbar ofrece las vistas en orden día → semana → mes", () => {
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    const botones = screen.getAllByRole("button", { name: /^(dia|semana|mes)$/ });
    expect(botones.map((b) => b.textContent)).toEqual(["dia", "semana", "mes"]);
  });

  it("cambiar a vista mes pide los turnos de nuevo (rango distinto)", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    listTurnosActionMock.mockClear();

    await user.click(screen.getByRole("button", { name: "mes" }));

    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "mes" })).toHaveClass("bg-salvia-oscuro");
  });

  it("prev/next/Hoy navegan y vuelven a pedir datos", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("button", { name: "Hoy" }));
    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalledTimes(3));
  });

  it("el botón '+ Agregar turno' abre el modal", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);

    await user.click(screen.getByRole("button", { name: "+ Agregar turno" }));
    expect(await screen.findByRole("dialog", { name: "Agregar turno" })).toBeInTheDocument();
  });

  // Bug reportado 2026-08-27: "tocar 2 veces el botón lo traba" —
  // tocar una vista YA activa dejaba `cargando` trabado en `true` para
  // siempre (`setVista` con el mismo valor es un no-op para React, el
  // efecto que apaga el loading nunca se disparaba de nuevo).
  it("tocar una vista ya activa no deja el calendario trabado en 'Cargando…'", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    await waitFor(() => expect(screen.queryByText("Cargando…")).not.toBeInTheDocument());

    // "dia" ya es la vista activa de entrada (ver el primer test) —
    // tocarla de nuevo no debería iniciar (ni trabar) ninguna carga.
    await user.click(screen.getByRole("button", { name: "dia" }));

    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
  });

  it("clickear un día en vista mes pasa a vista día", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    await user.click(screen.getByRole("button", { name: "mes" }));
    await waitFor(() => expect(screen.queryByText("Cargando…")).not.toBeInTheDocument());

    const hoy = new Date().getDate();
    await user.click(screen.getAllByText(String(hoy))[0]);

    await waitFor(() => expect(screen.getByRole("button", { name: "dia" })).toHaveClass("bg-salvia-oscuro"));
  });

  // F2.3 (docs/implementation-plan.md §11.3, corregido tras QA: "al
  // tocarlo se debe deslizar hacia la derecha, y ahí mostrar
  // configuración" — no un menú desplegable hacia abajo). Dos toques
  // sobre el MISMO botón: el primero solo despliega el texto, el
  // segundo abre el modal.
  it("el botón de tuerca se despliega al primer toque y abre la configuración al segundo", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);

    const boton = screen.getByRole("button", { name: "Ajustes del calendario" });
    // El texto vive siempre en el DOM (se desliza por CSS, `max-width`
    // de 0 a un valor amplio) — colapsado, no se ve, pero sigue estando.
    expect(screen.getByText("Configuración de calendario")).toHaveClass("max-w-0");
    expect(screen.queryByRole("dialog", { name: "Configuración de calendario" })).not.toBeInTheDocument();

    await user.click(boton);
    expect(screen.getByText("Configuración de calendario")).toHaveClass("max-w-[16rem]");
    expect(screen.queryByRole("dialog", { name: "Configuración de calendario" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Abrir configuración de calendario" }));
    expect(await screen.findByRole("dialog", { name: "Configuración de calendario" })).toBeInTheDocument();
  });

  // Acceso rápido a reservar horario (pedido explícito del cliente,
  // 2026-09-04): "agregar un acceso rápido a reservar horario desde la
  // pantalla principal del calendario al lado de agregar turno".
  describe("acceso rápido '+ Reservar horario'", () => {
    // Corrección de QA (2026-09-04, textual): "el botón de reservar
    // horario, debe aparecer verde como el de agregar turno" — antes era
    // un botón secundario (borde, sin relleno).
    it("tiene el mismo estilo verde que '+ Agregar turno'", () => {
      render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
      const reservar = screen.getByRole("button", { name: "+ Reservar horario" });
      const agregarTurno = screen.getByRole("button", { name: "+ Agregar turno" });
      expect(reservar.className).toContain("bg-salvia-oscuro");
      expect(reservar.className).toContain("text-marfil");
      expect(reservar.className).toBe(agregarTurno.className);
    });

    it("el botón abre el acceso rápido con las 2 opciones", async () => {
      const user = userEvent.setup();
      render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);

      await user.click(screen.getByRole("button", { name: "+ Reservar horario" }));
      expect(screen.getByRole("dialog", { name: "Reservar horario" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Agregar general" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Agregar específica" })).toBeInTheDocument();
    });

    it("guardar una regla nueva recarga bloqueosGenerales/bloqueosEspecificas", async () => {
      const user = userEvent.setup();
      crearBloqueoActionMock.mockResolvedValue({
        bloqueo: { id: "b-1", especifico: false, diaSemana: 1, alcance: "semana", horaDesde: "07:00", horaHasta: "08:00", tipoRegla: "bloquear_horario" },
      });
      render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
      await waitFor(() => expect(listBloqueosActionMock).toHaveBeenCalled());
      listBloqueosActionMock.mockClear();

      await user.click(screen.getByRole("button", { name: "+ Reservar horario" }));
      await user.click(screen.getByRole("button", { name: "Agregar general" }));
      fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "07:00" } });
      fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "08:00" } });
      await user.click(screen.getByRole("button", { name: "Agregar" }));

      await waitFor(() => expect(listBloqueosActionMock).toHaveBeenCalled());
      expect(screen.queryByRole("dialog", { name: "Reservar horario" })).not.toBeInTheDocument();
    });
  });
});
