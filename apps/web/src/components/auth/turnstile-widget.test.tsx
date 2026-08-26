import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TurnstileWidget } from "./turnstile-widget";

// Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY configurada (el caso real en
// dev/test), el widget no se renderiza — mismo criterio nil-disabled que
// el backend sin TURNSTILE_SECRET_KEY (internal/turnstile).
describe("TurnstileWidget", () => {
  it("no renderiza nada sin site key configurada", () => {
    const { container } = render(<TurnstileWidget onToken={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
