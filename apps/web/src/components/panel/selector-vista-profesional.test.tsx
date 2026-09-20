import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MiembroDelEquipo, VistaActual } from "@dental-mirage/shared-types";

const elegirVistaActionMock = vi.fn();
vi.mock("@/app/actions/topbar-panel", () => ({
  elegirVistaAction: (...args: unknown[]) => elegirVistaActionMock(...args),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const { SelectorVistaProfesional } = await import("./selector-vista-profesional");

function profesional(over: Partial<MiembroDelEquipo> = {}): MiembroDelEquipo {
  return {
    userId: "u1",
    nombre: "Dra. Lucía Ferrer",
    email: "lucia@example.com",
    roles: ["profesional"],
    esTitular: false,
    esVos: false,
    ultimaActividad: null,
    enLinea: false,
    ...over,
  };
}

function montar(profesionales: MiembroDelEquipo[], vista: VistaActual | null) {
  return render(<SelectorVistaProfesional profesionales={profesionales} vista={vista} />);
}

beforeEach(() => {
  elegirVistaActionMock.mockReset();
  elegirVistaActionMock.mockResolvedValue({});
  refreshMock.mockReset();
});

describe("SelectorVistaProfesional", () => {
  // La vista general es el estado por default de recepción: ve la
  // clínica entera, que es lo que su rol permite.
  it("sin foco dice que está viendo toda la clínica", () => {
    montar([profesional()], { profesional: null });
    expect(screen.getByRole("button", { name: "Cambiar de vista" })).toHaveTextContent("Toda la clínica");
  });

  it("con foco dice de quién es la agenda que se está mirando", () => {
    montar([profesional()], { profesional: { userId: "u1", nombre: "Dra. Lucía Ferrer" } });
    expect(screen.getByRole("button", { name: "Cambiar de vista" })).toHaveTextContent("Dra. Lucía Ferrer");
  });

  it("ofrece la vista general primero y después a cada profesional", async () => {
    const user = userEvent.setup();
    montar([profesional(), profesional({ userId: "u2", nombre: "Od. Matías Soto" })], { profesional: null });

    await user.click(screen.getByRole("button", { name: "Cambiar de vista" }));

    const opciones = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    // La primera opción del menú, después del botón que lo abre.
    expect(opciones[1]).toContain("Toda la clínica");
    expect(opciones[2]).toContain("Dra. Lucía Ferrer");
    expect(opciones[3]).toContain("Od. Matías Soto");
  });

  it("elegir un profesional lo manda al backend y vuelve a pedir la pantalla", async () => {
    const user = userEvent.setup();
    montar([profesional({ userId: "u9", nombre: "Dra. Ana" })], { profesional: null });

    await user.click(screen.getByRole("button", { name: "Cambiar de vista" }));
    await user.click(screen.getByText("Dra. Ana"));

    await waitFor(() => expect(elegirVistaActionMock).toHaveBeenCalledWith("u9"));
    // Cambiar de vista cambia TODO lo que la pantalla muestra, y eso sale
    // del servidor: sin esto el selector diría un nombre y la tabla
    // seguiría mostrando la agenda anterior.
    expect(refreshMock).toHaveBeenCalled();
  });

  // El id vacío es lo que el backend entiende como "volver a la general".
  it("volver a la vista general manda el id vacío", async () => {
    const user = userEvent.setup();
    montar([profesional()], { profesional: { userId: "u1", nombre: "Dra. Lucía Ferrer" } });

    await user.click(screen.getByRole("button", { name: "Cambiar de vista" }));
    await user.click(screen.getByText("Toda la clínica"));

    await waitFor(() => expect(elegirVistaActionMock).toHaveBeenCalledWith(""));
  });

  // Un rechazo del backend —un profesional intentando esto, o alguien que
  // dejó de estar en el equipo— tiene que decirse. Si no, el menú se
  // cierra y la vista no cambia, sin ninguna explicación.
  it("si el backend rechaza, muestra el motivo y no refresca", async () => {
    elegirVistaActionMock.mockResolvedValue({ error: "solo recepción puede cambiar de vista" });
    const user = userEvent.setup();
    montar([profesional()], { profesional: null });

    await user.click(screen.getByRole("button", { name: "Cambiar de vista" }));
    await user.click(screen.getByText("Dra. Lucía Ferrer"));

    expect(await screen.findByRole("alert")).toHaveTextContent("solo recepción");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("marca cuál es la vista actual", async () => {
    const user = userEvent.setup();
    montar([profesional()], { profesional: { userId: "u1", nombre: "Dra. Lucía Ferrer" } });

    await user.click(screen.getByRole("button", { name: "Cambiar de vista" }));

    const elegida = screen.getAllByRole("button").find((b) => b.getAttribute("aria-current") === "true");
    expect(elegida?.textContent).toContain("Dra. Lucía Ferrer");
  });

  // Con el drawer de mobile abierto el menú quedaría tapado, o tapándolo
  // — mismo criterio que el resto de los controles del header.
  it("bloqueado no se despliega", async () => {
    const user = userEvent.setup();
    render(<SelectorVistaProfesional profesionales={[profesional()]} vista={null} bloqueado />);

    await user.click(screen.getByRole("button", { name: "Cambiar de vista" }));

    expect(screen.queryByText("Ver como")).not.toBeInTheDocument();
  });
});
