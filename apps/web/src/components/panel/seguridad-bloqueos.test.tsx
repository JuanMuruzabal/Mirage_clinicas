import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BloqueosSeguridad } from "@dental-mirage/shared-types";

const { desbloquearMailActionMock, desbloquearIPActionMock, listBloqueosSeguridadActionMock } = vi.hoisted(() => ({
  desbloquearMailActionMock: vi.fn(),
  desbloquearIPActionMock: vi.fn(),
  listBloqueosSeguridadActionMock: vi.fn(),
}));

vi.mock("@/app/actions/seguridad", () => ({
  desbloquearMailAction: desbloquearMailActionMock,
  desbloquearIPAction: desbloquearIPActionMock,
  listBloqueosSeguridadAction: listBloqueosSeguridadActionMock,
}));

const { SeguridadBloqueos } = await import("./seguridad-bloqueos");

const vacio: BloqueosSeguridad = { mailsBloqueados: [], ipsBloqueadas: [], auditoria: [] };

const conDatos: BloqueosSeguridad = {
  mailsBloqueados: [{ id: "mail-1", email: "atacante@example.com", bloqueadoHasta: "2030-06-03T10:00:00-03:00", createdAt: "" }],
  ipsBloqueadas: [{ id: "ip-1", ip: "203.0.113.5", bloqueadoHasta: "2030-06-01T10:00:00-03:00", createdAt: "" }],
  auditoria: [
    {
      id: "audit-1",
      motivo: "mail_muchos_dnis",
      email: "atacante@example.com",
      ip: "203.0.113.5",
      dnis: "30000001, 30000002",
      turnosBorrados: 6,
      simulado: false,
      createdAt: "2030-05-30T10:00:00-03:00",
    },
  ],
};

describe("SeguridadBloqueos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con todo vacío, muestra los tres mensajes de 'nada bloqueado'", () => {
    render(<SeguridadBloqueos inicial={vacio} />);
    expect(screen.getByText("No hay ningún mail bloqueado en este momento.")).toBeInTheDocument();
    expect(screen.getByText("No hay ninguna IP bloqueada en este momento.")).toBeInTheDocument();
    expect(screen.getByText("Todavía no se registró ningún bloqueo.")).toBeInTheDocument();
  });

  it("muestra los mails/IPs bloqueados y la fila de auditoría", () => {
    render(<SeguridadBloqueos inicial={conDatos} />);
    // "atacante@example.com"/"203.0.113.5" aparecen dos veces cada uno —
    // en su propia sección (mails/IPs bloqueados) Y en la fila de
    // auditoría (columna "Mail / IP") — por diseño, no es un bug.
    expect(screen.getAllByText("atacante@example.com")).toHaveLength(2);
    expect(screen.getAllByText("203.0.113.5")).toHaveLength(2);
    expect(screen.getByText("Mismo mail, muchos DNIs distintos")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    // El párrafo explicativo de arriba menciona "Simulado" siempre, pero
    // ninguna fila (badge) de la tabla lo hace — la fila de conDatos no
    // está simulada.
    expect(screen.getAllByText("Simulado")).toHaveLength(1);
  });

  it("una fila de auditoría simulada muestra la marca 'Simulado'", () => {
    const conSimulado: BloqueosSeguridad = {
      ...vacio,
      auditoria: [
        {
          id: "audit-2",
          motivo: "dni_tipo_tope",
          ip: "203.0.113.9",
          dnis: "30000009",
          turnosBorrados: 0,
          simulado: true,
          createdAt: "2030-05-30T10:00:00-03:00",
        },
      ],
    };
    render(<SeguridadBloqueos inicial={conSimulado} />);
    // "Simulado" aparece dos veces: en el párrafo explicativo de arriba y
    // en la marca de la fila — por diseño, no es un bug.
    expect(screen.getAllByText("Simulado")).toHaveLength(2);
    expect(screen.getByText("Tope de turnos sin verificar por DNI")).toBeInTheDocument();
  });

  it("desbloquear un mail llama a la acción y recarga la lista", async () => {
    desbloquearMailActionMock.mockResolvedValue({ ok: true });
    listBloqueosSeguridadActionMock.mockResolvedValue(vacio);
    const user = userEvent.setup();
    render(<SeguridadBloqueos inicial={conDatos} />);

    await user.click(screen.getAllByRole("button", { name: "Desbloquear" })[0]);

    expect(desbloquearMailActionMock).toHaveBeenCalledWith("mail-1");
    expect(await screen.findByText("No hay ningún mail bloqueado en este momento.")).toBeInTheDocument();
  });

  it("desbloquear una IP llama a la acción correcta", async () => {
    desbloquearIPActionMock.mockResolvedValue({ ok: true });
    listBloqueosSeguridadActionMock.mockResolvedValue(vacio);
    const user = userEvent.setup();
    render(<SeguridadBloqueos inicial={conDatos} />);

    const botones = screen.getAllByRole("button", { name: "Desbloquear" });
    await user.click(botones[1]);

    expect(desbloquearIPActionMock).toHaveBeenCalledWith("ip-1");
  });

  it("en error, muestra el mensaje y no recarga", async () => {
    desbloquearMailActionMock.mockResolvedValue({ error: "no se pudo desbloquear el mail" });
    const user = userEvent.setup();
    render(<SeguridadBloqueos inicial={conDatos} />);

    await user.click(screen.getAllByRole("button", { name: "Desbloquear" })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent("no se pudo desbloquear el mail");
    expect(listBloqueosSeguridadActionMock).not.toHaveBeenCalled();
  });
});
