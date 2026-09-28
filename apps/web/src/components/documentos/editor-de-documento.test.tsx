import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { borrador, todoTipo } from "./fixtures";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

const acciones = vi.hoisted(() => ({
  guardarBorradorAction: vi.fn(),
  terminarDocumentoAction: vi.fn(),
  descartarBorradorAction: vi.fn(),
}));
vi.mock("@/app/actions/documentos", () => acciones);

const { EditorDeDocumento } = await import("./editor-de-documento");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // El foco y el scroll al elegir un campo del calco.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function esperarGuardado() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
}

describe("EditorDeDocumento", () => {
  it("se guarda solo un momento después de escribir", async () => {
    acciones.guardarBorradorAction.mockResolvedValue({ ok: true, documento: borrador() });
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    expect(screen.getByText("Borrador guardado")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Ana María" } });
    expect(screen.getByText("Cambios sin guardar…")).toBeInTheDocument();
    await esperarGuardado();
    expect(acciones.guardarBorradorAction).toHaveBeenCalledWith("doc-1", { nombre: "Ana María" });
    expect(screen.getByText("Borrador guardado")).toBeInTheDocument();
  });

  it("un error de formato se ve enseguida y no se manda a guardar", async () => {
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    fireEvent.change(screen.getByLabelText("Peso"), { target: { value: "70.25" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Puede tener hasta 1 decimales.");
    await esperarGuardado();
    expect(acciones.guardarBorradorAction).not.toHaveBeenCalled();
    expect(screen.getByText("No se pudo guardar")).toBeInTheDocument();
  });

  it("si la API rechaza el guardado, marca el campo", async () => {
    acciones.guardarBorradorAction.mockResolvedValue({
      ok: false,
      error: "Revisá los datos marcados.",
      errores: [{ campo: "nombre", mensaje: "Algo no está bien." }],
    });
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Ana M" } });
    await esperarGuardado();
    expect(screen.getByText("Algo no está bien.")).toBeInTheDocument();
    expect(screen.getByText("Revisá los datos marcados.")).toBeInTheDocument();
  });

  it("terminar sin los obligatorios lleva al campo y no manda nada", async () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminar y pasar a firmas" }));
    });
    expect(screen.getByText("Faltan datos para terminar: están marcados en el formulario.")).toBeInTheDocument();
    expect(screen.getByText("Este dato es obligatorio.")).toBeInTheDocument();
    expect(acciones.terminarDocumentoAction).not.toHaveBeenCalled();
  });

  it("terminar guarda lo pendiente, termina y refresca la página", async () => {
    acciones.guardarBorradorAction.mockResolvedValue({ ok: true, documento: borrador() });
    acciones.terminarDocumentoAction.mockResolvedValue({ ok: true, documento: borrador() });
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Ana Paz" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminar y pasar a firmas" }));
    });
    expect(acciones.guardarBorradorAction).toHaveBeenCalledWith("doc-1", { nombre: "Ana Paz" });
    expect(acciones.terminarDocumentoAction).toHaveBeenCalledWith("doc-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("si la API no deja terminar, muestra por qué", async () => {
    acciones.terminarDocumentoAction.mockResolvedValue({
      ok: false,
      error: "Revisá los datos marcados.",
      errores: [{ campo: "nombre", mensaje: "Este dato es obligatorio." }],
    });
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminar y pasar a firmas" }));
    });
    expect(screen.getByText("Revisá los datos marcados.")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("si el guardado previo falla, no termina", async () => {
    acciones.guardarBorradorAction.mockResolvedValue({ ok: false, error: "caída" });
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Ana P" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminar y pasar a firmas" }));
    });
    expect(acciones.terminarDocumentoAction).not.toHaveBeenCalled();
    expect(screen.getByText("No se pudo guardar el borrador. Revisá los datos marcados y probá de nuevo.")).toBeInTheDocument();
  });

  it("tocar un dato del calco abre su sección", async () => {
    render(<EditorDeDocumento documento={borrador({ nombre: "Ana" })} plantilla={todoTipo} />);
    expect(screen.queryByRole("radiogroup", { name: "Higiene" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Completar: Higiene" }));
    });
    expect(screen.getByRole("radiogroup", { name: "Higiene" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clínica/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("las secciones se abren y se cierran, y dicen cuánto falta", () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    expect(screen.getByText("0 de 1 obligatorios")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Datos/ }));
    expect(screen.queryByRole("textbox", { name: /^Nombre/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Clínica/ }));
    expect(screen.getByRole("group", { name: "Hábitos" })).toBeInTheDocument();
  });

  it("en el celular, Completar o Ver documento", () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    fireEvent.click(screen.getByRole("tab", { name: "Ver documento" }));
    expect(screen.getByRole("tab", { name: "Ver documento" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("complementary", { name: "Datos del documento" })).toHaveClass("hidden");
  });

  it("descartar pide confirmación", async () => {
    render(<EditorDeDocumento documento={borrador()} plantilla={todoTipo} />);
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
    expect(await screen.findByRole("dialog", { name: "¿Descartar este borrador?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(acciones.descartarBorradorAction).toHaveBeenCalledWith("doc-1");
  });
});
