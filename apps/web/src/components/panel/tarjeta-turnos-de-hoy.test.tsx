import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ResumenTurnoItem } from "@dental-mirage/shared-types";

const marcarAsistenciaActionMock = vi.fn();
vi.mock("@/app/actions/turnos", () => ({
  marcarAsistenciaAction: (...args: unknown[]) => marcarAsistenciaActionMock(...args),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const { TarjetaTurnosDeHoy, textoRestantes } = await import("./tarjeta-turnos-de-hoy");

// El reloj de los tests. Todas las horas de los fixtures se arman
// relativas a este instante, así el resultado no depende de cuándo se
// corre la suite.
const AHORA = new Date("2026-09-19T14:00:00.000Z").getTime();
const enMinutos = (m: number) => new Date(AHORA + m * 60_000).toISOString();

function turno(over: Partial<ResumenTurnoItem> = {}): ResumenTurnoItem {
  return {
    id: "t1",
    fecha: "2026-09-19",
    hora: "12:00",
    horaFin: "12:30",
    nombre: "Juan Paciente",
    horaInicioIso: enMinutos(60),
    horaFinIso: enMinutos(90),
    ...over,
  };
}

function montar(turnos: ResumenTurnoItem[]) {
  return render(
    <TarjetaTurnosDeHoy
      turnos={turnos}
      hrefCabecera="/panel/calendario?vista=dia"
      hrefPie="/panel/turnos?estado=agendado&desde=2026-09-19&hasta=2026-09-19"
    />,
  );
}

beforeEach(() => {
  marcarAsistenciaActionMock.mockReset();
  marcarAsistenciaActionMock.mockResolvedValue({});
  refreshMock.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(AHORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TarjetaTurnosDeHoy — el estado sale del reloj", () => {
  it("un turno que todavía no empezó se muestra PENDIENTE", () => {
    montar([turno()]);
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
  });

  // El estado nuevo de esta ronda: estamos dentro de su horario.
  it("un turno que está transcurriendo se muestra EN PROCESO", () => {
    montar([turno({ horaInicioIso: enMinutos(-10), horaFinIso: enMinutos(20) })]);
    expect(screen.getByText("En proceso")).toBeInTheDocument();
    expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();
  });

  // Lo que hace que la tarjeta sirva de verdad: la fila cambia sola en
  // la pantalla que ya está abierta, sin que nadie refresque.
  it("pasa de PENDIENTE a EN PROCESO sola, al llegar la hora", async () => {
    montar([turno({ horaInicioIso: enMinutos(1), horaFinIso: enMinutos(31) })]);
    expect(screen.getByText("Pendiente")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(screen.getByText("En proceso")).toBeInTheDocument();
  });
});

describe("TarjetaTurnosDeHoy — los botones de asistencia", () => {
  // "Estos botones aparecerán solo 5 min antes de la hora de comienzo
  // del turno" (pedido textual). El backend impone lo mismo: si esto se
  // adelantara, los botones aparecerían solo para que el servidor los
  // rechace.
  // Están SIEMPRE, apagados hasta que falten 5 minutos (corrección del
  // 2026-09-19): apareciendo de la nada movían la fila entera, y no
  // dejaban ver de antemano que la columna iba a tener algo.
  it("faltando más de 5 minutos están, pero deshabilitados", () => {
    montar([turno({ horaInicioIso: enMinutos(6), horaFinIso: enMinutos(36) })]);
    expect(screen.getByRole("button", { name: "Asistió" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No asistió" })).toBeDisabled();
  });

  it("aunque se mantengan apretados estando apagados, no marcan nada", async () => {
    montar([turno({ horaInicioIso: enMinutos(30), horaFinIso: enMinutos(60) })]);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Asistió" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(marcarAsistenciaActionMock).not.toHaveBeenCalled();
  });

  it("faltando menos de 5 minutos quedan habilitados, antes de que el turno empiece", () => {
    montar([turno({ horaInicioIso: enMinutos(3), horaFinIso: enMinutos(33) })]);
    expect(screen.getByRole("button", { name: "Asistió" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "No asistió" })).toBeEnabled();
  });

  it("se habilitan solos al entrar en la ventana, sin refrescar", async () => {
    montar([turno({ horaInicioIso: enMinutos(6), horaFinIso: enMinutos(36) })]);
    expect(screen.getByRole("button", { name: "Asistió" })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });

    expect(screen.getByRole("button", { name: "Asistió" })).toBeEnabled();
  });

  // Mismo gesto que el cartel del final del turno, y el mismo umbral:
  // son la misma acción irreversible.
  it("mantener apretado 5 segundos marca la asistencia y vuelve a pedir la pantalla", async () => {
    montar([turno({ id: "t-asistio", horaInicioIso: enMinutos(1), horaFinIso: enMinutos(31) })]);
    const boton = screen.getByRole("button", { name: "Asistió" });

    fireEvent.pointerDown(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(marcarAsistenciaActionMock).toHaveBeenCalledWith("t-asistio", "asistio");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("soltar antes de los 5 segundos no marca nada", async () => {
    montar([turno({ horaInicioIso: enMinutos(1), horaFinIso: enMinutos(31) })]);
    const boton = screen.getByRole("button", { name: "No asistió" });

    fireEvent.pointerDown(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    fireEvent.pointerUp(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(marcarAsistenciaActionMock).not.toHaveBeenCalled();
  });

  // El rechazo más común es un conflicto de identidad sin resolver. Sin
  // esto el botón se llena, no pasa nada, y no hay forma de saber por
  // qué — el mismo modo de falla que el cartel ya tuvo una vez.
  it("si el backend rechaza, muestra el motivo en la fila", async () => {
    marcarAsistenciaActionMock.mockResolvedValue({
      error: "hay un conflicto de identidad sin resolver con este paciente",
    });
    montar([turno({ horaInicioIso: enMinutos(1), horaFinIso: enMinutos(31) })]);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Asistió" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("conflicto de identidad sin resolver");
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("TarjetaTurnosDeHoy — el pie", () => {
  // "Quedan N turnos más hoy" cuenta los que TODAVÍA NO EMPEZARON: el
  // que está en proceso no es uno "más", es el de ahora.
  it("no cuenta el turno que está en proceso", () => {
    montar([
      turno({ id: "a", horaInicioIso: enMinutos(-5), horaFinIso: enMinutos(25) }),
      turno({ id: "b", horaInicioIso: enMinutos(60), horaFinIso: enMinutos(90) }),
      turno({ id: "c", horaInicioIso: enMinutos(120), horaFinIso: enMinutos(150) }),
    ]);
    expect(screen.getByText("Quedan 2 turnos más hoy.")).toBeInTheDocument();
  });

  it("el número grande cuenta TODOS los turnos del día, no solo los que faltan", () => {
    montar([
      turno({ id: "a", horaInicioIso: enMinutos(-5), horaFinIso: enMinutos(25) }),
      turno({ id: "b", horaInicioIso: enMinutos(60), horaFinIso: enMinutos(90) }),
    ]);
    // Dos turnos arriba, uno "más" abajo: el número es el día entero, el
    // pie es lo que falta. Que digan distinto es correcto.
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Queda 1 turno más hoy.")).toBeInTheDocument();
  });

  // 2026-09-19, pedido del cliente: sin turnos por delante no se dice
  // nada — "no queda ningún turno más hoy" era una frase para informar
  // que no hay nada que informar. Queda solo "Ver todos".
  it("sin turnos por delante no dice nada en el pie, solo queda Ver todos", () => {
    montar([]);
    expect(screen.getByText("No hay turnos para hoy.")).toBeInTheDocument();
    expect(screen.queryByText(/turno más hoy/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todos" })).toBeInTheDocument();
  });

  // Un turno anotado por adelantado SIGUE siendo un turno que falta
  // atender: la persona todavía no vino, lo único que se guardó es qué
  // va a decir cuando termine.
  it("un turno ya anotado sigue contando como uno que falta", () => {
    montar([
      turno({ id: "a", horaInicioIso: enMinutos(60), horaFinIso: enMinutos(90), asistenciaPreliminar: "asistio" }),
      turno({ id: "b", horaInicioIso: enMinutos(120), horaFinIso: enMinutos(150) }),
    ]);
    expect(screen.getByText("Quedan 2 turnos más hoy.")).toBeInTheDocument();
  });
});

// La corrección central de esta vuelta: marcar no adelanta el turno, y
// lo anotado es REVERSIBLE hasta que el turno termine.
describe("TarjetaTurnosDeHoy — un turno ya anotado", () => {
  // Los botones se quedan: si la celda pasara a decir "Asistido" en solo
  // lectura, diría que ya no se puede cambiar — y sí se puede.
  it("deja los dos botones y marca el elegido con un contorno", () => {
    montar([turno({ horaInicioIso: enMinutos(2), horaFinIso: enMinutos(32), asistenciaPreliminar: "asistio" })]);

    const asistio = screen.getByRole("button", { name: "Asistió" });
    const noAsistio = screen.getByRole("button", { name: "No asistió" });
    expect(asistio).toBeEnabled();
    expect(noAsistio).toBeEnabled();
    expect(asistio.className).toContain("ring-salvia-oscuro");
    expect(noAsistio.className).not.toContain("ring-terracota-oscuro");
  });

  // EL bug reportado (2026-09-19): "no puedo poner asistió una vez que
  // pongo no asistió... debe poder hacerse de los 2 lados". El gesto de
  // mantener apretado se disparaba UNA sola vez por montaje —protección
  // correcta en el cartel del final, donde la marca es irreversible, y
  // exactamente lo contrario de lo que hace falta acá—.
  //
  // Va y vuelve DOS veces a propósito: con la protección puesta, el
  // tercer gesto es el primero que no dispara.
  it("se puede ir y volver entre los dos, todas las veces que haga falta", async () => {
    montar([turno({ id: "t-ida-vuelta", horaInicioIso: enMinutos(2), horaFinIso: enMinutos(32) })]);

    const apretar = async (nombre: string) => {
      fireEvent.pointerDown(screen.getByRole("button", { name: nombre }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      fireEvent.pointerUp(screen.getByRole("button", { name: nombre }));
    };

    await apretar("No asistió");
    await apretar("Asistió");
    await apretar("No asistió");

    expect(marcarAsistenciaActionMock.mock.calls).toEqual([
      ["t-ida-vuelta", "ausente"],
      ["t-ida-vuelta", "asistio"],
      ["t-ida-vuelta", "ausente"],
    ]);
  });

  it("se puede cambiar de opinión: marcar el otro vuelve a llamar al backend", async () => {
    montar([
      turno({ id: "t-cambio", horaInicioIso: enMinutos(2), horaFinIso: enMinutos(32), asistenciaPreliminar: "ausente" }),
    ]);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Asistió" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(marcarAsistenciaActionMock).toHaveBeenCalledWith("t-cambio", "asistio");
  });

  // Y el ESTADO sigue saliendo del reloj: anotar la asistencia no
  // resuelve el turno, solo guarda qué va a decir cuando termine.
  it("sigue mostrando PENDIENTE o EN PROCESO, no resuelto", () => {
    montar([turno({ horaInicioIso: enMinutos(-5), horaFinIso: enMinutos(25), asistenciaPreliminar: "ausente" })]);

    expect(screen.getByText("En proceso")).toBeInTheDocument();
    expect(screen.queryByText("Resuelto")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No asistió" }).className).toContain("ring-terracota-oscuro");
  });
});

// Cuando un turno cruza su hora de fin deja de pertenecer a esta
// tarjeta: el backend lo pasa a "Turnos resueltos hoy". Eso es un cambio
// del servidor, así que la pantalla tiene que volver a pedirse sola.
describe("TarjetaTurnosDeHoy — al vencer un turno", () => {
  it("vuelve a pedir la pantalla cuando un turno cruza su hora de fin", async () => {
    montar([turno({ horaInicioIso: enMinutos(-30), horaFinIso: enMinutos(1) })]);
    expect(refreshMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });

    expect(refreshMock).toHaveBeenCalled();
  });
});

describe("TarjetaTurnosDeHoy — los botones se ven como un par", () => {
  // "No asistió" es cuatro letras más largo que "Asistió": sin un ancho
  // fijo quedaban de tamaños distintos, y una opción parecía pesar más
  // que la otra (2026-09-19, corrección pedida con captura).
  it("los dos tienen el mismo ancho", () => {
    montar([turno({ horaInicioIso: enMinutos(2), horaFinIso: enMinutos(32) })]);

    const asistio = screen.getByRole("button", { name: "Asistió" });
    const noAsistio = screen.getByRole("button", { name: "No asistió" });
    const anchoDe = (el: HTMLElement) => el.className.split(/\s+/).find((c) => c.startsWith("w-["));

    expect(anchoDe(asistio)).toBeDefined();
    expect(anchoDe(asistio)).toBe(anchoDe(noAsistio));
  });
});

describe("TarjetaTurnosDeHoy — la cabecera de columnas", () => {
  // Fija al scrollear: sin esto, al bajar por la lista se perdía qué
  // columna era cada cosa.
  it("nombra las cuatro columnas", () => {
    montar([turno()]);
    for (const columna of ["Horario", "Paciente", "Estado", "Asistencia"]) {
      expect(screen.getByRole("columnheader", { name: columna })).toBeInTheDocument();
    }
  });

  it("no dibuja la tabla si no hay turnos", () => {
    montar([]);
    expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
  });

  // --- Dos tablas: la cabecera visible y la de las filas (ítem 8, 2026-10-25) ---

  it("sin turnos sigue el aviso y no hay ninguna tabla (ni la cabecera visible)", () => {
    const { container } = montar([]);
    expect(screen.getByText("No hay turnos para hoy.")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
  });

  it("las columnas se nombran una sola vez: la cabecera visible es aria-hidden", () => {
    montar([turno()]);
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
  });

  it("con Profesional, son exactamente cinco columnheader", () => {
    montar([turno({ profesional: "Dra. Lucía Ferrer" })]);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Horario",
      "Paciente",
      "Profesional",
      "Estado",
      "Asistencia",
    ]);
  });

  it("la tabla real conserva su thead con th scope=col y el texto en sr-only", () => {
    const { container } = montar([turno()]);
    const tablas = container.querySelectorAll("table");
    expect(tablas).toHaveLength(2);
    const [visible, real] = Array.from(tablas);
    expect(visible).toHaveAttribute("aria-hidden", "true");
    expect(real).not.toHaveAttribute("aria-hidden");
    const ths = real.querySelectorAll("thead th");
    expect(ths).toHaveLength(4);
    ths.forEach((th) => {
      expect(th).toHaveAttribute("scope", "col");
      expect(th.querySelector(".sr-only")).not.toBeNull();
    });
    // La cabecera visible lleva la variante sobre el vidrio, sin la capa sticky.
    visible.querySelectorAll("th").forEach((th) => expect(th).not.toHaveClass("panel-th-sticky"));
    expect(real.querySelector("tbody tr")).not.toBeNull();
  });

  it.each([
    ["sin Profesional", {}],
    ["con Profesional", { profesional: "Dra. Lucía Ferrer" }],
  ] as const)("las dos tablas tienen el mismo colgroup (%s)", (_, over) => {
    const { container } = montar([turno(over)]);
    const [visible, real] = Array.from(container.querySelectorAll("table"));
    const clases = (t: Element) => Array.from(t.querySelectorAll("colgroup > col")).map((c) => c.className);
    const columnas = screen.getAllByRole("columnheader").length;
    expect(clases(visible)).toHaveLength(columnas);
    expect(clases(visible)).toEqual(clases(real));
    // Las dos tablas tienen el mismo ancho mínimo.
    expect(visible.className).toBe(real.className);
  });

  it("al scrollear las filas de costado, la cabecera copia su scrollLeft", () => {
    const { container } = montar([turno(), turno({ id: "t2" })]);
    const [visible, real] = Array.from(container.querySelectorAll("table"));
    const cajaCabecera = visible.parentElement as HTMLElement;
    const cajaFilas = real.parentElement as HTMLElement;
    expect(cajaCabecera).toHaveClass("overflow-hidden");
    expect(cajaFilas).toHaveClass("overflow-auto");

    cajaFilas.scrollLeft = 150;
    fireEvent.scroll(cajaFilas);
    expect(cajaCabecera.scrollLeft).toBe(150);

    cajaFilas.scrollLeft = 0;
    fireEvent.scroll(cajaFilas);
    expect(cajaCabecera.scrollLeft).toBe(0);
  });
});

// Fase 3.2.6 — la vista general de recepción: los turnos son de varias
// personas y la tabla tiene que decir de quién es cada uno.
describe("TarjetaTurnosDeHoy — la columna Profesional", () => {
  it("aparece cuando los turnos traen quién atiende", () => {
    montar([turno({ profesional: "Dra. Lucía Ferrer" })]);
    expect(screen.getByRole("columnheader", { name: "Profesional" })).toBeInTheDocument();
    expect(screen.getByText("Dra. Lucía Ferrer")).toBeInTheDocument();
  });

  // En la vista de un profesional todos los turnos son suyos: repetir su
  // nombre en cada fila sería ruido, y el backend directamente no manda
  // el dato.
  it("no aparece cuando no viene el dato", () => {
    montar([turno()]);
    expect(screen.queryByRole("columnheader", { name: "Profesional" })).not.toBeInTheDocument();
  });
});

describe("textoRestantes", () => {
  it("concuerda en singular y plural", () => {
    expect(textoRestantes(1)).toBe("Queda 1 turno más hoy.");
    expect(textoRestantes(4)).toBe("Quedan 4 turnos más hoy.");
  });
});

// QA de la 3.2.6 (2026-09-21): *"al tocar el horario me lleva a la
// tarjeta del turno, eso está bien, pero al tocar el nombre del
// paciente me debería llevar a la ficha"*.
//
// Son dos preguntas distintas —"¿qué pasa a esta hora?" y "¿quién es
// esta persona?"— y hasta acá las dos terminaban en el calendario.
describe("a dónde lleva cada celda", () => {
  it("el horario al turno en el calendario, el nombre a la ficha", () => {
    montar([turno({ pacienteId: "pac-1" })]);

    expect(screen.getByRole("link", { name: /12:00 a 12:30/ })).toHaveAttribute(
      "href",
      "/panel/calendario?vista=dia&fecha=2026-09-19&turno=t1",
    );
    expect(screen.getByRole("link", { name: "Juan Paciente" })).toHaveAttribute(
      "href",
      "/panel/pacientes/pac-1",
    );
  });

  // Un turno sin ficha vinculada: un link a ninguna parte sería peor
  // que el de siempre.
  it("sin ficha, el nombre se queda con el link al calendario", () => {
    montar([turno()]);

    expect(screen.getByRole("link", { name: "Juan Paciente" })).toHaveAttribute(
      "href",
      "/panel/calendario?vista=dia&fecha=2026-09-19&turno=t1",
    );
  });
});
