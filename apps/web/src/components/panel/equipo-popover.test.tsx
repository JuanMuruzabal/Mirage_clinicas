import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Equipo, MiembroDelEquipo, Presencia } from "@dental-mirage/shared-types";

const presenciaActionMock = vi.fn();
vi.mock("@/app/actions/presencia", () => ({
  presenciaAction: () => presenciaActionMock(),
}));
// El popover absorbió "Cerrar sesión" (2026-09-19). Sin el mock, la
// Server Action real corre fuera de un request y deja un rechazo sin
// atender que hace fallar la corrida entera.
const logoutActionMock = vi.fn();
vi.mock("@/app/actions/auth", () => ({ logoutAction: () => logoutActionMock() }));

const { EquipoPopover, haceCuanto, iniciales } = await import("./equipo-popover");

function miembro(over: Partial<MiembroDelEquipo> = {}): MiembroDelEquipo {
  return {
    userId: "u1",
    nombre: "Ana Titular",
    email: "ana@example.com",
    roles: ["owner", "admin", "profesional"],
    esTitular: true,
    esVos: true,
    ultimaActividad: new Date().toISOString(),
    enLinea: true,
    ...over,
  };
}

function equipo(miembros: MiembroDelEquipo[]): Equipo {
  return { miembros, pendientes: [], puedeInvitar: true };
}

function presencia(miembros: Presencia["miembros"]): Presencia {
  return { miembros, enLineaSegundos: 300, latidoSegundos: 60 };
}

beforeEach(() => {
  presenciaActionMock.mockReset();
  // Por default, el latido no trae novedades: la pantalla se queda con la
  // presencia que vino del servidor.
  presenciaActionMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("iniciales", () => {
  it("saca el tratamiento, que no distingue a nadie en una clínica de odontólogos", () => {
    expect(iniciales("Dra. Lucía Ferrer")).toBe("LF");
    expect(iniciales("Od. Matías Soto")).toBe("MS");
  });

  it("aguanta un nombre de una sola palabra", () => {
    expect(iniciales("Camila")).toBe("C");
  });
});

describe("haceCuanto", () => {
  const ahora = new Date("2026-09-14T12:00:00Z").getTime();
  const hace = (minutos: number) => new Date(ahora - minutos * 60000).toISOString();

  it("traduce cada rango", () => {
    expect(haceCuanto(hace(0), ahora)).toBe("Recién");
    expect(haceCuanto(hace(20), ahora)).toBe("Hace 20 min");
    expect(haceCuanto(hace(180), ahora)).toBe("Hace 3 h");
    expect(haceCuanto(hace(60 * 24), ahora)).toBe("Ayer");
    expect(haceCuanto(hace(60 * 24 * 5), ahora)).toBe("Hace 5 días");
  });

  it("sin actividad no inventa un tiempo", () => {
    expect(haceCuanto(null, ahora)).toBe("Sin actividad");
  });
});

describe("EquipoPopover", () => {
  it("cuenta solo a quienes están en línea", async () => {
    render(
      <EquipoPopover
        equipo={equipo([
          miembro({ userId: "u1", nombre: "Ana Titular", enLinea: true }),
          miembro({ userId: "u2", nombre: "Beto Colega", enLinea: true, esTitular: false, esVos: false }),
          miembro({ userId: "u3", nombre: "Caro Ausente", enLinea: false, esTitular: false, esVos: false }),
        ])}
      />,
    );

    expect(screen.getByRole("button", { name: "Ver colaboradores" })).toHaveTextContent("2 en línea");
  });

  it("separa a los ausentes y dice hace cuánto que no están", async () => {
    render(
      <EquipoPopover
        equipo={equipo([
          miembro({ userId: "u1", nombre: "Ana Titular", enLinea: true }),
          miembro({
            userId: "u3",
            nombre: "Caro Ausente",
            enLinea: false,
            esTitular: false,
            esVos: false,
            ultimaActividad: new Date(Date.now() - 90 * 60000).toISOString(),
          }),
        ])}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Ver colaboradores" }));

    expect(screen.getByText("Sin actividad")).toBeInTheDocument();
    expect(screen.getByText("En línea")).toBeInTheDocument();
    expect(screen.getByText("Hace 1 h")).toBeInTheDocument();
  });

  // El punto del latido: la presencia que llega pisa a la que vino del
  // servidor. Sin esto el popover sería una foto fija del momento en que
  // se cargó la página.
  it("el latido actualiza quién está en línea", async () => {
    presenciaActionMock.mockResolvedValue(
      presencia([
        { userId: "u1", ultimaActividad: new Date().toISOString(), enLinea: true },
        { userId: "u2", ultimaActividad: new Date().toISOString(), enLinea: true },
      ]),
    );

    render(
      <EquipoPopover
        equipo={equipo([
          miembro({ userId: "u1", nombre: "Ana Titular", enLinea: true }),
          // Del servidor vino ausente; el latido dice que llegó.
          miembro({ userId: "u2", nombre: "Beto Colega", enLinea: false, esTitular: false, esVos: false }),
        ])}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ver colaboradores" })).toHaveTextContent("2 en línea");
    });
  });

  // Un error de red no puede romper el panel: la acción devuelve null y
  // la pantalla se queda con la última foto que tenía.
  it("si el latido falla, conserva lo que ya mostraba", async () => {
    presenciaActionMock.mockResolvedValue(null);

    render(<EquipoPopover equipo={equipo([miembro({ userId: "u1", nombre: "Ana Titular", enLinea: true })])} />);

    await waitFor(() => expect(presenciaActionMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Ver colaboradores" })).toHaveTextContent("1 en línea");
  });

  it("lleva a la pantalla completa de colaboradores", async () => {
    render(<EquipoPopover equipo={equipo([miembro()])} />);

    await userEvent.click(screen.getByRole("button", { name: "Ver colaboradores" }));

    expect(screen.getByRole("link", { name: "Ver todos los colaboradores" })).toHaveAttribute(
      "href",
      "/colaboradores",
    );
  });

  it("con la clínica recién creada no muestra a nadie más", async () => {
    render(<EquipoPopover equipo={equipo([])} />);

    await userEvent.click(screen.getByRole("button", { name: "Ver colaboradores" }));

    expect(screen.getByText("Todavía no hay nadie más en la clínica.")).toBeInTheDocument();
  });

  // 2026-09-19, pedido del cliente: "en la tarjeta de los colaboradores
  // incluyendo al mismo profesional poner un botón de ver perfil, que me
  // llevará a mi perfil o al perfil del otro profesional".
  describe("ver perfil", () => {
    it("el propio va a /perfil, que además de mostrarlo edita", async () => {
      render(<EquipoPopover equipo={equipo([miembro({ userId: "u1", nombre: "Ana Titular", esVos: true })])} />);

      await userEvent.click(screen.getByRole("button", { name: "Ver colaboradores" }));

      expect(screen.getByRole("link", { name: "Ver perfil" })).toHaveAttribute("href", "/perfil");
    });

    it("el de un colega va a su ficha en solo lectura", async () => {
      render(
        <EquipoPopover
          equipo={equipo([
            miembro({ userId: "u2", nombre: "Beto Colega", esTitular: false, esVos: false }),
          ])}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "Ver colaboradores" }));

      expect(screen.getByRole("link", { name: "Ver perfil" })).toHaveAttribute("href", "/colaboradores/u2");
    });
  });

  // El componente reemplaza a la tuerca en el header de
  // /seleccionar-servicio, donde era el ÚNICO acceso a cerrar sesión: si
  // estas dos opciones se pierden, la persona se queda sin salida.
  describe("la cuenta", () => {
    it("ofrece 'Tu perfil' y 'Cerrar sesión'", async () => {
      render(<EquipoPopover equipo={equipo([miembro()])} />);

      await userEvent.click(screen.getByRole("button", { name: "Ver colaboradores" }));

      expect(screen.getByRole("link", { name: "Tu perfil" })).toHaveAttribute("href", "/perfil");
      expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    });
  });
});
