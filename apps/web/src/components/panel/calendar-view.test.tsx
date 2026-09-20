import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
// El calendario usa el router desde que la vista general dejó de ser
// elegible en Semana/Mes (QA de la 3.2.6): salir de Día cambia de foco y
// hay que volver a pedir la pantalla.
const routerRefreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefreshMock, push: vi.fn() }),
}));
const elegirVistaActionMock = vi.fn(async (_userId: string) => ({}));
// "Reservar horario" y "Configuración de calendario" preguntan a qué
// agenda se le carga lo que se está por crear (QA de la 3.2.6).
const opcionesDeAgendaActionMock = vi.fn(async () => ({
  profesionales: [
    { userId: "u1", nombre: "Lucía Gómez", detalle: "Ortodoncia" },
  ],
  miUserId: "u1",
  puedeElegirOtros: false,
  focoActual: null,
}));
vi.mock("@/app/actions/topbar-panel", () => ({
  elegirVistaAction: (...args: unknown[]) =>
    elegirVistaActionMock(...(args as [string])),
  opcionesDeAgendaAction: () => opcionesDeAgendaActionMock(),
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

const tiposConsulta = [
  { id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" },
];

describe("CalendarView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTurnosActionMock.mockResolvedValue([]);
    listHorarioAtencionActionMock.mockResolvedValue([
      {
        id: "gen-h",
        alcance: "general",
        horaDesde: "08:00",
        horaHasta: "18:00",
      },
    ]);
    listBloqueosActionMock.mockResolvedValue([]);
    listTiposConsultaActionMock.mockResolvedValue([]);
    listDisponibilidadActionMock.mockResolvedValue({
      slots: ["09:00", "09:15", "09:30"],
    });
    listPacientesActionMock.mockResolvedValue([]);
  });

  it("arranca en vista día (Hoy) — pedido explícito del cliente", () => {
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    expect(screen.getByRole("button", { name: "Día" })).toHaveClass(
      "bg-salvia-oscuro",
    );
  });

  // F2.3 extra ítem 1 (docs/Arquitectura y base/implementation-plan.md §11.5) — deep-link
  // desde una fila de tarjeta del dashboard "Turnero". String, no un Date
  // ya armado (bug real de QA, 2026-09-06: un Date cruzando de Server a
  // Client Component se reconstruye por su INSTANTE, no por sus dígitos
  // de calendario locales — ver el comentario grande en calendar-view.tsx).
  it("fechaInicialStr ancla la vista inicial a esa fecha, no a hoy", () => {
    render(
      <CalendarView
        tiposConsulta={tiposConsulta}
        turnosIniciales={[]}
        fechaInicialStr="2030-06-15"
      />,
    );
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
    render(
      <CalendarView
        tiposConsulta={tiposConsulta}
        turnosIniciales={[turno]}
        turnoAFocalizarId="t-1"
      />,
    );

    // El grid también pinta un bloque con el nombre del turno — el
    // nombre aparece dos veces en la página (grid + modal), por eso la
    // aserción se scopea al modal en vez de screen.getByText a secas.
    const dialogo = screen.getByRole("dialog", { name: "Detalle del turno" });
    expect(within(dialogo).getByText("María Games")).toBeInTheDocument();
  });

  it("turnoAFocalizarId que no matchea ningún turno cargado no abre nada", () => {
    render(
      <CalendarView
        tiposConsulta={tiposConsulta}
        turnosIniciales={[]}
        turnoAFocalizarId="no-existe"
      />,
    );
    expect(
      screen.queryByRole("dialog", { name: "Detalle del turno" }),
    ).not.toBeInTheDocument();
  });

  // turnoAPosicionar (corrección de QA, 2026-09-08): "Ver calendario ->"
  // de las tarjetas del dashboard — a diferencia de turnoAFocalizarId
  // (deep-link de una fila puntual, que sí abre el detalle), este NUNCA
  // abre TurnoDetalle: "no tiene que abrir la tarjeta del turno más
  // próximo, sino ubicar el calendario a la vista del usuario con el
  // turno más próximo visible, no abre la tarjeta de ningún turno".
  it("turnoAPosicionar ubica el calendario en ese turno, pero NUNCA abre su detalle", () => {
    const scrollToSpy = vi
      .spyOn(HTMLElement.prototype, "scrollTo")
      .mockImplementation(() => {});
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
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[turno]}
          turnoAPosicionar="t-1"
        />,
      );

      expect(
        screen.queryByRole("dialog", { name: "Detalle del turno" }),
      ).not.toBeInTheDocument();
      // Vertical: (15:00 en minutos/60 - HORA_INICIO=6) * PX_POR_HORA=64,
      // menos una hora de aire (ver scrollAHora) = (9 - 1) * 64 = 512.
      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({ top: 512 }),
      );
    } finally {
      scrollToSpy.mockRestore();
    }
  });

  it("turnoAPosicionar que no matchea ningún turno cargado no scrollea ni abre nada", () => {
    const scrollToSpy = vi
      .spyOn(HTMLElement.prototype, "scrollTo")
      .mockImplementation(() => {});
    try {
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[]}
          turnoAPosicionar="no-existe"
        />,
      );
      expect(
        screen.queryByRole("dialog", { name: "Detalle del turno" }),
      ).not.toBeInTheDocument();
      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      scrollToSpy.mockRestore();
    }
  });

  // bloqueoAFocalizarId (F2.3 extra ítem 1, docs/Arquitectura y base/implementation-plan.md
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
    listBloqueosActionMock.mockImplementation((esp: boolean) =>
      Promise.resolve(esp ? [especifico] : []),
    );

    render(
      <CalendarView
        tiposConsulta={tiposConsulta}
        turnosIniciales={[]}
        fechaInicialStr="2030-09-01"
        bloqueoAFocalizarId="b-1"
      />,
    );

    expect(
      await screen.findByRole("dialog", { name: "Horario bloqueado" }),
    ).toBeInTheDocument();
  });

  // Corrección de QA, 2026-09-08: "al tocar algún elemento del cuerpo de
  // la tarjeta... de horarios reservados, también que te ubique
  // visualmente... como hace con turnos de hoy y turnos próximos".
  it("bloqueoAFocalizarId también ubica el calendario en la hora de ese horario reservado", async () => {
    const scrollToSpy = vi
      .spyOn(HTMLElement.prototype, "scrollTo")
      .mockImplementation(() => {});
    try {
      const especifico = {
        id: "b-1",
        especifico: true as const,
        fecha: "2030-09-01",
        horaDesde: "15:00",
        horaHasta: "16:00",
        tipoRegla: "bloquear_horario",
      };
      listBloqueosActionMock.mockImplementation((esp: boolean) =>
        Promise.resolve(esp ? [especifico] : []),
      );

      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[]}
          fechaInicialStr="2030-09-01"
          bloqueoAFocalizarId="b-1"
        />,
      );

      await screen.findByRole("dialog", { name: "Horario bloqueado" });
      // (15:00 en minutos/60 - HORA_INICIO=6) * PX_POR_HORA=64, menos una
      // hora de aire (ver scrollAHora en calendar-view.tsx) = (9-1)*64 = 512.
      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({ top: 512 }),
      );
    } finally {
      scrollToSpy.mockRestore();
    }
  });

  it("bloqueoAFocalizarId que no matchea ningún bloqueo cargado no abre nada", async () => {
    listBloqueosActionMock.mockResolvedValue([]);
    render(
      <CalendarView
        tiposConsulta={tiposConsulta}
        turnosIniciales={[]}
        fechaInicialStr="2030-09-01"
        bloqueoAFocalizarId="no-existe"
      />,
    );

    await waitFor(() => expect(listBloqueosActionMock).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Banner de conflicto (F2.3 extra ítem 2, docs/Arquitectura y base/implementation-plan.md
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
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[]}
          fechaInicialStr="2030-09-01"
        />,
      );
      expect(
        screen.queryByText(/en conflictos, toca para ver/),
      ).not.toBeInTheDocument();
    });

    it("con un turno solapado a un horario reservado específico, muestra 'Tienes 1 turno en conflictos'", async () => {
      // listTurnosAction se vuelve a llamar al montar (rango visible) y
      // pisa `turnosIniciales` con lo que devuelva el mock — sin esto el
      // turno de la fixture desaparece antes de que los bloqueos terminen
      // de cargar, y el cluster nunca se arma (bug real encontrado acá).
      listTurnosActionMock.mockResolvedValue([turnoEnConflicto]);
      listBloqueosActionMock.mockImplementation((esp: boolean) =>
        Promise.resolve(esp ? [bloqueoSolapado] : []),
      );
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[turnoEnConflicto]}
          fechaInicialStr="2030-09-01"
        />,
      );

      expect(
        await screen.findByText("Tienes 1 turno en conflictos, toca para ver"),
      ).toBeInTheDocument();
    });

    it("un turno en conflicto que ya pasó no cuenta (turnoResuelto)", async () => {
      const yaResuelto = {
        ...turnoEnConflicto,
        horaFin: new Date(2020, 0, 1).toISOString(),
      };
      listTurnosActionMock.mockResolvedValue([yaResuelto]);
      listBloqueosActionMock.mockImplementation((esp: boolean) =>
        Promise.resolve(esp ? [bloqueoSolapado] : []),
      );
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[yaResuelto]}
          fechaInicialStr="2030-09-01"
        />,
      );

      await waitFor(() => expect(listBloqueosActionMock).toHaveBeenCalled());
      expect(
        screen.queryByText(/en conflictos, toca para ver/),
      ).not.toBeInTheDocument();
    });

    it("tocar el banner abre el 'Ver eventos' del conflicto", async () => {
      const user = userEvent.setup();
      listTurnosActionMock.mockResolvedValue([turnoEnConflicto]);
      listBloqueosActionMock.mockImplementation((esp: boolean) =>
        Promise.resolve(esp ? [bloqueoSolapado] : []),
      );
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[turnoEnConflicto]}
          fechaInicialStr="2030-09-01"
        />,
      );

      await user.click(
        await screen.findByText("Tienes 1 turno en conflictos, toca para ver"),
      );

      expect(
        screen.getByRole("dialog", { name: "Horarios reservados y turnos" }),
      ).toBeInTheDocument();
    });

    // Excepciones de horario de atención (nueva función, 2026-09-08):
    // "básicamente es lo mismo que horarios reservados" — una excepción
    // que se solapa con un turno cuenta para el banner igual que un
    // horario reservado real, sin ningún camino aparte.
    it("un turno solapado con una excepción de horario de atención también cuenta para el banner", async () => {
      listTurnosActionMock.mockResolvedValue([turnoEnConflicto]);
      listHorarioAtencionActionMock.mockResolvedValue([
        {
          id: "gen-h",
          alcance: "general",
          horaDesde: "08:00",
          horaHasta: "18:00",
        },
        // "No trabajo este período" 09:15-20:00 — cierra 08:00-09:15, que
        // se solapa con el turno 09:00-09:30.
        {
          id: "ha-1",
          alcance: "rango",
          fechaDesde: "2030-09-01",
          fechaHasta: "2030-09-01",
          horaDesde: "09:15",
          horaHasta: "20:00",
        },
      ]);
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[turnoEnConflicto]}
          fechaInicialStr="2030-09-01"
        />,
      );

      expect(
        await screen.findByText("Tienes 1 turno en conflictos, toca para ver"),
      ).toBeInTheDocument();
    });
  });

  // TR-115 había pedido que esta pastilla descartara los turnos
  // resueltos ("los 'x turnos'... solo deben ser turnos activos, no
  // resueltos"). En la ronda de correcciones de Fase 2.4.2 (TR-116,
  // cuarta ronda) el cliente aclaró explícitamente lo contrario para
  // esta rama: "esto no lo toqué, está bien como está ahora" — pedido
  // textual que prevalece sobre TR-115 acá. La pastilla vuelve a contar
  // TODOS los turnos `agendado` del rango, resueltos incluidos.
  it("la pastilla de cantidad cuenta todos los turnos agendados, incluidos los resueltos", async () => {
    // mediodiaDeHoy — ancla fija al mediodía LOCAL de hoy, no `Date.now()`
    // +/- horas: un offset relativo a "ahora" puede cruzar la medianoche
    // según a qué hora corra el test (bug real encontrado acá — el turno
    // "resuelto", pensado para caer HOY hace 3hs, terminaba cayendo AYER
    // si el test corría de madrugada, y el filtro por día lo excluía sin
    // que tuviera nada que ver con `turnoResuelto`). Mediodía deja 12hs
    // de margen para cualquier offset chico de este test en cualquiera
    // de las dos direcciones.
    const mediodiaDeHoy = new Date();
    mediodiaDeHoy.setHours(12, 0, 0, 0);
    const ahora = mediodiaDeHoy.getTime();
    const base = {
      estado: "agendado" as const,
      origen: "manual" as const,
      tipoConsultaId: "tc-1",
      apellidoContacto: "Games",
      dniContacto: "1",
      telefonoContacto: "1",
      emailContacto: "",
      motivo: "",
      createdAt: new Date().toISOString(),
    };
    const activo = {
      ...base,
      id: "t-activo",
      nombreContacto: "Activo",
      horaInicio: new Date(ahora + 60 * 60 * 1000).toISOString(),
      horaFin: new Date(ahora + 2 * 60 * 60 * 1000).toISOString(),
    };
    const resuelto = {
      ...base,
      id: "t-resuelto",
      nombreContacto: "Resuelto",
      horaInicio: new Date(ahora - 3 * 60 * 60 * 1000).toISOString(),
      horaFin: new Date(ahora - 2 * 60 * 60 * 1000).toISOString(),
    };

    // listTurnosActionMock (sin esto, el fetch-on-mount de CalendarView
    // resuelve al `[]` default de beforeEach y pisa `turnosIniciales`
    // antes de que la aserción llegue a leerlo — carrera real entre el
    // primer render y el efecto, no algo para depender del timing).
    listTurnosActionMock.mockResolvedValue([activo, resuelto]);
    render(
      <CalendarView
        tiposConsulta={tiposConsulta}
        turnosIniciales={[activo, resuelto]}
      />,
    );

    expect(await screen.findByText("2 turnos")).toBeInTheDocument();
  });

  it("el toolbar ofrece las vistas en orden día → semana → mes", () => {
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    const botones = screen.getAllByRole("button", {
      name: /^(Día|Semana|Mes)$/,
    });
    expect(botones.map((b) => b.textContent)).toEqual(["Día", "Semana", "Mes"]);
  });

  it("cambiar a vista mes pide los turnos de nuevo (rango distinto)", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    listTurnosActionMock.mockClear();

    await user.click(screen.getByRole("button", { name: "Mes" }));

    await waitFor(() => expect(listTurnosActionMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Mes" })).toHaveClass(
      "bg-salvia-oscuro",
    );
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
    expect(
      await screen.findByRole("dialog", { name: "Agregar turno" }),
    ).toBeInTheDocument();
  });

  // Bug reportado 2026-08-27: "tocar 2 veces el botón lo traba" —
  // tocar una vista YA activa dejaba `cargando` trabado en `true` para
  // siempre (`setVista` con el mismo valor es un no-op para React, el
  // efecto que apaga el loading nunca se disparaba de nuevo).
  it("tocar una vista ya activa no deja el calendario trabado en 'Cargando…'", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    await waitFor(() =>
      expect(screen.queryByText("Cargando…")).not.toBeInTheDocument(),
    );

    // "Día" ya es la vista activa de entrada (ver el primer test) —
    // tocarla de nuevo no debería iniciar (ni trabar) ninguna carga.
    await user.click(screen.getByRole("button", { name: "Día" }));

    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
  });

  it("clickear un día en vista mes pasa a vista día", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);
    await user.click(screen.getByRole("button", { name: "Mes" }));
    await waitFor(() =>
      expect(screen.queryByText("Cargando…")).not.toBeInTheDocument(),
    );

    const hoy = new Date().getDate();
    await user.click(screen.getAllByText(String(hoy))[0]);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Día" })).toHaveClass(
        "bg-salvia-oscuro",
      ),
    );
  });

  // F2.3 (docs/Arquitectura y base/implementation-plan.md §11.3, corregido tras QA: "al
  // tocarlo se debe deslizar hacia la derecha, y ahí mostrar
  // configuración" — no un menú desplegable hacia abajo). Dos toques
  // sobre el MISMO botón: el primero solo despliega el texto, el
  // segundo abre el modal.
  it("el botón de tuerca se despliega al primer toque y abre la configuración al segundo", async () => {
    const user = userEvent.setup();
    render(<CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />);

    const boton = screen.getByRole("button", {
      name: "Ajustes del calendario",
    });
    // El texto vive siempre en el DOM (se desliza por CSS, `max-width`
    // de 0 a un valor amplio) — colapsado, no se ve, pero sigue estando.
    expect(screen.getByText("Configuración de calendario")).toHaveClass(
      "max-w-0",
    );
    expect(
      screen.queryByRole("dialog", { name: "Configuración de calendario" }),
    ).not.toBeInTheDocument();

    await user.click(boton);
    expect(screen.getByText("Configuración de calendario")).toHaveClass(
      "max-w-[16rem]",
    );
    expect(
      screen.queryByRole("dialog", { name: "Configuración de calendario" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Abrir configuración de calendario" }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "Configuración de calendario",
      }),
    ).toBeInTheDocument();
  });

  // Acceso rápido a reservar horario (pedido explícito del cliente,
  // 2026-09-04): "agregar un acceso rápido a reservar horario desde la
  // pantalla principal del calendario al lado de agregar turno".
  describe("acceso rápido 'Reservar horario'", () => {
    // Corrección de estética (2026-09-06, foto de referencia): vuelve a
    // un estilo claro (borde, sin relleno), distinto de "+ Agregar
    // turno" — reemplaza la corrección de QA anterior (2026-09-04) que
    // lo había igualado en verde, pedido explícito del cliente esta vez.
    it("tiene estilo claro, distinto del verde de '+ Agregar turno'", () => {
      render(
        <CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />,
      );
      const reservar = screen.getByRole("button", { name: "Reservar horario" });
      const agregarTurno = screen.getByRole("button", {
        name: "+ Agregar turno",
      });
      expect(reservar.className).toContain("bg-marfil");
      expect(reservar.className).toContain("border-arena");
      expect(agregarTurno.className).toContain("bg-salvia-oscuro");
      expect(reservar.className).not.toBe(agregarTurno.className);
    });

    it("el botón abre el acceso rápido con las 2 opciones", async () => {
      const user = userEvent.setup();
      render(
        <CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />,
      );

      await user.click(
        screen.getByRole("button", { name: "Reservar horario" }),
      );
      expect(
        screen.getByRole("dialog", { name: "Reservar horario" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Agregar general" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Agregar específica" }),
      ).toBeInTheDocument();
    });

    it("guardar una regla nueva recarga bloqueosGenerales/bloqueosEspecificas", async () => {
      const user = userEvent.setup();
      crearBloqueoActionMock.mockResolvedValue({
        bloqueo: {
          id: "b-1",
          especifico: false,
          diaSemana: 1,
          alcance: "semana",
          horaDesde: "07:00",
          horaHasta: "08:00",
          tipoRegla: "bloquear_horario",
        },
      });
      render(
        <CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />,
      );
      await waitFor(() => expect(listBloqueosActionMock).toHaveBeenCalled());
      listBloqueosActionMock.mockClear();

      await user.click(
        screen.getByRole("button", { name: "Reservar horario" }),
      );
      await user.click(screen.getByRole("button", { name: "Agregar general" }));
      fireEvent.change(screen.getByLabelText("Desde"), {
        target: { value: "07:00" },
      });
      fireEvent.change(screen.getByLabelText("Hasta"), {
        target: { value: "08:00" },
      });
      await user.click(screen.getByRole("button", { name: "Agregar" }));

      await waitFor(() => expect(listBloqueosActionMock).toHaveBeenCalled());
      expect(
        screen.queryByRole("dialog", { name: "Reservar horario" }),
      ).not.toBeInTheDocument();
    });
  });

  // LA VISTA GENERAL ES EXCLUSIVA DE "DÍA" — QA de la Fase 3.2.6.
  //
  // El motivo no es una preferencia: en Día la vista general dibuja una
  // columna por profesional, y eso es lo que la hace legible. En Semana
  // las siete columnas ya son los días; sumarle N profesionales daría
  // 7 × N columnas. Sin columnas propias, "la agenda de todos" sería un
  // amontonamiento de bloques sin dueño.
  describe("vista general de recepción (exclusiva de Día)", () => {
    const zonaGeneral = {
      profesionales: [
        { userId: "u1", nombre: "Lucía Gómez", detalle: "Ortodoncia" },
        { userId: "u2", nombre: "Marcos Díaz", detalle: "Endodoncia" },
      ],
      vista: { profesional: null },
    };

    function turnoDeHoy(id: string, userId: string, hora: string) {
      const hoy = new Date();
      const inicio = new Date(
        hoy.getFullYear(),
        hoy.getMonth(),
        hoy.getDate(),
        Number(hora.slice(0, 2)),
        0,
      );
      return {
        id,
        estado: "agendado",
        nombreContacto: "Ana",
        apellidoContacto: "Paciente",
        horaInicio: inicio.toISOString(),
        horaFin: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
        atendidoPorUserId: userId,
      } as never;
    }

    it("en Día ofrece la vista general", () => {
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[]}
          zonaProfesional={zonaGeneral}
        />,
      );
      // Dos veces: en el botón del carrusel y en el conteo de abajo.
      expect(screen.getAllByText("Vista general").length).toBeGreaterThan(0);
    });

    // Al salir de Día se elige a alguien: el dueño del PRIMER turno del
    // día, que es el que la persona tiene delante de los ojos. Marcos
    // atiende antes que Lucía acá, aunque esté segundo en la lista.
    it("pasar a Semana se para en la agenda del profesional más próximo", async () => {
      const user = userEvent.setup();
      // También por la acción: al montar, el calendario vuelve a pedir
      // los turnos del rango, y esa respuesta es la que queda en memoria.
      listTurnosActionMock.mockResolvedValue([
        turnoDeHoy("t-2", "u2", "09:00"),
        turnoDeHoy("t-1", "u1", "14:00"),
      ]);
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[
            turnoDeHoy("t-2", "u2", "09:00"),
            turnoDeHoy("t-1", "u1", "14:00"),
          ]}
          zonaProfesional={zonaGeneral}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Semana" }));

      await waitFor(() =>
        expect(elegirVistaActionMock).toHaveBeenCalledWith("u2"),
      );
      // Y la pantalla se vuelve a pedir: el resto de lo que muestra
      // (tarjetas, columnas) sale del servidor.
      await waitFor(() => expect(routerRefreshMock).toHaveBeenCalled());
    });

    // Sin turnos no hay "más próximo" que valga: se cae a la primera
    // columna antes que dejar la vista general en Semana.
    it("sin turnos del día se para en el primer profesional", async () => {
      const user = userEvent.setup();
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[]}
          zonaProfesional={zonaGeneral}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Mes" }));

      await waitFor(() =>
        expect(elegirVistaActionMock).toHaveBeenCalledWith("u1"),
      );
    });

    // *"Una vez dentro de semana o mes no poder volver a poner vista
    // general"*: el selector deja de ofrecerla.
    it("en Semana la vista general ya no se ofrece", async () => {
      const user = userEvent.setup();
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[]}
          zonaProfesional={{
            ...zonaGeneral,
            vista: { profesional: { userId: "u1", nombre: "Lucía Gómez" } },
          }}
        />,
      );
      // Con alguien en foco, "Vista general" solo aparece como OPCIÓN
      // dentro del desplegable — hay que abrirlo para verla.
      await user.click(
        screen.getByRole("button", { name: "Elegir de quién es la vista" }),
      );
      expect(screen.getByText("Vista general")).toBeInTheDocument();
      await user.keyboard("{Escape}");

      await user.click(screen.getByRole("button", { name: "Semana" }));
      await user.click(
        screen.getByRole("button", { name: "Elegir de quién es la vista" }),
      );

      expect(screen.queryByText("Vista general")).not.toBeInTheDocument();
    });

    // Parada ya en la agenda de alguien, cambiar de vista no toca nada:
    // la regla es solo para salir de la general.
    it("con un profesional en foco, cambiar de vista no cambia de agenda", async () => {
      const user = userEvent.setup();
      render(
        <CalendarView
          tiposConsulta={tiposConsulta}
          turnosIniciales={[]}
          zonaProfesional={{
            ...zonaGeneral,
            vista: { profesional: { userId: "u2", nombre: "Marcos Díaz" } },
          }}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Semana" }));

      expect(elegirVistaActionMock).not.toHaveBeenCalled();
    });

    // Para quien no es recepción el selector no existe — el aislamiento
    // de la 3.2.2 no se relaja por una pantalla.
    it("sin zonaProfesional el calendario es el de siempre", () => {
      render(
        <CalendarView tiposConsulta={tiposConsulta} turnosIniciales={[]} />,
      );
      expect(screen.queryByText("Vista general")).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Elegir de quién es la vista"),
      ).not.toBeInTheDocument();
    });
  });
});
