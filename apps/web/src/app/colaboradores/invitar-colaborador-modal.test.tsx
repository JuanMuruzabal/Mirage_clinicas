import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { invitarColaboradorActionMock } = vi.hoisted(() => ({ invitarColaboradorActionMock: vi.fn() }));

vi.mock("@/app/actions/equipo", () => ({ invitarColaboradorAction: invitarColaboradorActionMock }));

const { InvitarColaboradorModal } = await import("./invitar-colaborador-modal");

describe("InvitarColaboradorModal (Fase 3.2.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // El brief pide el rol PRIMERO: es lo que decide qué va a poder ver esa
  // persona, así que se elige antes de nombrarla.
  it("no deja pasar al paso 2 sin elegir rol", async () => {
    render(<InvitarColaboradorModal onCerrar={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Elegí un rol para seguir.")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Código de perfil" })).not.toBeInTheDocument();
  });

  it("invita por código", async () => {
    invitarColaboradorActionMock.mockResolvedValue({});
    render(<InvitarColaboradorModal onCerrar={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /Profesional/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.type(screen.getByLabelText("Código de perfil"), "pr-abcd-efgh");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() =>
      expect(invitarColaboradorActionMock).toHaveBeenCalledWith({ rol: "profesional", codigo: "PR-ABCD-EFGH" }),
    );
  });

  it("invita por mail", async () => {
    invitarColaboradorActionMock.mockResolvedValue({});
    render(<InvitarColaboradorModal onCerrar={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /Recepcionista/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(screen.getByRole("tab", { name: "Correo electrónico" }));
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "camila@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));

    await waitFor(() =>
      expect(invitarColaboradorActionMock).toHaveBeenCalledWith({ rol: "recepcion", email: "camila@example.com" }),
    );
  });

  // Los avisos del backend ("ya trabaja acá", "ya tiene una invitación
  // pendiente") son la mitad del pedido del brief: tienen que llegar a la
  // pantalla, no morir en un 409.
  it("muestra el aviso que devuelve el backend", async () => {
    invitarColaboradorActionMock.mockResolvedValue({ error: "esa persona ya trabaja en esta clínica" });
    render(<InvitarColaboradorModal onCerrar={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /Profesional/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.type(screen.getByLabelText("Código de perfil"), "PR-ABCD-EFGH");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByText("esa persona ya trabaja en esta clínica")).toBeInTheDocument();
  });

  // Que quede claro que nadie entró todavía: el brief original decía que
  // el código sumaba al instante, y el cliente lo cambió.
  it("al terminar aclara que la persona todavía tiene que confirmar", async () => {
    invitarColaboradorActionMock.mockResolvedValue({});
    render(<InvitarColaboradorModal onCerrar={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /Profesional/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.type(screen.getByLabelText("Código de perfil"), "PR-ABCD-EFGH");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("heading", { name: "Invitación enviada" })).toBeInTheDocument();
    expect(screen.getByText(/no ve nada de la tuya/)).toBeInTheDocument();
  });

  it("volver al paso 1 conserva el rol elegido", async () => {
    render(<InvitarColaboradorModal onCerrar={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /Recepcionista/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(screen.getByRole("button", { name: /Recepcionista/ })).toHaveAttribute("aria-pressed", "true");
  });
});
