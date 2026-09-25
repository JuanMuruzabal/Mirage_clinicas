import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Confirmacion, Dialogo } from "./dialogo";

// Las reglas de un diálogo modal accesible (PP-3, H10): son lo que
// window.confirm daba gratis y un <div> hecho a mano no.

function ConDisparador() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir
      </button>
      {abierto && (
        <Dialogo titulo="Prueba" onCerrar={() => setAbierto(false)}>
          <button type="button">Primero</button>
          <button type="button">Último</button>
        </Dialogo>
      )}
    </>
  );
}

describe("Dialogo", () => {
  it("es modal, lleva el foco adentro y lo devuelve al cerrarse con Escape", async () => {
    const user = userEvent.setup();
    render(<ConDisparador />);
    const abrir = screen.getByRole("button", { name: "Abrir" });
    await user.click(abrir);

    const dialogo = screen.getByRole("dialog", { name: "Prueba" });
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(dialogo).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
  });

  it("Tab y Shift+Tab no salen del diálogo", async () => {
    const user = userEvent.setup();
    render(<ConDisparador />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    const cerrar = screen.getByRole("button", { name: "Cerrar" });
    const ultimo = screen.getByRole("button", { name: "Último" });

    ultimo.focus();
    await user.tab();
    expect(cerrar).toHaveFocus();
    await user.tab({ shift: true });
    expect(ultimo).toHaveFocus();
  });

  it("un click en el fondo lo cierra; uno adentro, no", async () => {
    const onCerrar = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialogo titulo="Prueba" onCerrar={onCerrar}>
        <p>Contenido</p>
      </Dialogo>,
    );
    await user.click(screen.getByText("Contenido"));
    expect(onCerrar).not.toHaveBeenCalled();
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});

describe("Confirmacion", () => {
  it("arranca con el foco en Cancelar: un Enter por reflejo no confirma", async () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    const user = userEvent.setup();
    render(<Confirmacion titulo="¿Seguro?" mensaje="Texto" confirmar="Sí" onConfirmar={onConfirmar} onCancelar={onCancelar} />);

    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});

describe("Dialogo en el servidor", () => {
  it("abierto desde el primer render, no rompe el SSR (PP-4): no dibuja nada hasta hidratar", () => {
    // Antes: createPortal(…, document.body) en el servidor → 500 en
    // /personalizar-pagina cuando la galería de plantillas se abría sola.
    expect(renderToString(<Dialogo titulo="Plantillas" onCerrar={() => {}}>contenido</Dialogo>)).toBe("");
  });

  it("montado en el cliente, se dibuja y toma el foco", () => {
    render(<Dialogo titulo="Plantillas" onCerrar={() => {}}>contenido</Dialogo>);
    expect(screen.getByRole("dialog", { name: "Plantillas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
  });
});
