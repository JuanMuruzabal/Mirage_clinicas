import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarGrid, esExcepcionSintetica } from "./calendar-grid";

const tiposConsulta = [
  { id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" },
  { id: "tc-2", nombre: "Urgencia", color: "#D6563A" },
];

const dias = [new Date(2030, 8, 1)];

const turnos = [
  {
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
  },
];

describe("CalendarGrid", () => {
  it("renderiza el turno en el día correcto con su nombre y hora", () => {
    render(<CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);
    const bloque = screen.getByRole("button", { name: /María Games/ });
    expect(within(bloque).getByText("María Games")).toBeInTheDocument();
    expect(within(bloque).getByText("09:00")).toBeInTheDocument();
  });

  it("no muestra turnos de otro día", () => {
    render(
      <CalendarGrid dias={[new Date(2030, 8, 2)]} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />,
    );
    expect(screen.queryByText("María Games")).not.toBeInTheDocument();
  });

  it("al hacer click en un turno, llama a onTurnoClick con ese turno", async () => {
    const onTurnoClick = vi.fn();
    const user = userEvent.setup();
    render(<CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={onTurnoClick} />);

    await user.click(screen.getByText("María Games"));
    expect(onTurnoClick).toHaveBeenCalledWith(turnos[0]);
  });

  // Corrección de QA (F2.3): el fondo sale del color CONFIGURADO para
  // ese tipo de consulta (tc-1 → #E7D9BE), no de un tema fijo por nombre.
  it("un turno se pinta con el color configurado para su tipo de consulta", () => {
    render(<CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);
    const bloque = screen.getByRole("button", { name: /María Games/ });
    expect(bloque).toHaveStyle({ background: "color-mix(in srgb, rgb(231, 217, 190) 25%, white)" });
  });

  // Bug real reportado por el cliente, 2026-08-30: "al refrescar la
  // página" los turnos aparecían corridos ~3 horas hacia abajo en el
  // calendario (volvían a su lugar con solo navegar afuera y volver). La
  // posición vertical (`top`) se calculaba con `.getHours()/.getMinutes()`
  // directo sobre el instante real del turno — getters LOCALES, que en
  // el servidor (SSR, container en UTC) dan una hora de pared distinta a
  // la de Córdoba. El input de este test se arma vía `Date.UTC` a
  // propósito (no el constructor local `new Date(y,m,d,h)`) para que no
  // dependa de en qué timezone corre la máquina que ejecuta el test —
  // Córdoba es UTC-3 todo el año: 12:00 UTC son 09:00 en Córdoba.
  it("ubica el turno según la hora de Córdoba, sin importar la timezone del entorno (bug de hidratación)", () => {
    const turnoUTC = [
      {
        ...turnos[0],
        horaInicio: new Date(Date.UTC(2030, 8, 1, 12, 0)).toISOString(), // 09:00 en Córdoba
        horaFin: new Date(Date.UTC(2030, 8, 1, 12, 30)).toISOString(),
      },
    ];
    render(<CalendarGrid dias={dias} turnos={turnoUTC} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);
    const bloque = screen.getByRole("button", { name: /María Games/ });
    // HORA_INICIO=8, PX_POR_HORA=64 (calendar-grid.tsx) — 09:00 Córdoba
    // menos las 08:00 con las que arranca la grilla, por 64px/hora.
    expect(bloque).toHaveStyle({ top: "64px" });
  });

  it("muestra las horas del día en la columna izquierda", () => {
    render(<CalendarGrid dias={dias} turnos={[]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument();
  });

  // Bug reportado 2026-08-29 (tanto mobile como escritorio), tras F2.1:
  // "la primera hora (08:00) quedó casi tapada por la fila de días" — el
  // `-translate-y-1/2` que centra cada hora sobre su línea de grilla
  // hacía que la mitad de arriba de "08:00" cayera detrás de la esquina
  // fija (ahora con fondo opaco, F2.1). El resto de las horas sigue
  // centrado sobre su línea como siempre.
  it("la hora 08:00 no lleva el translate que la esconde detrás de la esquina fija", () => {
    render(<CalendarGrid dias={dias} turnos={[]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);
    expect(screen.getByText("08:00")).not.toHaveClass("-translate-y-1/2");
    expect(screen.getByText("09:00")).toHaveClass("-translate-y-1/2");
  });

  // F2.1 (docs/implementation-plan.md §11, pedido explícito del
  // cliente): "si me muevo horizontalmente, al costado los horarios me
  // van siguiendo, y verticalmente los días" — cada uno fijo en un solo
  // eje (no en los dos), salvo la esquina compartida.
  it("la columna de horas queda fija en X, la fila de días en Y, la esquina en los dos ejes", () => {
    const dosDias = [new Date(2030, 8, 1), new Date(2030, 8, 2)];
    const { container } = render(
      <CalendarGrid dias={dosDias} turnos={[]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />,
    );

    const columnaHoras = container.querySelector(".w-16.flex-shrink-0")!;
    expect(columnaHoras).toHaveClass("sticky", "left-0");
    expect(columnaHoras).not.toHaveClass("top-0");

    const esquina = columnaHoras.querySelector(":scope > div")!;
    expect(esquina).toHaveClass("sticky", "top-0");

    const encabezadosDia = container.querySelectorAll(".flex.h-10.items-center.justify-center");
    expect(encabezadosDia.length).toBe(2);
    encabezadosDia.forEach((encabezado) => {
      expect(encabezado).toHaveClass("sticky", "top-0");
      expect(encabezado).not.toHaveClass("left-0");
    });
  });

  it("un turno resuelto (hora de fin pasada) se pinta gris, no con el color de su tipo de consulta", () => {
    const diaPasado = new Date(2020, 0, 15);
    const turnoPasado = {
      ...turnos[0],
      horaInicio: new Date(2020, 0, 15, 9, 0).toISOString(),
      horaFin: new Date(2020, 0, 15, 9, 30).toISOString(),
    };
    render(<CalendarGrid dias={[diaPasado]} turnos={[turnoPasado]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);

    const bloque = screen.getByRole("button", { name: /María Games/ });
    expect(bloque).toHaveStyle({ background: "var(--color-arena)" });
    expect(bloque.className).toContain("text-grafito/60");
  });

  // Corrección de QA: "en el calendario a los turnos resueltos si son
  // asistidos que tengan un contorno verde y los ausentes un contorno
  // rojo".
  it("un turno resuelto marcado 'asistio' tiene contorno verde", () => {
    const diaPasado = new Date(2020, 0, 15);
    const turnoPasado = {
      ...turnos[0],
      horaInicio: new Date(2020, 0, 15, 9, 0).toISOString(),
      horaFin: new Date(2020, 0, 15, 9, 30).toISOString(),
      asistencia: "asistio" as const,
    };
    render(<CalendarGrid dias={[diaPasado]} turnos={[turnoPasado]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);

    const bloque = screen.getByRole("button", { name: /María Games/ });
    expect(bloque).toHaveClass("border-salvia-oscuro");
  });

  it("un turno resuelto marcado 'ausente' tiene contorno rojo", () => {
    const diaPasado = new Date(2020, 0, 15);
    const turnoPasado = {
      ...turnos[0],
      horaInicio: new Date(2020, 0, 15, 9, 0).toISOString(),
      horaFin: new Date(2020, 0, 15, 9, 30).toISOString(),
      asistencia: "ausente" as const,
    };
    render(<CalendarGrid dias={[diaPasado]} turnos={[turnoPasado]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);

    const bloque = screen.getByRole("button", { name: /María Games/ });
    expect(bloque).toHaveClass("border-terracota-oscuro");
  });

  it("un turno resuelto sin marcar todavía se queda con el borde neutro de siempre", () => {
    const diaPasado = new Date(2020, 0, 15);
    const turnoPasado = {
      ...turnos[0],
      horaInicio: new Date(2020, 0, 15, 9, 0).toISOString(),
      horaFin: new Date(2020, 0, 15, 9, 30).toISOString(),
    };
    render(<CalendarGrid dias={[diaPasado]} turnos={[turnoPasado]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);

    const bloque = screen.getByRole("button", { name: /María Games/ });
    expect(bloque).toHaveClass("border-arena");
    expect(bloque).not.toHaveClass("border-salvia-oscuro", "border-terracota-oscuro");
  });

  // Autoreservado (nueva función, pedido textual del cliente,
  // 2026-09-08): "estos horarios auto reservados en el calendario se
  // deben ver con rayas" — mismo color del tipo de consulta, con una
  // textura de rayas diagonales encima (repeating-linear-gradient), no
  // un color aparte.
  it("un turno autoreservado se pinta con rayas, no con el color plano del tipo de consulta", () => {
    const turnoAutoreservado = { ...turnos[0], autoreservado: true };
    render(<CalendarGrid dias={dias} turnos={[turnoAutoreservado]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);

    const bloque = screen.getByRole("button", { name: /María Games/ });
    expect(bloque.style.background).toContain("repeating-linear-gradient");
  });

  it("un turno normal (no autoreservado) sigue con el color plano del tipo de consulta", () => {
    render(<CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);

    const bloque = screen.getByRole("button", { name: /María Games/ });
    expect(bloque.style.background).not.toContain("repeating-linear-gradient");
  });

  // Corrección de QA (F2.3): "el horario de atención que no modifique
  // cómo se ve el calendario" — el rango de horas del grid queda FIJO
  // (08-20) sin importar lo que se configure en "Horario de atención";
  // ese ajuste solo acota los selectores de hora al agendar un turno
  // (ver agregar-turno-modal.tsx/editar-turno-modal.tsx), nunca el grid.
  it("el rango de horas del grid es siempre fijo (08-20), CalendarGrid no recibe horario de atención", () => {
    render(<CalendarGrid dias={dias} turnos={[]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument();
  });

  // F2.3.8 — bloqueos horarios pintados en gris oscuro sobre el grid.
  // Rediseño 2026-09-03 (ver "foto_incosistencia_5/6.png" en docs/):
  // "sin importar que horas de los 2 horarios reservados se solapen, se
  // tiene que ver así en general, para cualquier tipo de solapamiento" —
  // CUALQUIER cantidad de reglas que se solapen entre sí (directa o
  // transitivamente) forman un único CLUSTER, dibujado siempre igual: un
  // mini-header fijo "Ver eventos →" en el borde de ARRIBA del cluster
  // entero (nunca en la intersección exacta de un par en particular, eso
  // hacía que su posición cambiara según qué regla empezara antes) más,
  // si sobra algo del cluster por debajo, una franja lisa sin texto (ver
  // agruparEnClusters/segmentosParaVisualizar en calendar-grid.tsx).
  describe("bloqueos horarios", () => {
    // 2030-09-01 es domingo (diaSemana=0).
    const bloqueoGeneral = {
      id: "bg-1", especifico: false, diaSemana: 0, alcance: "todos" as const, horaDesde: "07:00", horaHasta: "08:00", tipoRegla: "bloquear_horario",
    };
    const bloqueoEspecifico = {
      id: "be-1", especifico: true, fecha: "2030-09-01", horaDesde: "07:30", horaHasta: "08:30", tipoRegla: "bloquear_horario",
    };

    it("pinta un bloqueo general que aplica ese día", () => {
      render(
        <CalendarGrid dias={dias} turnos={[]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} bloqueosGenerales={[bloqueoGeneral]} />,
      );
      expect(screen.getByLabelText("Horario bloqueado de 07:00 a 08:00")).toBeInTheDocument();
    });

    it("no pinta un bloqueo general de otro día de la semana", () => {
      render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[{ ...bloqueoGeneral, diaSemana: 1 }]}
        />,
      );
      expect(screen.queryByLabelText(/Horario bloqueado/)).not.toBeInTheDocument();
    });

    // general 07:00-08:00 + específica 07:30-08:30 se solapan → UN
    // cluster que abarca la UNIÓN de las dos (07:00-08:30, no solo la
    // intersección 07:30-08:00) — el mini-header queda en 07:00 (el
    // borde de arriba del cluster entero), con el resto del cluster
    // (07:24-08:30 aprox.) como una única franja lisa por debajo.
    it("una específica que se solapa con una general: un cluster que abarca la unión de las dos, con el mini-header arriba del todo", () => {
      const { container } = render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[bloqueoGeneral]}
          bloqueosEspecificas={[bloqueoEspecifico]}
        />,
      );

      const header = screen.getByLabelText("Horario bloqueado de 07:00 a 08:30");
      expect(header.className).toContain("bg-grafito/60");
      expect(header).toHaveStyle({ top: "-64px", height: "24px" }); // arriba del cluster (07:00), altura fija

      expect(screen.queryByLabelText("Horario bloqueado de 07:30 a 08:00")).not.toBeInTheDocument();
      const restos = container.querySelectorAll('[aria-hidden="true"]');
      expect(restos.length).toBe(1); // una sola franja lisa con lo que sobra del cluster
      expect(restos[0].className).toContain("bg-grafito/10");
      // Pista en el cuerpo (corrección de QA, 2026-09-03): "dar indicios
      // de lo que son... ahora que no hay turnos en conflicto poner
      // (círculo más gris) x horarios reservados".
      expect(within(restos[0] as HTMLElement).getByText("2 horarios reservados")).toBeInTheDocument();
    });

    // Corrección de QA (2026-09-02/03, tres vueltas — ver
    // "foto_incosistencia_5/6.png" en docs/): 1) "el ver eventos varía
    // según los horarios... quiero que quede como un miniheader"; 2) al
    // agregar un segundo bloque de relleno ANIDADO: "es hacer una
    // tarjeta dentro de la otra tarjeta"; 3) con el header en la
    // intersección exacta (no en el cluster entero): "el ver eventos
    // cambia según los horarios... esto NO debe ser así". El mini-header
    // mide siempre lo mismo Y arranca siempre en el mismo lugar relativo
    // (el borde de arriba del cluster), sin importar cuál regla empieza
    // antes ni cuánto dure el solapamiento — y el resto del cluster (si
    // sobra) es un elemento HERMANO, nunca anidado dentro del botón.
    it("el mini-header 'Ver eventos →' mide siempre lo mismo y nunca queda anidado dentro de otro bloque", () => {
      // Solapamiento CORTO (15 min, 16px) — más chico que el mini-header
      // (24px): el header se recorta a la altura total del cluster, sin
      // franja de sobra.
      const generalCorta = { ...bloqueoGeneral, id: "bg-corta", horaDesde: "09:00", horaHasta: "09:15" };
      const especificaCorta = { ...bloqueoEspecifico, id: "be-corta", horaDesde: "09:00", horaHasta: "09:15" };
      // Solapamiento LARGO, con la ESPECÍFICA empezando DESPUÉS que la
      // general (12:30, no 12:00) — el cluster igual arranca en 12:00 (el
      // borde de arriba de TODO el cluster, sea cual sea la regla que
      // empiece antes), nunca en la intersección (12:30).
      const generalLarga = { ...bloqueoGeneral, id: "bg-larga", horaDesde: "12:00", horaHasta: "15:00" };
      const especificaLarga = { ...bloqueoEspecifico, id: "be-larga", horaDesde: "12:30", horaHasta: "16:00" };

      const { container } = render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[generalCorta, generalLarga]}
          bloqueosEspecificas={[especificaCorta, especificaLarga]}
        />,
      );

      const headerCorto = screen.getByLabelText("Horario bloqueado de 09:00 a 09:15");
      // El cluster largo abarca la UNIÓN (12:00-16:00), no la
      // intersección (12:30-15:00) — el header sigue arrancando en el
      // borde de arriba del cluster entero, 12:00.
      const headerLargo = screen.getByLabelText("Horario bloqueado de 12:00 a 16:00");

      // Mismo alto en los dos, pese a que el cluster entero mide 16px en
      // un caso y 256px en el otro.
      expect(headerCorto).toHaveStyle({ height: "16px" }); // se recorta: el cluster entero mide 16px, menos que el header
      expect(headerLargo).toHaveStyle({ height: "24px" }); // el mini-header de siempre

      // Ninguno de los dos headers tiene hijos propios — nunca un
      // segundo bloque anidado DENTRO del mismo botón.
      expect(headerCorto.children).toHaveLength(0);
      expect(headerLargo.children).toHaveLength(0);

      // El cluster corto no deja nada de sobra (cabe entero en el
      // header); el largo sí — como elemento HERMANO, no anidado.
      const restos = container.querySelectorAll('[aria-hidden="true"]');
      expect(restos.length).toBe(1);
    });

    // Corrección de QA (2026-09-03): cuando una específica cubre a la
    // general por completo, el cluster sigue siendo la unión de las dos
    // — acá coincide con el rango propio de la específica, porque ya la
    // contiene entera.
    it("una específica que cubre a la general por completo: el cluster es la unión (coincide con el rango de la específica)", () => {
      const especificaQueCubreEntera = { ...bloqueoEspecifico, horaDesde: "06:30", horaHasta: "08:30" };
      render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[bloqueoGeneral]}
          bloqueosEspecificas={[especificaQueCubreEntera]}
        />,
      );

      const header = screen.getByLabelText("Horario bloqueado de 06:30 a 08:30");
      expect(header.className).toContain("bg-grafito/60");
      expect(screen.queryByLabelText("Horario bloqueado de 07:00 a 08:00")).not.toBeInTheDocument();
    });

    // Rediseño 2026-09-01 (ver "solapamientos_model2.png" en docs/): el
    // mini-header ya no muestra los motivos como texto propio (se
    // truncaba feo con motivos largos) — el motivo de cada regla se ve
    // recién en el modal que abre al hacer click (ver
    // bloqueo-detalle-modal.test.tsx).
    it("el mini-header muestra 'Ver eventos →' en vez de los motivos, sin importar cuántas reglas se solapen", () => {
      const general = { ...bloqueoGeneral, motivo: "Limpieza" };
      const especifica = { ...bloqueoEspecifico, motivo: "Reunión" };
      render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[general]}
          bloqueosEspecificas={[especifica]}
        />,
      );
      expect(screen.getByText("Ver eventos →")).toBeInTheDocument();
      expect(screen.queryByText("Limpieza")).not.toBeInTheDocument();
      expect(screen.queryByText("Reunión")).not.toBeInTheDocument();
      expect(screen.queryByText(/Limpieza.*Reunión/)).not.toBeInTheDocument();
    });

    // Rediseño 2026-08-31 (ver "tipos de solapamiento.png" en docs/):
    // "que al tocar en el centro muestre la combinación de horarios
    // reservados... el botón para redirigirse a cada una" — ya no hay
    // una regla "principal" y otra "de abajo": onBloqueoClick siempre
    // recibe la LISTA completa de reglas del cluster tocado.
    it("al hacer click en el mini-header, pasa la lista de las dos reglas (general primero)", async () => {
      const user = userEvent.setup();
      const onBloqueoClick = vi.fn();
      render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[bloqueoGeneral]}
          bloqueosEspecificas={[bloqueoEspecifico]}
          onBloqueoClick={onBloqueoClick}
        />,
      );

      await user.click(screen.getByLabelText("Horario bloqueado de 07:00 a 08:30"));
      expect(onBloqueoClick).toHaveBeenCalledWith([bloqueoGeneral, bloqueoEspecifico], dias[0], []);
    });

    it("al hacer click en un bloqueo sin solapamiento, pasa una lista de un solo elemento", async () => {
      const user = userEvent.setup();
      const onBloqueoClick = vi.fn();
      render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[bloqueoGeneral]}
          onBloqueoClick={onBloqueoClick}
        />,
      );

      await user.click(screen.getByLabelText("Horario bloqueado de 07:00 a 08:00"));
      expect(onBloqueoClick).toHaveBeenCalledWith([bloqueoGeneral], dias[0], []);
    });

    // Corrección de QA (2026-08-31): "cuando se solapan general +
    // general, quiero aplicar esta lógica para cualquier solapamiento,
    // no importa con qué horario reservado hacen" — la combinación ya no
    // es exclusiva de un par general+específica.
    describe("solapamiento entre reglas del mismo tipo", () => {
      it("dos generales solapadas forman un cluster que abarca la unión de las dos", () => {
        const generalA = { ...bloqueoGeneral, id: "bg-2", horaDesde: "09:00", horaHasta: "10:00", motivo: "Limpieza" };
        const generalB = { ...bloqueoGeneral, id: "bg-3", horaDesde: "09:30", horaHasta: "10:30", motivo: "Revisión" };
        const { container } = render(
          <CalendarGrid
            dias={dias}
            turnos={[]}
            tiposConsulta={tiposConsulta}
            onTurnoClick={vi.fn()}
            bloqueosGenerales={[generalA, generalB]}
          />,
        );

        const header = screen.getByLabelText("Horario bloqueado de 09:00 a 10:30");
        expect(header.className).toContain("bg-grafito/60");
        expect(screen.getByText("Ver eventos →")).toBeInTheDocument();

        expect(screen.queryByLabelText("Horario bloqueado de 09:00 a 10:00")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Horario bloqueado de 09:30 a 10:30")).not.toBeInTheDocument();
        const restos = container.querySelectorAll('[aria-hidden="true"]');
        expect(restos.length).toBe(1);
      });

      it("al hacer click en el combinado de dos generales, pasa la lista ordenada por hora de inicio", async () => {
        const user = userEvent.setup();
        const onBloqueoClick = vi.fn();
        const generalA = { ...bloqueoGeneral, id: "bg-2", horaDesde: "09:00", horaHasta: "10:00" };
        const generalB = { ...bloqueoGeneral, id: "bg-3", horaDesde: "09:30", horaHasta: "10:30" };
        render(
          <CalendarGrid
            dias={dias}
            turnos={[]}
            tiposConsulta={tiposConsulta}
            onTurnoClick={vi.fn()}
            bloqueosGenerales={[generalA, generalB]}
            onBloqueoClick={onBloqueoClick}
          />,
        );

        await user.click(screen.getByLabelText("Horario bloqueado de 09:00 a 10:30"));
        expect(onBloqueoClick).toHaveBeenCalledWith([generalA, generalB], dias[0], []);
      });

      // Corrección de QA (2026-08-31): "todos los tipos de solapamiento
      // se vean como [general+general]" — dos específicas solapadas
      // también forman un cluster único, mismo criterio.
      it("dos específicas solapadas forman un cluster que abarca la unión de las dos", () => {
        const especificaA = { ...bloqueoEspecifico, id: "be-2", horaDesde: "13:00", horaHasta: "14:00", motivo: "Auditoría" };
        const especificaB = { ...bloqueoEspecifico, id: "be-3", horaDesde: "13:30", horaHasta: "14:30", motivo: "Capacitación" };
        const { container } = render(
          <CalendarGrid
            dias={dias}
            turnos={[]}
            tiposConsulta={tiposConsulta}
            onTurnoClick={vi.fn()}
            bloqueosEspecificas={[especificaA, especificaB]}
          />,
        );

        const header = screen.getByLabelText("Horario bloqueado de 13:00 a 14:30");
        expect(header.className).toContain("bg-grafito/60");
        expect(screen.getByText("Ver eventos →")).toBeInTheDocument();

        expect(screen.queryByLabelText("Horario bloqueado de 13:00 a 14:00")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Horario bloqueado de 13:30 a 14:30")).not.toBeInTheDocument();
        const restos = container.querySelectorAll('[aria-hidden="true"]');
        expect(restos.length).toBe(1);
      });
    });

    // Corrección de QA (2026-08-31): "si hay otro solapamiento más, con
    // tocar en el centro se puede agregar acá" — una tercera regla que
    // se solapa TRANSITIVAMENTE con las otras dos (aunque no toque
    // directamente a la primera) se suma al MISMO cluster, ampliando su
    // extensión — nunca rompe ni divide lo que ya había.
    it("una tercera regla que se solapa transitivamente se suma al mismo cluster y amplía su extensión", () => {
      const general = { ...bloqueoGeneral, horaDesde: "09:00", horaHasta: "10:00" };
      const especificaB = { ...bloqueoEspecifico, id: "be-2", horaDesde: "09:30", horaHasta: "10:30" };
      // especificaC no toca a `general` directamente (10:15 > 10:00),
      // pero sí a especificaB (10:15 < 10:30) — mismo cluster igual.
      const especificaC = { ...bloqueoEspecifico, id: "be-3", horaDesde: "10:15", horaHasta: "11:00" };
      const { container } = render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[general]}
          bloqueosEspecificas={[especificaB, especificaC]}
        />,
      );

      // Un solo cluster, de 09:00 (general) a 11:00 (especificaC) — no
      // dos tramos separados.
      const header = screen.getByLabelText("Horario bloqueado de 09:00 a 11:00");
      expect(header).toHaveStyle({ height: "24px" });
      const restos = container.querySelectorAll('[aria-hidden="true"]');
      expect(restos.length).toBe(1);
    });

    // Caso límite: tres reglas que ocupan EXACTAMENTE el mismo rango
    // forman un cluster de esa misma extensión — el click sigue pasando
    // la lista completa, con la general primero.
    it("tres reglas con el mismo rango horario forman un cluster con las tres", async () => {
      const user = userEvent.setup();
      const onBloqueoClick = vi.fn();
      const especificaB = { ...bloqueoEspecifico, id: "be-2", horaDesde: "07:00", horaHasta: "08:00", motivo: "Capacitación" };
      const especificaC = { ...bloqueoEspecifico, id: "be-3", horaDesde: "07:00", horaHasta: "08:00", motivo: "Auditoría" };
      const general = { ...bloqueoGeneral, motivo: "Limpieza" };
      render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[general]}
          bloqueosEspecificas={[especificaB, especificaC]}
          onBloqueoClick={onBloqueoClick}
        />,
      );

      const header = screen.getByLabelText("Horario bloqueado de 07:00 a 08:00");
      expect(header.className).toContain("bg-grafito/60");
      expect(screen.getByText("Ver eventos →")).toBeInTheDocument();
      // La pista del cuerpo cuenta las TRES reglas del cluster, no solo un par.
      expect(screen.getByText("3 horarios reservados")).toBeInTheDocument();

      await user.click(header);
      expect(onBloqueoClick).toHaveBeenCalledWith([general, especificaB, especificaC], dias[0], []);
    });
  });

  // Paso 2 — manejo de conflictos con turnos (2026-09-04, pedido
  // explícito del cliente): "si un horario reservado se solapa con un
  // turno, mostrar esta tarjeta de ver eventos, ya sea que sea un
  // horario reservado que se solapa con el turno o más... solo con la
  // pista en el cuerpo x turnos en conflicto y x horarios reservados".
  // Reutiliza EXACTAMENTE el mismo mini-header/tarjeta "combinado" de
  // arriba — la única diferencia es la pista roja del cuerpo.
  describe("conflictos entre turnos y horarios reservados (paso 2)", () => {
    const bloqueoGeneral = {
      id: "bg-1", especifico: false, diaSemana: 0, alcance: "todos" as const, horaDesde: "07:00", horaHasta: "08:00", tipoRegla: "bloquear_horario",
    };

    it("un turno sin ningún horario reservado superpuesto se dibuja normal, sin pasar por 'Ver eventos'", () => {
      render(<CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} bloqueosGenerales={[bloqueoGeneral]} />);
      // El turno (09:00-09:30) no se solapa con el bloqueo (07:00-08:00)
      // — cada uno se dibuja por su cuenta, sin ninguna tarjeta combinada.
      expect(screen.getByText("María Games")).toBeInTheDocument();
      expect(screen.queryByText("Ver eventos →")).not.toBeInTheDocument();
    });

    it("un turno que se solapa con un horario reservado se agrupa en la misma tarjeta 'Ver eventos', y el turno no se dibuja aparte", () => {
      const bloqueoSolapado = { ...bloqueoGeneral, horaDesde: "08:45", horaHasta: "09:15" };
      const { container } = render(
        <CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} bloqueosGenerales={[bloqueoSolapado]} />,
      );

      // Cluster 08:45 (bloqueo) a 09:30 (turno) — el turno no se dibuja
      // como botón propio con su nombre.
      expect(screen.getByText("Ver eventos →")).toBeInTheDocument();
      expect(screen.queryByText("María Games")).not.toBeInTheDocument();

      const header = screen.getByLabelText("Horario bloqueado de 08:45 a 09:30");
      expect(header).toHaveStyle({ height: "24px" }); // el mismo mini-header fijo de siempre

      const restos = container.querySelectorAll('[aria-hidden="true"]');
      expect(restos.length).toBe(1);
      expect(within(restos[0] as HTMLElement).getByText("1 turno en conflicto")).toBeInTheDocument();
      expect(within(restos[0] as HTMLElement).getByText("1 horario reservado")).toBeInTheDocument();
    });

    it("al hacer click en la tarjeta de conflicto, pasa las reglas Y los turnos del cluster", async () => {
      const user = userEvent.setup();
      const onBloqueoClick = vi.fn();
      const bloqueoSolapado = { ...bloqueoGeneral, horaDesde: "08:45", horaHasta: "09:15" };
      render(
        <CalendarGrid
          dias={dias}
          turnos={turnos}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[bloqueoSolapado]}
          onBloqueoClick={onBloqueoClick}
        />,
      );

      await user.click(screen.getByLabelText("Horario bloqueado de 08:45 a 09:30"));
      expect(onBloqueoClick).toHaveBeenCalledWith([bloqueoSolapado], dias[0], [turnos[0]]);
    });

    // "ya sea que sea un horario reservado que se solapa con el turno o
    // más" — dos reglas solapadas Y un turno adentro forman un único
    // cluster de conflicto, con las dos pistas mostrando sus cantidades.
    it("dos horarios reservados combinados que además se solapan con un turno: una sola tarjeta con las dos pistas", () => {
      const generalA = { ...bloqueoGeneral, horaDesde: "08:45", horaHasta: "09:10" };
      const especificaB = { id: "be-1", especifico: true, fecha: "2030-09-01", horaDesde: "09:05", horaHasta: "09:20", tipoRegla: "bloquear_horario" };
      const { container } = render(
        <CalendarGrid
          dias={dias}
          turnos={turnos}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[generalA]}
          bloqueosEspecificas={[especificaB]}
        />,
      );

      expect(screen.getByText("Ver eventos →")).toBeInTheDocument();
      const restos = container.querySelectorAll('[aria-hidden="true"]');
      expect(restos.length).toBe(1);
      expect(within(restos[0] as HTMLElement).getByText("1 turno en conflicto")).toBeInTheDocument();
      expect(within(restos[0] as HTMLElement).getByText("2 horarios reservados")).toBeInTheDocument();
    });
  });

  // Corrección de QA (2026-09-04): "el turno y el postturno aparecen como
  // en 2 tarjetas diferentes, lo mismo que con el ver eventos → y la
  // tarjeta con los horarios solapados... unir estas 2 tarjetas en una
  // sola... homogénea, pero manteniendo la diferencia de colores y
  // respetando su posición" — el redondeo de las cuatro esquinas en cada
  // mitad hacía un pellizco visual en la unión; con el de arriba
  // redondeado solo arriba y el de abajo solo abajo, se ve una sola
  // tarjeta con dos tonos.
  describe("redondeo homogéneo entre las dos mitades de una tarjeta compuesta", () => {
    it("un turno CON postturno: el turno redondea solo arriba, el postturno solo abajo", () => {
      const tiposConPost = [{ ...tiposConsulta[0], tiempoPostConsultaMinutos: 15 }, tiposConsulta[1]];
      render(<CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConPost} onTurnoClick={vi.fn()} />);

      const turno = screen.getByRole("button", { name: /María Games/ });
      expect(turno.className).toContain("rounded-t-field");
      expect(turno.className).not.toContain("rounded-field");

      const postturno = screen.getByText("Postturno 15min").closest("div[aria-hidden]")!;
      expect(postturno.className).toContain("rounded-b-field");
    });

    it("un turno SIN postturno sigue redondeando las cuatro esquinas", () => {
      render(<CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} />);
      const turno = screen.getByRole("button", { name: /María Games/ });
      expect(turno.className).toContain("rounded-field");
      expect(turno.className).not.toContain("rounded-t-field");
    });

    it("un turno resuelto (sin postturno visible) redondea las cuatro esquinas", () => {
      const diaPasado = new Date(2020, 0, 15);
      const tiposConPost = [{ ...tiposConsulta[0], tiempoPostConsultaMinutos: 15 }, tiposConsulta[1]];
      const turnoPasado = { ...turnos[0], horaInicio: new Date(2020, 0, 15, 9, 0).toISOString(), horaFin: new Date(2020, 0, 15, 9, 30).toISOString() };
      render(<CalendarGrid dias={[diaPasado]} turnos={[turnoPasado]} tiposConsulta={tiposConPost} onTurnoClick={vi.fn()} />);
      const turno = screen.getByRole("button", { name: /María Games/ });
      expect(turno.className).toContain("rounded-field");
      expect(turno.className).not.toContain("rounded-t-field");
    });

    it("el mini-header 'Ver eventos →' CON resto redondea solo arriba, el resto solo abajo", () => {
      const bloqueoGeneral = {
        id: "bg-1", especifico: false, diaSemana: 0, alcance: "todos" as const, horaDesde: "07:00", horaHasta: "08:00", tipoRegla: "bloquear_horario",
      };
      const bloqueoEspecifico = {
        id: "be-1", especifico: true, fecha: "2030-09-01", horaDesde: "07:30", horaHasta: "08:30", tipoRegla: "bloquear_horario",
      };
      const { container } = render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[bloqueoGeneral]}
          bloqueosEspecificas={[bloqueoEspecifico]}
        />,
      );
      const header = screen.getByLabelText("Horario bloqueado de 07:00 a 08:30");
      expect(header.className).toContain("rounded-t-field");
      expect(header.className).not.toContain("rounded-field");

      const resto = container.querySelector('[aria-hidden="true"]')!;
      expect(resto.className).toContain("rounded-b-field");
    });

    it("el mini-header SIN resto (el cluster entero cabe en el header) redondea las cuatro esquinas", () => {
      const generalCorta = {
        id: "bg-corta", especifico: false, diaSemana: 0, alcance: "todos" as const, horaDesde: "09:00", horaHasta: "09:15", tipoRegla: "bloquear_horario",
      };
      const especificaCorta = { id: "be-corta", especifico: true, fecha: "2030-09-01", horaDesde: "09:00", horaHasta: "09:15", tipoRegla: "bloquear_horario" };
      render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosGenerales={[generalCorta]}
          bloqueosEspecificas={[especificaCorta]}
        />,
      );
      const header = screen.getByLabelText("Horario bloqueado de 09:00 a 09:15");
      expect(header.className).toContain("rounded-field");
      expect(header.className).not.toContain("rounded-t-field");
    });
  });

  // Excepciones de horario de atención (nueva función, pedido textual del
  // cliente, 2026-09-08): "básicamente es lo mismo que horarios
  // reservados, pero ahora puede abarcar días completos" — se traducen a
  // horarios reservados sintéticos (cierresDeExcepciones) y pasan por el
  // MISMO clustering que reglas reales + turnos, sin sistema aparte.
  describe("excepciones de horario de atención", () => {
    it("\"no trabajo este período\" (sin horaDesde/horaHasta) cubre toda la grilla visible, sin nada real de por medio", () => {
      const excepcion = { id: "ha-1", alcance: "semana" as const, fechaDesde: "2030-08-26", fechaHasta: "2030-09-01" };
      render(
        <CalendarGrid dias={dias} turnos={[]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} horariosAtencion={[excepcion]} />,
      );
      const tarjeta = screen.getByText("No trabajo en este período");
      // Cubre de 08:00 (HORA_INICIO) a 20:00 (HORA_FIN) — 12 horas * 64px.
      expect(tarjeta.closest("button")).toHaveStyle({ top: "0px", height: "768px" });
    });

    // Corrección de QA, 2026-09-08: "al hacer click en la tarjeta me
    // muestra a qué excepción de horario hace referencia, igual que
    // horario reservado" — clickeable, mismo onBloqueoClick que un
    // horario reservado real (aunque no haya nada real de por medio).
    it("una excepción sola (sin nada real) es clickeable y avisa con el mismo onBloqueoClick que un horario reservado", async () => {
      const user = userEvent.setup();
      const onBloqueoClick = vi.fn();
      const excepcion = { id: "ha-1", alcance: "semana" as const, fechaDesde: "2030-08-26", fechaHasta: "2030-09-01" };
      render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          horariosAtencion={[excepcion]}
          onBloqueoClick={onBloqueoClick}
        />,
      );
      await user.click(screen.getByText("No trabajo en este período"));
      expect(onBloqueoClick).toHaveBeenCalledTimes(1);
      const [reglas] = onBloqueoClick.mock.calls[0];
      expect(reglas).toHaveLength(1);
      expect(esExcepcionSintetica(reglas[0])).toBe(true);
    });

    it("con horario reducido (horaDesde/horaHasta), cierra lo que queda AFUERA de esa ventana en dos tramos", () => {
      const excepcion = { id: "ha-2", alcance: "rango" as const, fechaDesde: "2030-09-01", fechaHasta: "2030-09-01", horaDesde: "10:00", horaHasta: "14:00" };
      render(
        <CalendarGrid dias={dias} turnos={[]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} horariosAtencion={[excepcion]} />,
      );
      const tarjetas = screen.getAllByText("No trabajo en este período");
      expect(tarjetas).toHaveLength(2);
      // 08:00-10:00 (2 horas) y 14:00-20:00 (6 horas).
      const altos = tarjetas.map((t) => (t.closest("button") as HTMLElement).style.height).sort();
      expect(altos).toEqual(["128px", "384px"]);
    });

    it("una excepción que no aplica ese día no dibuja nada", () => {
      const excepcion = { id: "ha-3", alcance: "rango" as const, fechaDesde: "2030-09-05", fechaHasta: "2030-09-10" };
      render(
        <CalendarGrid dias={dias} turnos={[]} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} horariosAtencion={[excepcion]} />,
      );
      expect(screen.queryByText("No trabajo en este período")).not.toBeInTheDocument();
    });

    it("dos excepciones que se solapan entre sí (sin nada real) se juntan en UNA sola tarjeta, sin 'Ver eventos'", () => {
      // Mismo ejemplo textual del cliente: "10:00 a 11:00 y... 10:30 a
      // 12:00... se verá un no trabajo en este período de 10:00 a 12:00".
      const primera = { id: "ha-4", alcance: "rango" as const, fechaDesde: "2030-09-01", fechaHasta: "2030-09-01", horaDesde: "10:00", horaHasta: "20:00" };
      const segunda = { id: "ha-5", alcance: "rango" as const, fechaDesde: "2030-09-01", fechaHasta: "2030-09-01", horaDesde: "10:30", horaHasta: "20:00" };
      render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          horariosAtencion={[primera, segunda]}
        />,
      );
      // Cada excepción cierra 08:00-10:00 / 08:00-10:30 respectivamente —
      // se solapan (ambas arrancan en 08:00) y se juntan en una sola
      // tarjeta 08:00-10:30 (2.5 horas), no dos tarjetas ni "Ver eventos →".
      expect(screen.getAllByText("No trabajo en este período")).toHaveLength(1);
      expect(screen.queryByText("Ver eventos →")).not.toBeInTheDocument();
      const tarjeta = screen.getByText("No trabajo en este período").closest("button") as HTMLElement;
      expect(tarjeta.style.height).toBe("160px"); // 2.5 horas * 64px
    });

    it("una excepción que se solapa con un horario reservado real se transforma en 'Ver eventos', con las dos pistas por separado", () => {
      const excepcion = { id: "ha-6", alcance: "rango" as const, fechaDesde: "2030-09-01", fechaHasta: "2030-09-01", horaDesde: "09:00", horaHasta: "20:00" };
      // Cierra 08:00-09:00 — se solapa con un horario reservado 07:30-08:30.
      const bloqueo = { id: "b-1", especifico: true, fecha: "2030-09-01", horaDesde: "07:30", horaHasta: "08:30", tipoRegla: "bloquear_horario" };
      render(
        <CalendarGrid
          dias={dias}
          turnos={[]}
          tiposConsulta={tiposConsulta}
          onTurnoClick={vi.fn()}
          bloqueosEspecificas={[bloqueo]}
          horariosAtencion={[excepcion]}
        />,
      );
      expect(screen.getByText("Ver eventos →")).toBeInTheDocument();
      expect(screen.getByText("1 horario reservado")).toBeInTheDocument();
      expect(screen.getByText("1 horario de no trabajo")).toBeInTheDocument();
    });

    it("una excepción que se solapa con un turno se transforma en 'Ver eventos' igual que un horario reservado", () => {
      const excepcion = { id: "ha-7", alcance: "rango" as const, fechaDesde: "2030-09-01", fechaHasta: "2030-09-01", horaDesde: "10:00", horaHasta: "20:00" };
      // Cierra 08:00-10:00 — se solapa con un turno 09:00-09:30.
      render(
        <CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={vi.fn()} horariosAtencion={[excepcion]} />,
      );
      expect(screen.getByText("Ver eventos →")).toBeInTheDocument();
      expect(screen.getByText("1 turno en conflicto")).toBeInTheDocument();
      expect(screen.getByText("1 horario de no trabajo")).toBeInTheDocument();
      expect(screen.queryByText("horario reservado")).not.toBeInTheDocument();
    });
  });
});
