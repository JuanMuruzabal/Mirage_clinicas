import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoogleSignInButton } from "./google-signin-button";

// Sin NEXT_PUBLIC_GOOGLE_CLIENT_ID configurada (el caso real en dev/test),
// el botón no se renderiza — mismo criterio nil-disabled que el resto de
// las dependencias externas del backend (Turnstile, Resend, etc.).
describe("GoogleSignInButton", () => {
  it("no renderiza nada sin GOOGLE_CLIENT_ID configurado", () => {
    const { container } = render(<GoogleSignInButton onError={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
