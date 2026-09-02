import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fechaISOLocal } from "@/lib/calendar-utils";

const { reprogramarTurnoActionMock, listDisponibilidadActionMock } = vi.hoisted(() => ({
  reprogramarTurnoActionMock: vi.fn(),
  listDisponibilidadActionMock: vi.fn(),
}));
vi.mock("@/app/actions/turnos", () => ({
  reprogramarTurnoAction: reprogramarTurnoActionMock,
}));
// F2.3 (corrección de QA): EditarHoraForm ya no arma el selector de hora
// con un <input type="time"> + horario de atención propio — pide los
// horarios YA calculados como disponibles a /disponibilidad (vía Server
// Action), excluyendo el propio turno que se está reprogramando. Sin
// este mock, el useEffect llama a la Server Action de verdad (unhandled
// rejection fuera de un request real de Next.js).
vi.mock("@/app/actions/calendario-config", () => ({
  listDisponibilidadAction: listDisponibilidadActionMock,
}));

const { EditarTurnoModal } = await import("./editar-turno-modal");

// Todos los cuartos de hora del día — lista amplia a propósito, para que
// cualquier hora "actual" que precargue un turno de prueba (siempre en
// punto o en cuarto, ver los fixtures de abajo) aparezca entre los
// horarios "disponibles" del mock sin tener que calcularla a mano por
// cada test.
const TODOS_LOS_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const totalMin = i * 15;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
  const mm = String(totalMin % 60).padStart(2, "0");
  return `${hh}:${mm}`;
});

const tiposConsulta = [{ id: "tc-1", nombre: "Consulta general", color: "#E7D9BE", duracionMinutos: 30 }];

// HoraPicker (corrección de QA, F2.3: "que se vean algunos en pantalla e
// ir scrolleando", y "que aparezca colapsada... y quede solo el horario
// seleccionado en la barra") ya no es un <select> nativo ni una lista
// siempre visible — arranca colapsado, mostrando el horario ya elegido
// en la propia barra (aria-label dinámico "Hora: <valor>", ver el
// comentario del componente), sin necesidad de desplegar la lista para
// leerlo. Se busca por coincidencia parcial ("Hora"), no texto exacto,
// porque el aria-label completo cambia con cada horario. En vez de
// `.not.toHaveValue("")` se espera a que esa barra deje de mostrar
// "Buscando horarios…" (ver hora-picker.test.tsx).
function esperarHoraCargada() {
  return waitFor(() => expect(screen.getByLabelText(/^Hora/)).not.toHaveTextContent("Buscando horarios"));
}

// Turno `pendiente` sacado del todo en Extra 2.3.3 (TR-104) — este modal
// ya solo tiene una forma posible (EditarHoraForm, siempre edita el
// horario), así que un solo fixture "agendado" alcanza. `origen: "manual"`
// es el caso con motivo editable; `turnoPaginaPublica` (más abajo) cubre
// el caso E3.3 con motivo de solo lectura.
const turnoAgendado = {
  id: "turno-2",
  estado: "agendado" as const,
  origen: "manual" as const,
  nombreContacto: "Bruno",
  apellidoContacto: "Iglesias",
  dniContacto: "30111222",
  telefonoContacto: "+5493511234567",
  emailContacto: "bruno@example.com",
  motivo: "Dolor de muela",
  createdAt: new Date().toISOString(),
  tipoConsultaId: "tc-1",
  horaInicio: "2026-09-01T13:00:00.000Z",
  horaFin: "2026-09-01T13:30:00.000Z",
};

describe("EditarTurnoModal — turno agendado (solo edita el horario)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDisponibilidadActionMock.mockResolvedValue({ slots: TODOS_LOS_SLOTS });
  });

  it("no muestra los campos de contacto", () => {
    render(<EditarTurnoModal turno={turnoAgendado} tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("DNI")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Hora/)).toBeInTheDocument();
  });

  it("precarga fecha/hora a partir del horario actual del turno", async () => {
    render(<EditarTurnoModal turno={turnoAgendado} tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    // horaInicio es 2026-09-01T13:00:00Z (UTC) — el valor mostrado depende
    // del timezone local del entorno de test, así que solo verificamos que
    // el input viene con algo cargado, no un valor específico. La hora
    // arranca sin ninguna opción marcada mientras se pide la
    // disponibilidad real (el HoraPicker solo muestra "Buscando
    // horarios…") y se completa apenas resuelve /disponibilidad.
    expect(screen.getByLabelText("Fecha")).not.toHaveValue("");
    await esperarHoraCargada();
  });

  // Corrección de QA (2026-09-06): "desde mi iphone si puedo seleccionar
  // fechas pasadas... indispensable en el día del turno, no mostrar días
  // anteriores" — usa el calendario nativo del celular, que sí respeta
  // `min` para no ofrecer días anteriores a hoy.
  it("el selector de fecha no ofrece días pasados", () => {
    render(<EditarTurnoModal turno={turnoAgendado} tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByLabelText("Fecha")).toHaveAttribute("min", fechaISOLocal());
  });

  it("pide la disponibilidad excluyendo el propio turno que se está reprogramando", async () => {
    render(<EditarTurnoModal turno={turnoAgendado} tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await waitFor(() =>
      expect(listDisponibilidadActionMock).toHaveBeenCalledWith("tc-1", expect.any(String), "turno-2"),
    );
  });

  it("guarda el nuevo horario con reprogramarTurnoAction y llama a onSuccess", async () => {
    reprogramarTurnoActionMock.mockResolvedValue({ turno: { ...turnoAgendado, horaInicio: "2026-09-02T13:00:00.000Z" } });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoAgendado} tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={onSuccess} />);

    await esperarHoraCargada();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(reprogramarTurnoActionMock).toHaveBeenCalledWith("turno-2", expect.objectContaining({
      horaInicio: expect.any(String),
      horaFin: expect.any(String),
    }));
    expect(onSuccess).toHaveBeenCalledWith({ ...turnoAgendado, horaInicio: "2026-09-02T13:00:00.000Z" });
  });

  it("precarga el motivo actual y permite editarlo antes de guardar (origen manual)", async () => {
    reprogramarTurnoActionMock.mockResolvedValue({ turno: turnoAgendado });
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoAgendado} tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const motivo = screen.getByLabelText("Motivo de consulta (opcional)");
    expect(motivo).toHaveValue("Dolor de muela");

    await user.clear(motivo);
    await user.type(motivo, "Control de rutina");
    await esperarHoraCargada();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(reprogramarTurnoActionMock).toHaveBeenCalledWith("turno-2", expect.objectContaining({ motivo: "Control de rutina" }));
  });

  // Extra 2.3.3 (E3.3, TR-104), acceptance criterion textual: "intentar
  // editarlo en un turno de origen 'pagina_publica' no ofrece la opción"
  // — el motivo de un turno pedido desde la página pública se muestra de
  // solo lectura, nunca como un input editable.
  it("un turno de origen 'pagina_publica' no ofrece la opción de editar el motivo", async () => {
    const turnoPaginaPublica = { ...turnoAgendado, id: "turno-3", origen: "pagina_publica" as const };
    reprogramarTurnoActionMock.mockResolvedValue({ turno: turnoPaginaPublica });
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoPaginaPublica} tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.queryByLabelText("Motivo de consulta (opcional)")).not.toBeInTheDocument();
    expect(screen.getByText("Dolor de muela")).toBeInTheDocument();
    expect(screen.getByText(/no permiten editar el motivo acá/)).toBeInTheDocument();

    // El horario se sigue pudiendo reprogramar igual — solo el motivo
    // queda de solo lectura.
    await esperarHoraCargada();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(reprogramarTurnoActionMock).toHaveBeenCalledWith("turno-3", expect.objectContaining({ motivo: "Dolor de muela" }));
  });

  it("muestra el error de solapamiento (T2.5) que devuelve la acción", async () => {
    reprogramarTurnoActionMock.mockResolvedValue({ error: "ese horario se superpone con otro turno ya agendado" });
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoAgendado} tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await esperarHoraCargada();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("se superpone");
  });

  it("no permite mover el turno a una fecha pasada", async () => {
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoAgendado} tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await esperarHoraCargada();
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2020-01-01" } });
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("fecha pasada");
    expect(reprogramarTurnoActionMock).not.toHaveBeenCalled();
  });

  // F2.3 (corrección de QA): "solo me tiene que salir seleccionables los
  // horarios que entran en mi agenda" — sin ningún horario disponible
  // (ej.: día completamente bloqueado), no se puede guardar.
  it("no permite guardar sin ningún horario disponible", async () => {
    listDisponibilidadActionMock.mockResolvedValue({ slots: [] });
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoAgendado} tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("No hay horarios disponibles")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Elegí un horario disponible");
    expect(reprogramarTurnoActionMock).not.toHaveBeenCalled();
  });

  it("un turno ya resuelto (horario pasado) permite guardar sin tocar la fecha — solo corrige el motivo", async () => {
    const turnoResuelto = { ...turnoAgendado, horaInicio: "2020-01-01T13:00:00.000Z", horaFin: "2020-01-01T13:30:00.000Z" };
    reprogramarTurnoActionMock.mockResolvedValue({ turno: turnoResuelto });
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoResuelto} tiposConsulta={tiposConsulta} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const motivo = screen.getByLabelText("Motivo de consulta (opcional)");
    await user.clear(motivo);
    await user.type(motivo, "Motivo corregido");
    await esperarHoraCargada();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(reprogramarTurnoActionMock).toHaveBeenCalledWith("turno-2", expect.objectContaining({ motivo: "Motivo corregido" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("se cierra con el botón Cancelar y con la X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditarTurnoModal turno={turnoAgendado} tiposConsulta={tiposConsulta} onClose={onClose} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
