import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClickableTableRow } from "./clickable-table-row";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

function renderFila(href: string) {
  return render(
    <table>
      <tbody>
        <ClickableTableRow href={href}>
          <td>Bruno Iglesias</td>
          <td>
            <button type="button">Ver ficha →</button>
          </td>
        </ClickableTableRow>
      </tbody>
    </table>,
  );
}

describe("ClickableTableRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clickear en cualquier parte de la fila navega al href", async () => {
    const user = userEvent.setup();
    renderFila("/panel/pacientes/pac-1");

    await user.click(screen.getByText("Bruno Iglesias"));
    expect(pushMock).toHaveBeenCalledWith("/panel/pacientes/pac-1");
  });

  it("clickear en un link propio de la fila no dispara un push duplicado", async () => {
    const user = userEvent.setup();
    renderFila("/panel/pacientes/pac-1");

    await user.click(screen.getByRole("button", { name: "Ver ficha →" }));
    expect(pushMock).not.toHaveBeenCalled();
  });

  // mobileOnClick (corrección de QA, 2026-09-06, tabla de Pacientes en
  // mobile): por debajo de 768px, tocar la fila llama a esto en vez de
  // navegar — mismo criterio que TurnosTable (tocar la fila siempre
  // despliega, nunca navega sola). Sin la prop, el comportamiento de
  // siempre (TR-023) sigue intacto en cualquier ancho (ver el test de
  // arriba, que no la usa).
  describe("mobileOnClick", () => {
    function mockearMatchMedia(matches: boolean) {
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
      return () => {
        window.matchMedia = original;
      };
    }

    it("por debajo de 768px, clickear la fila llama a mobileOnClick en vez de navegar", async () => {
      const restaurar = mockearMatchMedia(true);
      const mobileOnClick = vi.fn();
      try {
        const user = userEvent.setup();
        render(
          <table>
            <tbody>
              <ClickableTableRow href="/panel/pacientes/pac-1" mobileOnClick={mobileOnClick}>
                <td>Bruno Iglesias</td>
              </ClickableTableRow>
            </tbody>
          </table>,
        );

        await user.click(screen.getByText("Bruno Iglesias"));

        expect(mobileOnClick).toHaveBeenCalledTimes(1);
        expect(pushMock).not.toHaveBeenCalled();
      } finally {
        restaurar();
      }
    });

    it("por debajo de 768px, apretar Enter sobre la fila también llama a mobileOnClick", async () => {
      const restaurar = mockearMatchMedia(true);
      const mobileOnClick = vi.fn();
      try {
        const user = userEvent.setup();
        render(
          <table>
            <tbody>
              <ClickableTableRow href="/panel/pacientes/pac-1" mobileOnClick={mobileOnClick}>
                <td tabIndex={0}>Bruno Iglesias</td>
              </ClickableTableRow>
            </tbody>
          </table>,
        );

        screen.getByText("Bruno Iglesias").focus();
        await user.keyboard("{Enter}");

        expect(mobileOnClick).toHaveBeenCalledTimes(1);
        expect(pushMock).not.toHaveBeenCalled();
      } finally {
        restaurar();
      }
    });

    it("desde 768px (escritorio), clickear la fila navega igual, ignora mobileOnClick", async () => {
      const restaurar = mockearMatchMedia(false);
      const mobileOnClick = vi.fn();
      try {
        const user = userEvent.setup();
        render(
          <table>
            <tbody>
              <ClickableTableRow href="/panel/pacientes/pac-1" mobileOnClick={mobileOnClick}>
                <td>Bruno Iglesias</td>
              </ClickableTableRow>
            </tbody>
          </table>,
        );

        await user.click(screen.getByText("Bruno Iglesias"));

        expect(mobileOnClick).not.toHaveBeenCalled();
        expect(pushMock).toHaveBeenCalledWith("/panel/pacientes/pac-1");
      } finally {
        restaurar();
      }
    });
  });
});
