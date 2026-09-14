import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Equipo, MiembroDelEquipo } from "@dental-mirage/shared-types";

const {
  invitarColaboradorActionMock,
  quitarColaboradorActionMock,
  cancelarInvitacionActionMock,
  reenviarInvitacionActionMock,
} = vi.hoisted(() => ({
  invitarColaboradorActionMock: vi.fn(),
  quitarColaboradorActionMock: vi.fn(),
  cancelarInvitacionActionMock: vi.fn(),
  reenviarInvitacionActionMock: vi.fn(),
}));

vi.mock("@/app/actions/equipo", () => ({
  invitarColaboradorAction: invitarColaboradorActionMock,
  quitarColaboradorAction: quitarColaboradorActionMock,
  cancelarInvitacionAction: cancelarInvitacionActionMock,
  reenviarInvitacionAction: reenviarInvitacionActionMock,
}));

const { EquipoDeLaClinica } = await import("./equipo-de-la-clinica");

function miembro(over: Partial<MiembroDelEquipo> = {}): MiembroDelEquipo {
  return {
    userId: "u1",
    nombre: "Ana Titular",
    email: "ana@example.com",
    roles: ["owner", "admin", "profesional"],
    esTitular: true,
    esVos: true,
    ...over,
  };
}

const equipoBase: Equipo = {
  miembros: [
    miembro(),
    miembro({ userId: "u2", nombre: "Camila Ortiz", email: "camila@example.com", roles: ["recepcion"], esTitular: false, esVos: false }),
    miembro({ userId: "u3", nombre: "Lucía Ferrer", email: "lucia@example.com", roles: ["profesional"], esTitular: false, esVos: false }),
  ],
  pendientes: [],
  puedeInvitar: true,
};

describe("EquipoDeLaClinica (Fase 3.2.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // El orden lo pide el brief: "primero el creador, luego recepcionistas,
  // y al final las tarjetas de los colegas".
  it("agrupa al titular, recepción y profesionales, en ese orden", () => {
    render(<EquipoDeLaClinica equipo={equipoBase} />);

    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual(["Titular", "Recepción", "Profesionales"]);

    expect(screen.getByText("Ana Titular")).toBeInTheDocument();
    expect(screen.getByText("Camila Ortiz")).toBeInTheDocument();
    expect(screen.getByText("Lucía Ferrer")).toBeInTheDocument();
  });

  // "La tarjeta del titular no tiene acciones (no te podés quitar a vos
  // mismo) y lleva un tag gris 'Sos vos'" — brief.
  it("al titular no se lo puede quitar, y se marca como 'Sos vos'", () => {
    render(<EquipoDeLaClinica equipo={equipoBase} />);

    const tarjetaTitular = screen.getByText("Ana Titular").closest("article")!;
    expect(within(tarjetaTitular).getByText("Sos vos")).toBeInTheDocument();
    expect(within(tarjetaTitular).queryByRole("button", { name: /Quitar/ })).not.toBeInTheDocument();
  });

  it("quitar a un colaborador llama a la acción con su id", async () => {
    quitarColaboradorActionMock.mockResolvedValue({});
    render(<EquipoDeLaClinica equipo={equipoBase} />);

    const tarjeta = screen.getByText("Camila Ortiz").closest("article")!;
    await userEvent.click(within(tarjeta).getByRole("button", { name: /Quitar de la clínica/ }));

    await waitFor(() => expect(quitarColaboradorActionMock).toHaveBeenCalledWith("u2"));
  });

  it("si quitar falla, lo dice en la tarjeta", async () => {
    quitarColaboradorActionMock.mockResolvedValue({ error: "no se puede quitar al titular de la clínica" });
    render(<EquipoDeLaClinica equipo={equipoBase} />);

    const tarjeta = screen.getByText("Camila Ortiz").closest("article")!;
    await userEvent.click(within(tarjeta).getByRole("button", { name: /Quitar de la clínica/ }));

    expect(await within(tarjeta).findByRole("alert")).toHaveTextContent("no se puede quitar al titular");
  });

  // Quien no es el titular ve el equipo pero no puede tocarlo. La regla
  // vive en el backend; acá solo se decide qué se dibuja.
  it("sin permiso para invitar, no hay botones de gestión", () => {
    render(<EquipoDeLaClinica equipo={{ ...equipoBase, puedeInvitar: false }} />);

    expect(screen.queryByRole("button", { name: /Invitar colaborador/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar de la clínica/ })).not.toBeInTheDocument();
    // Pero sí ve a las personas.
    expect(screen.getByText("Camila Ortiz")).toBeInTheDocument();
  });

  it("las invitaciones pendientes se pueden reenviar y cancelar", async () => {
    reenviarInvitacionActionMock.mockResolvedValue({});
    cancelarInvitacionActionMock.mockResolvedValue({});
    render(
      <EquipoDeLaClinica
        equipo={{
          ...equipoBase,
          pendientes: [{ id: "inv-1", email: "julian@example.com", rol: "recepcion", venceAt: "2026-09-21T12:00:00Z" }],
        }}
      />,
    );

    const tarjeta = screen.getByText("julian@example.com").closest("article")!;
    await userEvent.click(within(tarjeta).getByRole("button", { name: "Reenviar invitación" }));
    await waitFor(() => expect(reenviarInvitacionActionMock).toHaveBeenCalledWith("inv-1"));
    expect(await within(tarjeta).findByText("Invitación reenviada.")).toBeInTheDocument();

    await userEvent.click(within(tarjeta).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(cancelarInvitacionActionMock).toHaveBeenCalledWith("inv-1"));
  });

  it("una clínica sin equipo lo dice en vez de mostrar secciones vacías", () => {
    render(<EquipoDeLaClinica equipo={{ miembros: [miembro()], pendientes: [], puedeInvitar: true }} />);

    expect(screen.getByText("Todavía no hay nadie en recepción.")).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay otros profesionales en la clínica.")).toBeInTheDocument();
  });
});
