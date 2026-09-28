import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { aFirmar, conLamina, firma, sellado, trazo } from "./fixtures";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

const acciones = vi.hoisted(() => ({
  firmarDocumentoAction: vi.fn(),
  volverAEditarDocumentoAction: vi.fn(),
}));
vi.mock("@/app/actions/documentos", () => acciones);

// El lienzo de verdad necesita un puntero; acá alcanza con un botón que
// "firma".
vi.mock("./lienzo-de-firma", () => ({
  LienzoDeFirma: ({ onCambio }: { onCambio: (t: unknown) => void }) => (
    <button type="button" onClick={() => onCambio(trazo())}>
      Dibujar firma
    </button>
  ),
}));

const { VistaDeDocumento } = await import("./vista-de-documento");

beforeEach(() => vi.clearAllMocks());

describe("VistaDeDocumento", () => {
  it("a firmar, mío y sin firmas: se firma en el dispositivo o se vuelve a editar", async () => {
    acciones.volverAEditarDocumentoAction.mockResolvedValue({ ok: true, documento: aFirmar() });
    render(<VistaDeDocumento documento={aFirmar()} />);
    expect(screen.getAllByRole("button", { name: "Firmar en este dispositivo" })).toHaveLength(2);
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(1);
    expect(screen.getByText(/Terminado el 27\/09\/2026/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Volver a editar" }));
    });
    expect(acciones.volverAEditarDocumentoAction).toHaveBeenCalledWith("doc-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("volver a editar que falla muestra el error", async () => {
    acciones.volverAEditarDocumentoAction.mockResolvedValue({ ok: false, error: "alguien ya firmó" });
    render(<VistaDeDocumento documento={aFirmar()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Volver a editar" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("alguien ya firmó");
  });

  it("con una firma ya no se vuelve a editar, y la firma aparece", () => {
    render(<VistaDeDocumento documento={aFirmar([firma("paciente")])} />);
    expect(screen.queryByRole("button", { name: "Volver a editar" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Firmar en este dispositivo" })).toHaveLength(1);
    expect(screen.getByText("Firmada")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Firma de Ana Paz" })).toBeInTheDocument();
  });

  it("uno ajeno a firmar se lee, no se firma", () => {
    render(<VistaDeDocumento documento={aFirmar([], { esMio: false })} />);
    expect(screen.queryByRole("button", { name: "Firmar en este dispositivo" })).not.toBeInTheDocument();
    expect(screen.getByText("Las firmas las junta quien hizo el documento.")).toBeInTheDocument();
  });

  it("sellado: folio, sello y ninguna acción", () => {
    render(<VistaDeDocumento documento={sellado()} />);
    expect(screen.getByRole("heading", { name: "Firmado y sellado" })).toBeInTheDocument();
    expect(screen.getByText(/folio 3 · sello/)).toBeInTheDocument();
    expect(screen.getByText("ffff0000…7777")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("anulado: dice por qué", () => {
    render(<VistaDeDocumento documento={{ ...aFirmar(), estado: "anulado", motivoAnulacion: "El paciente decidió no hacerlo." }} />);
    expect(screen.getByText("El paciente decidió no hacerlo.")).toBeInTheDocument();
  });

  it("un contenido ilegible no rompe la pantalla", () => {
    render(<VistaDeDocumento documento={{ ...aFirmar(), contenido: { raro: true } }} />);
    expect(screen.getByText("No se pudo leer el contenido de este documento.")).toBeInTheDocument();
  });
});

describe("FirmarDialogo", () => {
  it("el paciente: sus datos vienen precargados y la firma viaja con ellos", async () => {
    acciones.firmarDocumentoAction.mockResolvedValue({ ok: true, documento: aFirmar() });
    render(<VistaDeDocumento documento={aFirmar()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Firmar en este dispositivo" })[0]);
    const dialogo = await screen.findByRole("dialog", { name: "Firma del paciente o representante" });
    expect(dialogo).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre y apellido de quien firma")).toHaveValue("Ana Paz");
    expect(screen.getByLabelText("DNI")).toHaveValue("30111222");

    const firmar = screen.getByRole("button", { name: "Firmar" });
    expect(firmar).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Dibujar firma" }));
    await act(async () => {
      fireEvent.click(firmar);
    });
    expect(acciones.firmarDocumentoAction).toHaveBeenCalledWith("doc-1", {
      rol: "paciente",
      trazo: trazo(),
      nombre: "Ana Paz",
      dni: "30111222",
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("un representante: sus datos, y el vínculo es obligatorio", async () => {
    acciones.firmarDocumentoAction.mockResolvedValue({ ok: false, error: "esa firma ya está" });
    render(<VistaDeDocumento documento={aFirmar()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Firmar en este dispositivo" })[0]);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByLabelText("Un representante"));
    expect(screen.getByLabelText("Nombre y apellido de quien firma")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Nombre y apellido de quien firma"), { target: { value: "Marta Paz" } });
    fireEvent.change(screen.getByLabelText("DNI"), { target: { value: "20.333.444" } });
    expect(screen.getByLabelText("DNI")).toHaveValue("20333444");
    fireEvent.click(screen.getByRole("button", { name: "Dibujar firma" }));
    expect(screen.getByRole("button", { name: "Firmar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Vínculo con el paciente"), { target: { value: "Madre" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Firmar" }));
    });
    expect(acciones.firmarDocumentoAction).toHaveBeenCalledWith("doc-1", expect.objectContaining({ enRepresentacion: true, vinculo: "Madre", dni: "20333444" }));
    expect(screen.getByRole("alert")).toHaveTextContent("esa firma ya está");
    fireEvent.click(screen.getByLabelText("El paciente"));
    expect(screen.getByLabelText("DNI")).toHaveValue("30111222");
  });

  it("el profesional firma como sí mismo, sin datos que tipear", async () => {
    acciones.firmarDocumentoAction.mockResolvedValue({ ok: true, documento: aFirmar() });
    render(<VistaDeDocumento documento={aFirmar([firma("paciente")])} />);
    fireEvent.click(screen.getByRole("button", { name: "Firmar en este dispositivo" }));
    expect(await screen.findByText(/Firmás como Lucía Gómez/)).toBeInTheDocument();
    expect(screen.queryByLabelText("DNI")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dibujar firma" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Firmar" }));
    });
    expect(acciones.firmarDocumentoAction).toHaveBeenCalledWith("doc-1", { rol: "profesional", trazo: trazo() });
  });

  it("cancelar cierra sin firmar", async () => {
    render(<VistaDeDocumento documento={aFirmar()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Firmar en este dispositivo" })[0]);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(acciones.firmarDocumentoAction).not.toHaveBeenCalled();
  });

  it("con lámina, lo sellado es la página original con lo congelado y las firmas en su renglón", async () => {
    const { container } = render(<VistaDeDocumento documento={conLamina(sellado())} />);
    const hoja = screen.getByRole("figure", { name: "Documento sellado" });
    expect(hoja.querySelector("img")).toHaveAttribute("src", "/documentos-clinicos/originales/consentimiento-tratamiento-conducto/v1/pagina-1.w1600.webp");
    const escrito = [...container.querySelectorAll("figure text")].map((t) => t.textContent);
    expect(escrito).toEqual(expect.arrayContaining(["Córdoba, 27/09/2026", "Ana Paz", "36", "No consigna"]));
    // Las dos firmas, dibujadas sobre su línea del papel; nada tocable.
    expect(hoja.querySelectorAll("svg svg[role=img]")).toHaveLength(2);
    expect(hoja.querySelector("[data-zona]")).toBeNull();
    // Sin calco: la hoja ES el documento. Las huellas van debajo.
    expect(screen.queryByRole("heading", { name: "Consentimiento informado" })).not.toBeInTheDocument();
    expect(screen.getByText(/folio 3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver en pantalla completa" }));
    expect(await screen.findByRole("dialog", { name: "Tratamiento de conducto: documento sellado" })).toBeInTheDocument();
  });

  it("a firmar con lámina: la firma que falta no se dibuja", () => {
    render(<VistaDeDocumento documento={conLamina(aFirmar([firma("paciente")]))} />);
    const hoja = screen.getByRole("figure", { name: "Documento para firmar" });
    expect(hoja.querySelectorAll("svg svg[role=img]")).toHaveLength(1);
  });
});
