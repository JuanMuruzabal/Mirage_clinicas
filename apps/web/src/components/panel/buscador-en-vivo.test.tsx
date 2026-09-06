import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuscadorEnVivo } from "./buscador-en-vivo";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

describe("BuscadorEnVivo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no navega apenas se monta, con el valor inicial", () => {
    render(<BuscadorEnVivo hrefBase="/panel/turnos?estado=agendado" placeholder="Buscar…" />);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("al escribir, navega solo (sin Enter ni botón) tras el debounce, agregando q", async () => {
    const user = userEvent.setup();
    render(<BuscadorEnVivo hrefBase="/panel/turnos?estado=agendado" placeholder="Buscar…" />);

    await user.type(screen.getByPlaceholderText("Buscar…"), "jua");

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/panel/turnos?estado=agendado&q=jua"), { timeout: 2000 });
  });

  it("usa '?' en vez de '&' cuando hrefBase no tiene querystring todavía", async () => {
    const user = userEvent.setup();
    render(<BuscadorEnVivo hrefBase="/panel/pacientes" placeholder="Buscar…" />);

    await user.type(screen.getByPlaceholderText("Buscar…"), "ana");

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/panel/pacientes?q=ana"), { timeout: 2000 });
  });

  it("al borrar el texto, navega a hrefBase sin q", async () => {
    const user = userEvent.setup();
    render(<BuscadorEnVivo q="jua" hrefBase="/panel/pacientes" placeholder="Buscar…" />);

    await user.clear(screen.getByPlaceholderText("Buscar…"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/panel/pacientes"), { timeout: 2000 });
  });

  it("no navega si el texto tipeado es igual al q ya vigente", async () => {
    render(<BuscadorEnVivo q="jua" hrefBase="/panel/pacientes" placeholder="Buscar…" />);
    await new Promise((r) => setTimeout(r, 400));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("debounce: solo navega una vez tras varias teclas seguidas", async () => {
    const user = userEvent.setup();
    render(<BuscadorEnVivo hrefBase="/panel/pacientes" placeholder="Buscar…" />);

    await user.type(screen.getByPlaceholderText("Buscar…"), "jua");

    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(pushMock).toHaveBeenCalledWith("/panel/pacientes?q=jua");
  });
});
