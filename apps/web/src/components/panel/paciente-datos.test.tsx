import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { editarPacienteActionMock } = vi.hoisted(() => ({ editarPacienteActionMock: vi.fn() }));
vi.mock("@/app/actions/pacientes", () => ({ editarPacienteAction: editarPacienteActionMock }));

const { PacienteDatos } = await import("./paciente-datos");

const paciente = {
  id: "pac-1",
  nombre: "Bruno",
  apellido: "Iglesias",
  dni: "30111222",
  telefono: "+5493511234567",
  email: "bruno@example.com",
  createdAt: new Date().toISOString(),
};

describe("PacienteDatos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra DNI, teléfono y email", () => {
    render(<PacienteDatos pacienteInicial={paciente} />);
    expect(screen.getByText("30111222")).toBeInTheDocument();
    expect(screen.getByText("+5493511234567")).toBeInTheDocument();
    expect(screen.getByText("bruno@example.com")).toBeInTheDocument();
  });

  it("muestra — cuando no hay email", () => {
    render(<PacienteDatos pacienteInicial={{ ...paciente, email: null }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  // Corrección de QA: "Ver mail" (Extra 2.3.4/E4.1) faltaba acá — mismo
  // componente que ya aplica en la tabla de Pacientes.
  it("email largo: se oculta detrás de 'Ver email', con el texto completo en el modal", async () => {
    const emailLargo = "bruno.alejandro.iglesias.paciente.frecuente@clinica-ejemplo.com.ar";
    const user = userEvent.setup();
    render(<PacienteDatos pacienteInicial={{ ...paciente, email: emailLargo }} />);

    expect(screen.getByRole("button", { name: "Ver email" })).toBeInTheDocument();
    expect(screen.queryByText(emailLargo)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver email" }));
    const dialogo = await screen.findByRole("dialog", { name: "Email" });
    expect(within(dialogo).getByText(emailLargo)).toBeInTheDocument();
  });

  // Fase 2.4.1, corrección de QA: mails/teléfonos migrados por una
  // resolución de conflicto ("el mail es de la persona verificada") se
  // agrupan detrás de "Ver mails"/"Ver teléfonos" en vez de mostrar solo
  // el principal. Sin flecha (segunda ronda de correcciones, 2026-09-06:
  // "quitar de los botones el '->'" — no son navegación, abren un modal).
  describe("mails/teléfonos alternativos (Fase 2.4.1)", () => {
    it("con un solo mail alternativo, agrupa detrás de 'Ver mails'", async () => {
      const user = userEvent.setup();
      render(<PacienteDatos pacienteInicial={paciente} emailsAlternativos={["bruno.alt@example.com"]} />);

      expect(screen.queryByText("bruno@example.com")).not.toBeInTheDocument();
      const boton = screen.getByRole("button", { name: "Ver mails" });
      await user.click(boton);

      const dialogo = await screen.findByRole("dialog", { name: "Mails" });
      expect(dialogo).toHaveTextContent("bruno@example.com");
      expect(dialogo).toHaveTextContent("bruno.alt@example.com");
    });

    it("con un teléfono alternativo, agrupa detrás de 'Ver teléfonos'", async () => {
      const user = userEvent.setup();
      render(<PacienteDatos pacienteInicial={paciente} telefonosAlternativos={["+5493519999999"]} />);

      expect(screen.queryByText("+5493511234567")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Ver teléfonos" }));

      const dialogo = await screen.findByRole("dialog", { name: "Teléfonos" });
      expect(dialogo).toHaveTextContent("+5493511234567");
      expect(dialogo).toHaveTextContent("+5493519999999");
    });

    // Bug real reportado por el cliente, 2026-09-05: "se migró todo menos
    // el mail" — con la ficha verificada SIN mail propio, el único mail
    // alternativo migrado no entraba en la rama "> 1" y el respaldo
    // mostraba el mail principal (vacío) en vez del alternativo.
    it("con la ficha SIN mail propio y un solo mail alternativo, muestra ese mail (no '—')", () => {
      render(<PacienteDatos pacienteInicial={{ ...paciente, email: null }} emailsAlternativos={["migrado@example.com"]} />);

      expect(screen.getByText("migrado@example.com")).toBeInTheDocument();
      expect(screen.queryByText("—")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ver mails" })).not.toBeInTheDocument();
    });

    it("con la ficha SIN mail propio y un mail alternativo largo, se oculta detrás de 'Ver email'", async () => {
      const emailLargo = "bruno.alejandro.iglesias.paciente.frecuente@clinica-ejemplo.com.ar";
      const user = userEvent.setup();
      render(<PacienteDatos pacienteInicial={{ ...paciente, email: null }} emailsAlternativos={[emailLargo]} />);

      expect(screen.getByRole("button", { name: "Ver email" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Ver email" }));
      const dialogo = await screen.findByRole("dialog", { name: "Email" });
      expect(within(dialogo).getByText(emailLargo)).toBeInTheDocument();
    });

    it("sin alternativos, muestra el mail/teléfono principal como siempre", () => {
      render(<PacienteDatos pacienteInicial={paciente} />);
      expect(screen.queryByRole("button", { name: "Ver mails" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ver teléfonos" })).not.toBeInTheDocument();
      expect(screen.getByText("bruno@example.com")).toBeInTheDocument();
      expect(screen.getByText("+5493511234567")).toBeInTheDocument();
    });
  });

  // Fase 2.4.2, rediseñado en la ronda de correcciones (2026-09-06): un
  // paciente puede tener MÁS de un tutor — cada uno aparece como su
  // propia tarjeta dentro de "Datos de tutores" (antes era un único set
  // de campos con un solo tutor).
  describe("Datos de tutores (ronda de correcciones, 2026-09-06)", () => {
    const tutor1 = { relacion: "familiar", nombre: "Julián Ortiz", telefono: "+5493511111111", email: "julian@example.com" };
    const tutor2 = { relacion: "otro", nombre: "Abuela Rosa", telefono: "+5493512222222", email: "rosa@example.com" };

    it("sin tutores, no muestra la sección", () => {
      render(<PacienteDatos pacienteInicial={paciente} />);
      expect(screen.queryByText("Datos de tutores")).not.toBeInTheDocument();
    });

    it("con un tutor, muestra la sección con sus datos (sin DNI)", () => {
      render(<PacienteDatos pacienteInicial={{ ...paciente, tutores: [tutor1] }} />);
      expect(screen.getByText("Datos de tutores")).toBeInTheDocument();
      expect(screen.getByText("Julián Ortiz")).toBeInTheDocument();
      expect(screen.getByText("Familiar")).toBeInTheDocument();
      expect(screen.getByText("+5493511111111")).toBeInTheDocument();
      expect(screen.getByText("julian@example.com")).toBeInTheDocument();
      // Tercera ronda de correcciones (2026-09-06), pedido textual del
      // cliente: "sacarlo del todo, no es tan útil y agrega complejidad"
      // — TutorInfo ya no tiene el campo `dni` (ver shared-types); la
      // sección de tutores no tiene ninguna etiqueta "DNI" (a diferencia
      // de "Datos de contacto", que sí la tiene para el paciente).
      const seccionTutores = screen.getByText("Datos de tutores").closest("section")!;
      expect(within(seccionTutores).queryByText("DNI")).not.toBeInTheDocument();
    });

    it("con dos tutores, muestra una tarjeta por cada uno", () => {
      render(<PacienteDatos pacienteInicial={{ ...paciente, tutores: [tutor1, tutor2] }} />);
      expect(screen.getByText("Julián Ortiz")).toBeInTheDocument();
      expect(screen.getByText("Abuela Rosa")).toBeInTheDocument();
      expect(screen.getByText("Otro")).toBeInTheDocument();
    });

    // Cuarta ronda de correcciones (2026-09-06), bug real reportado por
    // el cliente: "los números nuevos de los tutores no se agregan con
    // los existentes, sino que se reemplaza el anterior con el nuevo" —
    // corregido para que se ACUMULEN (mismo botón "Ver teléfonos" que ya
    // usa el propio del paciente), nunca reemplazan al principal.
    it("con un teléfono alternativo, el tutor agrupa detrás de 'Ver teléfonos del tutor'", async () => {
      const user = userEvent.setup();
      const tutorConAlternativo = { ...tutor1, telefonosAlternativos: ["+5493519999999"] };
      render(<PacienteDatos pacienteInicial={{ ...paciente, tutores: [tutorConAlternativo] }} />);

      expect(screen.queryByText("+5493511111111")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Ver teléfonos del tutor" }));

      const dialogo = await screen.findByRole("dialog", { name: "Teléfonos del tutor" });
      expect(dialogo).toHaveTextContent("+5493511111111");
      expect(dialogo).toHaveTextContent("+5493519999999");
    });

    it("sin teléfonos alternativos, el tutor sigue mostrando el principal a secas", () => {
      render(<PacienteDatos pacienteInicial={{ ...paciente, tutores: [tutor1] }} />);
      expect(screen.getByText("+5493511111111")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ver teléfonos del tutor" })).not.toBeInTheDocument();
    });
  });

  it("'Editar datos' abre el modal, y al guardar actualiza los datos mostrados", async () => {
    editarPacienteActionMock.mockResolvedValue({ paciente: { ...paciente, dni: "30222333" } });
    const user = userEvent.setup();
    render(<PacienteDatos pacienteInicial={paciente} />);

    await user.click(screen.getByRole("button", { name: "Editar datos" }));
    expect(await screen.findByRole("dialog", { name: "Editar datos del paciente" })).toBeInTheDocument();

    await user.clear(screen.getByLabelText("DNI"));
    await user.type(screen.getByLabelText("DNI"), "30222333");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(screen.queryByRole("dialog", { name: "Editar datos del paciente" })).not.toBeInTheDocument();
    expect(screen.getByText("30222333")).toBeInTheDocument();
  });
});
