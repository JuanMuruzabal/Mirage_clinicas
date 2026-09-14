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
  cambiarRolesAction: vi.fn(),
}));

// Las acciones de cada tarjeta viven en un menú de tres puntos desde el
// rediseño del 2026-09-14: con tres opciones, la tarjeta pasaba a tener
// más botones que datos.
async function abrirMenuDe(nombre: string) {
  await userEvent.click(screen.getByRole("button", { name: `Acciones de ${nombre}` }));
}

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
    expect(titulos).toEqual(["Titular", "Recepción1 persona", "Profesionales1 persona"]);

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
    // Ni siquiera tiene menú de acciones.
    expect(within(tarjetaTitular).queryByRole("button", { name: /Acciones de/ })).not.toBeInTheDocument();
  });

  it("quitar a un colaborador llama a la acción con su id", async () => {
    quitarColaboradorActionMock.mockResolvedValue({});
    render(<EquipoDeLaClinica equipo={equipoBase} />);

    await abrirMenuDe("Camila Ortiz");
    await userEvent.click(screen.getByRole("button", { name: "Quitar del equipo" }));

    await waitFor(() => expect(quitarColaboradorActionMock).toHaveBeenCalledWith("u2"));
  });

  it("si quitar falla, lo dice en la tarjeta", async () => {
    quitarColaboradorActionMock.mockResolvedValue({ error: "no se puede quitar al titular de la clínica" });
    render(<EquipoDeLaClinica equipo={equipoBase} />);

    const tarjeta = screen.getByText("Camila Ortiz").closest("article")!;
    await abrirMenuDe("Camila Ortiz");
    await userEvent.click(screen.getByRole("button", { name: "Quitar del equipo" }));

    expect(await within(tarjeta).findByRole("alert")).toHaveTextContent("no se puede quitar al titular");
  });

  // Quien no es el titular ve el equipo pero no puede tocarlo. La regla
  // vive en el backend; acá solo se decide qué se dibuja.
  it("sin permiso para invitar, no hay botones de gestión", () => {
    render(<EquipoDeLaClinica equipo={{ ...equipoBase, puedeInvitar: false }} />);

    // El botón de invitar vive en el encabezado (EncabezadoEquipo), así
    // que acá lo que se verifica es que no haya menús de acciones.
    expect(screen.queryByRole("button", { name: /Acciones de/ })).not.toBeInTheDocument();
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
    await abrirMenuDe("julian@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Reenviar invitación" }));
    await waitFor(() => expect(reenviarInvitacionActionMock).toHaveBeenCalledWith("inv-1"));
    expect(await within(tarjeta).findByText("Invitación reenviada.")).toBeInTheDocument();

    await abrirMenuDe("julian@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar invitación" }));
    await waitFor(() => expect(cancelarInvitacionActionMock).toHaveBeenCalledWith("inv-1"));
  });

  it("una clínica sin equipo lo dice en vez de mostrar secciones vacías", () => {
    render(<EquipoDeLaClinica equipo={{ miembros: [miembro()], pendientes: [], puedeInvitar: true }} />);

    expect(screen.getByText("Todavía no hay nadie en recepción.")).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay otros profesionales en la clínica.")).toBeInTheDocument();
  });

  // --- Rediseño del 2026-09-14 ---

  // Cada tipo de tag lleva su propio color, asignado por nombre y no por
  // posición: con todos del mismo gris, la fila se leía como un bloque
  // indistinto.
  it("cada rol lleva su propio color, y 'Sos vos' va en neutro", () => {
    render(<EquipoDeLaClinica equipo={equipoBase} />);

    // "Titular" y "Recepción" aparecen dos veces cada uno: como
    // encabezado de su grupo y como tag. El tag es el <li>.
    const tag = (texto: string) => screen.getAllByText(texto).find((el) => el.tagName === "LI");
    expect(tag("Titular")).toHaveClass("tag-rol--titular");
    expect(tag("Administrador de página")).toHaveClass("tag-rol--admin");
    expect(tag("Recepción")).toHaveClass("tag-rol--recepcion");
    // "Sos vos" es una aclaración, no un rol: no compite con los reales.
    expect(screen.getByText("Sos vos").closest("li")).toHaveClass("tag-rol--vos");
  });

  it("el menú de acciones ofrece cambiar rol y quitar", async () => {
    render(<EquipoDeLaClinica equipo={equipoBase} />);

    await abrirMenuDe("Camila Ortiz");

    expect(screen.getByRole("button", { name: "Cambiar rol" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar del equipo" })).toBeInTheDocument();
  });

  it("cambiar rol abre el modal con los roles actuales", async () => {
    render(<EquipoDeLaClinica equipo={equipoBase} />);

    await abrirMenuDe("Camila Ortiz");
    await userEvent.click(screen.getByRole("button", { name: "Cambiar rol" }));

    expect(screen.getByRole("heading", { name: "Cambiar rol" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Recepcionista/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("deja claro quién puede tocar el equipo", () => {
    render(<EquipoDeLaClinica equipo={equipoBase} />);
    expect(
      screen.getByText("Solo el titular puede invitar, cambiar roles y quitar a alguien del equipo."),
    ).toBeInTheDocument();
  });
});

