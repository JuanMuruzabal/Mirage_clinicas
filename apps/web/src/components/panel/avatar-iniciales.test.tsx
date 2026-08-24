import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AvatarIniciales } from "./avatar-iniciales";

describe("AvatarIniciales", () => {
  it("muestra las iniciales en mayúscula", () => {
    const { container } = render(<AvatarIniciales nombre="bruno" apellido="iglesias" />);
    expect(container.textContent).toBe("BI");
  });

  it("es decorativo (aria-hidden) — el nombre completo ya está en texto real al lado", () => {
    const { container } = render(<AvatarIniciales nombre="Bruno" apellido="Iglesias" />);
    expect(container.querySelector("span")).toHaveAttribute("aria-hidden", "true");
  });
});
