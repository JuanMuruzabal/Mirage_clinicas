import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  solicitarTurnoPublicoActionMock,
  listTiposConsultaPublicoActionMock,
  listDisponibilidadPublicaActionMock,
  enviarVerificacionEmailActionMock,
  confirmarVerificacionEmailActionMock,
  pacienteVerificadoPublicoActionMock,
} = vi.hoisted(() => ({
  solicitarTurnoPublicoActionMock: vi.fn(),
  listTiposConsultaPublicoActionMock: vi.fn(),
  listDisponibilidadPublicaActionMock: vi.fn(),
  enviarVerificacionEmailActionMock: vi.fn(),
  confirmarVerificacionEmailActionMock: vi.fn(),
  pacienteVerificadoPublicoActionMock: vi.fn(),
}));
vi.mock("@/app/actions/turno-publico", () => ({
  solicitarTurnoPublicoAction: solicitarTurnoPublicoActionMock,
  listTiposConsultaPublicoAction: listTiposConsultaPublicoActionMock,
  listDisponibilidadPublicaAction: listDisponibilidadPublicaActionMock,
  enviarVerificacionEmailAction: enviarVerificacionEmailActionMock,
  confirmarVerificacionEmailAction: confirmarVerificacionEmailActionMock,
  pacienteVerificadoPublicoAction: pacienteVerificadoPublicoActionMock,
}));

const { PedirTurnoForm } = await import("./pedir-turno-form");

const tiposConsulta = [{ id: "tc-1", nombre: "Consulta general", color: "#E7D9BE", duracionMinutos: 30 }];

// avanzarAPrimeraVez/avanzarAYaVine — Fase 2.4.1: el wizard ahora arranca
// con "¿Para quién es el turno?" / "¿Ya te has atendido con nosotros?"
// antes de llegar a los pasos que ya existían.
async function avanzarAPrimeraVez(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Para mí" }));
  await user.click(screen.getByRole("button", { name: "Es mi primera vez" }));
}

async function avanzarAYaVine(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Para mí" }));
  await user.click(screen.getByRole("button", { name: "Ya he venido anteriormente" }));
}

async function completarContacto(user: ReturnType<typeof userEvent.setup>) {
  await avanzarAPrimeraVez(user);
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
    localStorage.clear();
    listTiposConsultaPublicoActionMock.mockResolvedValue(tiposConsulta);
    listDisponibilidadPublicaActionMock.mockResolvedValue({ slots: ["10:00", "10:15"] });
    enviarVerificacionEmailActionMock.mockResolvedValue({ ok: true });
    confirmarVerificacionEmailActionMock.mockResolvedValue({ token: "token-de-prueba" });
    // Corrección de QA: confirmarCodigo ahora SIEMPRE chequea si el DNI ya
    // pertenece a una ficha verificada con ese mail (los dos caminos,
    // "primera vez" incluido) — sin match por default, el camino
    // "primera vez" sigue de largo como siempre.
    pacienteVerificadoPublicoActionMock.mockResolvedValue({ error: "no encontramos un paciente verificado con esos datos" });
  });

  it("arranca preguntando para quién es el turno", () => {
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica="+5493511234567" />);

    expect(screen.getByText("¿Para quién es el turno?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Para otro" })).toBeDisabled();
  });

  it("'Para mí' lleva a la pregunta de si ya se atendió antes", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await user.click(screen.getByRole("button", { name: "Para mí" }));

    expect(screen.getByText("¿Ya te has atendido con nosotros?")).toBeInTheDocument();
  });

  it("valida el DNI antes de pasar a verificación", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica="+5493511234567" />);

    await avanzarAPrimeraVez(user);
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

    expect(enviarVerificacionEmailActionMock).toHaveBeenCalledWith("clinica-x", "bruno@example.com", "");
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

  it("en local (codigoDev en la respuesta), muestra el código debajo del campo", async () => {
    enviarVerificacionEmailActionMock.mockResolvedValue({ ok: true, codigoDev: "482913" });
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await completarContacto(user);

    expect(await screen.findByText("482913")).toBeInTheDocument();
    expect(screen.getByText(/Modo desarrollo/)).toBeInTheDocument();
  });

  it("sin codigoDev en la respuesta (producción), no muestra el aviso de desarrollo", async () => {
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await completarContacto(user);

    expect(screen.queryByText(/Modo desarrollo/)).not.toBeInTheDocument();
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

  // Corrección de QA sobre TR-107 (regla universal: "sea paciente
  // verificado o no verificado solo puede tener un turno activo con el
  // mismo dni, sea el tipo de consulta que sea"): el error de turno
  // activo suma un contacto directo por WhatsApp (con el teléfono de la
  // clínica).
  it("con un turno activo, muestra el contacto por WhatsApp", async () => {
    solicitarTurnoPublicoActionMock.mockResolvedValue({
      error: "ya tenés un turno pendiente, con mail muru...@gmail.com. No podés sacar otro turno — por cualquier consulta o modificación, contactate con la clínica.",
    });
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica="+549 351 123-4567" />);

    await avanzarHastaTurno(user);
    await user.click(screen.getByRole("button", { name: "Confirmar turno" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ya tenés un turno pendiente");
    const link = screen.getByRole("link", { name: "Escribir por WhatsApp" });
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/5493511234567"));
  });

  it("con un turno activo sin teléfono de clínica, no muestra el contacto por WhatsApp", async () => {
    solicitarTurnoPublicoActionMock.mockResolvedValue({
      error: "ya tenés un turno pendiente, con mail muru...@gmail.com. No podés sacar otro turno — por cualquier consulta o modificación, contactate con la clínica.",
    });
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await avanzarHastaTurno(user);
    await user.click(screen.getByRole("button", { name: "Confirmar turno" }));

    await screen.findByRole("alert");
    expect(screen.queryByRole("link", { name: "Escribir por WhatsApp" })).not.toBeInTheDocument();
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

  // Corrección de QA, pedido textual del documento: "si el paciente...
  // se va por el camino de 'primera vez'... si el DNI es el mismo y el
  // mail el mismo que tiene el paciente confirmado, redirigirlo a la
  // selección de pacientes del segundo camino".
  it("primera vez con DNI/mail de una ficha ya verificada, redirige a la tarjeta en vez de seguir a turno", async () => {
    pacienteVerificadoPublicoActionMock.mockResolvedValue({ paciente: { id: "pac-1", nombre: "Bruno I.", dni: "30***222" } });
    const user = userEvent.setup();
    render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

    await completarContacto(user);
    await completarVerificacion(user);

    expect(pacienteVerificadoPublicoActionMock).toHaveBeenCalledWith("clinica-x", "30111222", "bruno@example.com", "token-de-prueba");
    expect(await screen.findByText("¿Sos vos?")).toBeInTheDocument();
    expect(screen.queryByText("Tipo de consulta")).not.toBeInTheDocument();
  });

  describe("camino 'ya he venido antes' (Fase 2.4.1)", () => {
    async function completarYaVineDatos(user: ReturnType<typeof userEvent.setup>) {
      await avanzarAYaVine(user);
      await user.type(screen.getByLabelText("DNI"), "30111222");
      await user.type(screen.getByLabelText("Email"), "bruno@example.com");
      await user.click(screen.getByRole("button", { name: "Continuar" }));
    }

    it("pide DNI + mail, manda el código y confirma la tarjeta del paciente encontrado", async () => {
      pacienteVerificadoPublicoActionMock.mockResolvedValue({ paciente: { id: "pac-1", nombre: "Bruno I.", dni: "30***222" } });
      const user = userEvent.setup();
      render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      await completarYaVineDatos(user);
      expect(enviarVerificacionEmailActionMock).toHaveBeenCalledWith("clinica-x", "bruno@example.com", "");

      await completarVerificacion(user);
      expect(pacienteVerificadoPublicoActionMock).toHaveBeenCalledWith("clinica-x", "30111222", "bruno@example.com", "token-de-prueba");

      expect(await screen.findByText("¿Sos vos?")).toBeInTheDocument();
      expect(screen.getByText("Bruno I.")).toBeInTheDocument();
      expect(screen.getByText("DNI 30***222")).toBeInTheDocument();
    });

    it("al confirmar la tarjeta, salta directo a turno y manda pacienteVerificadoId", async () => {
      pacienteVerificadoPublicoActionMock.mockResolvedValue({ paciente: { id: "pac-1", nombre: "Bruno I.", dni: "30***222" } });
      solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" });
      const user = userEvent.setup();
      render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      await completarYaVineDatos(user);
      await completarVerificacion(user);
      await user.click(await screen.findByRole("button", { name: "Sí, soy yo — continuar" }));

      await screen.findByText("Tipo de consulta");
      await user.click(screen.getByRole("button", { name: "Confirmar turno" }));

      expect(await screen.findByText(/¡Listo!/)).toBeInTheDocument();
      expect(solicitarTurnoPublicoActionMock).toHaveBeenCalledWith(
        "clinica-x",
        expect.objectContaining({
          pacienteVerificadoId: "pac-1",
          emailContacto: "bruno@example.com",
          verificacionToken: "token-de-prueba",
          tipoConsultaId: "tc-1",
        }),
      );
      const llamada = solicitarTurnoPublicoActionMock.mock.calls[0][1];
      expect(llamada.nombreContacto).toBeUndefined();
      expect(llamada.dniContacto).toBeUndefined();
    });

    it("sin ficha verificada, ofrece empezar como paciente nuevo", async () => {
      pacienteVerificadoPublicoActionMock.mockResolvedValue({ error: "no encontramos un paciente verificado con esos datos" });
      const user = userEvent.setup();
      render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      await completarYaVineDatos(user);
      await completarVerificacion(user);

      expect(await screen.findByText("No encontramos una ficha verificada con esos datos.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Empezar como paciente nuevo →" }));

      expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
      expect(screen.getByLabelText("DNI")).toHaveValue("30111222");
    });

    it("'No soy yo' vuelve al paso de datos", async () => {
      pacienteVerificadoPublicoActionMock.mockResolvedValue({ paciente: { id: "pac-1", nombre: "Bruno I.", dni: "30***222" } });
      const user = userEvent.setup();
      render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      await completarYaVineDatos(user);
      await completarVerificacion(user);
      await screen.findByText("¿Sos vos?");
      await user.click(screen.getByRole("button", { name: "No soy yo" }));

      expect(screen.getByText("Contanos con qué datos te registraste")).toBeInTheDocument();
    });
  });

  // Pedido textual del cliente (2026-09-05): si el wizard se cierra sin
  // querer (mobile: tocar afuera, la pestaña se recicla) y se vuelve a
  // abrir, debe retomar el paso en el que estaba en vez de arrancar de
  // cero — evita perder el código ya solicitado y reescribir todos los
  // datos de contacto de nuevo.
  describe("persistencia del progreso (localStorage)", () => {
    it("al cerrarse y volver a montar, retoma el paso 'Confirmanos que sos vos' con el mail ya cargado", async () => {
      const user = userEvent.setup();
      const { unmount } = render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      await completarContacto(user);
      await screen.findByText("Confirmanos que sos vos");

      // PedirTurnoButton desmonta este componente por completo al cerrar
      // el modal (accidental o no) — se simula acá desmontando y montando
      // una instancia nueva, exactamente lo que pasa al reabrir.
      unmount();
      render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      expect(screen.getByText("Confirmanos que sos vos")).toBeInTheDocument();
      expect(screen.getByText("bruno@example.com")).toBeInTheDocument();
    });

    it("retoma el paso 'turno' con el tipo de consulta y la fecha ya elegidos", async () => {
      const user = userEvent.setup();
      const { unmount } = render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      await avanzarHastaTurno(user);
      await screen.findByRole("button", { name: "Confirmar turno" });

      unmount();
      render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      expect(await screen.findByText("Tipo de consulta")).toBeInTheDocument();
      expect(listDisponibilidadPublicaActionMock).toHaveBeenCalledWith("clinica-x", "tc-1", expect.any(String));
    });

    it("con progreso guardado de OTRA clínica (otro slug), no lo mezcla — arranca de cero", async () => {
      const user = userEvent.setup();
      const { unmount } = render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);
      await completarContacto(user);
      await screen.findByText("Confirmanos que sos vos");
      unmount();

      render(<PedirTurnoForm slug="clinica-y" nombreClinica="Clínica Y" telefonoClinica={null} />);

      expect(screen.getByText("¿Para quién es el turno?")).toBeInTheDocument();
    });

    it("al confirmar el turno con éxito, borra el progreso guardado", async () => {
      solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" });
      const user = userEvent.setup();
      render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      await avanzarHastaTurno(user);
      await user.click(screen.getByRole("button", { name: "Confirmar turno" }));
      await screen.findByText(/¡Listo!/);

      expect(localStorage.length).toBe(0);
    });

    it("con un progreso guardado vencido (más de 30 minutos), arranca de cero", () => {
      localStorage.setItem(
        "dental-mirage:pedir-turno:clinica-x",
        JSON.stringify({
          version: 1,
          guardadoEn: Date.now() - 31 * 60 * 1000,
          paso: "turno",
          flujo: "primera-vez",
          campos: { nombreContacto: "Bruno", apellidoContacto: "Iglesias", dniContacto: "30111222", telefonoContacto: "", emailContacto: "", motivo: "" },
          yaVineDni: "",
          emailEnVerificacion: "bruno@example.com",
          verificacionToken: "token-viejo",
          pacienteVerificado: null,
          tipoConsultaId: "tc-1",
          fecha: "2030-06-03",
          hora: "10:00",
        }),
      );

      render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      expect(screen.getByText("¿Para quién es el turno?")).toBeInTheDocument();
    });

    it("con datos corruptos en localStorage, no rompe y arranca de cero", () => {
      localStorage.setItem("dental-mirage:pedir-turno:clinica-x", "esto no es JSON válido{{{");

      render(<PedirTurnoForm slug="clinica-x" nombreClinica="Clínica X" telefonoClinica={null} />);

      expect(screen.getByText("¿Para quién es el turno?")).toBeInTheDocument();
    });
  });
});
