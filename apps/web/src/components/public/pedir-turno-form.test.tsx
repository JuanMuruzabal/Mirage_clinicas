import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, type ComponentProps } from "react";

const {
  solicitarTurnoPublicoActionMock,
  listTiposConsultaPublicoActionMock,
  listDisponibilidadPublicaActionMock,
  enviarVerificacionEmailActionMock,
  confirmarVerificacionEmailActionMock,
  pacienteVerificadoPublicoActionMock,
  pacientesVerificadosDeTutorActionMock,
} = vi.hoisted(() => ({
  solicitarTurnoPublicoActionMock: vi.fn(),
  listTiposConsultaPublicoActionMock: vi.fn(),
  listDisponibilidadPublicaActionMock: vi.fn(),
  enviarVerificacionEmailActionMock: vi.fn(),
  confirmarVerificacionEmailActionMock: vi.fn(),
  pacienteVerificadoPublicoActionMock: vi.fn(),
  pacientesVerificadosDeTutorActionMock: vi.fn(),
}));
vi.mock("@/app/actions/turno-publico", () => ({
  solicitarTurnoPublicoAction: solicitarTurnoPublicoActionMock,
  listTiposConsultaPublicoAction: listTiposConsultaPublicoActionMock,
  listDisponibilidadPublicaAction: listDisponibilidadPublicaActionMock,
  enviarVerificacionEmailAction: enviarVerificacionEmailActionMock,
  confirmarVerificacionEmailAction: confirmarVerificacionEmailActionMock,
  pacienteVerificadoPublicoAction: pacienteVerificadoPublicoActionMock,
  pacientesVerificadosDeTutorAction: pacientesVerificadosDeTutorActionMock,
}));

const { PedirTurnoForm } = await import("./pedir-turno-form");

const tiposConsulta = [{ id: "tc-1", nombre: "Consulta general", color: "#E7D9BE", duracionMinutos: 30 }];

// renderForm — todo test necesita `onClose` (rediseño §3.1: la [×] ahora
// vive adentro de cada pantalla, ver pedir-turno-form.tsx) — se provee un
// no-op por default para no repetirlo en cada `render(...)`.
function renderForm(props: Omit<ComponentProps<typeof PedirTurnoForm>, "onClose"> & { onClose?: () => void }) {
  return render(<PedirTurnoForm onClose={() => {}} {...props} />);
}

// avanzarAPrimeraVez/avanzarAYaVine — el wizard arranca con "¿Para quién
// es el turno?" / "¿Ya te atendiste con nosotros?" antes de llegar a los
// pasos de datos. Rediseño (docs/Fase 2/turnero_pagina/rediseno-flujo-turnos.md §3.5): elegir
// una tarjeta ya no avanza sola — hace falta tocar "Continuar" aparte.
async function avanzarAPrimeraVez(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("Para mí"));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.click(screen.getByText("Es mi primera vez"));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

async function avanzarAYaVine(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("Para mí"));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.click(screen.getByText("Ya vine antes"));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

async function completarContacto(user: ReturnType<typeof userEvent.setup>) {
  await avanzarAPrimeraVez(user);
  await user.type(screen.getByLabelText("Nombre"), "Bruno");
  await user.type(screen.getByLabelText("Apellido"), "Iglesias");
  await user.type(screen.getByLabelText("DNI"), "30111222");
  // Campo de teléfono compuesto (país + número local, §5 [3a]): el país
  // por default es AR (+54) — el número local completa el mismo valor
  // final ("+5493511234567") que antes se tipeaba de un tirón.
  await user.type(screen.getByLabelText("Teléfono"), "93511234567");
  await user.type(screen.getByLabelText("Email"), "bruno@example.com");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

// completarVerificacion — [4] pasa de un campo único a 6 casillas
// separadas (§5 [4]) con aria-label "Dígito N" cada una.
async function completarVerificacion(user: ReturnType<typeof userEvent.setup>, codigo = "123456") {
  for (let i = 0; i < codigo.length; i++) {
    await user.type(screen.getByLabelText(`Dígito ${i + 1}`), codigo[i]);
  }
  await user.click(screen.getByRole("button", { name: "Confirmar" }));
}

async function avanzarHastaTurno(user: ReturnType<typeof userEvent.setup>) {
  await completarContacto(user);
  await completarVerificacion(user);
  await screen.findByText("Tipo de consulta");
  // Rediseño (§5 [6]): el horario ya no viene preseleccionado — son
  // fichas tocables con estado "seleccionada" visible, hace falta tocar
  // una para habilitar "Confirmar turno".
  await user.click(screen.getByRole("button", { name: "10:00" }));
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
    pacientesVerificadosDeTutorActionMock.mockResolvedValue({ error: "no encontramos un paciente verificado con esos datos" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("arranca preguntando para quién es el turno", () => {
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: "+5493511234567" });

    expect(screen.getByText("¿Para quién es el turno?")).toBeInTheDocument();
    expect(screen.getByText("Para mí")).toBeInTheDocument();
    expect(screen.getByText("Para otra persona")).toBeInTheDocument();
  });

  it("'Para mí' + Continuar lleva a la pregunta de si ya se atendió antes", async () => {
    const user = userEvent.setup();
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

    await user.click(screen.getByText("Para mí"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("¿Ya te atendiste con nosotros?")).toBeInTheDocument();
  });

  it("'Continuar' en [1] queda deshabilitado hasta elegir una tarjeta", () => {
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("valida el DNI antes de pasar a verificación", async () => {
    const user = userEvent.setup();
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: "+5493511234567" });

    await avanzarAPrimeraVez(user);
    await user.type(screen.getByLabelText("Nombre"), "Bruno");
    await user.type(screen.getByLabelText("Apellido"), "Iglesias");
    await user.type(screen.getByLabelText("DNI"), "123");
    await user.type(screen.getByLabelText("Teléfono"), "93511234567");
    await user.type(screen.getByLabelText("Email"), "bruno@example.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/DNI debe tener 7 u 8 dígitos/);
    expect(enviarVerificacionEmailActionMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Confirmanos que sos vos")).not.toBeInTheDocument();
  });

  it("al continuar con datos válidos, manda el código y muestra 'Confirmanos que sos vos'", async () => {
    const user = userEvent.setup();
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

    await completarContacto(user);

    expect(enviarVerificacionEmailActionMock).toHaveBeenCalledWith("clinica-x", "bruno@example.com", "");
    expect(await screen.findByText("Confirmanos que sos vos")).toBeInTheDocument();
    expect(screen.getByText("bruno@example.com")).toBeInTheDocument();
  });

  it("código incorrecto: muestra el error y no avanza a tipo de consulta", async () => {
    confirmarVerificacionEmailActionMock.mockResolvedValue({ error: "el código es incorrecto o ya venció" });
    const user = userEvent.setup();
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

    await completarContacto(user);
    await completarVerificacion(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("el código es incorrecto o ya venció");
    expect(screen.queryByText("Tipo de consulta")).not.toBeInTheDocument();
  });

  it("en local (codigoDev en la respuesta), muestra el código en el bloque 'solo dev'", async () => {
    enviarVerificacionEmailActionMock.mockResolvedValue({ ok: true, codigoDev: "482913" });
    const user = userEvent.setup();
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

    await completarContacto(user);

    expect(await screen.findByText("482913")).toBeInTheDocument();
    expect(screen.getByText("solo dev")).toBeInTheDocument();
  });

  it("sin codigoDev en la respuesta (producción), no muestra el bloque de desarrollo", async () => {
    const user = userEvent.setup();
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

    await completarContacto(user);
    await screen.findByText("Confirmanos que sos vos");

    expect(screen.queryByText("solo dev")).not.toBeInTheDocument();
  });

  it("'Reenviar código', tras la cuenta regresiva, vuelve a pedir el código", async () => {
    // `shouldAdvanceTime` deja correr el reloj real de fondo (para que
    // las esperas asíncronas de Testing Library/userEvent no se
    // cuelguen) mientras `advanceTimersByTime` de abajo salta el
    // `setInterval` de la cuenta regresiva sin esperar 30 segundos
    // reales — necesita instalarse ANTES de montar (el intervalo del
    // componente se crea con la referencia de timer vigente al montar).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

    await completarContacto(user);
    await screen.findByText("Confirmanos que sos vos");

    // "Reenviar código en 0:30" arranca deshabilitado (§5 [4]).
    expect(screen.queryByRole("button", { name: "Reenviar código" })).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    await user.click(screen.getByRole("button", { name: "Reenviar código" }));

    expect(enviarVerificacionEmailActionMock).toHaveBeenCalledTimes(2);
  });

  it("'Atrás' desde verificación vuelve al paso de contacto sin perder los datos tipeados", async () => {
    const user = userEvent.setup();
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

    await completarContacto(user);
    await screen.findByText("Confirmanos que sos vos");
    await user.click(screen.getByRole("button", { name: "Atrás" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("Bruno");
    expect(screen.getByLabelText("DNI")).toHaveValue("30111222");
  });

  it("en éxito con teléfono de clínica, muestra confirmación y el link de WhatsApp", async () => {
    solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" });
    const user = userEvent.setup();
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: "+549 351 123-4567" });

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
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

    await avanzarHastaTurno(user);
    await user.click(screen.getByRole("button", { name: "Confirmar turno" }));

    expect(await screen.findByText(/¡Listo!/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Escribir también por WhatsApp" })).not.toBeInTheDocument();
  });

  it("muestra el error que devuelve la acción (p. ej. horario ya no disponible)", async () => {
    solicitarTurnoPublicoActionMock.mockResolvedValue({ error: "ese horario ya no está disponible, elegí otro" });
    const user = userEvent.setup();
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

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
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: "+549 351 123-4567" });

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
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

    await avanzarHastaTurno(user);
    await user.click(screen.getByRole("button", { name: "Confirmar turno" }));

    await screen.findByRole("alert");
    expect(screen.queryByRole("link", { name: "Escribir por WhatsApp" })).not.toBeInTheDocument();
  });

  it("'Atrás' desde turno vuelve al paso de verificación", async () => {
    const user = userEvent.setup();
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

    await avanzarHastaTurno(user);
    await user.click(screen.getByRole("button", { name: "Atrás" }));

    expect(screen.getByText("Confirmanos que sos vos")).toBeInTheDocument();
  });

  it("pide los tipos de consulta y la disponibilidad al llegar al paso de turno", async () => {
    const user = userEvent.setup();
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

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
    renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

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
      await user.click(screen.getByRole("button", { name: "Enviar código" }));
    }

    it("pide DNI + mail, manda el código y confirma la tarjeta del paciente encontrado", async () => {
      pacienteVerificadoPublicoActionMock.mockResolvedValue({ paciente: { id: "pac-1", nombre: "Bruno I.", dni: "30***222" } });
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

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
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      await completarYaVineDatos(user);
      await completarVerificacion(user);
      await user.click(await screen.findByRole("button", { name: "Sí, soy yo" }));

      await screen.findByText("Tipo de consulta");
      await user.click(screen.getByRole("button", { name: "10:00" }));
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
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      await completarYaVineDatos(user);
      await completarVerificacion(user);

      expect(await screen.findByText("No encontramos una ficha verificada con esos datos.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Empezar como paciente nuevo" }));

      expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
      expect(screen.getByLabelText("DNI")).toHaveValue("30111222");
    });

    it("'No soy yo' vuelve al paso de datos", async () => {
      pacienteVerificadoPublicoActionMock.mockResolvedValue({ paciente: { id: "pac-1", nombre: "Bruno I.", dni: "30***222" } });
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      await completarYaVineDatos(user);
      await completarVerificacion(user);
      await screen.findByText("¿Sos vos?");
      await user.click(screen.getByRole("button", { name: "No soy yo" }));

      expect(screen.getByText("Buscamos tu ficha")).toBeInTheDocument();
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
      const { unmount } = renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      await completarContacto(user);
      await screen.findByText("Confirmanos que sos vos");

      // PedirTurnoButton desmonta este componente por completo al cerrar
      // el modal (accidental o no) — se simula acá desmontando y montando
      // una instancia nueva, exactamente lo que pasa al reabrir.
      unmount();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      expect(screen.getByText("Confirmanos que sos vos")).toBeInTheDocument();
      expect(screen.getByText("bruno@example.com")).toBeInTheDocument();
    });

    it("retoma el paso 'turno' con el tipo de consulta y la fecha ya elegidos", async () => {
      const user = userEvent.setup();
      const { unmount } = renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      await avanzarHastaTurno(user);
      await screen.findByRole("button", { name: "Confirmar turno" });

      unmount();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      expect(await screen.findByText("Tipo de consulta")).toBeInTheDocument();
      expect(listDisponibilidadPublicaActionMock).toHaveBeenCalledWith("clinica-x", "tc-1", expect.any(String));
    });

    it("con progreso guardado de OTRA clínica (otro slug), no lo mezcla — arranca de cero", async () => {
      const user = userEvent.setup();
      const { unmount } = renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });
      await completarContacto(user);
      await screen.findByText("Confirmanos que sos vos");
      unmount();

      renderForm({ slug: "clinica-y", nombreClinica: "Clínica Y", telefonoClinica: null });

      expect(screen.getByText("¿Para quién es el turno?")).toBeInTheDocument();
    });

    it("al confirmar el turno con éxito, borra el progreso guardado", async () => {
      solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" });
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

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

      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      expect(screen.getByText("¿Para quién es el turno?")).toBeInTheDocument();
    });

    it("con datos corruptos en localStorage, no rompe y arranca de cero", () => {
      localStorage.setItem("dental-mirage:pedir-turno:clinica-x", "esto no es JSON válido{{{");

      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      expect(screen.getByText("¿Para quién es el turno?")).toBeInTheDocument();
    });
  });

  // Fase 2.4.2 — camino "para otro": reusa la MISMA pregunta
  // "ya-te-atendiste" que "para mí" (el flag `esOtro` decide a cuál grupo
  // de pasos saltar desde ahí, ver pedir-turno-form.tsx).
  describe("camino 'para otro' (Fase 2.4.2)", () => {
    async function avanzarAOtroPrimeraVez(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByText("Para otra persona"));
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      await user.click(screen.getByText("Es mi primera vez"));
      await user.click(screen.getByRole("button", { name: "Continuar" }));
    }

    async function avanzarAOtroYaVine(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByText("Para otra persona"));
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      await user.click(screen.getByText("Ya vine antes"));
      await user.click(screen.getByRole("button", { name: "Continuar" }));
    }

    it("'Para otra persona' lleva a la misma pregunta de siempre", async () => {
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      await user.click(screen.getByText("Para otra persona"));
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      expect(screen.getByText("¿Ya te atendiste con nosotros?")).toBeInTheDocument();
    });

    it("primera vez: pide datos del tutor y LUEGO del paciente (2 pasos), verifica el mail del tutor y llega a turno", async () => {
      solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" });
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      await avanzarAOtroPrimeraVez(user);

      // Paso 1: solo datos del tutor — todavía no se ven campos del
      // paciente.
      expect(screen.getByText("Primero, tus datos")).toBeInTheDocument();
      expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText("Sos su…"), "familiar");
      await user.type(screen.getByLabelText("Tu nombre completo"), "María Pérez");
      await user.type(screen.getByLabelText("Tu teléfono"), "93511111111");
      await user.type(screen.getByLabelText("Tu email"), "mama@example.com");
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      expect(enviarVerificacionEmailActionMock).not.toHaveBeenCalled();

      // Paso 2: datos del paciente — recién acá se manda el código.
      expect(await screen.findByText("Datos de la persona que se atiende")).toBeInTheDocument();
      expect(screen.queryByLabelText("Tu nombre completo")).not.toBeInTheDocument();
      await user.type(screen.getByLabelText("Nombre"), "Juanito");
      await user.type(screen.getByLabelText("Apellido"), "Pérez");
      await user.type(screen.getByLabelText("DNI"), "40111222");
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      expect(enviarVerificacionEmailActionMock).toHaveBeenCalledWith("clinica-x", "mama@example.com", "");

      await completarVerificacion(user);
      await screen.findByText("Tipo de consulta");
      await user.click(screen.getByRole("button", { name: "10:00" }));

      await user.click(screen.getByRole("button", { name: "Confirmar turno" }));
      await screen.findByText(/¡Listo!/);

      expect(solicitarTurnoPublicoActionMock).toHaveBeenCalledWith(
        "clinica-x",
        expect.objectContaining({
          paraOtro: true,
          nombreContacto: "Juanito",
          apellidoContacto: "Pérez",
          dniContacto: "40111222",
          tutorRelacion: "familiar",
          tutorNombre: "María Pérez",
          tutorEmail: "mama@example.com",
        }),
      );
    });

    it("primera vez: 'Atrás' desde 'Datos de la persona que se atiende' vuelve a 'Primero, tus datos' sin perder lo tipeado", async () => {
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      await avanzarAOtroPrimeraVez(user);
      await user.selectOptions(screen.getByLabelText("Sos su…"), "familiar");
      await user.type(screen.getByLabelText("Tu nombre completo"), "María Pérez");
      await user.type(screen.getByLabelText("Tu teléfono"), "93511111111");
      await user.type(screen.getByLabelText("Tu email"), "mama@example.com");
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      await screen.findByText("Datos de la persona que se atiende");
      await user.click(screen.getByRole("button", { name: "Atrás" }));

      expect(await screen.findByText("Primero, tus datos")).toBeInTheDocument();
      expect(screen.getByLabelText("Tu nombre completo")).toHaveValue("María Pérez");
    });

    it("ya he venido antes: busca por mail del tutor y muestra una LISTA de fichas", async () => {
      pacientesVerificadosDeTutorActionMock.mockResolvedValue({
        pacientes: [
          { id: "pac-1", nombre: "Juanito P.", dni: "40***222" },
          { id: "pac-2", nombre: "Anita P.", dni: "41***333" },
        ],
      });
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      await avanzarAOtroYaVine(user);
      await user.type(screen.getByLabelText("Tu email"), "mama@example.com");
      await user.click(screen.getByRole("button", { name: "Enviar código" }));
      await completarVerificacion(user);

      expect(pacientesVerificadosDeTutorActionMock).toHaveBeenCalledWith("clinica-x", "mama@example.com", "token-de-prueba");
      expect(await screen.findByText("¿Para quién es el turno?")).toBeInTheDocument();
      expect(screen.getByText("Juanito P.")).toBeInTheDocument();
      expect(screen.getByText("Anita P.")).toBeInTheDocument();

      // Rediseño (§5 [5b]): ninguna ficha viene preseleccionada — elegir
      // una fila no alcanza, hace falta "Continuar" aparte.
      await user.click(screen.getByText("Juanito P."));
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      await screen.findByText("Tipo de consulta");
    });

    it("ya he venido antes, sin match: ofrece empezar como paciente nuevo (vuelve al formulario completo)", async () => {
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null });

      await avanzarAOtroYaVine(user);
      await user.type(screen.getByLabelText("Tu email"), "papa@example.com");
      await user.click(screen.getByRole("button", { name: "Enviar código" }));
      await completarVerificacion(user);

      await user.click(await screen.findByRole("button", { name: "Empezar como paciente nuevo" }));
      expect(screen.getByLabelText("Tu nombre completo")).toBeInTheDocument();
    });
  });

  // Fase 2, ítem 5 ("compartir calendario") — con enlaceToken el wizard se
  // recorre COMPLETO, paso por paso, igual que sin enlace (incluida [2]
  // "¿Ya te atendiste?" con sus 2 caminos) — lo único que cambia son las 3
  // "trabas" de seguridad que el profesional no necesita acá: no se manda
  // código de verificación, no se muestra el CAPTCHA, y el pedido final
  // manda `enlaceToken` en vez de `verificacionToken`.
  describe("con enlaceToken (Fase 2, ítem 5 — compartir calendario)", () => {
    it("'Para mí' sigue mostrando la pregunta de si ya se atendió antes (no se saltea ningún paso)", async () => {
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null, enlaceToken: "enlace-1" });

      await user.click(screen.getByText("Para mí"));
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      expect(screen.getByText("¿Ya te atendiste con nosotros?")).toBeInTheDocument();
    });

    it("primera vez con enlace, sin ficha ya verificada: no manda código ni muestra el CAPTCHA, va directo al turno", async () => {
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null, enlaceToken: "enlace-2" });

      await avanzarAPrimeraVez(user);
      await user.type(screen.getByLabelText("Nombre"), "Bruno");
      await user.type(screen.getByLabelText("Apellido"), "Iglesias");
      await user.type(screen.getByLabelText("DNI"), "30111222");
      await user.type(screen.getByLabelText("Teléfono"), "93511234567");
      await user.type(screen.getByLabelText("Email"), "bruno@example.com");
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      expect(pacienteVerificadoPublicoActionMock).toHaveBeenCalledWith("clinica-x", "30111222", "bruno@example.com", "", "enlace-2");
      expect(enviarVerificacionEmailActionMock).not.toHaveBeenCalled();
      expect(await screen.findByText("Tipo de consulta")).toBeInTheDocument();
      expect(screen.queryByText("Confirmanos que sos vos")).not.toBeInTheDocument();
    });

    // El pedido textual del cliente: "al igual que pasa cuando pongo mi
    // dni y mail verificado en el camino 'es mi primera vez' le tendria
    // que mostrar la tarjeta" — mismo chequeo retroactivo de
    // confirmarCodigo(), reusado acá sin código de por medio.
    it("primera vez con enlace: si el DNI+mail ya pertenecen a una ficha verificada, muestra la tarjeta en vez de seguir a turno", async () => {
      solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" });
      pacienteVerificadoPublicoActionMock.mockResolvedValue({ paciente: { id: "pac-1", nombre: "Bruno I.", dni: "30***222" } });
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null, enlaceToken: "enlace-3" });

      await avanzarAPrimeraVez(user);
      await user.type(screen.getByLabelText("Nombre"), "Bruno");
      await user.type(screen.getByLabelText("Apellido"), "Iglesias");
      await user.type(screen.getByLabelText("DNI"), "30111222");
      await user.type(screen.getByLabelText("Teléfono"), "93511234567");
      await user.type(screen.getByLabelText("Email"), "bruno@example.com");
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      expect(await screen.findByText("¿Sos vos?")).toBeInTheDocument();
      expect(screen.getByText("Bruno I.")).toBeInTheDocument();
      expect(screen.queryByText("Tipo de consulta")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Sí, soy yo" }));
      await screen.findByText("Tipo de consulta");
      await user.click(screen.getByRole("button", { name: "10:00" }));
      await user.click(screen.getByRole("button", { name: "Confirmar turno" }));
      await screen.findByText(/¡Listo!/);

      expect(solicitarTurnoPublicoActionMock).toHaveBeenCalledWith(
        "clinica-x",
        expect.objectContaining({ enlaceToken: "enlace-3", pacienteVerificadoId: "pac-1" }),
      );
      const payload = solicitarTurnoPublicoActionMock.mock.calls[0][1];
      expect(payload.verificacionToken).toBeUndefined();
    });

    it("el pedido final manda enlaceToken en vez de verificacionToken", async () => {
      solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" });
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null, enlaceToken: "enlace-3b" });

      await avanzarAPrimeraVez(user);
      await user.type(screen.getByLabelText("Nombre"), "Bruno");
      await user.type(screen.getByLabelText("Apellido"), "Iglesias");
      await user.type(screen.getByLabelText("DNI"), "30111222");
      await user.type(screen.getByLabelText("Teléfono"), "93511234567");
      await user.type(screen.getByLabelText("Email"), "bruno@example.com");
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      await screen.findByText("Tipo de consulta");
      await user.click(screen.getByRole("button", { name: "10:00" }));
      await user.click(screen.getByRole("button", { name: "Confirmar turno" }));

      expect(await screen.findByText(/¡Listo!/)).toBeInTheDocument();
      const payload = solicitarTurnoPublicoActionMock.mock.calls[0][1];
      expect(payload.enlaceToken).toBe("enlace-3b");
      expect(payload.verificacionToken).toBeUndefined();
    });

    it("'ya vine antes' con enlace: busca directo (sin código) y muestra la tarjeta si hay match", async () => {
      pacienteVerificadoPublicoActionMock.mockResolvedValue({ paciente: { id: "pac-1", nombre: "Bruno I.", dni: "30***222" } });
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null, enlaceToken: "enlace-4" });

      await avanzarAYaVine(user);
      await user.type(screen.getByLabelText("DNI"), "30111222");
      await user.type(screen.getByLabelText("Email"), "bruno@example.com");
      await user.click(screen.getByRole("button", { name: "Buscar" }));

      expect(enviarVerificacionEmailActionMock).not.toHaveBeenCalled();
      expect(pacienteVerificadoPublicoActionMock).toHaveBeenCalledWith("clinica-x", "30111222", "bruno@example.com", "", "enlace-4");
      expect(await screen.findByText("¿Sos vos?")).toBeInTheDocument();
      expect(screen.getByText("Bruno I.")).toBeInTheDocument();
      expect(screen.queryByText("Confirmanos que sos vos")).not.toBeInTheDocument();
    });

    it("'ya vine antes' con enlace, sin match: ofrece empezar como paciente nuevo (sin pantalla de código)", async () => {
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null, enlaceToken: "enlace-5" });

      await avanzarAYaVine(user);
      await user.type(screen.getByLabelText("DNI"), "30111222");
      await user.type(screen.getByLabelText("Email"), "nadie@example.com");
      await user.click(screen.getByRole("button", { name: "Buscar" }));

      expect(await screen.findByText("No encontramos una ficha verificada con esos datos.")).toBeInTheDocument();
      expect(screen.queryByText("Confirmanos que sos vos")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Empezar como paciente nuevo" }));
      expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    });

    it("'Para otra persona' + primera vez con enlace: pasa por [2] igual que siempre y no manda código", async () => {
      solicitarTurnoPublicoActionMock.mockResolvedValue({ id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" });
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null, enlaceToken: "enlace-6" });

      await user.click(screen.getByText("Para otra persona"));
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      expect(screen.getByText("¿Ya te atendiste con nosotros?")).toBeInTheDocument();
      await user.click(screen.getByText("Es mi primera vez"));
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      expect(screen.getByText("Primero, tus datos")).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText("Sos su…"), "familiar");
      await user.type(screen.getByLabelText("Tu nombre completo"), "María Pérez");
      await user.type(screen.getByLabelText("Tu teléfono"), "93511111111");
      await user.type(screen.getByLabelText("Tu email"), "mama@example.com");
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      expect(enviarVerificacionEmailActionMock).not.toHaveBeenCalled();
      expect(await screen.findByText("Datos de la persona que se atiende")).toBeInTheDocument();

      await user.type(screen.getByLabelText("Nombre"), "Juanito");
      await user.type(screen.getByLabelText("Apellido"), "Pérez");
      await user.type(screen.getByLabelText("DNI"), "40111222");
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      expect(await screen.findByText("Tipo de consulta")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "10:00" }));
      await user.click(screen.getByRole("button", { name: "Confirmar turno" }));
      await screen.findByText(/¡Listo!/);

      expect(solicitarTurnoPublicoActionMock).toHaveBeenCalledWith(
        "clinica-x",
        expect.objectContaining({ enlaceToken: "enlace-6", paraOtro: true, tutorEmail: "mama@example.com" }),
      );
    });

    it("'Para otra persona' + 'ya vine antes' con enlace: busca por mail del tutor directo, sin código, y muestra la lista", async () => {
      pacientesVerificadosDeTutorActionMock.mockResolvedValue({
        pacientes: [{ id: "pac-1", nombre: "Juanito P.", dni: "40***222" }],
      });
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null, enlaceToken: "enlace-7" });

      await user.click(screen.getByText("Para otra persona"));
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      await user.click(screen.getByText("Ya vine antes"));
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      await user.type(screen.getByLabelText("Tu email"), "mama@example.com");
      await user.click(screen.getByRole("button", { name: "Buscar" }));

      expect(enviarVerificacionEmailActionMock).not.toHaveBeenCalled();
      expect(pacientesVerificadosDeTutorActionMock).toHaveBeenCalledWith("clinica-x", "mama@example.com", "", "enlace-7");
      expect(await screen.findByText("¿Para quién es el turno?")).toBeInTheDocument();
      expect(screen.getByText("Juanito P.")).toBeInTheDocument();
    });

    it("con enlace, 'Atrás' desde turno vuelve a los datos de contacto (sin pasar por ninguna pantalla de código)", async () => {
      const user = userEvent.setup();
      renderForm({ slug: "clinica-x", nombreClinica: "Clínica X", telefonoClinica: null, enlaceToken: "enlace-8" });

      await avanzarAPrimeraVez(user);
      await user.type(screen.getByLabelText("Nombre"), "Bruno");
      await user.type(screen.getByLabelText("Apellido"), "Iglesias");
      await user.type(screen.getByLabelText("DNI"), "30111222");
      await user.type(screen.getByLabelText("Teléfono"), "93511234567");
      await user.type(screen.getByLabelText("Email"), "bruno@example.com");
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      await screen.findByText("Tipo de consulta");

      await user.click(screen.getByRole("button", { name: "Atrás" }));

      expect(await screen.findByLabelText("Nombre")).toHaveValue("Bruno");
      expect(screen.queryByText("Confirmanos que sos vos")).not.toBeInTheDocument();
    });
  });
});
