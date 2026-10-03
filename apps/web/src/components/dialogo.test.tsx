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

  // Documentos clínicos (Fase 5.1): los modales del módulo van en la paleta
  // blanca, como "Agregar turno"; el resto de la app sigue en hueso.
  it("la superficie es hueso salvo que se pida la blanca", () => {
    const { rerender } = render(
      <Dialogo titulo="Prueba" onCerrar={vi.fn()}>
        <p>Contenido</p>
      </Dialogo>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("bg-hueso");
    rerender(
      <Dialogo titulo="Prueba" onCerrar={vi.fn()} superficie="marfil">
        <p>Contenido</p>
      </Dialogo>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("bg-marfil");
  });

  it("va arriba salvo que se pida centrado, y centrado igual scrollea si no entra", () => {
    const { rerender } = render(
      <Dialogo titulo="Prueba" onCerrar={vi.fn()}>
        <p>Contenido</p>
      </Dialogo>,
    );
    expect(screen.getByRole("dialog")).not.toHaveClass("my-auto");
    rerender(
      <Dialogo titulo="Prueba" onCerrar={vi.fn()} centrado>
        <p>Contenido</p>
      </Dialogo>,
    );
    // my-auto en la caja, no items-center en el fondo: el fondo sigue
    // alineado arriba con su scroll, así un diálogo alto no queda cortado.
    expect(screen.getByRole("dialog")).toHaveClass("my-auto");
    expect(screen.getByRole("dialog").parentElement).toHaveClass("items-start", "overflow-y-auto");
  });

  // El odontograma (QA de la 5.5): pantalla entera en el celular, lo justo
  // para las 16 piezas en la computadora.
  it("el ancho completo ocupa la pantalla en el celular, y los demás no", () => {
    const { rerender } = render(
      <Dialogo titulo="Prueba" onCerrar={vi.fn()} ancho="completo">
        <p>Contenido</p>
      </Dialogo>,
    );
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveClass("max-w-4xl", "max-sm:min-h-full", "max-sm:rounded-none", "max-sm:border-0");
    expect(dialogo.parentElement).toHaveClass("max-sm:p-0");
    rerender(
      <Dialogo titulo="Prueba" onCerrar={vi.fn()} ancho="ancho">
        <p>Contenido</p>
      </Dialogo>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("max-w-7xl");
    expect(screen.getByRole("dialog")).not.toHaveClass("max-sm:min-h-full");
    expect(screen.getByRole("dialog").parentElement).not.toHaveClass("max-sm:p-0");
  });

  it("un Escape que un control de adentro ya usó (preventDefault) no lo cierra; el siguiente, sí", async () => {
    const onCerrar = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialogo titulo="Prueba" onCerrar={onCerrar}>
        <div
          role="group"
          aria-label="Control"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.preventDefault();
          }}
        >
          <button type="button">Adentro</button>
        </div>
        <button type="button">Afuera</button>
      </Dialogo>,
    );
    screen.getByRole("button", { name: "Adentro" }).focus();
    await user.keyboard("{Escape}");
    expect(onCerrar).not.toHaveBeenCalled();
    screen.getByRole("button", { name: "Afuera" }).focus();
    await user.keyboard("{Escape}");
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

// El pie (QA de la 5.5): "Listo" del odontograma queda pegado abajo, fuera
// de lo que scrollea, sin hueco por donde se vea el contenido.
describe("Dialogo con pie", () => {
  it("el pie se dibuja fuera del área que scrollea, y el diálogo se acota a la pantalla", () => {
    render(
      <Dialogo titulo="Prueba" onCerrar={vi.fn()} ancho="completo" pie={<button type="button">Listo</button>}>
        <p>Contenido largo</p>
      </Dialogo>,
    );
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveClass("flex", "flex-col", "max-h-[calc(100dvh-3rem)]", "max-sm:h-dvh");
    const contenido = screen.getByText("Contenido largo").parentElement!;
    expect(contenido).toHaveClass("overflow-y-auto", "flex-1", "min-h-0");
    const listo = screen.getByRole("button", { name: "Listo" });
    expect(contenido).not.toContainElement(listo);
    const pie = listo.parentElement!;
    expect(pie).toHaveClass("shrink-0", "border-t");
    expect(pie.parentElement).toBe(dialogo);
    // El pie va después del contenido: es lo último del diálogo.
    expect(dialogo.lastElementChild).toBe(pie);
  });

  it("con pie y otro ancho, no ocupa la pantalla entera del celular", () => {
    render(
      <Dialogo titulo="Prueba" onCerrar={vi.fn()} ancho="medio" pie={<button type="button">Listo</button>}>
        <p>Contenido</p>
      </Dialogo>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("flex-col");
    expect(screen.getByRole("dialog")).not.toHaveClass("max-sm:h-dvh");
    expect(screen.getByRole("button", { name: "Listo" }).parentElement).not.toHaveClass("max-sm:rounded-none");
  });

  it("sin pie queda como antes: el contenido va directo, sin caja que scrollee ni límite de alto", () => {
    render(
      <Dialogo titulo="Prueba" onCerrar={vi.fn()} ancho="completo">
        <p>Contenido</p>
      </Dialogo>,
    );
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).not.toHaveClass("flex-col");
    expect(dialogo).not.toHaveClass("max-h-[calc(100dvh-3rem)]");
    const parrafo = screen.getByText("Contenido");
    expect(parrafo.parentElement).toBe(dialogo);
    expect(dialogo.querySelector(".overflow-y-auto")).toBeNull();
  });
});
