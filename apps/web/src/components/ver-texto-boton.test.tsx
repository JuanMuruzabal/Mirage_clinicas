import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerTextoBoton } from "./ver-texto-boton";

describe("VerTextoBoton", () => {
  it("muestra el botón 'Ver <título>' y no el texto completo de entrada", () => {
    render(<VerTextoBoton titulo="Motivo" texto="Un motivo bastante largo que no entra en la fila" />);
    expect(screen.getByRole("button", { name: "Ver motivo" })).toBeInTheDocument();
    expect(screen.queryByText("Un motivo bastante largo que no entra en la fila")).not.toBeInTheDocument();
  });

  it("al tocar el botón, abre un modal con el texto completo", async () => {
    const user = userEvent.setup();
    render(<VerTextoBoton titulo="Email" texto="paciente-con-un-mail-muy-largo@ejemplo.com" />);

    await user.click(screen.getByRole("button", { name: "Ver email" }));

    expect(screen.getByRole("dialog", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByText("paciente-con-un-mail-muy-largo@ejemplo.com")).toBeInTheDocument();
  });

  it("la X cierra el modal", async () => {
    const user = userEvent.setup();
    render(<VerTextoBoton titulo="Motivo" texto="Motivo largo de prueba" />);

    await user.click(screen.getByRole("button", { name: "Ver motivo" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tocar el contenido del modal (no el fondo) no lo cierra", async () => {
    const user = userEvent.setup();
    render(<VerTextoBoton titulo="Motivo" texto="Motivo largo de prueba" />);

    await user.click(screen.getByRole("button", { name: "Ver motivo" }));
    await user.click(screen.getByText("Motivo largo de prueba"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("tocar el fondo cierra el modal", async () => {
    const user = userEvent.setup();
    render(<VerTextoBoton titulo="Motivo" texto="Motivo largo de prueba" />);

    await user.click(screen.getByRole("button", { name: "Ver motivo" }));
    await user.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("no propaga el click del botón hacia un contenedor clickeable (fila de tarjeta)", async () => {
    const user = userEvent.setup();
    const onFilaClick = vi.fn();
    render(
      <div onClick={onFilaClick}>
        <VerTextoBoton titulo="Motivo" texto="Motivo largo de prueba" />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Ver motivo" }));
    expect(onFilaClick).not.toHaveBeenCalled();
  });

  it("variante 'link' aplica una clase distinta a la de 'boton' (default)", () => {
    const { rerender } = render(<VerTextoBoton titulo="Motivo" texto={"x".repeat(40)} variante="boton" />);
    const botonPastilla = screen.getByRole("button", { name: "Ver motivo" });
    expect(botonPastilla.className).toContain("rounded-full");
    expect(botonPastilla.className).toContain("border-arena");

    rerender(<VerTextoBoton titulo="Motivo" texto={"x".repeat(40)} variante="link" />);
    const botonLink = screen.getByRole("button", { name: "Ver motivo" });
    expect(botonLink.className).not.toContain("rounded-full");
    expect(botonLink.className).toContain("underline-offset-2");
  });

  // Corrección de QA (Extra 2.3.3): la columna Contacto de TurnosTable
  // pide "ver mail ->" con flecha, mismo estilo que "Ver paciente →" —
  // sin la prop, ningún otro uso existente (tarjetas del dashboard,
  // pastillas de tabla) suma la flecha por su cuenta.
  it("flecha=true suma ' →' al final del texto del botón; sin la prop, no aparece", () => {
    const { rerender } = render(<VerTextoBoton titulo="Email" texto="alguien@example.com" />);
    expect(screen.getByRole("button", { name: "Ver email" })).toBeInTheDocument();

    rerender(<VerTextoBoton titulo="Email" texto="alguien@example.com" flecha />);
    expect(screen.getByRole("button", { name: "Ver email →" })).toBeInTheDocument();
  });
});
