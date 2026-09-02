import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  solicitarTurnoPublicoActionMock,
  listTiposConsultaPublicoActionMock,
  listDisponibilidadPublicaActionMock,
  enviarVerificacionEmailActionMock,
  confirmarVerificacionEmailActionMock,
} = vi.hoisted(() => ({
  solicitarTurnoPublicoActionMock: vi.fn(),
  listTiposConsultaPublicoActionMock: vi.fn(),
  listDisponibilidadPublicaActionMock: vi.fn(),
  enviarVerificacionEmailActionMock: vi.fn(),
  confirmarVerificacionEmailActionMock: vi.fn(),
}));
vi.mock("@/app/actions/turno-publico", () => ({
  solicitarTurnoPublicoAction: solicitarTurnoPublicoActionMock,
  listTiposConsultaPublicoAction: listTiposConsultaPublicoActionMock,
  listDisponibilidadPublicaAction: listDisponibilidadPublicaActionMock,
  enviarVerificacionEmailAction: enviarVerificacionEmailActionMock,
  confirmarVerificacionEmailAction: confirmarVerificacionEmailActionMock,
}));

const { PedirTurnoForm } = await import("./pedir-turno-form");

const tiposConsulta = [{ id: "tc-1", nombre: "Consulta general", color: "#E7D9BE", duracionMinutos: 30 }];

async function completarContacto(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombre"), "Bruno");
  await user.type(screen.getByLabelText("Apellido"), "Iglesias");
  await user.type(screen.getByLabelText("DNI"), "30111222");
  await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
  await user.type(screen.getByLabelText("Email"), "bruno@example.com");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

async function completarVerificacion(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Código de verificación"), "123456");
  await user.click(screen.getByRole("button", { name: "Confirmar código" }));
}

async function avanzarHastaTurno(user: ReturnType<typeof userEvent.setup>) {
  await completarContacto(user);
  await completarVerificacion(user);
  await screen.findByText("Tipo de consulta");
}

describe("PedirTurnoForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTiposConsultaPublicoActionMock.mockResolvedValue(tiposConsulta);
    listDisponibilidadPublicaActionMock.mockResolvedValue({ slots: ["10:00", "10:15"] });
    enviarVerificacionEmailActionMock.mockResolvedValue({ ok: true });
    confirmarVerificacionEmailActionMock.mockResolvedValue({ token: "token-de-prueba" });
  });

  it("valida el DNI antes de pasar a verificación", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica="+5493511234567" />);

    await user.type(screen.getByLabelText("Nombre"), "Bruno");
    await user.type(screen.getByLabelText("Apellido"), "Iglesias");
    await user.type(screen.getByLabelText("DNI"), "123");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
    await user.type(screen.getByLabelText("Email"), "bruno@example.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/DNI debe tener 7 u 8 dígitos/);
    expect(enviarVerificacionEmailActionMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Confirmanos que sos vos")).not.toBeInTheDocument();
  });

  it("al continuar con datos válidos, manda el código y muestra 'Confirmanos que sos vos'", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await completarContacto(user);

    expect(enviarVerificacionEmailActionMock).toHaveBeenCalledWith("clinica-x", "bruno@example.com");
    expect(await screen.findByText("Confirmanos que sos vos")).toBeInTheDocument();
    expect(screen.getByText("bruno@example.com")).toBeInTheDocument();
  });

  it("código incorrecto: muestra el error y no avanza a tipo de consulta", async () => {
    confirmarVerificacionEmailActionMock.mockResolvedValue({ error: "el código es incorrecto o ya venció" });
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await completarContacto(user);
    await completarVerificacion(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("el código es incorrecto o ya venció");
    expect(screen.queryByText("Tipo de consulta")).not.toBeInTheDocument();
  });

  it("'Reenviar código' vuelve a pedir el código y avisa", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await completarContacto(user);
    await user.click(await screen.findByRole("button", { name: "Reenviar código" }));

    expect(enviarVerificacionEmailActionMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Te mandamos un código nuevo.")).toBeInTheDocument();
  });

  it("'Atrás' desde verificación vuelve al paso de contacto sin perder los datos tipeados", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await completarContacto(user);
    await screen.findByText("Confirmanos que sos vos");
    await user.click(screen.getByRole("button", { name: "Atrás" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("Bruno");
    expect(screen.getByLabelText("DNI")).toHaveValue("30111222");
  });

  it("en éxito con teléfono de clínica, muestra confirmación y el link de WhatsApp", async () => {
    solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" });
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica="+549 351 123-4567" />);

    await avanzarHastaTurno(user);
    // Paso "turno": tipo y hora ya vienen auto-elegidos (primer tipo/slot).
    await user.click(screen.getByRole("button", { name: "Confirmar turno" }));

    expect(await screen.findByText(/¡Listo!/)).toBeInTheDocument();
    expect(solicitarTurnoPublicoActionMock).toHaveBeenCalledWith(
      "clinica-x",
      expect.objectContaining({
        nombreContacto: "Bruno",
        apellidoContacto: "Iglesias",
        dniContacto: "30111222",
        telefonoContacto: "+5493511234567",
        emailContacto: "bruno@example.com",
        motivo: undefined,
        tipoConsultaId: "tc-1",
        hora: "10:00",
        verificacionToken: "token-de-prueba",
      }),
    );
    const link = screen.getByRole("link", { name: "Escribir también por WhatsApp" });
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/5493511234567"));
  });

  it("en éxito sin teléfono de clínica, muestra confirmación sin link de WhatsApp", async () => {
    solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" });
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await avanzarHastaTurno(user);
    await user.click(screen.getByRole("button", { name: "Confirmar turno" }));

    expect(await screen.findByText(/¡Listo!/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Escribir también por WhatsApp" })).not.toBeInTheDocument();
  });

  it("muestra el error que devuelve la acción (p. ej. horario ya no disponible)", async () => {
    solicitarTurnoPublicoActionMock.mockResolvedValue({ error: "ese horario ya no está disponible, elegí otro" });
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await avanzarHastaTurno(user);
    await user.click(screen.getByRole("button", { name: "Confirmar turno" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ese horario ya no está disponible, elegí otro");
  });

  it("'Atrás' desde turno vuelve al paso de verificación", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await avanzarHastaTurno(user);
    await user.click(screen.getByRole("button", { name: "Atrás" }));

    expect(screen.getByText("Confirmanos que sos vos")).toBeInTheDocument();
  });

  it("pide los tipos de consulta y la disponibilidad al llegar al paso de turno", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await avanzarHastaTurno(user);

    expect(listTiposConsultaPublicoActionMock).toHaveBeenCalledWith("clinica-x");
    expect(listDisponibilidadPublicaActionMock).toHaveBeenCalledWith("clinica-x", "tc-1", expect.any(String));
  });
});
