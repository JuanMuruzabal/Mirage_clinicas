import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { PantallaDiaHora } from "./pantalla-dia-hora";

// Fecha fija dentro de un mes completo, lejos de "hoy" real — así
// ninguna celda queda deshabilitada por "pasado" salvo las que se prueban
// a propósito (mismo criterio que fechaDePruebaDisponibilidad en el
// backend, apps/api/internal/http/disponibilidad_test.go).
const FECHA_PRUEBA = "2030-06-15";
const MES_PRUEBA = "2030-06";

const tipos = [{ nombre: "Consulta general", profesionales: 2 }];

// Dos profesionales para el mismo tipo (Fase 3.2.7): es el caso que hace
// aparecer el paso "¿con quién te querés atender?".
const profesionales = [
  { userId: "u-1", nombre: "Ana Gómez", tipoConsultaId: "tc-ana", duracionMinutos: 30, proximoDisponible: FECHA_PRUEBA },
  { userId: "u-2", nombre: "Beto Colega", tipoConsultaId: "tc-beto", duracionMinutos: 45 },
];

function renderPantalla(overrides: Partial<ComponentProps<typeof PantallaDiaHora>> = {}) {
  const props: ComponentProps<typeof PantallaDiaHora> = {
    tipos,
    tipoNombre: "Consulta general",
    onTipoNombreChange: vi.fn(),
    profesionales,
    profesionalId: "u-1",
    cargandoProfesionales: false,
    onProfesionalChange: vi.fn(),
    mostrarProfesionales: true,
    fecha: FECHA_PRUEBA,
    onFechaChange: vi.fn(),
    slots: ["09:00", "09:30"],
    cargandoSlots: false,
    hora: "",
    onHoraChange: vi.fn(),
    error: null,
    confirmando: false,
    onConfirmar: vi.fn(),
    onIrProximoDisponible: vi.fn(),
    onBack: vi.fn(),
    onClose: vi.fn(),
    mesVisible: MES_PRUEBA,
    diasConTurnos: ["2030-06-15", "2030-06-16"],
    cargandoMes: false,
    onMesChange: vi.fn(),
    ...overrides,
  };
  render(<PantallaDiaHora {...props} />);
  return props;
}

describe("PantallaDiaHora — panel de calendario mensual (3.8)", () => {
  it("nunca monta un <input type=\"date\"> nativo", () => {
    renderPantalla();
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument();
  });

  it("'Elegir fecha' despliega el panel dentro del flujo, sin popover", async () => {
    const user = userEvent.setup();
    renderPantalla();

    expect(screen.queryByRole("button", { name: "Mes siguiente" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Elegir fecha" }));

    expect(screen.getByRole("button", { name: "Cerrar calendario" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mes siguiente" })).toBeInTheDocument();
  });

  it("un día con turnos es seleccionable, elige la fecha y cierra el panel", async () => {
    const user = userEvent.setup();
    const props = renderPantalla();
    await user.click(screen.getByRole("button", { name: "Elegir fecha" }));

    await user.click(screen.getByRole("button", { name: "16" }));

    expect(props.onFechaChange).toHaveBeenCalledWith("2030-06-16");
    expect(screen.queryByRole("button", { name: "Cerrar calendario" })).not.toBeInTheDocument();
  });

  it("un día sin turnos queda deshabilitado", async () => {
    const user = userEvent.setup();
    renderPantalla();
    await user.click(screen.getByRole("button", { name: "Elegir fecha" }));

    expect(screen.getByRole("button", { name: "20" })).toBeDisabled();
  });

  it("Escape (con foco en un día) cierra el panel y devuelve el foco al botón", async () => {
    const user = userEvent.setup();
    renderPantalla();
    await user.click(screen.getByRole("button", { name: "Elegir fecha" }));
    screen.getByRole("button", { name: "16" }).focus();

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Elegir fecha" })).toHaveFocus();
  });

  it("las flechas del teclado mueven el foco entre días", async () => {
    const user = userEvent.setup();
    renderPantalla();
    await user.click(screen.getByRole("button", { name: "Elegir fecha" }));
    screen.getByRole("button", { name: "16" }).focus();

    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("button", { name: "17" })).toHaveFocus();
  });

  it("'Volver a hoy' pide el día de hoy", async () => {
    const user = userEvent.setup();
    const props = renderPantalla();
    await user.click(screen.getByRole("button", { name: "Elegir fecha" }));

    await user.click(screen.getByRole("button", { name: "Volver a hoy" }));

    expect(props.onFechaChange).toHaveBeenCalled();
  });

  it("pide la disponibilidad del mes recién al abrir el calendario, no antes", async () => {
    const user = userEvent.setup();
    const props = renderPantalla();

    expect(props.onMesChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Elegir fecha" }));

    expect(props.onMesChange).toHaveBeenCalledWith(MES_PRUEBA);
  });
});

describe("PantallaDiaHora — horarios agrupados por franja", () => {
  it("sin más de una franja con turnos, no muestra chips", () => {
    renderPantalla({ slots: ["09:00", "09:30"] });
    expect(screen.queryByRole("button", { name: /Mañana/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "09:00" })).toBeInTheDocument();
  });

  it("con turnos en más de una franja, muestra un chip por franja con su conteo", () => {
    renderPantalla({ slots: ["09:00", "13:00", "19:00"] });
    expect(screen.getByRole("button", { name: "Mañana (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tarde (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Noche (1)" })).toBeInTheDocument();
  });

  it("el contador de la derecha muestra el total del día, no el de la franja", () => {
    renderPantalla({ slots: ["09:00", "13:00", "19:00"] });
    expect(screen.getByText("3 turnos")).toBeInTheDocument();
  });

  it("tocar un chip cambia la tira a los horarios de esa franja", async () => {
    const user = userEvent.setup();
    renderPantalla({ slots: ["09:00", "19:00"] });
    expect(screen.getByRole("button", { name: "09:00" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Noche (1)" }));

    expect(screen.queryByRole("button", { name: "09:00" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "19:00" })).toBeInTheDocument();
  });
});

// El paso "¿con quién te querés atender?" (Fase 3.2.7). Va en esta misma
// pantalla y no en un paso aparte: el tipo determina la duración, la
// duración determina los huecos, y los tres se miran juntos.
describe("PantallaDiaHora — elegir profesional (Fase 3.2.7)", () => {
  it("con varios, muestra una tarjeta por profesional con su proximidad", () => {
    renderPantalla();

    expect(screen.getByRole("radio", { name: /Ana Gómez/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Beto Colega/ })).toBeInTheDocument();
    // La proximidad es lo que vuelve real la elección: entre dos nombres
    // que el paciente no conoce, con qué rapidez lo atienden es el
    // criterio que usa.
    expect(screen.getByText(/Primer turno: sáb 15/)).toBeInTheDocument();
    // Y quien no tiene hueco lo dice, en vez de mentir con una fecha
    // lejana o aparecer igual que los demás.
    expect(screen.getByText("Sin turnos en los próximos 30 días")).toBeInTheDocument();
  });

  it("la duración es la de cada profesional, no la del tipo", () => {
    renderPantalla();
    expect(screen.getByText("30 min")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
  });

  it("tocar una tarjeta avisa al padre", async () => {
    const user = userEvent.setup();
    const props = renderPantalla();

    await user.click(screen.getByRole("radio", { name: /Beto Colega/ }));

    expect(props.onProfesionalChange).toHaveBeenCalledWith("u-2");
  });

  it("con uno solo no pide elegir: dice quién atiende y sigue", () => {
    renderPantalla({ profesionales: [{ userId: "u-1", nombre: "Ana Gómez", tipoConsultaId: "tc-ana", duracionMinutos: 30 }] });

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
  });

  it("si nadie atiende ese tipo, lo dice en vez de dejar la pantalla muda", () => {
    renderPantalla({ profesionales: [] });
    expect(screen.getByText(/nadie de la clínica atiende este tipo/)).toBeInTheDocument();
  });

  it("con enlace no se pregunta: el turno es de quien lo generó", () => {
    renderPantalla({ mostrarProfesionales: false });

    expect(screen.queryByText("¿Con quién te querés atender?")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Ana Gómez/ })).not.toBeInTheDocument();
  });

  it("sin profesional elegido no se puede confirmar", () => {
    renderPantalla({ profesionalId: "", hora: "09:00" });
    expect(screen.getByRole("button", { name: "Confirmar turno" })).toBeDisabled();
  });
});
