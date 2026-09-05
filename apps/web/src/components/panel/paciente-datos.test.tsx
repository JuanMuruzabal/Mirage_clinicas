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
  // agrupan detrás de "Ver mails →"/"Ver teléfonos →" en vez de mostrar
  // solo el principal.
  describe("mails/teléfonos alternativos (Fase 2.4.1)", () => {
    it("con un solo mail alternativo, agrupa detrás de 'Ver mails →'", async () => {
      const user = userEvent.setup();
      render(<PacienteDatos pacienteInicial={paciente} emailsAlternativos={["bruno.alt@example.com"]} />);

      expect(screen.queryByText("bruno@example.com")).not.toBeInTheDocument();
      const boton = screen.getByRole("button", { name: "Ver mails →" });
      await user.click(boton);

      const dialogo = await screen.findByRole("dialog", { name: "Mails" });
      expect(dialogo).toHaveTextContent("bruno@example.com");
      expect(dialogo).toHaveTextContent("bruno.alt@example.com");
    });

    it("con un teléfono alternativo, agrupa detrás de 'Ver teléfonos →'", async () => {
      const user = userEvent.setup();
      render(<PacienteDatos pacienteInicial={paciente} telefonosAlternativos={["+5493519999999"]} />);

      expect(screen.queryByText("+5493511234567")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Ver teléfonos →" }));

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
      expect(screen.queryByRole("button", { name: "Ver mails →" })).not.toBeInTheDocument();
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
      expect(screen.queryByRole("button", { name: "Ver mails →" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ver teléfonos →" })).not.toBeInTheDocument();
      expect(screen.getByText("bruno@example.com")).toBeInTheDocument();
      expect(screen.getByText("+5493511234567")).toBeInTheDocument();
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
