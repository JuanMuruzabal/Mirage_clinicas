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
});
