import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock, crearPacienteActionMock, sumarPacienteAMiListaActionMock, listPacientesActionMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  crearPacienteActionMock: vi.fn(),
  sumarPacienteAMiListaActionMock: vi.fn(),
  listPacientesActionMock: vi.fn(),
}));
// mismo mock que pacientes-table.test.tsx/clickable-table-row.test.tsx.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
// El modal pregunta a qué agenda va la ficha (Fase 3.2.6) — sin
// mockearlo corre la Server Action de verdad y `cookies()` explota fuera
// de un request.
vi.mock("@/app/actions/topbar-panel", () => ({
  opcionesDeAgendaAction: async () => ({
    profesionales: [{ userId: "u1", nombre: "Lucía Gómez", detalle: "Ortodoncia" }],
    miUserId: "u1",
    puedeElegirOtros: false,
    focoActual: null,
  }),
  elegirVistaAction: async () => ({}),
}));
vi.mock("@/app/actions/pacientes", () => ({
  crearPacienteAction: crearPacienteActionMock,
  sumarPacienteAMiListaAction: sumarPacienteAMiListaActionMock,
  // La pestaña "De la clínica" la llama al montarse (2026-09-19).
  listPacientesAction: listPacientesActionMock,
}));

const { AgregarPacienteButton } = await import("./agregar-paciente-button");

describe("AgregarPacienteButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPacientesActionMock.mockResolvedValue([]);
  });

  it("abre y cierra el modal", async () => {
    const user = userEvent.setup();
    render(<AgregarPacienteButton />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ Agregar paciente" }));
    expect(screen.getByRole("dialog", { name: "Agregar paciente" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al crear un paciente, cierra el modal y refresca la página", async () => {
    crearPacienteActionMock.mockResolvedValue({
      paciente: { id: "pac-1", nombre: "Bruno", apellido: "Iglesias", dni: "30111222", telefono: "+549", createdAt: new Date().toISOString() },
    });
    const user = userEvent.setup();
    render(<AgregarPacienteButton />);

    await user.click(screen.getByRole("button", { name: "+ Agregar paciente" }));
    // El modal abre en "De la clínica" desde el 2026-09-19; el alta vive
    // detrás de la otra pestaña.
    await user.click(screen.getByRole("button", { name: "Paciente nuevo" }));
    await user.type(screen.getByLabelText("Nombre"), "Bruno");
    await user.type(screen.getByLabelText("Apellido"), "Iglesias");
    await user.type(screen.getByLabelText("DNI"), "30111222");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
    // Obligatorio desde el 2026-09-15, ver agregar-paciente-modal.test.tsx.
    await user.type(screen.getByLabelText("Email"), "bruno@example.com");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByText("+ Agregar paciente")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
