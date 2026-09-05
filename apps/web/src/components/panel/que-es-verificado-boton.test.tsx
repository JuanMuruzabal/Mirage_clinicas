import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueEsVerificadoBoton } from "./que-es-verificado-boton";

describe("QueEsVerificadoBoton", () => {
  it("no muestra el modal hasta tocar el botón", () => {
    render(<QueEsVerificadoBoton />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al tocar el botón, abre el modal con la explicación", async () => {
    const user = userEvent.setup();
    render(<QueEsVerificadoBoton />);

    await user.click(screen.getByRole("button", { name: "¿Qué es un paciente verificado?" }));
    expect(screen.getByRole("dialog", { name: "Qué es un paciente verificado" })).toBeInTheDocument();
    expect(screen.getByText(/apenas se confirma que asistió a al menos un turno/)).toBeInTheDocument();
  });

  it("se cierra al presionar la X", async () => {
    const user = userEvent.setup();
    render(<QueEsVerificadoBoton />);

    await user.click(screen.getByRole("button", { name: "¿Qué es un paciente verificado?" }));
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("se cierra al hacer click en el fondo", async () => {
    const user = userEvent.setup();
    render(<QueEsVerificadoBoton />);

    await user.click(screen.getByRole("button", { name: "¿Qué es un paciente verificado?" }));
    await user.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
