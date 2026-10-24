import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClinicaDelUsuario } from "@dental-mirage/shared-types";

const { entrarEnClinicaActionMock } = vi.hoisted(() => ({ entrarEnClinicaActionMock: vi.fn() }));

vi.mock("@/app/actions/clinicas", () => ({ entrarEnClinicaAction: entrarEnClinicaActionMock }));
// El selector quedó solo con la variante del panel (correcciones generales,
// 2026-10-18): cambiar de clínica no navega, refresca la pantalla.
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const { SelectorClinica } = await import("./selector-clinica");

function clinica(over: Partial<ClinicaDelUsuario> = {}): ClinicaDelUsuario {
  return {
    id: "c1",
    nombre: "Consultorio Propio",
    slug: "consultorio-propio",
    tipo: "individual",
    roles: ["owner"],
    rolPrincipal: "owner",
    esPropia: true,
    profesionales: 1,
    activa: true,
    ...over,
  };
}

const clinicas = [
  clinica(),
  clinica({ id: "c2", nombre: "Clínica Del Colega", rolPrincipal: "profesional", esPropia: false, activa: false }),
];

// Rediseño del 2026-09-14: reemplaza a "Estás en [píldora] Cambiar de
// clínica", que eran tres tratamientos visuales para una sola idea. Desde
// el 2026-10-18 queda solo la variante compacta del topbar, sin rótulo, y el
// único que lo usa (PanelTopbar) pasa siempre `quedarseAca`.
describe("SelectorClinica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra dónde está parada la persona sin abrir nada", () => {
    render(<SelectorClinica clinicas={clinicas} nombreActual="Consultorio Propio" quedarseAca />);

    // Sin rótulo "Estás en": el nombre va en el control mismo.
    expect(screen.queryByText("Estás en")).not.toBeInTheDocument();
    const control = screen.getByRole("button", { name: /Cambiar de clínica/ });
    expect(control).toHaveAttribute("aria-expanded", "false");
    expect(control).toHaveTextContent("Consultorio Propio");
    // La lista no está hasta que se la pide.
    expect(screen.queryByText("Clínica Del Colega")).not.toBeInTheDocument();
  });

  it("abre la lista con las clínicas y su rol, marcando la actual", async () => {
    render(<SelectorClinica clinicas={clinicas} nombreActual="Consultorio Propio" quedarseAca />);

    await userEvent.click(screen.getByRole("button", { name: /Cambiar de clínica/ }));

    expect(screen.getByText("Clínica Del Colega")).toBeInTheDocument();
    expect(screen.getByText("Profesional")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todas las clínicas" })).toHaveAttribute("href", "/clinicas");
  });

  it("elegir otra clínica entra en ella sin salir de la pantalla: avisa, refresca y cierra", async () => {
    entrarEnClinicaActionMock.mockResolvedValue(undefined);
    const onCambiada = vi.fn();
    render(<SelectorClinica clinicas={clinicas} nombreActual="Consultorio Propio" quedarseAca onCambiada={onCambiada} />);

    await userEvent.click(screen.getByRole("button", { name: /Cambiar de clínica/ }));
    await userEvent.click(screen.getByText("Clínica Del Colega"));

    await waitFor(() => expect(entrarEnClinicaActionMock).toHaveBeenCalledWith("c2", { redirigir: false }));
    await waitFor(() => expect(onCambiada).toHaveBeenCalledTimes(1));
    expect(refreshMock).toHaveBeenCalled();
    expect(screen.queryByText("Clínica Del Colega")).not.toBeInTheDocument();
  });

  it("bloqueado (con el menú lateral abierto) no se despliega", async () => {
    render(<SelectorClinica clinicas={clinicas} nombreActual="Consultorio Propio" quedarseAca bloqueado />);
    const control = screen.getByRole("button", { name: /Cambiar de clínica/ });
    expect(control).toBeDisabled();
    await userEvent.click(control);
    expect(control).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Clínica Del Colega")).not.toBeInTheDocument();
  });

  // Elegir la que ya está activa no dispara nada: solo cierra.
  it("elegir la clínica actual no vuelve a entrar", async () => {
    render(<SelectorClinica clinicas={clinicas} nombreActual="Consultorio Propio" quedarseAca />);

    await userEvent.click(screen.getByRole("button", { name: /Cambiar de clínica/ }));
    // El nombre aparece dos veces —en el control y en la lista—: el de la
    // lista es el que está dentro de un <li>.
    const enLaLista = screen.getAllByText("Consultorio Propio").find((el) => el.closest("li"));
    await userEvent.click(enLaLista!);

    expect(entrarEnClinicaActionMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Clínica Del Colega")).not.toBeInTheDocument());
  });

  it("cierra con Escape", async () => {
    render(<SelectorClinica clinicas={clinicas} nombreActual="Consultorio Propio" quedarseAca />);

    await userEvent.click(screen.getByRole("button", { name: /Cambiar de clínica/ }));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText("Clínica Del Colega")).not.toBeInTheDocument();
  });
});
