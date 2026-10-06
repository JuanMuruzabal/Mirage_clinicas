import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DocumentoDetalle } from "@dental-mirage/shared-types";

// El asiento a medio escribir de un anexo de continuación (5.6d): cerrar el
// diálogo no lo pierde, y el botón de la sección avisa que quedó sin guardar.

const acciones = vi.hoisted(() => ({
  crearContinuacionAction: vi.fn(),
  leerDocumentoAction: vi.fn(),
  sumarAsientoAction: vi.fn(),
}));
vi.mock("@/app/actions/documentos", () => acciones);

const { ContinuacionDeLaSeccion } = await import("./anexo-de-continuacion");

const anexo = {
  id: "c1",
  plantillaId: "anexo-de-continuacion",
  plantillaVersion: 1,
  plantillaNombre: "Anexo de continuación",
  tipo: "anexo",
  estado: "abierto",
  folio: 2,
  continuacion: { seccion: "plan", numero: 1 },
  asientos: [],
} as unknown as DocumentoDetalle;

beforeEach(() => {
  vi.clearAllMocks();
  acciones.leerDocumentoAction.mockResolvedValue({ ok: true, documento: anexo });
});

async function abrir(nombre: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: nombre }));
  return screen.findByRole("textbox", { name: /Texto/ });
}

describe("ContinuacionDeLaSeccion", () => {
  it("cerrar el diálogo con texto escrito lo conserva, y el botón avisa", async () => {
    render(<ContinuacionDeLaSeccion historiaId="h1" seccion="plan" anexo={{ id: "c1", numero: 1 }} />);
    expect(screen.getByRole("button", { name: "Anexo Nº 1" })).toBeInTheDocument();

    const texto = await abrir(/Anexo Nº 1/);
    fireEvent.change(texto, { target: { value: "Control a los siete días" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Anexo Nº 1 · texto sin guardar" })).toBeInTheDocument();
    expect(await abrir(/Anexo Nº 1/)).toHaveValue("Control a los siete días");
  });

  it("un texto en blanco no cuenta como sin guardar", async () => {
    render(<ContinuacionDeLaSeccion historiaId="h1" seccion="plan" anexo={{ id: "c1", numero: 1 }} />);
    fireEvent.change(await abrir(/Anexo Nº 1/), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Anexo Nº 1" })).toBeInTheDocument();
  });

  it("recién creado, el botón pasa a ser el del anexo aunque la página no se haya actualizado", async () => {
    acciones.crearContinuacionAction.mockResolvedValue({ ok: true, documento: anexo });
    render(<ContinuacionDeLaSeccion historiaId="h1" seccion="plan" />);
    fireEvent.click(screen.getByRole("button", { name: "Crear anexo" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Anexo Nº 1" })).toBeInTheDocument();
  });
});
