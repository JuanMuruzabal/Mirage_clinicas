import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VistaActual } from "@dental-mirage/shared-types";

const elegirVistaActionMock = vi.fn();
vi.mock("@/app/actions/topbar-panel", () => ({
  elegirVistaAction: (...args: unknown[]) => elegirVistaActionMock(...args),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const { ZonaProfesional } = await import("./zona-profesional");

const PROFESIONALES = [
  { userId: "u1", nombre: "Juan Muru", detalle: "Odontología general" },
  { userId: "u2", nombre: "Lucía Ferrer", detalle: "Ortodoncia" },
  { userId: "u3", nombre: "Matías Soto", detalle: "Endodoncia" },
];

function montar(vista: VistaActual | null, props: Record<string, unknown> = {}) {
  return render(
    <ZonaProfesional profesionales={PROFESIONALES} vista={vista} etiqueta="Mostrando" {...props} />,
  );
}

const enFoco = (userId: string, nombre: string): VistaActual => ({ profesional: { userId, nombre } });

beforeEach(() => {
  elegirVistaActionMock.mockReset();
  elegirVistaActionMock.mockResolvedValue({});
  refreshMock.mockReset();
});

describe("ZonaProfesional — qué muestra", () => {
  it("sin foco dice la vista general y cuenta 'Toda la clínica'", () => {
    montar(null);
    // Dos veces a propósito, como en el mockup: en el botón (el nombre
    // de la vista) y en la línea de conteo de abajo, donde un
    // profesional mostraría "1 de 3".
    expect(screen.getAllByText("Toda la clínica")).toHaveLength(2);
    expect(screen.getByText("Mostrando")).toBeInTheDocument();
  });

  // El mockup muestra "1 de 4" debajo del control: es lo que dice cuánto
  // falta recorrer, y por eso las flechas tienen sentido.
  it("con foco muestra el nombre, su especialidad y la posición", () => {
    montar(enFoco("u2", "Lucía Ferrer"));
    expect(screen.getByText("Lucía Ferrer")).toBeInTheDocument();
    expect(screen.getByText("Ortodoncia")).toBeInTheDocument();
    expect(screen.getByText("2 de 3")).toBeInTheDocument();
  });

  // Pacientes usa "Pacientes de" cuando hay alguien en foco, y
  // "Mostrando" en la vista general (mockup `pacientes-recepcion.html`).
  it("la etiqueta puede cambiar cuando hay alguien en foco", () => {
    montar(enFoco("u1", "Juan Muru"), { etiquetaConFoco: "Pacientes de" });
    expect(screen.getByText("Pacientes de")).toBeInTheDocument();
    expect(screen.queryByText("Mostrando")).not.toBeInTheDocument();
  });
});

// LAS FLECHAS son el punto del diseño: recepción salta de un
// profesional a otro con un clic, sin abrir ningún menú.
describe("ZonaProfesional — las flechas", () => {
  it("avanzan al siguiente profesional", async () => {
    const user = userEvent.setup();
    montar(enFoco("u1", "Juan Muru"));

    await user.click(screen.getByRole("button", { name: "Profesional siguiente" }));

    await waitFor(() => expect(elegirVistaActionMock).toHaveBeenCalledWith("u2"));
  });

  it("retroceden al anterior", async () => {
    const user = userEvent.setup();
    montar(enFoco("u2", "Lucía Ferrer"));

    await user.click(screen.getByRole("button", { name: "Profesional anterior" }));

    await waitFor(() => expect(elegirVistaActionMock).toHaveBeenCalledWith("u1"));
  });

  // Es una rueda, no una lista con extremos: desde el último, "siguiente"
  // vuelve al principio (la vista general, que va primera).
  it("dan la vuelta: después del último viene la vista general", async () => {
    const user = userEvent.setup();
    montar(enFoco("u3", "Matías Soto"));

    await user.click(screen.getByRole("button", { name: "Profesional siguiente" }));

    await waitFor(() => expect(elegirVistaActionMock).toHaveBeenCalledWith(""));
  });

  it("desde la vista general, 'anterior' va al último", async () => {
    const user = userEvent.setup();
    montar(null);

    await user.click(screen.getByRole("button", { name: "Profesional anterior" }));

    await waitFor(() => expect(elegirVistaActionMock).toHaveBeenCalledWith("u3"));
  });

  // Sin vista general en la rueda (pantalla General del mockup), el
  // recorrido es solo entre profesionales.
  it("sin vista general, la rueda solo recorre profesionales", async () => {
    const user = userEvent.setup();
    montar(enFoco("u3", "Matías Soto"), { conVistaGeneral: false });

    await user.click(screen.getByRole("button", { name: "Profesional siguiente" }));

    await waitFor(() => expect(elegirVistaActionMock).toHaveBeenCalledWith("u1"));
  });
});

describe("ZonaProfesional — el menú", () => {
  it("lista la vista general primero y después a cada profesional", async () => {
    const user = userEvent.setup();
    montar(null);

    await user.click(screen.getByRole("button", { name: "Elegir de quién es la vista" }));

    expect(screen.getByText("Profesionales de la clínica")).toBeInTheDocument();
    for (const p of PROFESIONALES) {
      expect(screen.getByText(p.nombre)).toBeInTheDocument();
    }
  });

  it("elegir a alguien del menú cambia la vista y vuelve a pedir la pantalla", async () => {
    const user = userEvent.setup();
    montar(null);

    await user.click(screen.getByRole("button", { name: "Elegir de quién es la vista" }));
    await user.click(screen.getByText("Matías Soto"));

    await waitFor(() => expect(elegirVistaActionMock).toHaveBeenCalledWith("u3"));
    // Cambiar de vista cambia TODO lo que la pantalla muestra, y eso sale
    // del servidor.
    expect(refreshMock).toHaveBeenCalled();
  });

  it("en General no ofrece la vista general", async () => {
    const user = userEvent.setup();
    montar(enFoco("u1", "Juan Muru"), { conVistaGeneral: false });

    await user.click(screen.getByRole("button", { name: "Elegir de quién es la vista" }));

    expect(screen.queryByText("Toda la clínica")).not.toBeInTheDocument();
  });

  // Un rechazo del backend —un profesional intentando esto, o alguien
  // que dejó de estar en el equipo— tiene que decirse.
  it("si el backend rechaza, muestra el motivo y no refresca", async () => {
    elegirVistaActionMock.mockResolvedValue({ error: "solo recepción puede cambiar de vista" });
    const user = userEvent.setup();
    montar(null);

    await user.click(screen.getByRole("button", { name: "Elegir de quién es la vista" }));
    await user.click(screen.getByText("Juan Muru"));

    expect(await screen.findByRole("alert")).toHaveTextContent("solo recepción");
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
