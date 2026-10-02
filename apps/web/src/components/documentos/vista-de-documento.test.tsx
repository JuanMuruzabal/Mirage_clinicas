import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { aFirmar, conLamina, firma, paraImprimir, sellado, trazo } from "./fixtures";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

const acciones = vi.hoisted(() => ({
  firmarDocumentoAction: vi.fn(),
  registrarImpresionAction: vi.fn(),
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
  it("a firmar, mío y sin firmas: se firma en el dispositivo, y ya no se vuelve a editar", () => {
    render(<VistaDeDocumento documento={aFirmar()} />);
    expect(screen.getAllByRole("button", { name: "Firmar en este dispositivo" })).toHaveLength(2);
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(1);
    expect(screen.getByText(/Terminado el 27\/09\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Volver a editar" })).not.toBeInTheDocument();
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

  it("sellado: el PDF se descarga por la ruta del BFF, con su código de verificación", () => {
    render(<VistaDeDocumento documento={{ ...sellado(), codigoVerificacion: "04HM-ASW9" }} />);
    expect(screen.getByRole("heading", { name: "PDF del documento" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Descargar PDF" });
    expect(link).toHaveAttribute("href", "/panel/documentos/doc-1/pdf");
    expect(screen.getByText(/Código de verificación/)).toBeInTheDocument();
    expect(screen.getByText("04HM-ASW9")).toBeInTheDocument();
  });

  it("sellado sin código (respuesta vieja): el link igual está, sin código", () => {
    render(<VistaDeDocumento documento={sellado()} />);
    expect(screen.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute("href", "/panel/documentos/doc-1/pdf");
    expect(screen.queryByText(/Código de verificación/)).not.toBeInTheDocument();
  });

  it.each([
    ["a firmar", () => aFirmar([], { codigoVerificacion: "04HM-ASW9" })],
    ["anulado", () => ({ ...aFirmar(), estado: "anulado" as const, motivoAnulacion: "x", codigoVerificacion: "04HM-ASW9" })],
  ])("%s: ni PDF ni código de verificación", (_, documento) => {
    render(<VistaDeDocumento documento={documento()} />);
    expect(screen.queryByRole("link", { name: "Descargar PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "PDF del documento" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Código de verificación/)).not.toBeInTheDocument();
    expect(screen.queryByText("04HM-ASW9")).not.toBeInTheDocument();
  });

  it("sellado: Imprimir abre el PDF en una pestaña nueva (inline), junto a Descargar PDF", () => {
    render(<VistaDeDocumento documento={{ ...sellado(), codigoVerificacion: "04HM-ASW9" }} />);
    const imprimir = screen.getByRole("link", { name: "Imprimir (abre el PDF en una pestaña nueva)" });
    expect(imprimir).toHaveTextContent("Imprimir");
    expect(imprimir).toHaveAttribute("href", "/panel/documentos/doc-1/pdf?para=imprimir");
    expect(imprimir).toHaveAttribute("target", "_blank");
    expect(imprimir).toHaveAttribute("rel", "noopener");
    // Un sellado no se imprime desde la pantalla: no hay botón que llame a window.print.
    expect(screen.queryByRole("button", { name: "Imprimir" })).not.toBeInTheDocument();
    // El PDF se genera en cada pedido: nada dice que "queda guardado".
    const bloque = screen.getByRole("heading", { name: "PDF del documento" }).closest("section") as HTMLElement;
    expect(bloque.textContent).not.toMatch(/guardad/i);
  });

  it("para imprimir: junto al Imprimir de la hoja, Descargar PDF; sin el bloque ni el código de un sellado", () => {
    render(<VistaDeDocumento documento={conLamina(paraImprimir({ codigoVerificacion: "04HM-ASW9" }))} />);
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
    const descargar = screen.getByRole("link", { name: "Descargar PDF" });
    expect(descargar).toHaveAttribute("href", "/panel/documentos/doc-1/pdf");
    expect(descargar).not.toHaveAttribute("target");
    // El Imprimir de un consentimiento es la hoja en la página, no el PDF en otra pestaña.
    expect(screen.queryByRole("link", { name: /Imprimir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "PDF del documento" })).not.toBeInTheDocument();
    expect(screen.queryByText("04HM-ASW9")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getAllByRole("button", { name: "Ver en pantalla completa" })[0]);
    expect(await screen.findByRole("dialog", { name: "Tratamiento de conducto: documento sellado" })).toBeInTheDocument();
  });

  it("un consentimiento para imprimir: sin firmas en la pantalla, se imprime la hoja a tamaño carta", async () => {
    // spyOn y no stubGlobal: `unstubAllGlobals` se llevaría también el
    // IntersectionObserver de vitest.setup, que usa el <Link> de la vista.
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<VistaDeDocumento documento={conLamina(paraImprimir())} />);
    expect(screen.getByRole("heading", { name: "Listo para imprimir o descargar" })).toBeInTheDocument();
    expect(screen.getByText(/se firma a mano/)).toBeInTheDocument();
    // Nada de firmar en la pantalla.
    expect(screen.queryByRole("heading", { name: "Firmas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Firmar en este dispositivo" })).not.toBeInTheDocument();
    // La de la pantalla y la de la impresora (a esa, en pantalla, la esconde
    // el CSS de globals.css, que jsdom no carga).
    expect(screen.getAllByRole("figure", { name: "Documento para imprimir" })).toHaveLength(2);

    // Lo que sale por la impresora: la hoja, en un portal a <body>, a su tamaño
    // de papel y con la imagen de 300 dpi.
    const impresion = document.body.querySelector(":scope > .impresion-documento");
    expect(impresion).not.toBeNull();
    expect(impresion?.querySelector("style")?.textContent).toBe("@page { size: 612pt 792pt; margin: 0; }");
    const hoja = impresion?.querySelector("figure") as HTMLElement;
    expect(hoja.style.width).toBe("612pt");
    expect(hoja.style.height).toBe("792pt");
    expect(hoja.querySelector("img")).toHaveAttribute("src", "/documentos-clinicos/originales/consentimiento-tratamiento-conducto/v1/pagina-1.w2550.webp");
    expect([...hoja.querySelectorAll("text")].map((t) => t.textContent)).toContain("Córdoba, 27/09/2026");

    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(imprimir).toHaveBeenCalled();
    expect(acciones.registrarImpresionAction).toHaveBeenCalledWith("doc-1");

    // Ya no se edita: si hay que corregir algo, se hace otro del mismo documento.
    expect(screen.queryByRole("button", { name: "Volver a editar" })).not.toBeInTheDocument();
    expect(screen.getByText(/Ya no se puede editar/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "hacé uno nuevo" })).toHaveAttribute(
      "href",
      "/panel/documentos?paciente=pac-1&plantilla=consentimiento-tratamiento-conducto",
    );
    imprimir.mockRestore();
  });

  it("el consentimiento para imprimir de un colega se imprime, no se edita", () => {
    render(<VistaDeDocumento documento={conLamina(paraImprimir({ esMio: false, autorNombre: "Pedro Díaz" }))} />);
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Volver a editar" })).not.toBeInTheDocument();
    expect(screen.getByText(/Lo hizo Pedro Díaz/)).toBeInTheDocument();
  });

  it("sin lámina, lo que se imprime es el calco, con márgenes comunes", () => {
    render(<VistaDeDocumento documento={paraImprimir()} />);
    const impresion = document.body.querySelector(":scope > .impresion-documento");
    expect(impresion?.querySelector("style")?.textContent).toBe("@page { margin: 15mm; }");
    expect(impresion?.querySelector("article")).not.toBeNull();
  });

  it("la columna de la izquierda queda pegada debajo del header", () => {
    render(<VistaDeDocumento documento={sellado()} />);
    expect(screen.getByRole("complementary", { name: "Firmas del documento" })).toHaveClass("lg:top-[calc(var(--header-height)+1rem)]");
  });

  it("a firmar con lámina: la firma que falta no se dibuja", () => {
    render(<VistaDeDocumento documento={conLamina(aFirmar([firma("paciente")]))} />);
    const hoja = screen.getByRole("figure", { name: "Documento para firmar" });
    expect(hoja.querySelectorAll("svg svg[role=img]")).toHaveLength(1);
  });
});
