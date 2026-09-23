import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  // Tercera ronda de correcciones (2026-09-06), pedido textual del
  // cliente: "sacar de todos los botones que contengan '->'" — el prop
  // `flecha` que existía acá (Extra 2.3.3) se eliminó del todo, ver el
  // comentario grande arriba del componente.
  it("nunca suma una flecha al texto del botón", () => {
    render(<VerTextoBoton titulo="Email" texto="alguien@example.com" />);
    expect(screen.getByRole("button", { name: "Ver email" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /→/ })).not.toBeInTheDocument();
  });

  // Contactos principales (2026-09-23): "en los botones 'ver mails' o
  // 'ver teléfonos' debería también tener un indicador visual de cuál es
  // el principal".
  it("con `principal`, muestra la lista y marca solo al principal", async () => {
    const user = userEvent.setup();
    render(<VerTextoBoton titulo="Mails" texto={"a@example.com\nb@example.com\nb@example.com"} principal="b@example.com" />);

    await user.click(screen.getByRole("button", { name: "Ver mails" }));
    const items = within(screen.getByRole("dialog")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).queryByText("Principal")).not.toBeInTheDocument();
    expect(within(items[1]).getByText("Principal")).toBeInTheDocument();
    // Un dato repetido lleva una sola marca.
    expect(within(items[2]).queryByText("Principal")).not.toBeInTheDocument();
  });

  it("sin `principal` el texto sale tal cual, sin marca", async () => {
    const user = userEvent.setup();
    render(<VerTextoBoton titulo="Mails" texto={"a@example.com\nb@example.com"} principal={null} />);

    await user.click(screen.getByRole("button", { name: "Ver mails" }));
    expect(screen.queryByText("Principal")).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).queryByRole("list")).not.toBeInTheDocument();
  });
});
