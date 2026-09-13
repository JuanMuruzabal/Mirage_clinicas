import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampoPassword, fuerzaPassword } from "./campo-password";

function registroFalso(name: string) {
  return { name, onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() };
}

// Ronda de QA del 2026-09-13 — ver la bitácora de la fase (`docs/Fases post MVP/Fase 3/fase3.2-multi-tenant.md`).
describe("fuerzaPassword", () => {
  it("no muestra nada con el campo vacío", () => {
    expect(fuerzaPassword("")).toEqual({ nivel: 0, etiqueta: "" });
  });

  // El largo mínimo es la regla real que valida el backend: mientras no
  // se alcanza, el nivel es el más bajo aunque la clave tenga de todo.
  // Una barra llena justo antes de un error sería mentir.
  it("mientras falta largo, dice cuántos caracteres faltan", () => {
    expect(fuerzaPassword("Abc1!")).toEqual({ nivel: 1, etiqueta: "Te faltan 7 caracteres" });
    expect(fuerzaPassword("Abc1!Abc1!x")).toEqual({ nivel: 1, etiqueta: "Te falta 1 carácter" });
  });

  it("pasado el mínimo, lo que suma es la variedad", () => {
    expect(fuerzaPassword("abcdefghijkl").nivel).toBe(2);
    expect(fuerzaPassword("abcdefghijk1").nivel).toBe(2);
    expect(fuerzaPassword("Abcdefghijk1").nivel).toBe(3);
    expect(fuerzaPassword("Abcdefghijk1!").nivel).toBe(4);
  });
});

describe("CampoPassword", () => {
  it("el ojo muestra y vuelve a ocultar la contraseña", async () => {
    render(<CampoPassword label="Contraseña" registro={registroFalso("password")} valor="secreta12345" />);

    const input = screen.getByLabelText("Contraseña");
    expect(input).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(input).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("con conFuerza, muestra el progreso en vez de una regla estática", () => {
    render(<CampoPassword label="Contraseña" registro={registroFalso("password")} valor="Abc1!" conFuerza />);
    expect(screen.getByText("Te faltan 7 caracteres")).toBeInTheDocument();
  });

  it("sin conFuerza no hay barra", () => {
    render(<CampoPassword label="Confirmar" registro={registroFalso("confirmar")} valor="Abc1!" />);
    expect(screen.queryByText(/Te faltan/)).not.toBeInTheDocument();
  });

  // El error de "no coinciden" aparecía recién al enviar. El aviso va
  // DEBAJO del campo: adentro, al lado del ojo, se leía como un segundo
  // botón para ver la contraseña (corrección de QA del 2026-09-13).
  it("el aviso de coincidencia aparece solo cuando corresponde", () => {
    const { rerender } = render(
      <CampoPassword label="Confirmar" registro={registroFalso("confirmar")} valor="secreta12345" coincide />,
    );
    expect(screen.getByText("Las contraseñas coinciden")).toBeInTheDocument();
    // Y un solo botón en el campo: el del ojo.
    expect(screen.getAllByRole("button")).toHaveLength(1);

    rerender(<CampoPassword label="Confirmar" registro={registroFalso("confirmar")} valor="secreta12345" />);
    expect(screen.queryByText("Las contraseñas coinciden")).not.toBeInTheDocument();

    // Ni con el campo vacío, aunque el padre diga que "coinciden".
    rerender(<CampoPassword label="Confirmar" registro={registroFalso("confirmar")} valor="" coincide />);
    expect(screen.queryByText("Las contraseñas coinciden")).not.toBeInTheDocument();
  });
});
