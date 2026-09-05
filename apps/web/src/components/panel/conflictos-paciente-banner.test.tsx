import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ConflictoPaciente, TipoConsulta, Turno } from "@dental-mirage/shared-types";

const { refreshMock, resolverConflictoPacienteActionMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  resolverConflictoPacienteActionMock: vi.fn(),
}));
// mismo mock que agregar-paciente-button.test.tsx.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/app/actions/pacientes", () => ({ resolverConflictoPacienteAction: resolverConflictoPacienteActionMock }));

const { ConflictosPacienteBanner } = await import("./conflictos-paciente-banner");

const pacienteVerificado = { id: "pac-1", nombre: "Bruno", apellido: "Iglesias", dni: "30111222", telefono: "+5493511234567", email: "bruno@example.com", createdAt: "" };
const pacienteEnConflicto = { id: "pac-2", nombre: "Bruno", apellido: "Iglesias", dni: "30111222", telefono: "+5493510000000", email: "otro@example.com", createdAt: "" };
const tiposConsulta: TipoConsulta[] = [{ id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" }];
const turno: Turno = {
  id: "turno-1",
  estado: "agendado",
  origen: "pagina_publica",
  tipoConsultaId: "tc-1",
  horaInicio: "2030-06-03T10:00:00-03:00",
  horaFin: "2030-06-03T10:30:00-03:00",
  nombreContacto: "Bruno",
  apellidoContacto: "Iglesias",
  dniContacto: "30111222",
  telefonoContacto: "+5493510000000",
  emailContacto: "otro@example.com",
  motivo: "",
  createdAt: "",
};

const conflicto: ConflictoPaciente = {
  id: "conf-1",
  pacienteVerificado,
  pacienteEnConflicto,
  turno,
  motivo: "se registró con otro mail",
  createdAt: "",
};

describe("ConflictosPacienteBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no muestra nada sin conflictos", () => {
    render(<ConflictosPacienteBanner conflictos={[]} tiposConsulta={tiposConsulta} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("muestra el conteo (singular) y abre el modal de resolución al tocarlo", async () => {
    const user = userEvent.setup();
    render(<ConflictosPacienteBanner conflictos={[conflicto]} tiposConsulta={tiposConsulta} />);

    const banner = screen.getByRole("button", { name: /Tenés 1 conflicto de pacientes, tocá para ver/ });
    expect(banner).toBeInTheDocument();

    await user.click(banner);
    expect(screen.getByRole("dialog", { name: "Conflicto de pacientes" })).toBeInTheDocument();
    expect(screen.getByText("se registró con otro mail")).toBeInTheDocument();
  });

  it("muestra el conteo en plural con más de un conflicto", () => {
    render(<ConflictosPacienteBanner conflictos={[conflicto, { ...conflicto, id: "conf-2" }]} tiposConsulta={tiposConsulta} />);
    expect(screen.getByRole("button", { name: /Tenés 2 conflictos de pacientes, tocá para ver/ })).toBeInTheDocument();
  });

  it("al resolver, cierra el modal y refresca la página", async () => {
    resolverConflictoPacienteActionMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ConflictosPacienteBanner conflictos={[conflicto]} tiposConsulta={tiposConsulta} />);

    await user.click(screen.getByRole("button", { name: /tocá para ver/ }));
    await user.click(screen.getByRole("button", { name: "El mail es de la persona verificada" }));

    expect(resolverConflictoPacienteActionMock).toHaveBeenCalledWith("conf-1", true);
    expect(await screen.findByRole("button", { name: /tocá para ver/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
