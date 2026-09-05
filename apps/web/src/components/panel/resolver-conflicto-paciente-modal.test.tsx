import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ConflictoPaciente, TipoConsulta, Turno } from "@dental-mirage/shared-types";

const { resolverConflictoPacienteActionMock } = vi.hoisted(() => ({
  resolverConflictoPacienteActionMock: vi.fn(),
}));
vi.mock("@/app/actions/pacientes", () => ({ resolverConflictoPacienteAction: resolverConflictoPacienteActionMock }));

const { ResolverConflictoPacienteModal } = await import("./resolver-conflicto-paciente-modal");

const pacienteVerificado = {
  id: "pac-1",
  nombre: "Bruno",
  apellido: "Iglesias",
  dni: "30111222",
  telefono: "+5493511234567",
  email: "bruno@example.com",
  createdAt: "",
  verificado: true,
};
const pacienteEnConflicto = { id: "pac-2", nombre: "Bruno", apellido: "Iglesias", dni: "30111222", telefono: "+5493510000000", email: "otro@example.com", createdAt: "" };
const tiposConsulta: TipoConsulta[] = [
  { id: "tc-1", nombre: "Consulta general", color: "#E7D9BE" },
  { id: "tc-2", nombre: "Ortodoncia", color: "#D6563A" },
];
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

describe("ResolverConflictoPacienteModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra los datos de las dos fichas, el motivo y el tipo/horario del turno en conflicto", () => {
    render(<ResolverConflictoPacienteModal conflicto={conflicto} tiposConsulta={tiposConsulta} onClose={vi.fn()} onResuelto={vi.fn()} />);

    expect(screen.getByText("se registró con otro mail")).toBeInTheDocument();
    expect(screen.getByText("Ficha verificada")).toBeInTheDocument();
    expect(screen.getByText("Ficha nueva (en conflicto)")).toBeInTheDocument();
    expect(screen.getByText("bruno@example.com")).toBeInTheDocument();
    expect(screen.getByText("otro@example.com")).toBeInTheDocument();
    expect(screen.getByText(/Consulta general/)).toBeInTheDocument();
  });

  // Corrección de QA, pedido textual del cliente: "si el paciente
  // verificado tiene ya un turno con ese tipo de consulta informar
  // también en el conflicto".
  it("con un turno vigente del mismo tipo, muestra el aviso de colisión", () => {
    const conflictoConColision: ConflictoPaciente = {
      ...conflicto,
      turnoVigenteDelMismoTipo: { ...turno, id: "turno-existente", horaInicio: "2030-06-01T09:00:00-03:00" },
    };
    render(<ResolverConflictoPacienteModal conflicto={conflictoConColision} tiposConsulta={tiposConsulta} onClose={vi.fn()} onResuelto={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("ya tiene un turno de Consulta general");
    expect(screen.getByRole("alert")).toHaveTextContent("no se migra");
  });

  it("sin turno vigente del mismo tipo, no muestra el aviso de colisión", () => {
    render(<ResolverConflictoPacienteModal conflicto={conflicto} tiposConsulta={tiposConsulta} onClose={vi.fn()} onResuelto={vi.fn()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Corrección de QA, pedido textual del cliente: "marcar como en
  // conflicto en la página de pacientes pero recomendar contactarse con
  // los 2" — el ticket se crea igual aunque ninguna de las dos fichas
  // esté verificada todavía.
  it("con ninguna ficha verificada, recomienda contactarse con las dos y no rotula ninguna como 'Ficha verificada'", () => {
    const conflictoSinVerificar: ConflictoPaciente = {
      ...conflicto,
      pacienteVerificado: { ...pacienteVerificado, verificado: false },
    };
    render(<ResolverConflictoPacienteModal conflicto={conflictoSinVerificar} tiposConsulta={tiposConsulta} onClose={vi.fn()} onResuelto={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Ninguna de las dos fichas está verificada todavía");
    expect(screen.getByRole("alert")).toHaveTextContent("contactate con las dos personas");
    expect(screen.queryByText("Ficha verificada")).not.toBeInTheDocument();
    expect(screen.getByText("Ficha original (sin verificar)")).toBeInTheDocument();
  });

  // "si tienen mismo número pero diferente mail, sugerir llamar el
  // teléfono... para solucionar el mal entendido" — pedido textual.
  it("con ninguna ficha verificada y mismo teléfono, agrega la sugerencia de llamar", () => {
    const conflictoMismoTelefono: ConflictoPaciente = {
      ...conflicto,
      pacienteVerificado: { ...pacienteVerificado, verificado: false, telefono: "+5493511111111" },
      pacienteEnConflicto: { ...pacienteEnConflicto, telefono: "+5493511111111" },
    };
    render(<ResolverConflictoPacienteModal conflicto={conflictoMismoTelefono} tiposConsulta={tiposConsulta} onClose={vi.fn()} onResuelto={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("podés llamar a ese número para resolverlo directamente");
  });

  it("con la ficha original verificada, no muestra la recomendación de contactar a los dos", () => {
    render(<ResolverConflictoPacienteModal conflicto={conflicto} tiposConsulta={tiposConsulta} onClose={vi.fn()} onResuelto={vi.fn()} />);
    expect(screen.queryByText(/Ninguna de las dos fichas está verificada/)).not.toBeInTheDocument();
  });

  it("cierra al tocar la X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ResolverConflictoPacienteModal conflicto={conflicto} tiposConsulta={tiposConsulta} onClose={onClose} onResuelto={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("'el mail es de la persona verificada' llama a la acción con esVerificado=true", async () => {
    resolverConflictoPacienteActionMock.mockResolvedValue({ ok: true });
    const onResuelto = vi.fn();
    const user = userEvent.setup();
    render(<ResolverConflictoPacienteModal conflicto={conflicto} tiposConsulta={tiposConsulta} onClose={vi.fn()} onResuelto={onResuelto} />);

    await user.click(screen.getByRole("button", { name: "El mail es de la persona verificada" }));

    expect(resolverConflictoPacienteActionMock).toHaveBeenCalledWith("conf-1", true);
    expect(onResuelto).toHaveBeenCalledTimes(1);
  });

  it("'el mail no es del paciente verificado' llama a la acción con esVerificado=false", async () => {
    resolverConflictoPacienteActionMock.mockResolvedValue({ ok: true });
    const onResuelto = vi.fn();
    const user = userEvent.setup();
    render(<ResolverConflictoPacienteModal conflicto={conflicto} tiposConsulta={tiposConsulta} onClose={vi.fn()} onResuelto={onResuelto} />);

    await user.click(screen.getByRole("button", { name: "El mail no es del paciente verificado" }));

    expect(resolverConflictoPacienteActionMock).toHaveBeenCalledWith("conf-1", false);
    expect(onResuelto).toHaveBeenCalledTimes(1);
  });

  it("en error, muestra el mensaje y no cierra", async () => {
    resolverConflictoPacienteActionMock.mockResolvedValue({ error: "este conflicto ya fue resuelto" });
    const onResuelto = vi.fn();
    const user = userEvent.setup();
    render(<ResolverConflictoPacienteModal conflicto={conflicto} tiposConsulta={tiposConsulta} onClose={vi.fn()} onResuelto={onResuelto} />);

    await user.click(screen.getByRole("button", { name: "El mail es de la persona verificada" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("este conflicto ya fue resuelto");
    expect(onResuelto).not.toHaveBeenCalled();
  });
});
